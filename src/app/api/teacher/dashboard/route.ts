import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "TEACHER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schoolId = session.user.schoolId
    if (!schoolId) {
      return NextResponse.json({ error: "No school assigned" }, { status: 400 })
    }

    // Parse pagination params
    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
    const limit = Math.min(200, Math.max(10, parseInt(url.searchParams.get("limit") || "100")))
    const skip = (page - 1) * limit

    // Run all queries in parallel — use DB-level aggregation for stats
    const [school, classes, students, totalCount, statusCounts] = await Promise.all([
      prisma.school.findUnique({
        where: { id: schoolId },
        select: { name: true, logoUrl: true },
      }),
      prisma.class.findMany({
        where: { schoolId },
        include: { _count: { select: { students: true } } },
        orderBy: { createdAt: "desc" },
      }),
      // Paginated student list — only select needed fields
      prisma.student.findMany({
        where: { schoolId },
        select: {
          id: true,
          serialNumber: true,
          photoUrl: true,
          formData: true,
          status: true,
          flagNote: true,
          submittedAt: true,
          class: { select: { name: true, linkToken: true } },
        },
        orderBy: { submittedAt: "desc" },
        take: limit,
        skip,
      }),
      // Total count for pagination
      prisma.student.count({ where: { schoolId } }),
      // DB-level aggregation for stats — no need to load all records
      prisma.student.groupBy({
        by: ["status"],
        where: { schoolId },
        _count: { status: true },
      }),
    ])

    // Build stats from groupBy result
    const statsMap: Record<string, number> = {}
    for (const item of statusCounts) {
      statsMap[item.status] = item._count.status
    }
    const stats = {
      total: totalCount,
      submitted: statsMap["SUBMITTED"] || 0,
      approved: statsMap["APPROVED"] || 0,
      flagged: statsMap["FLAGGED"] || 0,
      pending: statsMap["PENDING"] || 0,
      printed: statsMap["PRINTED"] || 0,
    }

    const response = NextResponse.json({
      success: true,
      data: { school, classes, students, stats },
      pagination: { page, limit, total: totalCount, pages: Math.ceil(totalCount / limit) },
    })

    // Allow CDN/browser caching for 10s, serve stale for 30s while revalidating
    response.headers.set("Cache-Control", "private, s-maxage=10, stale-while-revalidate=30")

    return response
  } catch (error) {
    console.error("Teacher dashboard error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
