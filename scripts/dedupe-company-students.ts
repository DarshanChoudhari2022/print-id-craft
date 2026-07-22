import "dotenv/config"
import fs from "node:fs/promises"
import path from "node:path"
import { PrismaClient } from "@prisma/client"
import { buildImportIdentityKeys } from "@/lib/import-identity"

const prisma = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const targetSchoolName = "Company ID Cards"
const outputDir = path.resolve("outputs/company-deduplication")

function chooseIdentity(formData: Record<string, string>): string {
  const keys = buildImportIdentityKeys(formData)
  return keys.find(key => key.startsWith("employee:"))
    || keys.find(key => key.startsWith("name-dob:"))
    || keys.find(key => key.startsWith("name-mobile:"))
    || keys.find(key => key.startsWith("record:"))
    || ""
}

function recordScore(student: any): number {
  const fd = (student.formData || {}) as Record<string, unknown>
  const photoScore = student.photoUrl || student.photoPath ? 1000 : 0
  const processedScore = ["PROCESSED", "REPROCESSED", "PLAIN"].includes(student.photoBgStatus) ? 50 : 0
  const statusScore = student.status === "PRINTED" ? 40 : student.status === "APPROVED" ? 30 : 0
  const completeness = Object.values(fd).filter(value => String(value ?? "").trim()).length
  return photoScore + processedScore + statusScore + completeness
}

async function main() {
  const schools = await prisma.school.findMany({ select: { id: true, name: true } })
  const school = schools.find(item => item.name.trim().toLowerCase() === targetSchoolName.toLowerCase())
  if (!school) throw new Error(`School '${targetSchoolName}' not found.`)

  const students = await prisma.student.findMany({
    where: { schoolId: school.id },
    orderBy: { submittedAt: "asc" },
  })

  const groups = new Map<string, typeof students>()
  for (const student of students) {
    const identity = chooseIdentity((student.formData || {}) as Record<string, string>)
    if (!identity) continue
    const group = groups.get(identity) || []
    group.push(student)
    groups.set(identity, group)
  }

  const duplicates = Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([identity, group]) => {
      const sorted = [...group].sort((a, b) => {
        const scoreDiff = recordScore(b) - recordScore(a)
        if (scoreDiff !== 0) return scoreDiff
        return a.submittedAt.getTime() - b.submittedAt.getTime()
      })
      return {
        identity,
        keep: sorted[0],
        remove: sorted.slice(1),
      }
    })

  const report = {
    mode: APPLY ? "apply" : "dry-run",
    school,
    totalRecords: students.length,
    uniqueIdentities: groups.size,
    duplicateGroups: duplicates.length,
    recordsToRemove: duplicates.reduce((sum, item) => sum + item.remove.length, 0),
    groups: duplicates.map(item => ({
      identity: item.identity,
      keep: {
        id: item.keep.id,
        serialNumber: item.keep.serialNumber,
        name: item.keep.fullName,
        hasPhoto: Boolean(item.keep.photoUrl || item.keep.photoPath),
      },
      remove: item.remove.map(student => ({
        id: student.id,
        serialNumber: student.serialNumber,
        name: student.fullName,
        hasPhoto: Boolean(student.photoUrl || student.photoPath),
      })),
    })),
  }

  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(
    path.join(outputDir, APPLY ? "apply-report.json" : "dry-run-report.json"),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))

  if (!APPLY || report.recordsToRemove === 0) return

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  await fs.writeFile(
    path.join(outputDir, `rollback-before-${timestamp}.json`),
    JSON.stringify({ school, students }, null, 2)
  )

  const ids = duplicates.flatMap(item => item.remove.map(student => student.id))
  const result = await prisma.student.deleteMany({ where: { id: { in: ids } } })
  if (result.count !== ids.length) {
    throw new Error(`Expected to remove ${ids.length} records, removed ${result.count}.`)
  }
  console.log(`Removed ${result.count} duplicate company employee records.`)
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
