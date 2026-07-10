import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { buildStudentIndexData } from "@/lib/student-index"
import { withStudentPhotoUrl } from "@/lib/student-photo-url"

export const dynamic = "force-dynamic"

// PUT — Edit student form data by teacher
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "TEACHER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schoolId = session.user.schoolId
    if (!schoolId) {
      return NextResponse.json({ error: "No school assigned" }, { status: 400 })
    }

    const studentId = params.id
    const { formData, photoUrl, photoPath } = await req.json()

    if (!formData || typeof formData !== "object") {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
    }

    const hasPhotoUpdate = typeof photoUrl === "string" || typeof photoPath === "string"
    if (hasPhotoUpdate) {
      if (typeof photoUrl !== "string" || typeof photoPath !== "string") {
        return NextResponse.json({ error: "Invalid photo update" }, { status: 400 })
      }
      if (!photoPath.startsWith(`students/${schoolId}/`)) {
        return NextResponse.json({ error: "Photo path is not allowed for this school" }, { status: 400 })
      }
    }

    // Verify student belongs to teacher's school (and class if sub-teacher)
    const whereClause: any = { id: studentId, schoolId }
    if (!session.user.isMainTeacher && session.user.classId) {
      whereClause.classId = session.user.classId
    }

    const student = await prisma.student.findFirst({ where: whereClause })
    if (!student) {
      return NextResponse.json({ error: "Student not found or not authorized" }, { status: 404 })
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: {
        formData,
        ...(hasPhotoUpdate ? {
          photoUrl,
          photoPath,
          originalPhotoUrl: photoUrl,
          originalPhotoPath: photoPath,
          photoBgStatus: "",
        } : {}),
        ...buildStudentIndexData(formData, student.classId),
      },
      select: {
        id: true,
        serialNumber: true,
        photoUrl: true,
        photoPath: true,
        originalPhotoUrl: true,
        originalPhotoPath: true,
        photoBgStatus: true,
        photoAiRunCount: true,
        formData: true,
        status: true,
        flagNote: true,
        teacherComment: true,
        submittedAt: true,
        updatedAt: true,
        class: { select: { name: true, linkToken: true } },
      },
    })

    return NextResponse.json({ success: true, data: withStudentPhotoUrl(updated) })
  } catch (error) {
    console.error("PUT /api/teacher/students/[id]/edit error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
