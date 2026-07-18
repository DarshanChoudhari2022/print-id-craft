import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { prisma } from "../src/lib/prisma"
import { normalizeStudentFormData } from "../src/lib/student-text-normalization"
import { buildStudentIndexData } from "../src/lib/student-index"
import type { StudentFieldDescriptor } from "../src/lib/student-text-normalization"

type BackupRow = {
  id: string
  schoolId: string
  classId: string
  formData: unknown
  fullName: string
  normalizedName: string
  normalizedFatherName: string
  normalizedDob: string
  normalizedRollNo: string
  normalizedSearchText: string
  duplicateFingerprint: string | null
}

const apply = process.argv.includes("--apply")
const schoolArg = process.argv.find(arg => arg.startsWith("--school-id="))
const schoolId = schoolArg?.slice("--school-id=".length).trim() || undefined

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function main() {
  const [students, templates] = await Promise.all([
    prisma.student.findMany({
      where: schoolId ? { schoolId } : undefined,
      select: {
        id: true,
        schoolId: true,
        classId: true,
        formData: true,
        fullName: true,
        normalizedName: true,
        normalizedFatherName: true,
        normalizedDob: true,
        normalizedRollNo: true,
        normalizedSearchText: true,
        duplicateFingerprint: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.template.findMany({
      where: schoolId ? { schoolId } : undefined,
      select: { schoolId: true, fieldConfig: true },
    }),
  ])

  const fieldsBySchool = new Map<string, Map<string, StudentFieldDescriptor>>()
  for (const template of templates) {
    const schoolFields = fieldsBySchool.get(template.schoolId) || new Map()
    const fields = Array.isArray(template.fieldConfig)
      ? template.fieldConfig as StudentFieldDescriptor[]
      : []
    for (const field of fields) {
      if (field?.key && !schoolFields.has(field.key)) schoolFields.set(field.key, field)
    }
    fieldsBySchool.set(template.schoolId, schoolFields)
  }

  const changes = students.flatMap(student => {
    const current = (student.formData || {}) as Record<string, unknown>
    const fields = Array.from(fieldsBySchool.get(student.schoolId)?.values() || [])
    const normalized = normalizeStudentFormData(current, fields)
    const indexData = buildStudentIndexData(normalized, student.classId)
    const indexChanged =
      student.fullName !== indexData.fullName ||
      student.normalizedName !== indexData.normalizedName ||
      student.normalizedFatherName !== indexData.normalizedFatherName ||
      student.normalizedDob !== indexData.normalizedDob ||
      student.normalizedRollNo !== indexData.normalizedRollNo ||
      student.normalizedSearchText !== indexData.normalizedSearchText ||
      student.duplicateFingerprint !== indexData.duplicateFingerprint
    if (sameJson(current, normalized) && !indexChanged) return []
    return [{
      student,
      normalized,
      indexData,
    }]
  })

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    schoolId: schoolId || "all",
    scanned: students.length,
    wouldChange: changes.length,
    unchanged: students.length - changes.length,
  }, null, 2))

  if (!apply || changes.length === 0) {
    if (!apply) console.log("No records were written. Re-run with --apply after reviewing the count.")
    return
  }

  const backupDir = path.resolve(process.cwd(), "outputs", "student-text-backups")
  await mkdir(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = path.join(backupDir, `student-text-before-${stamp}.json`)
  const backup: BackupRow[] = changes.map(({ student }) => student)
  await writeFile(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    schoolId: schoolId || null,
    rows: backup,
  }, null, 2), "utf8")
  console.log(`Backup written before updates: ${backupPath}`)

  const BATCH_SIZE = 100
  let updated = 0
  for (let start = 0; start < changes.length; start += BATCH_SIZE) {
    const batch = changes.slice(start, start + BATCH_SIZE)
    await prisma.$transaction(
      batch.map(({ student, normalized, indexData }) =>
        prisma.student.update({
          where: { id: student.id },
          data: {
            formData: normalized as any,
            ...indexData,
          },
        })
      ),
    )
    updated += batch.length
    console.log(`Updated ${updated}/${changes.length}`)
  }

  console.log(`Completed safely. Updated ${updated} records. Backup: ${backupPath}`)
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
