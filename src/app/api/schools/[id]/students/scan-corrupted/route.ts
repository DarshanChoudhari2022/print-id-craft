import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { storageDownload } from "@/lib/storage"
import { isBlackBoxCorruptedPhoto } from "@/lib/photo-corruption-detector"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const BUCKET = "student-photos"

async function fetchPhotoBuffer(photoPath?: string | null, photoUrl?: string | null): Promise<Buffer | null> {
  if (photoPath) {
    const { data } = await storageDownload(BUCKET, photoPath)
    if (data) return data
  }
  if (photoUrl && /^https?:\/\//i.test(photoUrl)) {
    try {
      const res = await fetch(photoUrl, { cache: "no-store" })
      if (res.ok) {
        return Buffer.from(await res.arrayBuffer())
      }
    } catch {
      return null
    }
  }
  return null
}

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const schoolId = params.id

  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.user.role === "TEACHER" && session.user.schoolId !== schoolId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    } else if (session.user.role !== "MANUFACTURER" && session.user.role !== "TEACHER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const students = await prisma.student.findMany({
      where: { schoolId },
      select: {
        id: true,
        serialNumber: true,
        status: true,
        flagNote: true,
        photoPath: true,
        photoUrl: true,
        formData: true,
      },
    })

    let scannedCount = 0
    let corruptedCount = 0
    const corruptedStudents: Array<{ id: string; serialNumber: string; name: string }> = []

    for (const student of students) {
      if (!student.photoPath && !student.photoUrl) continue
      scannedCount++

      const buffer = await fetchPhotoBuffer(student.photoPath, student.photoUrl)
      if (!buffer) continue

      const isCorrupted = await isBlackBoxCorruptedPhoto(buffer)
      if (isCorrupted) {
        corruptedCount++
        const fd = (student.formData || {}) as Record<string, string>
        const studentName = fd.fullName || fd["Full Name"] || fd["Student Name"] || fd.name || student.serialNumber

        corruptedStudents.push({
          id: student.id,
          serialNumber: student.serialNumber,
          name: studentName,
        })

        // Automatically flag corrupted student record
        await prisma.student.update({
          where: { id: student.id },
          data: {
            status: "FLAGGED",
            flagNote: "Photo corrupted (black block detected) — please re-upload",
          },
        })
      }
    }

    return NextResponse.json({
      success: true,
      scannedCount,
      corruptedCount,
      corruptedStudents,
      message: corruptedCount > 0
        ? `Found and flagged ${corruptedCount} corrupted photo(s).`
        : "No corrupted photos detected in this school.",
    })
  } catch (error: any) {
    console.error("Scan corrupted photos error:", error)
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 })
  }
}
