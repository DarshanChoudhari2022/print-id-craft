import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "TEACHER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schoolId = session.user.schoolId
    if (!schoolId) {
      return NextResponse.json({ error: "No school assigned" }, { status: 400 })
    }

    const [school, classes, students] = await Promise.all([
      prisma.school.findUnique({
        where: { id: schoolId },
        select: { name: true, logoUrl: true },
      }),
      prisma.class.findMany({
        where: { schoolId },
        include: { _count: { select: { students: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.student.findMany({
        where: { schoolId },
        include: { class: { select: { name: true, linkToken: true } } },
        orderBy: { submittedAt: "desc" },
      }),
    ])

    const stats = {
      total: students.length,
      submitted: students.filter((s) => s.status === "SUBMITTED").length,
      approved: students.filter((s) => s.status === "APPROVED").length,
      flagged: students.filter((s) => s.status === "FLAGGED").length,
      pending: students.filter((s) => s.status === "PENDING").length,
      printed: students.filter((s) => s.status === "PRINTED").length,
    }

    return NextResponse.json({
      success: true,
      data: { school, classes, students, stats },
    })
  } catch (error) {
    console.error("Teacher dashboard error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
