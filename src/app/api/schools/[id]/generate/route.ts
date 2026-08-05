import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { studentPhotoUrl } from "@/lib/student-photo-url"
import { DEFAULT_CARD_HEIGHT_MM, DEFAULT_CARD_WIDTH_MM } from "@/lib/card-dimensions"
import { getDefaultTemplate, getTemplateForClass } from "@/lib/template-resolver"
import {
  buildGenerationFilterOptions,
  filterStudentsByGenerationScope,
  sortStudentsForGeneration,
} from "@/lib/generation-scope"
import { applyFixedTemplateValuesToFormData } from "@/lib/fixed-template-values"
import {
  effectiveMobileFieldConfig,
  findInvalidMobileFields,
} from "@/lib/student-mobile-validation"

export const maxDuration = 60; // Vercel function timeout config

/**
 * GET /api/schools/[id]/generate?classId=xxx
 * 
 * Returns all data needed for client-side batch rendering:
 * - Template image URL and field mappings
 * - All student data for the class (or all classes)
 * 
 * The actual canvas rendering happens client-side using the
 * existing `generateJpgCard()` function from JpgCardPreview.
 */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const classId = searchParams.get("classId")
    const statusFilter = searchParams.get("status") || "APPROVED"
    const mode = searchParams.get("mode")
    const classGrade = searchParams.get("classGrade")?.trim() || ""
    const division = searchParams.get("division")?.trim() || ""

    const whereClause: any = {
      schoolId: params.id,
      status: statusFilter,
    }
    if (classId) {
      whereClause.classId = classId
    }

    if (mode === "filters") {
      const optionStudents = await prisma.student.findMany({
        where: whereClause,
        select: { formData: true },
      })
      return NextResponse.json({
        success: true,
        data: buildGenerationFilterOptions(optionStudents),
      })
    }

    const defaultTemplate = await getDefaultTemplate(params.id)
    const template = classId
      ? await getTemplateForClass(classId)
      : defaultTemplate

    if (!template?.templateImageUrl || !template?.fieldMappings) {
      return NextResponse.json(
        { error: classId
            ? "No JPG template configured for this class. Please assign and map a template first."
            : "No JPG template configured. Please upload and map a template first." },
        { status: 400 }
      )
    }

    const fieldMappings = template.fieldMappings as any[]
    if (!Array.isArray(fieldMappings) || fieldMappings.length === 0) {
      return NextResponse.json(
        { error: "No field mappings found. Please map fields on the template first." },
        { status: 400 }
      )
    }

    const students = await prisma.student.findMany({
      where: whereClause,
      select: {
        id: true,
        serialNumber: true,
        fullName: true,
        photoUrl: true,
        photoPath: true,
        formData: true,
        class: {
          select: {
            name: true,
            // Keep each class's assigned template when generating all classes.
            template: {
              select: {
                templateImageUrl: true,
                fieldMappings: true,
                backTemplateImageUrl: true,
                backFieldMappings: true,
                hasBackSide: true,
                cardWidthMm: true,
                cardHeightMm: true,
                photoBgColor: true,
                printConfig: true,
                fieldConfig: true,
              },
            },
          },
        },
      },
      orderBy: { serialNumber: "asc" },
    })
    const scopedStudents = sortStudentsForGeneration(
      filterStudentsByGenerationScope(students, classGrade, division)
    )

    if (scopedStudents.length === 0) {
      const scopeLabel = [classGrade, division].filter(Boolean).join(" - ")
      return NextResponse.json(
        { error: `No ${statusFilter.toLowerCase()} students found${scopeLabel ? ` in ${scopeLabel}` : classId ? " in this section" : ""}.` },
        { status: 404 }
      )
    }

    const invalidStudents = scopedStudents.flatMap((student) => {
      const assignedTemplate = student.class.template || template
      const fields = effectiveMobileFieldConfig(
        assignedTemplate?.fieldConfig,
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
          error: `Printing blocked: ${invalidStudents.length} student${invalidStudents.length === 1 ? " has" : "s have"} missing or invalid mobile data. Correct the records and generate again. Affected: ${affected}${invalidStudents.length > 10 ? ", ..." : ""}`,
          code: "INVALID_MOBILE_DATA",
          invalidCount: invalidStudents.length,
          invalidStudents: invalidStudents.slice(0, 100),
        },
        { status: 422 },
      )
    }

    // Build student render data
    const renderData = scopedStudents.map((s) => {
      const formData = s.formData as Record<string, any>
      // Classes without an assignment inherit the default school template.
      const assignedTemplate = s.class.template || template
      const assignedFields = [
        ...((assignedTemplate.fieldMappings as any[]) || []),
        ...((assignedTemplate.backFieldMappings as any[]) || []),
      ]
      const formDataWithFixedValues = applyFixedTemplateValuesToFormData(
        formData,
        assignedFields,
      )
      return {
        id: s.id,
        serialNumber: s.serialNumber,
        photoUrl: studentPhotoUrl(s),
        className: s.class.name,
        formData: {
          ...formDataWithFixedValues,
          class: formDataWithFixedValues.class || s.class.name,
        },
        template: {
          templateImageUrl: assignedTemplate.templateImageUrl,
          fieldMappings: assignedTemplate.fieldMappings,
          backTemplateImageUrl: assignedTemplate.backTemplateImageUrl || null,
          backFieldMappings: assignedTemplate.backFieldMappings || [],
          hasBackSide: assignedTemplate.hasBackSide || false,
          cardWidthMm: assignedTemplate.cardWidthMm || DEFAULT_CARD_WIDTH_MM,
          cardHeightMm: assignedTemplate.cardHeightMm || DEFAULT_CARD_HEIGHT_MM,
          photoBgColor: assignedTemplate.photoBgColor || "#FFFFFF",
        },
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        templateImageUrl: template.templateImageUrl,
        fieldMappings: fieldMappings,
        backTemplateImageUrl: template.backTemplateImageUrl || null,
        backFieldMappings: (template.backFieldMappings as any[]) || [],
        hasBackSide: template.hasBackSide || false,
        cardWidthMm: template.cardWidthMm || DEFAULT_CARD_WIDTH_MM,
        cardHeightMm: template.cardHeightMm || DEFAULT_CARD_HEIGHT_MM,
        photoBgColor: template.photoBgColor || "#FFFFFF",
        orientation: template.orientation || "PORTRAIT",
        students: renderData,
        totalCount: renderData.length,
      },
    })
  } catch (error) {
    console.error("GET /api/schools/[id]/generate error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

/**
 * POST /api/schools/[id]/generate
 * 
 * Explicitly marks students as PRINTED after physical print confirmation.
 * Download/generation must not call this automatically.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { action, confirmPrinted, studentIds } = body

    if (action !== "markPrinted" || confirmPrinted !== true) {
      return NextResponse.json(
        { error: "Printed status requires explicit physical print confirmation" },
        { status: 400 }
      )
    }
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: "No student IDs provided" }, { status: 400 })
    }
    if (studentIds.length > 2000 || studentIds.some((id) => typeof id !== "string")) {
      return NextResponse.json({ error: "Invalid student IDs" }, { status: 400 })
    }

    const result = await prisma.student.updateMany({
      where: {
        id: { in: studentIds },
        schoolId: params.id,
        status: { in: ["APPROVED", "SUBMITTED"] },
      },
      data: { status: "PRINTED" },
    })

    return NextResponse.json({
      success: true,
      printedCount: result.count,
      requestedCount: studentIds.length,
      message: `${result.count} students marked as PRINTED`,
    })
  } catch (error) {
    console.error("POST /api/schools/[id]/generate error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
