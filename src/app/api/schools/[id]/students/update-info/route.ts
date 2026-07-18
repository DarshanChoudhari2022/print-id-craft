import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import ExcelJS from "exceljs"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { buildStudentIndexData } from "@/lib/student-index"
import { normalizeStudentStringFormData } from "@/lib/student-text-normalization"

export const maxDuration = 300

const MAX_ROWS = 3000
const ALLOWED_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
]

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return ""
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === "object") {
    const anyValue = value as any
    if (typeof anyValue.text === "string") return anyValue.text
    if (anyValue.result != null) return String(anyValue.result)
    if (Array.isArray(anyValue.richText)) return anyValue.richText.map((r: any) => r.text || "").join("")
  }
  return String(value)
}

function cleanText(value: string): string {
  return String(value || "").replace(/^'/, "").trim()
}

function cleanMobile(value: string): string {
  return cleanText(value).replace(/\s+/g, " ").trim()
}

function normalizedHeader(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function findHeaderRow(sheet: ExcelJS.Worksheet): number {
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 30); rowNumber++) {
    const headers = (sheet.getRow(rowNumber).values as ExcelJS.CellValue[])
      .slice(1)
      .map(cellText)
      .map(normalizedHeader)
    if (headers.includes("serialnumber") && (headers.includes("studentname") || headers.includes("name"))) {
      return rowNumber
    }
  }
  throw new Error("Could not find a header row with Serial Number and Student Name.")
}

async function parseWorkbookRows(file: File): Promise<Array<Record<string, string>>> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error("Workbook has no sheets.")

  const headerRowNumber = findHeaderRow(sheet)
  const headers = (sheet.getRow(headerRowNumber).values as ExcelJS.CellValue[])
    .slice(1)
    .map(cellText)
    .map(h => h.trim())

  const keyedHeaders = headers.map((header, index) => {
    const key = normalizedHeader(header)
    return key || `empty${index + 1}`
  })

  const rows: Array<Record<string, string>> = []
  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    if (rows.length >= MAX_ROWS) throw new Error(`Maximum ${MAX_ROWS} rows allowed.`)
    const row = sheet.getRow(rowNumber)
    const values = (row.values as ExcelJS.CellValue[]).slice(1)
    const record: Record<string, string> = { __rowNumber: String(rowNumber) }
    let hasData = false

    for (let i = 0; i < keyedHeaders.length; i++) {
      const text = cleanText(cellText(values[i]))
      if (text) hasData = true
      const baseKey = keyedHeaders[i]
      const key = record[baseKey] === undefined ? baseKey : `${baseKey}_${i + 1}`
      record[key] = text
    }

    if (hasData) rows.push(record)
  }
  return rows
}

function firstValue(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = cleanText(row[key] || "")
    if (value) return value
  }
  return ""
}

function mergeInfoOnlyFormData(existing: Record<string, any>, row: Record<string, string>, fallbackClass: string) {
  const name = firstValue(row, ["studentname", "name", "fullname"])
  const dob = firstValue(row, ["dateofbirth", "dob", "birthdate"])
  const bloodGroup = firstValue(row, ["bloodgroup", "bg"])
  const mobile = cleanMobile(firstValue(row, ["mobileno", "mobile", "phone", "phonenumber", "contact"]))
  const address = firstValue(row, ["homeaddress", "address", "addr"])
  const classGrade = firstValue(row, ["classgrade", "grade", "standard"])
  const sectionClass = firstValue(row, ["class_10", "classsection", "schoolname"]) || fallbackClass

  const next: Record<string, any> = { ...existing }
  for (const alias of ["fullName", "studentName", "mobile_no", "phone", "homeAddress", "home_address", "dob", "blood_group", "blood group"]) {
    delete next[alias]
  }

  if (name) {
    next.name = name
  }
  if (dob) {
    next.dateOfBirth = dob
  }
  if (bloodGroup) next.bloodGroup = bloodGroup
  if (mobile) {
    next.mobile = mobile
  }
  if (address) {
    next.address = address
  }
  if (classGrade) next.classGrade = classGrade
  if (sectionClass) next.class = sectionClass

  return normalizeStudentStringFormData(next)
}

function normalizeStatus(value: string): "PENDING" | "SUBMITTED" | "FLAGGED" | "APPROVED" | "PRINTED" | null {
  const status = cleanText(value).toUpperCase()
  if (["PENDING", "SUBMITTED", "FLAGGED", "APPROVED", "PRINTED"].includes(status)) return status as any
  return null
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const school = await prisma.school.findUnique({
      where: { id: params.id },
      select: { id: true, name: true },
    })
    if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 })

    const form = await req.formData()
    const file = form.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No Excel file uploaded." }, { status: 400 })
    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls") && !ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Please upload an Excel .xlsx file." }, { status: 400 })
    }

    const rows = await parseWorkbookRows(file)
    if (rows.length === 0) return NextResponse.json({ error: "No student rows found." }, { status: 400 })

    const students = await prisma.student.findMany({
      where: { schoolId: params.id },
      select: { id: true, serialNumber: true, classId: true, formData: true, status: true },
    })
    const bySerial = new Map(students.map(s => [s.serialNumber.toLowerCase().trim(), s]))
    const unmatchedRows: Array<{ row: string; serialNumber: string }> = []
    const updates: Array<{ id: string; data: any }> = []
    const samples: Array<{ serialNumber: string; name: string; classGrade: string }> = []

    for (const row of rows) {
      const serialNumber = firstValue(row, ["serialnumber", "serial", "sr"])
      if (!serialNumber) {
        unmatchedRows.push({ row: row.__rowNumber, serialNumber: "" })
        continue
      }

      const student = bySerial.get(serialNumber.toLowerCase().trim())
      if (!student) {
        unmatchedRows.push({ row: row.__rowNumber, serialNumber })
        continue
      }

      const formData = mergeInfoOnlyFormData((student.formData || {}) as Record<string, any>, row, school.name)
      const indexData = buildStudentIndexData(formData, student.classId)
      const status = normalizeStatus(row.status || "")
      updates.push({
        id: student.id,
        data: {
          ...indexData,
          formData,
          ...(status ? { status } : {}),
        },
      })
      if (samples.length < 8) {
        samples.push({
          serialNumber,
          name: String(formData.name || formData.fullName || ""),
          classGrade: String(formData.classGrade || ""),
        })
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({
        error: "No matching students found. Please check Serial Number column.",
        unmatchedRows,
      }, { status: 400 })
    }

    const BATCH = 50
    for (let i = 0; i < updates.length; i += BATCH) {
      const chunk = updates.slice(i, i + BATCH)
      await prisma.$transaction(
        chunk.map(update =>
          prisma.student.update({
            where: { id: update.id },
            data: update.data,
          })
        )
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        totalRows: rows.length,
        updated: updates.length,
        unmatched: unmatchedRows.length,
        unmatchedRows: unmatchedRows.slice(0, 50),
        samples,
        photosPreserved: true,
      },
    })
  } catch (error: any) {
    console.error("Update info Excel error:", error)
    return NextResponse.json({ error: error?.message || "Failed to update student information." }, { status: 500 })
  }
}
