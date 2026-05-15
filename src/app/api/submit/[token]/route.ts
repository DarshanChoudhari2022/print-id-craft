import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: { token: string } }) {
  try {
    const cls = await prisma.class.findUnique({
      where: { linkToken: params.token },
      include: {
        school: {
          include: {
            template: true,
          },
        },
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

    const template = cls.school.template

    // fieldConfig is auto-synced from Excel on every import — it has the EXACT Excel column
    // names as labels (e.g. "GR NO", "House", "MOBILE") and the correct stored data keys.
    // Use it as the primary form field source so the public form always matches the school's
    // Excel exactly.  Fall back to deriving from fieldMappings only for JPG-template-only
    // schools that have never imported an Excel.
    const rawMappings = (template?.fieldMappings || []) as any[]
    const rawFieldConf = (template?.fieldConfig || []) as any[]

    // Keys/labels that students should not fill in (system-managed or auto-filled)
    const FORM_SKIP_KEYS = new Set(["class", "classSection", "photoUrl", "srNo", "photoId"])
    const FORM_SKIP_LABELS = new Set(["class", "class-section", "photo url", "photourl", "no", "no.", "photo no", "photo no.", "photo id", "photo number"])

    let resolvedFieldConfig: any[]
    if (rawFieldConf.length > 0) {
      resolvedFieldConfig = rawFieldConf
        .filter((f: any) =>
          !FORM_SKIP_KEYS.has(f.key) &&
          !FORM_SKIP_LABELS.has((f.label || "").toLowerCase().trim())
        )
        .map((f: any) => {
          const k = (f.key || "").toLowerCase()
          const l = (f.label || "").toLowerCase()
          let formType = f.type || "text"
          if (k === "phone" || k.includes("mob") || l.includes("mobile") || l.includes("phone")) formType = "tel"
          return { key: f.key, label: f.label, type: formType, required: true }
        })
    } else if (rawMappings.length > 0) {
      resolvedFieldConfig = rawMappings
        .filter((m: any) => m.type !== "photo")
        .map((m: any) => {
          const k = (m.fieldKey || "").toLowerCase()
          let formType = "text"
          if (k.includes("phone") || k.includes("mob") || k === "mob_father" || k === "mother_phone") formType = "tel"
          return { key: m.fieldKey, label: m.label, type: formType, required: true }
        })
    } else {
      resolvedFieldConfig = []
    }

    // ─────────────────────────────────────────────────────────────────────
    // CRITICAL: Align form field keys with the ACTUAL keys already stored
    // in existing students' formData for this school. This guarantees that
    // a parent's submission lands in the same columns as the rest of the
    // database (Excel-imported rows), regardless of whether the template's
    // fieldConfig was generated from JPG mappings (e.g. "studentName",
    // "houseFlag", "rollNo") before the Excel import re-keyed everything
    // to ("fullName", "flagColor", "grNo", ...).
    //
    // Strategy: collect the union of keys from all existing students, then
    // for each form field, try to find an existing key that matches by
    // fuzzy alias (same logic as the table view in the admin dashboard).
    // If a match is found, rewrite the form field's `key` to that existing
    // key so the submission slots into the right column.
    // ─────────────────────────────────────────────────────────────────────
    try {
      const existingStudents = await prisma.student.findMany({
        where: { schoolId: cls.school.id },
        select: { formData: true },
        take: 200, // bounded — 200 rows is plenty to learn the key vocabulary
      })

      if (existingStudents.length > 0) {
        const existingKeyFreq: Record<string, number> = {}
        for (const s of existingStudents) {
          const fd = (s.formData as Record<string, unknown> | null) || {}
          for (const k of Object.keys(fd)) {
            const v = fd[k]
            if (v != null && String(v).trim() !== "") {
              existingKeyFreq[k] = (existingKeyFreq[k] || 0) + 1
            }
          }
        }
        const existingKeys = Object.keys(existingKeyFreq)

        // Fuzzy alias groups — keys in the same group are considered the
        // "same field" across schools, so a form key like "studentName" can
        // be remapped to an existing data key like "fullName".
        const ALIAS_GROUPS: string[][] = [
          ["fullName", "name", "studentName", "Student Name", "Student_Name", "Full Name", "full_name", "student_name", "NAME", "Name"],
          ["rollNo", "roll", "Roll No", "Roll No.", "RollNo", "roll_no"],
          ["grNo", "GR NO", "GR No", "GR_NO", "GRNo", "gr_no", "Gr No"],
          ["srNo", "NO", "No", "no", "sr_no", "Sr No"],
          ["phone", "mobile", "Mobile", "MOBILE", "Phone", "mob", "MOB", "mob_father", "fatherPhone", "father_phone"],
          ["flagColor", "houseFlag", "house_flag", "House", "house", "House Flag", "Flag", "Colour", "colour", "Color", "color"],
          ["photoId", "Photo ID", "PHOTO NO.", "PHOTO NO", "Photo No", "Photo No.", "photo_id", "PhotoId", "photo_no"],
          ["address", "Address", "ADDRESS", "addr", "Add", "Add:"],
          ["fatherName", "father", "Father", "Father Name", "Father's Name", "father_name"],
          ["motherName", "mother", "Mother", "Mother Name", "Mother's Name", "mother_name"],
          ["dob", "DOB", "Date of Birth", "date_of_birth", "birthDate", "birthday"],
          ["bloodGroup", "Blood Group", "blood_group", "BG", "bg"],
          ["branch", "Branch", "BRANCH"],
          ["section", "Section", "SECTION", "division", "Division"],
        ]
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
        const findGroupFor = (key: string): string[] | null => {
          const nk = normalize(key)
          for (const grp of ALIAS_GROUPS) {
            if (grp.some(k => normalize(k) === nk)) return grp
          }
          return null
        }

        resolvedFieldConfig = resolvedFieldConfig.map((f: any) => {
          // 1) Exact key already in existing data → no change needed
          if (existingKeys.includes(f.key)) return f

          // 2) Case-insensitive / normalized match against existing keys
          const nf = normalize(f.key)
          const ciMatch = existingKeys.find(k => normalize(k) === nf)
          if (ciMatch) return { ...f, key: ciMatch }

          // 3) Alias-group match — pick the most-used existing key in the group
          const grp = findGroupFor(f.key)
          if (grp) {
            const candidates = existingKeys
              .filter(k => grp.some(g => normalize(g) === normalize(k)))
              .sort((a, b) => (existingKeyFreq[b] || 0) - (existingKeyFreq[a] || 0))
            if (candidates.length > 0) return { ...f, key: candidates[0] }
          }

          // 4) Label-based match — if any existing key has the same normalized
          //    form as this field's label, use that key.
          if (f.label) {
            const nl = normalize(String(f.label))
            const labelMatch = existingKeys.find(k => normalize(k) === nl)
            if (labelMatch) return { ...f, key: labelMatch }
          }

          // No match — leave key as-is (new field that the existing data
          // doesn't have yet).
          return f
        })
      }
    } catch (alignErr) {
      console.error("Field-key alignment failed (non-fatal):", alignErr)
    }

    // Detect flag/house field from EITHER fieldMappings (type=flag) OR fieldConfig key/label.
    const FLAG_FIELD_KEYS = ["flagColor", "houseFlag", "house_flag", "houseColor", "house_color"]
    const FLAG_LABEL_WORDS = ["house", "flag", "colour", "color"]
    const hasFlagMapping =
      rawMappings.some((m: any) => m.type === "flag") ||
      rawFieldConf.some((f: any) =>
        FLAG_FIELD_KEYS.includes(f.key) ||
        FLAG_LABEL_WORDS.some(w => (f.label || "").toLowerCase().includes(w))
      )
    const FLAG_KEYS = ["flagColor", "Flag Color", "flag_color", "House", "house", "Colour", "colour", "houseFlag", "house_flag", "houseColor", "house_color"]
    const flagColorSet = new Set<string>()
    if (hasFlagMapping) {
      try {
        const otherStudents = await prisma.student.findMany({
          where: { schoolId: cls.school.id },
          select: { formData: true },
        })
        for (const s of otherStudents) {
          const fd = (s.formData as Record<string, string> | null) || {}
          for (const k of FLAG_KEYS) {
            const v = (fd[k] || "").trim()
            if (v) flagColorSet.add(v)
          }
        }
      } catch {
        // Non-fatal — dropdown will simply be empty and form falls back to text input
      }
    }
    const flagColors = Array.from(flagColorSet).sort((a, b) => a.localeCompare(b))

    return NextResponse.json({
      success: true,
      data: {
        schoolName: cls.school.name,
        schoolLogo: cls.school.logoUrl,
        className: cls.name,
        schoolId: cls.school.id,
        classId: cls.id,
        fieldConfig: resolvedFieldConfig,
        frontLayout: template?.frontLayout || [],
        backLayout: template?.backLayout || [],
        cardWidthMm: template?.cardWidthMm || 85.6,
        cardHeightMm: template?.cardHeightMm || 54.0,
        orientation: template?.orientation || "LANDSCAPE",
        // JPG template data for card preview
        templateImageUrl: template?.templateImageUrl || null,
        fieldMappings: rawMappings,
        // Photo background color for auto-replacement
        photoBgColor: template?.photoBgColor || "#FFFFFF",
        // Available house/flag colours for dropdown in public form
        flagColors,
      },
    })
  } catch (error) {
    console.error("GET /api/submit/[token] error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
