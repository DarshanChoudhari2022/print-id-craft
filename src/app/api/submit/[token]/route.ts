import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: { token: string } }) {
  try {
    const cls = await prisma.class.findUnique({
      where: { linkToken: params.token },
      include: {
        school: {
          include: {
            template: { select: { fieldConfig: true } },
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

    return NextResponse.json({
      success: true,
      data: {
        schoolName: cls.school.name,
        schoolLogo: cls.school.logoUrl,
        className: cls.name,
        schoolId: cls.school.id,
        classId: cls.id,
        fieldConfig: cls.school.template?.fieldConfig || [],
      },
    })
  } catch (error) {
    console.error("GET /api/submit/[token] error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
