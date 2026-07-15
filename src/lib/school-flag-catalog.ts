import { prisma } from "@/lib/prisma"
import { storageList, storagePublicUrl } from "@/lib/storage"
import {
  buildHouseFlagDefinitions,
  resolveHouseValue,
  type HouseFlagDefinition,
} from "@/lib/house-flags"

const BUCKET = "student-photos"

export async function getSchoolFlagCatalog(
  schoolId: string,
): Promise<HouseFlagDefinition[]> {
  const students = await prisma.student.findMany({
    where: { schoolId },
    select: { formData: true },
  })
  const studentValues = students
    .map(student => resolveHouseValue(
      (student.formData as Record<string, string> | null) || {},
    ))
    .filter(Boolean)

  let storedFiles: string[] = []
  try {
    const { data, error } = await storageList(BUCKET, `flags/${schoolId}`)
    if (error) {
      console.error("Flag list error:", error)
    } else {
      storedFiles = (data || []).map(file => file.name)
    }
  } catch (error) {
    console.error("Flag list exception:", error)
  }

  return buildHouseFlagDefinitions(
    studentValues,
    storedFiles,
    filename => storagePublicUrl(BUCKET, `flags/${schoolId}/${filename}`),
  )
}
