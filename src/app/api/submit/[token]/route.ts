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

    // Re-derive fieldConfig from fieldMappings on every read so the public form
    // always shows exactly the fields placed on the JPG template — no extra/stale
    // default fields, correct label names, correct order.
    const rawMappings = (template?.fieldMappings || []) as any[]
    let resolvedFieldConfig: any[]
    if (rawMappings.length > 0) {
      resolvedFieldConfig = rawMappings
        .filter((m: any) => m.type !== "photo")
        .map((m: any) => {
          const k = (m.fieldKey || "").toLowerCase()
          let formType = "text"
          if (k.includes("phone") || k.includes("mob") || k === "mob_father" || k === "mother_phone") formType = "tel"
          return { key: m.fieldKey, label: m.label, type: formType, required: true }
        })
    } else {
      resolvedFieldConfig = (template?.fieldConfig || []) as any[]
    }

    // Only query students for house/flag colours when the template actually has
    // a flag-type mapping. For schools without flags this avoids a full table scan.
    const hasFlagMapping = rawMappings.some((m: any) => m.type === "flag")
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
