import { runWithMissingColumnFallback } from "@/lib/prisma-query-compat"

export const TEACHER_EDIT_AUTH_SELECT = {
  id: true,
  classId: true,
} as const

export async function updateTeacherStudentWithPhotoAiFallback<T extends object>(
  fullUpdate: () => Promise<T & { photoAiRunCount: number }>,
  compatibleUpdate: () => Promise<T>,
): Promise<T & { photoAiRunCount: number }> {
  return runWithMissingColumnFallback(
    fullUpdate,
    async () => ({ ...(await compatibleUpdate()), photoAiRunCount: 0 }),
  )
}
