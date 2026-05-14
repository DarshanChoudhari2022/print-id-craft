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

    // Collect the unique house/flag colours that have already been used by other
    // students in this school so the public form can render a dropdown rather
    // than a free-text input (parents often misspell colour names). We look at
    // a handful of common keys to be tolerant of varied field configs.
    const FLAG_KEYS = ["flagColor", "Flag Color", "flag_color", "House", "house", "Colour", "colour", "houseFlag", "house_flag", "houseColor", "house_color"]
    const flagColorSet = new Set<string>()
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
    const flagColors = Array.from(flagColorSet).sort((a, b) => a.localeCompare(b))

    return NextResponse.json({
      success: true,
      data: {
        schoolName: cls.school.name,
        schoolLogo: cls.school.logoUrl,
        className: cls.name,
        schoolId: cls.school.id,
        classId: cls.id,
        fieldConfig: template?.fieldConfig || [],
        frontLayout: template?.frontLayout || [],
        backLayout: template?.backLayout || [],
        cardWidthMm: template?.cardWidthMm || 85.6,
        cardHeightMm: template?.cardHeightMm || 54.0,
        orientation: template?.orientation || "LANDSCAPE",
        // JPG template data for card preview
        templateImageUrl: template?.templateImageUrl || null,
        fieldMappings: template?.fieldMappings || [],
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
