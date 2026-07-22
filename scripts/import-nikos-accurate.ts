import "dotenv/config"
import fs from "node:fs/promises"
import path from "node:path"
import ExcelJS from "exceljs"
import { createHash } from "node:crypto"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const inputPath = "C:/Users/choud/Desktop/Nikos-Public-School 26-27.xlsx"
const schoolName = "Nikos Public School"
const outputDir = path.resolve("outputs/nikos-accurate-import")

type WorkbookStudentRow = {
  rowNumber: number
  serialNumber: string
  name: string
  dob: string
  bloodGroup: string
  mobile: string
  address: string
  classGrade: string
  sectionClass: string
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return ""
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === "object") {
    const rich = value as { text?: string; result?: unknown; richText?: Array<{ text?: string }> }
    if (typeof rich.text === "string") return rich.text
    if (rich.result != null) return String(rich.result)
    if (Array.isArray(rich.richText)) return rich.richText.map(part => part.text || "").join("")
  }
  return String(value)
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/^'/, "").replace(/\s+/g, " ").trim()
}

function norm(value: unknown): string {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function canonicalDob(value: string): string {
  const match = clean(value).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!match) return clean(value)
  return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[3]}`
}

function canonicalMobile(value: string): string {
  return clean(value).replace(/^'+/, "")
}

function hashFingerprint(classId: string, name: string, father: string, dob: string): string | null {
  const n = norm(name)
  const f = norm(father)
  if (!n || !f) return null
  const d = norm(dob)
  return createHash("sha256").update(d ? `${classId}|${n}|${f}|${d}` : `${classId}|${n}|${f}`).digest("hex")
}

function readExisting(fd: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = clean(fd[key])
    if (value) return value
  }
  return ""
}

function canonicalTemplateKey(key: string): string {
  const normalized = norm(key)
  if (normalized === "classes" || normalized === "classgrade") return "class"
  if (normalized === "mobileno" || normalized === "phone") return "mobile"
  if (normalized === "homeaddress") return "address"
  if (normalized === "bloodgroup") return "bloodGroup"
  return key
}

async function main() {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(inputPath)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error("Workbook has no worksheet.")

  let headerRowNumber = 0
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 30); rowNumber++) {
    const headers = (sheet.getRow(rowNumber).values as ExcelJS.CellValue[]).slice(1).map(cellText).map(norm)
    if (headers.includes("serialnumber") && headers.includes("studentname")) {
      headerRowNumber = rowNumber
      break
    }
  }
  if (!headerRowNumber) throw new Error("Could not locate the student header row.")

  const headerValues = (sheet.getRow(headerRowNumber).values as ExcelJS.CellValue[]).slice(1).map(cellText)
  const headerIndexes = (wanted: string) =>
    headerValues.map((header, index) => norm(header) === wanted ? index + 1 : 0).filter(Boolean)
  const one = (wanted: string) => {
    const indexes = headerIndexes(wanted)
    if (indexes.length !== 1) throw new Error(`Expected one '${wanted}' column, found ${indexes.length}.`)
    return indexes[0]
  }

  const columns = {
    serial: one("serialnumber"),
    name: one("studentname"),
    dob: one("dateofbirth"),
    bloodGroup: one("bloodgroup"),
    mobile: one("mobileno"),
    address: one("homeaddress"),
    classes: headerIndexes("class"),
  }
  // This workbook visually labels both I and J as Class, but ExcelJS exposes
  // the second duplicate table header as blank. The data columns remain
  // adjacent: I is the grade and J is the school-wide section.
  if (columns.classes.length === 1) {
    columns.classes.push(columns.classes[0] + 1)
  }
  if (columns.classes.length !== 2) {
    throw new Error(
      `Expected two Class columns (grade and school section), found ${columns.classes.length}: ` +
      JSON.stringify(headerValues.map((header, index) => ({ column: index + 1, header, normalized: norm(header) })))
    )
  }

  const parsedRows: WorkbookStudentRow[] = []
  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const serialNumber = clean(cellText(row.getCell(columns.serial).value))
    if (!serialNumber) continue
    parsedRows.push({
      rowNumber,
      serialNumber,
      name: clean(cellText(row.getCell(columns.name).value)),
      dob: canonicalDob(cellText(row.getCell(columns.dob).value)),
      bloodGroup: clean(cellText(row.getCell(columns.bloodGroup).value)),
      mobile: canonicalMobile(cellText(row.getCell(columns.mobile).value)),
      address: clean(cellText(row.getCell(columns.address).value)),
      classGrade: clean(cellText(row.getCell(columns.classes[0]).value)),
      sectionClass: clean(cellText(row.getCell(columns.classes[1]).value)),
    })
  }

  const duplicateSerials = parsedRows
    .map(row => row.serialNumber.toLowerCase())
    .filter((serial, index, all) => all.indexOf(serial) !== index)
  if (duplicateSerials.length) throw new Error(`Duplicate serial numbers in workbook: ${duplicateSerials.join(", ")}`)

  const schools = await prisma.school.findMany({
    select: { id: true, name: true },
  })
  const school = schools.find(item => item.name.trim().toLowerCase() === schoolName.toLowerCase())
  if (!school) throw new Error(`School '${schoolName}' was not found in the configured database.`)

  const [students, templates] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId: school.id },
      select: {
        id: true,
        serialNumber: true,
        classId: true,
        formData: true,
        fullName: true,
        normalizedName: true,
        normalizedFatherName: true,
        normalizedDob: true,
        normalizedRollNo: true,
        normalizedSearchText: true,
        duplicateFingerprint: true,
        photoUrl: true,
        photoPath: true,
        status: true,
      },
    }),
    prisma.template.findMany({
      where: { schoolId: school.id },
      select: { id: true, name: true, fieldConfig: true, fieldMappings: true, backFieldMappings: true },
    }),
  ])

  const bySerial = new Map(students.map(student => [student.serialNumber.trim().toLowerCase(), student]))
  const unmatched = parsedRows.filter(row => !bySerial.has(row.serialNumber.toLowerCase()))
  const missingFromWorkbook = students.filter(student =>
    !parsedRows.some(row => row.serialNumber.toLowerCase() === student.serialNumber.trim().toLowerCase())
  )
  const invalidRows = parsedRows.filter(row => !row.name || !row.mobile || !row.classGrade)

  const classDistribution = parsedRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.classGrade] = (acc[row.classGrade] || 0) + 1
    return acc
  }, {})

  const changes = parsedRows.flatMap(row => {
    const student = bySerial.get(row.serialNumber.toLowerCase())
    if (!student) return []
    const existing = (student.formData || {}) as Record<string, unknown>
    return [{
      row,
      student,
      before: {
        name: readExisting(existing, ["name", "fullName", "studentName", "Student Name"]),
        mobile: readExisting(existing, ["mobile", "phone", "mobile_no", "Mobile no"]),
        classGrade: readExisting(existing, ["classGrade", "classgrade", "grade", "class"]),
      },
    }]
  })
  const mismatchCounts = changes.reduce<Record<string, number>>((counts, change) => {
    const existing = (change.student.formData || {}) as Record<string, unknown>
    const comparisons: Record<string, [string, string]> = {
      name: [readExisting(existing, ["name"]), change.row.name],
      dob: [readExisting(existing, ["dateOfBirth"]), change.row.dob],
      bloodGroup: [readExisting(existing, ["bloodGroup"]), change.row.bloodGroup],
      mobile: [readExisting(existing, ["mobile"]), change.row.mobile],
      address: [readExisting(existing, ["address"]), change.row.address],
      classGrade: [readExisting(existing, ["classGrade"]), change.row.classGrade],
    }
    for (const [field, [actual, expected]] of Object.entries(comparisons)) {
      if (clean(actual) !== clean(expected)) counts[field] = (counts[field] || 0) + 1
    }
    return counts
  }, {})

  const report = {
    mode: APPLY ? "apply" : "dry-run",
    inputPath,
    headerRowNumber,
    columns,
    workbookRows: parsedRows.length,
    databaseStudents: students.length,
    matched: changes.length,
    unmatched: unmatched.map(row => ({ row: row.rowNumber, serialNumber: row.serialNumber })),
    missingFromWorkbook: missingFromWorkbook.map(student => student.serialNumber),
    invalidRows: invalidRows.map(row => ({ row: row.rowNumber, serialNumber: row.serialNumber })),
    mismatchCounts,
    classDistribution,
    templates: templates.map(template => ({
      id: template.id,
      name: template.name,
      fieldConfig: template.fieldConfig,
      fieldMappings: template.fieldMappings,
      backFieldMappings: template.backFieldMappings,
    })),
    deepchand: changes
      .filter(change => change.row.name.toLowerCase().includes("deepchand"))
      .map(change => ({
        serialNumber: change.row.serialNumber,
        excel: change.row,
        formData: change.student.formData,
      })),
    samples: changes.slice(0, 10).map(change => ({
      serialNumber: change.row.serialNumber,
      before: change.before,
      after: {
        name: change.row.name,
        mobile: change.row.mobile,
        classGrade: change.row.classGrade,
      },
    })),
  }

  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(path.join(outputDir, APPLY ? "apply-report.json" : "dry-run-report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))

  if (!APPLY) return
  if (unmatched.length || missingFromWorkbook.length || invalidRows.length || changes.length !== parsedRows.length) {
    throw new Error("Safety check failed; no database changes were made.")
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  await fs.writeFile(
    path.join(outputDir, `rollback-before-${timestamp}.json`),
    JSON.stringify({ school, templates, students }, null, 2)
  )

  const updates = changes.map(({ row, student }) => {
    const existing = (student.formData || {}) as Record<string, unknown>
    const next: Record<string, unknown> = { ...existing }
    for (const alias of [
      "fullName", "studentName", "Student Name", "mobile_no", "phone", "Mobile no",
      "homeAddress", "home_address", "Home Address", "dob", "Date of Birth",
      "blood_group", "blood group", "Blood Group", "classgrade", "grade",
    ]) {
      delete next[alias]
    }
    next.name = row.name
    next.dateOfBirth = row.dob
    next.bloodGroup = row.bloodGroup
    next.mobile = row.mobile
    next.address = row.address
    next.classGrade = row.classGrade
    next.class = schoolName

    const father = readExisting(next, ["father", "fatherName", "Father Name"])
    const rollNo = readExisting(next, ["rollNo", "rollno", "Roll No."])
    const admissionNo = readExisting(next, ["admissionNo", "admissionno", "Admission No."])
    const normalizedSearchText = Array.from(new Set([
      row.name, father, row.dob, rollNo, row.mobile, admissionNo,
      ...Object.values(next).map(clean),
    ].map(norm).filter(Boolean))).join(" ")

    return prisma.student.update({
      where: { id: student.id },
      data: {
        formData: next as any,
        fullName: row.name,
        normalizedName: norm(row.name),
        normalizedFatherName: norm(father),
        normalizedDob: norm(row.dob),
        normalizedSearchText,
        duplicateFingerprint: hashFingerprint(student.classId, row.name, father, row.dob),
      },
    })
  })

  const batchSize = 50
  for (let index = 0; index < updates.length; index += batchSize) {
    await prisma.$transaction(updates.slice(index, index + batchSize))
  }

  for (const template of templates) {
    const fieldConfig = Array.isArray(template.fieldConfig)
      ? template.fieldConfig.map((field: any) => ({
          ...field,
          key: canonicalTemplateKey(String(field?.key || "")),
        }))
      : template.fieldConfig
    const fieldMappings = Array.isArray(template.fieldMappings)
      ? template.fieldMappings.map((field: any) => ({
          ...field,
          fieldKey: canonicalTemplateKey(String(field?.fieldKey || "")),
        }))
      : template.fieldMappings
    const backFieldMappings = Array.isArray(template.backFieldMappings)
      ? template.backFieldMappings.map((field: any) => ({
          ...field,
          fieldKey: canonicalTemplateKey(String(field?.fieldKey || "")),
        }))
      : template.backFieldMappings

    await prisma.template.update({
      where: { id: template.id },
      data: {
        fieldConfig: fieldConfig as any,
        fieldMappings: fieldMappings as any,
        backFieldMappings: backFieldMappings as any,
      },
    })
  }

  console.log(
    `Updated ${updates.length} Nikos students and normalized ${templates.length} template. ` +
    "Photos, IDs, and layout positions were preserved."
  )
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
