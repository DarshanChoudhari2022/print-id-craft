import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { enqueueJob, kickJobWorker } from "@/lib/jobs/enqueue"
import { MAX_PRINT_BATCH_STUDENTS } from "@/lib/jobs/types"
import { StudentStatus } from "@prisma/client"
import { getDefaultTemplate } from "@/lib/template-resolver"
import {
  effectiveMobileFieldConfig,
  findInvalidMobileFields,
} from "@/lib/student-mobile-validation"

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
    const limit = Math.min(50, parseInt(url.searchParams.get("limit") || "20"))

    const [batches, total] = await Promise.all([
      prisma.printBatch.findMany({
        where: { schoolId: params.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.printBatch.count({ where: { schoolId: params.id } }),
    ])

    const response = NextResponse.json({
      success: true,
      data: batches,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
    response.headers.set("Cache-Control", "private, max-age=3, stale-while-revalidate=10")
    return response
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const existingGenerating = await prisma.printBatch.findFirst({
      where: { schoolId: params.id, status: "GENERATING" },
    })
    if (existingGenerating) {
      return NextResponse.json(
        { error: "A batch is already being generated for this school. Please wait." },
        { status: 409 }
      )
    }

    const printableWhere = {
      schoolId: params.id,
      status: { in: [StudentStatus.SUBMITTED, StudentStatus.APPROVED] },
    }

    const totalPrintable = await prisma.student.count({ where: printableWhere })
    if (totalPrintable > MAX_PRINT_BATCH_STUDENTS) {
      return NextResponse.json(
        {
          error: `Too many students for one print batch (${totalPrintable}). Filter by class/status or print in smaller groups.`,
          maxStudents: MAX_PRINT_BATCH_STUDENTS,
          totalStudents: totalPrintable,
        },
        { status: 413 }
      )
    }

    const [students, defaultTemplate] = await Promise.all([
      prisma.student.findMany({
      where: {
        ...printableWhere,
      },
      orderBy: { serialNumber: "asc" },
      select: {
        id: true,
        serialNumber: true,
        fullName: true,
        formData: true,
        class: {
          select: {
            template: { select: { fieldConfig: true } },
          },
        },
      },
      }),
      getDefaultTemplate(params.id),
    ])

    if (students.length === 0) {
      return NextResponse.json(
        { error: "No students available for printing. Students must be in SUBMITTED or APPROVED status." },
        { status: 400 }
      )
    }

    const invalidStudents = students.flatMap((student) => {
      const fields = effectiveMobileFieldConfig(
        student.class.template?.fieldConfig,
        defaultTemplate?.fieldConfig,
      )
      const issues = findInvalidMobileFields(
        (student.formData || {}) as Record<string, unknown>,
        fields,
      )
      if (issues.length === 0) return []
      return [{
        id: student.id,
        serialNumber: student.serialNumber,
        studentName: student.fullName || "Unknown student",
        issues,
      }]
    })

    if (invalidStudents.length > 0) {
      const affected = invalidStudents
        .slice(0, 10)
        .map(student => `${student.serialNumber} (${student.studentName})`)
        .join(", ")
      return NextResponse.json(
        {
          error: `Print batch blocked: ${invalidStudents.length} student${invalidStudents.length === 1 ? " has" : "s have"} missing or invalid mobile data. Correct the records first. Affected: ${affected}${invalidStudents.length > 10 ? ", ..." : ""}`,
          code: "INVALID_MOBILE_DATA",
          invalidCount: invalidStudents.length,
          invalidStudents: invalidStudents.slice(0, 100),
        },
        { status: 422 },
      )
    }

    const batch = await prisma.printBatch.create({
      data: {
        schoolId: params.id,
        studentCount: students.length,
        status: "GENERATING",
      },
    })

    const job = await enqueueJob({
      type: "GENERATE_PRINT_BATCH",
      schoolId: params.id,
      createdById: session.user.id,
      payload: {
        batchId: batch.id,
        studentIds: students.map((s) => s.id),
      },
    })

    await kickJobWorker(new URL(req.url).origin)

    return NextResponse.json(
      {
        success: true,
        data: {
          batchId: batch.id,
          jobId: job.id,
          status: "GENERATING",
          studentCount: students.length,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("POST batches error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
