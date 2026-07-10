import { runWithMissingColumnFallback } from "@/lib/prisma-query-compat"

export async function updateTeacherStudentWithPhotoAiFallback<T extends object>(
  fullUpdate: () => Promise<T & { photoAiRunCount: number }>,
  compatibleUpdate: () => Promise<T>,
): Promise<T & { photoAiRunCount: number }> {
  return runWithMissingColumnFallback(
    fullUpdate,
    async () => ({ ...(await compatibleUpdate()), photoAiRunCount: 0 }),
  )
}
