import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const schema = z.object({
  fixedOfficeNo: z.string().trim().max(100),
})

export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  try {
    const session = await getServerSession(authOptions)
    const authorized =
      session?.user?.role === "MANUFACTURER" ||
      (session?.user?.role === "TEACHER" &&
        session.user.isMainTeacher &&
        session.user.schoolId === id)

    if (!authorized) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { fixedOfficeNo } = schema.parse(await req.json())
    const templates = await prisma.template.findMany({
      where: { schoolId: id },
      select: { id: true, printConfig: true },
    })

    await prisma.$transaction(
      templates.map(template =>
        prisma.template.update({
          where: { id: template.id },
          data: {
            printConfig: {
              ...((template.printConfig as Record<string, unknown> | null) || {}),
              fixedOfficeNo,
            },
          },
        })
      )
    )

    return NextResponse.json({
      success: true,
      data: { fixedOfficeNo, updatedTemplates: templates.length },
    })
  } catch (error) {
    console.error(`PUT /api/schools/${id}/fixed-office-number error:`, error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
