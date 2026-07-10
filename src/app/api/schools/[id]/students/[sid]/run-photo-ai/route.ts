import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ensureBucket, storageDownload, storagePublicUrl, storageUpload } from "@/lib/storage"
import { removeBackgroundForSubmit } from "@/lib/removebg-api"
import { PHOTO_BG_STATUS } from "@/lib/photo-bg-status"
import { withStudentPhotoUrl } from "@/lib/student-photo-url"
import { getTemplateForClass } from "@/lib/template-resolver"
import {
  buildProcessedPhotoPath,
  contentTypeFromPhotoPath,
  nextAiRunCount,
} from "@/lib/student-photo-ai"

export const runtime = "nodejs"
export const maxDuration = 300

const BUCKET = "student-photos"

async function readSourcePhoto(student: {
  id: string
  originalPhotoPath: string
  originalPhotoUrl: string
  photoPath: string
  photoUrl: string
}): Promise<{ buffer: Buffer; contentType: string; fileName: string; sourcePath: string; sourceUrl: string }> {
  const sourcePath = student.originalPhotoPath || student.photoPath
  const sourceUrl = student.originalPhotoUrl || student.photoUrl
  if (sourcePath) {
    const { data, error } = await storageDownload(BUCKET, sourcePath)
    if (error || !data) throw new Error("Could not download the student photo")
    return {
      buffer: data,
      contentType: contentTypeFromPhotoPath(sourcePath),
      fileName: sourcePath.split("/").pop() || `${student.id}.jpg`,
      sourcePath,
      sourceUrl,
    }
  }

  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    throw new Error("Student photo is missing")
  }

  const response = await fetch(sourceUrl, { cache: "no-store" })
  if (!response.ok) throw new Error("Could not read the student photo")
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "image/jpeg",
    fileName: `${student.id}.jpg`,
    sourcePath: "",
    sourceUrl,
  }
}

export async function POST(req: Request, props: { params: Promise<{ id: string; sid: string }> }) {
  const params = await props.params
  try {
    const session = await getServerSession(authOptions)
    if (!session || (session.user?.role !== "MANUFACTURER" && session.user?.role !== "TEACHER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.user.role === "TEACHER" && session.user.schoolId !== params.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const where: { id: string; schoolId: string; classId?: string } = {
      id: params.sid,
      schoolId: params.id,
    }
    if (session.user.role === "TEACHER" && !session.user.isMainTeacher) {
      if (!session.user.classId) return NextResponse.json({ error: "No class assigned" }, { status: 403 })
      where.classId = session.user.classId
    }

    const student = await prisma.student.findFirst({
      where,
      select: {
        id: true,
        schoolId: true,
        classId: true,
        serialNumber: true,
        photoUrl: true,
        photoPath: true,
        originalPhotoUrl: true,
        originalPhotoPath: true,
        photoAiRunCount: true,
        formData: true,
      },
    })
    if (!student) {
      return NextResponse.json({ error: "Student not found or not authorized" }, { status: 404 })
    }

    const template = await getTemplateForClass(student.classId)
    const bgColor = template?.photoBgColor || "#FFFFFF"
    const source = await readSourcePhoto(student)
    const { buffer } = await removeBackgroundForSubmit(source.buffer, source.contentType, source.fileName, bgColor)

    await ensureBucket(BUCKET)
    const runCount = nextAiRunCount(student.photoAiRunCount)
    const photoPath = buildProcessedPhotoPath(params.id, student.id, runCount)
    const { error: uploadError } = await storageUpload(BUCKET, photoPath, buffer, {
      contentType: "image/jpeg",
      upsert: true,
    })
    if (uploadError) {
      return NextResponse.json({ error: `AI photo upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const photoUrl = storagePublicUrl(BUCKET, photoPath)
    const updated = await prisma.student.update({
      where: { id: student.id },
      data: {
        photoUrl,
        photoPath,
        photoBgStatus: PHOTO_BG_STATUS.REPROCESSED,
        photoAiRunCount: runCount,
        ...(!student.originalPhotoPath && !student.originalPhotoUrl ? {
          originalPhotoPath: source.sourcePath,
          originalPhotoUrl: source.sourceUrl,
        } : {}),
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
        classId: true,
        class: { select: { id: true, name: true, linkToken: true } },
      },
    })

    return NextResponse.json({
      success: true,
      data: withStudentPhotoUrl(updated),
    })
  } catch (error: any) {
    console.error("Run photo AI error:", error)
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 })
  }
}
