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

    const students = await prisma.student.findMany({
      where: { schoolId },
      include: { class: { select: { name: true } } },
      orderBy: { submittedAt: "desc" },
    })

    return NextResponse.json({ success: true, data: students })
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
