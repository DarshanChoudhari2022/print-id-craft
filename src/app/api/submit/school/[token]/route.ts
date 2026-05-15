import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * Public GET — resolves a school-wide registration token to the school
 * info, its active classes (so the parent can pick from a dropdown),
 * and the same field/template metadata the per-class submit endpoint
 * exposes. Replaces per-class link sharing.
 */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  try {
    const school = await prisma.school.findUnique({
      where: { linkToken: params.token },
      include: {
        template: true,
        classes: {
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, expiresAt: true },
        },
      },
    })

    if (!school) {
      return NextResponse.json({ error: "Invalid link", code: "INVALID" }, { status: 404 })
    }

    if (!school.linkActive) {
      return NextResponse.json({ error: "This link is closed", code: "CLOSED" }, { status: 410 })
    }

    if (school.linkExpiresAt && new Date() > school.linkExpiresAt) {
      return NextResponse.json({ error: "This link has expired", code: "EXPIRED" }, { status: 410 })
    }

    const template = school.template
    const rawMappings = (template?.fieldMappings || []) as any[]
    const rawFieldConf = (template?.fieldConfig || []) as any[]

    // Same skip rules as the per-class endpoint — keeps behaviour consistent.
    const FORM_SKIP_KEYS = new Set(["class", "classSection", "photoUrl", "srNo", "photoId"])
    const FORM_SKIP_LABELS = new Set([
      "class", "class-section", "photo url", "photourl",
      "no", "no.", "photo no", "photo no.", "photo id", "photo number",
    ])

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

    // Align form keys with existing students' actual stored keys (same
    // logic as the per-class endpoint) so submissions land in the right
    // columns regardless of fieldConfig drift.
    try {
      const existingStudents = await prisma.student.findMany({
        where: { schoolId: school.id },
        select: { formData: true },
        take: 200,
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
          if (existingKeys.includes(f.key)) return f
          const nf = normalize(f.key)
          const ciMatch = existingKeys.find(k => normalize(k) === nf)
          if (ciMatch) return { ...f, key: ciMatch }
          const grp = findGroupFor(f.key)
          if (grp) {
            const candidates = existingKeys
              .filter(k => grp.some(g => normalize(g) === normalize(k)))
              .sort((a, b) => (existingKeyFreq[b] || 0) - (existingKeyFreq[a] || 0))
            if (candidates.length > 0) return { ...f, key: candidates[0] }
          }
          if (f.label) {
            const nl = normalize(String(f.label))
            const labelMatch = existingKeys.find(k => normalize(k) === nl)
            if (labelMatch) return { ...f, key: labelMatch }
          }
          return f
        })
      }
    } catch (alignErr) {
      console.error("Field-key alignment failed (non-fatal):", alignErr)
    }

    // House/flag colour vocabulary (same as per-class endpoint).
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
          where: { schoolId: school.id },
          select: { formData: true },
        })
        for (const s of otherStudents) {
          const fd = (s.formData as Record<string, string> | null) || {}
          for (const k of FLAG_KEYS) {
            const v = (fd[k] || "").trim()
            if (v) flagColorSet.add(v)
          }
        }
      } catch { /* non-fatal */ }
    }
    const flagColors = Array.from(flagColorSet).sort((a, b) => a.localeCompare(b))

    return NextResponse.json({
      success: true,
      data: {
        schoolName: school.name,
        schoolLogo: school.logoUrl,
        schoolId: school.id,
        // Class dropdown — parent picks one before submitting.
        classes: school.classes.map(c => ({
          id: c.id,
          name: c.name,
          // Drop classes whose individual expiry has passed even if the
          // school link itself is still active.
          expired: !!(c.expiresAt && new Date() > c.expiresAt),
        })).filter(c => !c.expired)
          .map(({ id, name }) => ({ id, name })),
        fieldConfig: resolvedFieldConfig,
        frontLayout: template?.frontLayout || [],
        backLayout: template?.backLayout || [],
        cardWidthMm: template?.cardWidthMm || 85.6,
        cardHeightMm: template?.cardHeightMm || 54.0,
        orientation: template?.orientation || "LANDSCAPE",
        templateImageUrl: template?.templateImageUrl || null,
        fieldMappings: rawMappings,
        photoBgColor: template?.photoBgColor || "#FFFFFF",
        flagColors,
      },
    })
  } catch (error) {
    console.error("GET /api/submit/school/[token] error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
