import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { DEFAULT_CARD_HEIGHT_MM, DEFAULT_CARD_WIDTH_MM } from "@/lib/card-dimensions"
import { APP_BUILD_ID } from "@/lib/app-build-id"
import { buildFormFields, buildTemplateFallbackFields, checkSubmissionStatus, type FormField } from "@/lib/submit-fields"
import { computeSubmitFormRevision } from "@/lib/submit-draft"
import { migrateTemplateToPt } from "@/lib/font-size-units"
import { getFieldRole, inferFieldRole, resolveFieldValue, sortFieldsByRole } from "@/lib/field-resolver"
import { getTemplateForClass } from "@/lib/template-resolver"
import { getSchoolFlagCatalog } from "@/lib/school-flag-catalog"
import {
  DIVISIONS,
  isDivisionDisabled,
  resolveEffectiveClassOptions,
  resolveEffectiveDivisionOptions,
  templateHasDivisionPlaceholder,
} from "@/lib/section-class"

export async function GET(req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  try {
    const cls = await prisma.class.findUnique({
      where: { linkToken: params.token },
      include: {
        school: true,
      },
    })

    if (!cls) {
      return NextResponse.json({ error: "Invalid link", code: "INVALID" }, { status: 404 })
    }

    if (!cls.isActive) {
      return NextResponse.json({ error: "This link is closed", code: "CLOSED" }, { status: 410 })
    }

    if (cls.expiresAt && new Date() > cls.expiresAt) {
      return NextResponse.json({ error: "This link has expired", code: "EXPIRED" }, { status: 410 })
    }

    // Optional: check whether this student was already submitted (return visit).
    const { searchParams } = new URL(req.url)
    if (searchParams.get("statusCheck") === "1") {
      let formData: Record<string, string> = {}
      const rawFormData = searchParams.get("formData")
      if (rawFormData) {
        try {
          formData = JSON.parse(rawFormData) as Record<string, string>
        } catch {
          return NextResponse.json({ error: "Invalid formData" }, { status: 400 })
        }
      }
      const name = resolveFieldValue(formData, "name")
      if (!name) {
        return NextResponse.json({ success: true, data: { submitted: false } })
      }
      const status = await checkSubmissionStatus(cls.id, formData)
      return NextResponse.json({
        success: true,
        data: status.submitted
          ? {
              submitted: true,
              serialNumber: status.serialNumber,
              submittedAt: status.submittedAt,
              studentName: status.studentName,
            }
          : { submitted: false },
      })
    }

    // One-shot legacy → pt font-size migration. Same logic as the
    // admin template endpoint so the public preview, the admin
    // preview, and the printed batch all share the same fontSize unit.
    let template = await getTemplateForClass(cls.id)
    if (template) {
      const { migrated, data } = migrateTemplateToPt(template as any)
      if (migrated && data) {
        try {
          template = await prisma.template.update({
            where: { id: template.id },
            data: {
              frontLayout: (data as any).frontLayout,
              backLayout: (data as any).backLayout,
              fieldMappings: (data as any).fieldMappings,
              backFieldMappings: (data as any).backFieldMappings,
              printConfig: (data as any).printConfig,
            },
          })
        } catch (e) {
          console.error("Public per-class: font-size migration persist failed (non-fatal):", e)
          template = data as any
        }
      }
    }

    // fieldConfig is auto-synced from Excel on every import — it has the EXACT Excel column
    // names as labels (e.g. "GR NO", "House", "MOBILE") and the correct stored data keys.
    // Use it as the primary form field source so the public form always matches the school's
    // Excel exactly.  Fall back to deriving from fieldMappings only for JPG-template-only
    // schools that have never imported an Excel.
    const rawMappings = (template?.fieldMappings || []) as any[]
    const backFieldMappings = (template?.backFieldMappings || []) as any[]
    const rawFieldConf = (template?.fieldConfig || []) as any[]

    // ─────────────────────────────────────────────────────────────────────
    // Form-field derivation. When the school already has student data,
    // we REBUILD the form's field list directly from the keys present
    // in that data — using each key as both the form key AND label —
    // so the public form's labels match the admin table headers
    // verbatim (e.g. "GR NO", "MOBILE", "Address", "Name", "House").
    // No aliasing, no relabelling, no extra fields. New submissions
    // therefore slot perfectly into the existing columns.
    //
    // Auto-managed keys (`NO`, `PHOTO NO.`, `class`, `photoUrl`, …) are
    // filtered out by buildFormFields() so the parent never sees them.
    //
    // For brand-new schools with no submissions yet we fall back to the
    // template's fieldConfig / fieldMappings.
    // ─────────────────────────────────────────────────────────────────────
    const templateFallback: FormField[] = buildTemplateFallbackFields(template)

    let resolvedFieldConfig: FormField[] = []
    try {
      resolvedFieldConfig = await buildFormFields(cls.school.id, templateFallback)
    } catch (e) {
      console.error("buildFormFields failed (non-fatal):", e)
      resolvedFieldConfig = templateFallback
    }

    // Merge semantic roles from template onto data-derived keys, then sort
    // fields into a parent-friendly order (name → parents → address → mobile…).
    const roleByKey = Object.fromEntries(
      templateFallback.map(f => [f.key, f.role || inferFieldRole(f.key, f.label)])
    )
    resolvedFieldConfig = sortFieldsByRole(
      resolvedFieldConfig.map(f => ({
        ...f,
        role: roleByKey[f.key] || getFieldRole(f.key, f.label),
      }))
    )

    // Detect flag/house field from EITHER fieldMappings (type=flag) OR fieldConfig key/label.
    const FLAG_FIELD_KEYS = ["flagColor", "houseFlag", "house_flag", "houseColor", "house_color"]
    const FLAG_LABEL_WORDS = ["house", "flag", "colour", "color"]
    const hasFlagMapping =
      rawMappings.some((m: any) => m.type === "flag") ||
      backFieldMappings.some((m: any) => m.type === "flag") ||
      rawFieldConf.some((f: any) =>
        FLAG_FIELD_KEYS.includes(f.key) ||
        FLAG_LABEL_WORDS.some(w => (f.label || "").toLowerCase().includes(w))
      )
    let flagColors: string[] = []
    if (hasFlagMapping) {
      try {
        const flags = await getSchoolFlagCatalog(cls.school.id)
        flagColors = flags.map(flag => flag.color)
      } catch {
        // Non-fatal — dropdown will simply be empty and form falls back to text input
      }
    }
    const classOptions = resolveEffectiveClassOptions(
      cls.classOptions,
      cls.sectionType,
      cls.name
    )
    const usesClassPicker = classOptions.length > 0
    const needsDivision = usesClassPicker && templateHasDivisionPlaceholder(rawMappings, rawFieldConf) && !isDivisionDisabled(cls.divisionOptions)
    const fixedBranch = ((template?.printConfig as { fixedBranch?: string } | null)?.fixedBranch || "").trim()
    const publicFieldConfig = fixedBranch
      ? resolvedFieldConfig.filter((f) => getFieldRole(f.key, f.label, f.role) !== "branch")
      : resolvedFieldConfig
    const formRevision = computeSubmitFormRevision(fixedBranch, publicFieldConfig)

    return NextResponse.json({
      success: true,
      data: {
        appBuildId: APP_BUILD_ID,
        formRevision,
        schoolName: cls.school.name,
        schoolLogo: cls.school.logoUrl,
        className: cls.name,
        sectionName: cls.name,
        schoolId: cls.school.id,
        classId: cls.id,
        usesClassPicker,
        classOptions,
        needsDivision,
        divisions: needsDivision ? resolveEffectiveDivisionOptions(cls.divisionOptions) : [],
        fieldConfig: publicFieldConfig,
        frontLayout: template?.frontLayout || [],
        backLayout: template?.backLayout || [],
        cardWidthMm: template?.cardWidthMm || DEFAULT_CARD_WIDTH_MM,
        cardHeightMm: template?.cardHeightMm || DEFAULT_CARD_HEIGHT_MM,
        orientation: template?.orientation || "LANDSCAPE",
        // JPG template data for card preview
        templateImageUrl: template?.templateImageUrl || null,
        fieldMappings: rawMappings,
        backTemplateImageUrl: template?.backTemplateImageUrl || null,
        backFieldMappings: (template?.backFieldMappings as any[]) || [],
        hasBackSide: template?.hasBackSide || false,
        // Photo background color for auto-replacement
        photoBgColor: template?.photoBgColor || "#FFFFFF",
        // Available house/flag colours for dropdown in public form
        flagColors,
        // Fixed branch option
        fixedBranch,
      },
    })
  } catch (error) {
    console.error("GET /api/submit/[token] error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
