import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get("page") || "1")
    const limit = parseInt(url.searchParams.get("limit") || "50")
    const status = url.searchParams.get("status")
    const classId = url.searchParams.get("classId")
    const search = url.searchParams.get("search")

    const where: any = { schoolId: params.id }
    if (status) where.status = status
    if (classId) where.classId = classId

    // Search by serial number or form data name
    if (search) {
      where.OR = [
        { serialNumber: { contains: search, mode: "insensitive" } },
        { formData: { path: ["fullName"], string_contains: search } },
      ]
    }

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        include: {
          class: { select: { name: true } },
        },
        orderBy: { submittedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.student.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: students,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("GET students error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
