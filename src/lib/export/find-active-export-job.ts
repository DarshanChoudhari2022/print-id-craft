import { prisma } from "@/lib/prisma"
import type { ExportArchivePayload } from "@/lib/jobs/types"

function isSameExport(
  candidate: ExportArchivePayload | null,
  requested: ExportArchivePayload
) {
  if (!candidate) return false
  return (
    candidate.classId === requested.classId &&
    candidate.status === requested.status &&
    candidate.includePhotos === requested.includePhotos &&
    (candidate.format || "archive") === (requested.format || "archive") &&
    candidate.totalStudents === requested.totalStudents
  )
}

export async function findActiveExportJob(
  schoolId: string,
  createdById: string,
  payload: ExportArchivePayload
) {
  const activeJobs = await prisma.job.findMany({
    where: {
      schoolId,
      createdById,
      type: "EXPORT_SCHOOL_ARCHIVE",
      status: { in: ["PENDING", "RUNNING"] },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, status: true, payload: true },
  })

  return (activeJobs || []).find((job) =>
    isSameExport(job.payload as ExportArchivePayload | null, payload)
  ) || null
}
