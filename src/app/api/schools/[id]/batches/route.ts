import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { uploadWithRetry } from "@/lib/supabase"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const batches = await prisma.printBatch.findMany({
      where: { schoolId: params.id },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ success: true, data: batches })
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if already generating
    const existingGenerating = await prisma.printBatch.findFirst({
      where: { schoolId: params.id, status: "GENERATING" },
    })
    if (existingGenerating) {
      return NextResponse.json(
        { error: "A batch is already being generated for this school. Please wait." },
        { status: 409 }
      )
    }

    // Get students to include
    const students = await prisma.student.findMany({
      where: {
        schoolId: params.id,
        status: { in: ["SUBMITTED", "APPROVED"] },
      },
      orderBy: { serialNumber: "asc" },
      include: { class: { select: { name: true } } },
    })

    if (students.length === 0) {
      return NextResponse.json(
        { error: "No students available for printing. Students must be in SUBMITTED or APPROVED status." },
        { status: 400 }
      )
    }

    // Create batch record
    const batch = await prisma.printBatch.create({
      data: {
        schoolId: params.id,
        studentCount: students.length,
        status: "GENERATING",
      },
    })

    // Generate manifest CSV in background
    generateBatchFiles(params.id, batch.id, students).catch((err) => {
      console.error("Batch generation error:", err)
    })

    return NextResponse.json({
      success: true,
      data: { batchId: batch.id, status: "GENERATING", studentCount: students.length },
    }, { status: 201 })
  } catch (error) {
    console.error("POST batches error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

async function generateBatchFiles(schoolId: string, batchId: string, students: any[]) {
  try {
    // Generate print manifest CSV
    const csvHeaders = "Serial Number,Full Name,Class,Roll No.,DOB,Blood Group,Status"
    const csvRows = students.map((s) => {
      const fd = s.formData as any
      return [
        s.serialNumber,
        fd.fullName || fd["Full Name"] || "",
        s.class?.name || fd.class || "",
        fd.rollNo || fd["Roll No."] || "",
        fd.dob || fd["Date of Birth"] || "",
        fd.bloodGroup || fd["Blood Group"] || "",
        s.status,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
    })
    const csvContent = [csvHeaders, ...csvRows].join("\n")
    const csvBuffer = Buffer.from(csvContent, "utf-8")

    const manifestPath = `batches/${schoolId}/${batchId}/manifest.csv`
    await uploadWithRetry("student-photos", manifestPath, csvBuffer, {
      contentType: "text/csv",
      upsert: true,
    })

    // Note: Full PDF generation requires @react-pdf/renderer which runs client-side
    // For server-side, we store the manifest and mark as READY
    // The actual PDF download will be generated on-demand by the client

    await prisma.printBatch.update({
      where: { id: batchId },
      data: {
        status: "READY",
        manifestPath,
      },
    })

    // Mark students as PRINTED
    await prisma.student.updateMany({
      where: {
        id: { in: students.map((s) => s.id) },
      },
      data: { status: "PRINTED" },
    })
  } catch (error) {
    console.error("generateBatchFiles error:", error)
    await prisma.printBatch.update({
      where: { id: batchId },
      data: { status: "PENDING" },
    })
  }
}
