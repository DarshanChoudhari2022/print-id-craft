import {
  normalizePersonName,
  normalizeStudentFormData,
} from "@/lib/student-text-normalization"

type StudentWithPhoto = {
  id: string
  photoUrl?: string | null
  photoPath?: string | null
  updatedAt?: string | Date | null
  photoUpdatedAt?: number
  formData?: unknown
  fullName?: string | null
}

/** Cache-bust token for student photo media URLs (storage path is stable after reprocess). */
export function photoCacheVersion(
  student: Pick<StudentWithPhoto, "updatedAt" | "photoUpdatedAt">
): number | undefined {
  if (student.photoUpdatedAt) return student.photoUpdatedAt
  if (student.updatedAt) return new Date(student.updatedAt).getTime()
  return undefined
}

export function studentPhotoUrl(student: StudentWithPhoto): string {
  const version = photoCacheVersion(student)
  if (student.photoPath) {
    return `/api/media/student-photo/${student.id}${version ? `?v=${version}` : ""}`
  }
  return student.photoUrl || ""
}

export function withStudentPhotoUrl<T extends StudentWithPhoto>(student: T): T {
  const normalizedFormData =
    student.formData && typeof student.formData === "object" && !Array.isArray(student.formData)
      ? normalizeStudentFormData(student.formData as Record<string, unknown>)
      : student.formData
  return {
    ...student,
    ...(normalizedFormData !== undefined ? { formData: normalizedFormData } : {}),
    ...(typeof student.fullName === "string"
      ? { fullName: normalizePersonName(student.fullName) }
      : {}),
    photoUrl: studentPhotoUrl(student),
  } as T
}

/** Append a cache-bust query param when fetching a photo for reprocessing. */
export function cacheBustPhotoUrl(url: string, token = Date.now()): string {
  if (!url || url.startsWith("data:")) return url
  const sep = url.includes("?") ? "&" : "?"
  return `${url}${sep}v=${token}`
}
