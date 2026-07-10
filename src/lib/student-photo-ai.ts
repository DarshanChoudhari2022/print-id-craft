export function nextAiRunCount(current: number | null | undefined): number {
  return Math.max(0, Number(current) || 0) + 1
}

export function isApiAiProcessingModel(model: string | null | undefined): boolean {
  return model === "removebg"
}

export function buildProcessedPhotoPath(schoolId: string, studentId: string, runCount: number): string {
  return `students/${schoolId}/api-ai/${studentId}-run-${runCount}.jpg`
}

export function contentTypeFromPhotoPath(path: string | null | undefined): string {
  const ext = path?.split(".").pop()?.toLowerCase()
  if (ext === "png") return "image/png"
  if (ext === "webp") return "image/webp"
  return "image/jpeg"
}
