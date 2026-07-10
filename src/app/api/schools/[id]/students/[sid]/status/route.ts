import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const statusSchema = z.object({
  status: z.enum(["PENDING", "SUBMITTED", "FLAGGED", "APPROVED", "PRINTED"]),
})

export async function PUT(req: Request, props: { params: Promise<{ id: string; sid: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    // Teachers can only update students from their own school and, for sub-teachers, their assigned class.
    if (session.user?.role === "TEACHER" && session.user.schoolId !== params.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const validated = statusSchema.parse(body)

    const where: { id: string; schoolId: string; classId?: string } = {
      id: params.sid,
      schoolId: params.id,
    }
    if (session.user?.role === "TEACHER" && !session.user.isMainTeacher) {
      if (!session.user.classId) {
        return NextResponse.json({ error: "No class assigned" }, { status: 403 })
      }
      where.classId = session.user.classId
    }

    const result = await prisma.student.updateMany({
      where,
      data: { status: validated.status },
    })
    if (result.count === 0) {
      return NextResponse.json({ error: "Student not found or not authorized" }, { status: 404 })
    }

    const student = await prisma.student.findUnique({
      where: { id: params.sid },
      select: { id: true, status: true },
    })

    return NextResponse.json({ success: true, data: student })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
