import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { storageDownload } from "@/lib/storage"
import { EXPORT_BUCKET } from "@/lib/jobs/types"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  const role = session?.user?.role
  if (!session || (role !== "MANUFACTURER" && role !== "TEACHER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const job = await prisma.job.findUnique({ where: { id: params.id } })
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  // Teachers can only download jobs belonging to their own school
  if (role === "TEACHER") {
    const teacherSchoolId = session.user.schoolId
    if (!teacherSchoolId || job.schoolId !== teacherSchoolId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  if (job.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Export not ready yet", status: job.status },
      { status: 409 }
    )
  }

  const result = job.result as {
    storagePath?: string
    storageParts?: Array<{ storagePath: string; bytes: number }>
    fileName?: string
    bytes?: number
  } | null
  if (!result?.storagePath) {
    return NextResponse.json({ error: "No downloadable export for this job" }, { status: 404 })
  }

  const fileName = result.fileName || "school-archive.zip"
  const parts = result.storageParts?.length
    ? result.storageParts
    : [{ storagePath: result.storagePath, bytes: result.bytes || 0 }]
  let partIndex = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (partIndex >= parts.length) {
        controller.close()
        return
      }

      const part = parts[partIndex]
      const { data, error } = await storageDownload(EXPORT_BUCKET, part.storagePath)
      if (error || !data) {
        controller.error(new Error(`Export file part ${partIndex + 1} is missing from storage`))
        return
      }

      partIndex += 1
      controller.enqueue(new Uint8Array(data))
    },
  })

  const contentLength = parts.reduce((total, part) => total + part.bytes, 0)
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      ...(contentLength > 0 ? { "Content-Length": String(contentLength) } : {}),
    },
  })
}
