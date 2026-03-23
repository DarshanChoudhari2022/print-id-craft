import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { uploadWithRetry, getPublicUrl } from "@/lib/supabase"
import * as XLSX from "xlsx"
import QRCode from "qrcode"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schoolId = params.id

    // Verify school + get template field config
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: { template: { select: { fieldConfig: true } }, classes: { select: { id: true, name: true } } },
    })
    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 })
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const classId = formData.get("classId") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }
    if (!classId) {
      return NextResponse.json({ error: "Class is required" }, { status: 400 })
    }

    // Verify class belongs to school
    const targetClass = school.classes.find(c => c.id === classId)
    if (!targetClass) {
      return NextResponse.json({ error: "Class not found in this school" }, { status: 400 })
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum 10MB." }, { status: 400 })
    }

    // Parse the Excel/CSV file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    let workbook: XLSX.WorkBook
    try {
      workbook = XLSX.read(buffer, { type: "buffer" })
    } catch {
      return NextResponse.json({ error: "Invalid file format. Please upload an Excel (.xlsx/.xls) or CSV file." }, { status: 400 })
    }

    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return NextResponse.json({ error: "Empty file — no sheets found." }, { status: 400 })
    }

    const sheet = workbook.Sheets[sheetName]
    const rawRows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" })

    if (rawRows.length === 0) {
      return NextResponse.json({ error: "No data rows found in the spreadsheet." }, { status: 400 })
    }

    if (rawRows.length > 2000) {
      return NextResponse.json({ error: "Maximum 2000 students per import. Your file has " + rawRows.length + " rows." }, { status: 400 })
    }

    // Field config from template
    const fieldConfig = (school.template?.fieldConfig || []) as Array<{ key: string; label: string; type: string; required: boolean }>

    // Build a label→key mapping for flexible column matching
    // e.g. "Full Name" → "fullName", "Roll No." → "rollNo", etc.
    const labelToKey: Record<string, string> = {}
    for (const f of fieldConfig) {
      labelToKey[f.label.toLowerCase().trim()] = f.key
      labelToKey[f.key.toLowerCase().trim()] = f.key
    }
    // Common aliases
    labelToKey["name"] = "fullName"
    labelToKey["student name"] = "fullName"
    labelToKey["full name"] = "fullName"
    labelToKey["roll no"] = "rollNo"
    labelToKey["roll no."] = "rollNo"
    labelToKey["roll number"] = "rollNo"
    labelToKey["admission no"] = "rollNo"
    labelToKey["admission no."] = "rollNo"
    labelToKey["date of birth"] = "dob"
    labelToKey["dob"] = "dob"
    labelToKey["blood group"] = "bloodGroup"
    labelToKey["father name"] = "fatherName"
    labelToKey["father's name"] = "fatherName"
    labelToKey["mother name"] = "motherName"
    labelToKey["mother's name"] = "motherName"
    labelToKey["phone"] = "phone"
    labelToKey["mobile"] = "phone"
    labelToKey["phone number"] = "phone"
    labelToKey["mobile number"] = "phone"
    labelToKey["contact"] = "phone"
    labelToKey["address"] = "address"
    labelToKey["photo url"] = "photoUrl"
    labelToKey["photo"] = "photoUrl"

    // Map Excel columns to our field keys
    const excelHeaders = rawRows.length > 0 ? Object.keys(rawRows[0]) : []
    const columnMap: Record<string, string> = {} // excelHeader → fieldKey
    for (const header of excelHeaders) {
      const normalized = header.toLowerCase().trim()
      if (labelToKey[normalized]) {
        columnMap[header] = labelToKey[normalized]
      }
    }

    // Validate each row & build student data
    const validRows: Array<{ formData: Record<string, string>; photoUrl: string; rowNum: number }> = []
    const errors: Array<{ row: number; field: string; message: string }> = []

    // Required fields check
    const requiredFields = fieldConfig.filter(f => f.required && f.key !== "class")

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i]
      const rowNum = i + 2 // Excel row (1-indexed header + data)
      const studentFormData: Record<string, string> = {}
      let photoUrl = ""

      // Map columns
      for (const [excelHeader, fieldKey] of Object.entries(columnMap)) {
        const val = String(raw[excelHeader] ?? "").trim()
        if (fieldKey === "photoUrl") {
          photoUrl = val
        } else {
          studentFormData[fieldKey] = val
        }
      }

      // Also check unmapped columns — store them too (extra data)
      for (const [header, value] of Object.entries(raw)) {
        if (!columnMap[header]) {
          const key = header.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "")
          if (key && String(value).trim()) {
            studentFormData[key] = String(value).trim()
          }
        }
      }

      // Add class name
      studentFormData["class"] = targetClass.name

      // Validate required fields
      let hasError = false
      for (const rf of requiredFields) {
        if (!studentFormData[rf.key] || studentFormData[rf.key].trim() === "") {
          errors.push({ row: rowNum, field: rf.label, message: `${rf.label} is required` })
          hasError = true
        }
      }

      // Must have at least a name
      if (!studentFormData.fullName && !studentFormData["Full Name"]) {
        errors.push({ row: rowNum, field: "Full Name", message: "Student name is required" })
        hasError = true
      }

      if (!hasError) {
        validRows.push({ formData: studentFormData, photoUrl, rowNum })
      }
    }

    // If mode is "validate", return validation results without saving
    const mode = formData.get("mode") as string | null
    if (mode === "validate") {
      return NextResponse.json({
        success: true,
        data: {
          totalRows: rawRows.length,
          validRows: validRows.length,
          errorRows: errors.length,
          errors: errors.slice(0, 50), // limit to 50 error details
          preview: validRows.slice(0, 10).map(r => ({
            ...r.formData,
            _rowNum: r.rowNum,
            _photoUrl: r.photoUrl,
          })),
          mappedColumns: Object.entries(columnMap).map(([excel, key]) => ({
            excelColumn: excel,
            mappedTo: key,
            label: fieldConfig.find(f => f.key === key)?.label || key,
          })),
          unmappedColumns: excelHeaders.filter(h => !columnMap[h]),
        },
      })
    }

    // --- IMPORT MODE: Create all valid students ---
    if (validRows.length === 0) {
      return NextResponse.json({ 
        error: "No valid rows to import. Fix the errors and try again.", 
        errors: errors.slice(0, 20) 
      }, { status: 400 })
    }

    // Generate serial numbers
    const schoolCode = school.name
      .replace(/[^A-Za-z]/g, "")
      .substring(0, 6)
      .toUpperCase()

    const lastStudent = await prisma.student.findFirst({
      where: { schoolId },
      orderBy: { serialNumber: "desc" },
    })

    let nextNum = 1
    if (lastStudent) {
      const match = lastStudent.serialNumber.match(/-(\d+)$/)
      if (match) {
        nextNum = parseInt(match[1]) + 1
      } else {
        const count = await prisma.student.count({ where: { schoolId } })
        nextNum = count + 1
      }
    }

    // Bulk create students
    const createdStudents: Array<{ id: string; serialNumber: string; name: string }> = []
    const importErrors: Array<{ row: number; error: string }> = []

    for (const row of validRows) {
      const serialNumber = `${schoolCode}-${String(nextNum).padStart(4, "0")}`
      nextNum++

      try {
        const student = await prisma.student.create({
          data: {
            schoolId,
            classId,
            serialNumber,
            formData: row.formData,
            photoUrl: row.photoUrl || "",
            status: "SUBMITTED",
          },
        })

        createdStudents.push({
          id: student.id,
          serialNumber,
          name: row.formData.fullName || row.formData["Full Name"] || "Unknown",
        })

        // Generate QR code in background (don't block)
        generateQR(student.id, schoolId, serialNumber).catch(err => {
          console.error(`QR generation failed for ${serialNumber}:`, err)
        })
      } catch (err: any) {
        // Unique constraint violation on serialNumber — increment and retry
        if (err?.code === "P2002") {
          nextNum++
          try {
            const retrySerial = `${schoolCode}-${String(nextNum).padStart(4, "0")}`
            nextNum++
            const student = await prisma.student.create({
              data: {
                schoolId,
                classId,
                serialNumber: retrySerial,
                formData: row.formData,
                photoUrl: row.photoUrl || "",
                status: "SUBMITTED",
              },
            })
            createdStudents.push({
              id: student.id,
              serialNumber: retrySerial,
              name: row.formData.fullName || "Unknown",
            })
            generateQR(student.id, schoolId, retrySerial).catch(() => {})
          } catch (retryErr: any) {
            importErrors.push({ row: row.rowNum, error: retryErr?.message || "Failed to create student" })
          }
        } else {
          importErrors.push({ row: row.rowNum, error: err?.message || "Failed to create student" })
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        imported: createdStudents.length,
        failed: importErrors.length,
        total: validRows.length,
        students: createdStudents.slice(0, 20), // first 20 for display
        errors: importErrors.slice(0, 20),
      },
    })
  } catch (error: any) {
    console.error("Bulk import error:", error)
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 })
  }
}

async function generateQR(studentId: string, schoolId: string, serialNumber: string) {
  try {
    const qrContent = JSON.stringify({ serial: serialNumber, school: schoolId, student: studentId })
    const qrBuffer = await QRCode.toBuffer(qrContent, { width: 300, margin: 2 })
    const qrPath = `students/${schoolId}/qr/${studentId}.png`
    await uploadWithRetry("student-photos", qrPath, qrBuffer, {
      contentType: "image/png",
      upsert: true,
    })
    const qrUrl = getPublicUrl("student-photos", qrPath)
    await prisma.student.update({
      where: { id: studentId },
      data: { qrCodeUrl: qrUrl },
    })
  } catch (err) {
    console.error("QR generation error:", err)
  }
}
