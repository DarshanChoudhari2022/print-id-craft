import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "@/app/api/schools/[id]/export/archive/route"
import { getServerSession } from "next-auth/next"
import { prisma } from "@/lib/prisma"
import { enqueueJob } from "@/lib/jobs/enqueue"

describe("GET /api/schools/[id]/export/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getServerSession as any).mockResolvedValue({
      user: { id: "manufacturer-1", role: "MANUFACTURER" },
    })
    ;(prisma.school.findUnique as any).mockResolvedValue({
      id: "s1",
      name: "Test School",
      address: null,
      contactEmail: "",
      classes: [],
      template: null,
    })
  })

  it("refuses archives above the request student cap", async () => {
    ;(prisma.student.count as any).mockResolvedValue(15001)

    const req = new Request("http://localhost:3000/api/schools/s1/export/archive?limit=15000")
    const res = await GET(req, { params: Promise.resolve({ id: "s1" }) })
    const data = await res.json()

    expect(res.status).toBe(413)
    expect(data.error).toBe("Archive too large for one request")
    expect(data.totalStudents).toBe(15001)
    expect(data.maxStudents).toBe(15000)
  })

  it("reuses an identical active export instead of adding duplicate work", async () => {
    ;(prisma.student.count as any).mockResolvedValue(1419)
    ;(prisma.job.findMany as any).mockResolvedValue([
      {
        id: "active-job",
        status: "RUNNING",
        payload: {
          classId: null,
          status: "APPROVED",
          includePhotos: true,
          maxStudents: 15000,
          totalStudents: 1419,
          format: "excel",
        },
      },
    ])

    const req = new Request(
      "http://localhost:3000/api/schools/s1/export/archive?status=APPROVED&format=excel"
    )
    const res = await GET(req, { params: Promise.resolve({ id: "s1" }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.data).toMatchObject({
      jobId: "active-job",
      status: "RUNNING",
      reused: true,
      totalStudents: 1419,
    })
    expect(enqueueJob).not.toHaveBeenCalled()
  })

  it("queues an export limited to the inclusive India submission-date range", async () => {
    ;(prisma.student.count as any).mockResolvedValue(12)
    ;(prisma.job.findMany as any).mockResolvedValue([])
    ;(enqueueJob as any).mockResolvedValue({ id: "date-job", status: "PENDING" })

    const req = new Request(
      "http://localhost:3000/api/schools/s1/export/archive?format=excel&status=APPROVED&dateFrom=2026-08-05&dateTo=2026-08-06"
    )
    const res = await GET(req, { params: Promise.resolve({ id: "s1" }) })

    expect(res.status).toBe(200)
    expect(prisma.student.count).toHaveBeenCalledWith({
      where: {
        schoolId: "s1",
        status: "APPROVED",
        submittedAt: {
          gte: new Date("2026-08-04T18:30:00.000Z"),
          lt: new Date("2026-08-06T18:30:00.000Z"),
        },
      },
    })
    expect(enqueueJob).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        dateFrom: "2026-08-05",
        dateTo: "2026-08-06",
        totalStudents: 12,
      }),
    }))
  })

  it("rejects an invalid or reversed date range before counting students", async () => {
    const req = new Request(
      "http://localhost:3000/api/schools/s1/export/archive?dateFrom=2026-08-06&dateTo=2026-08-05"
    )
    const res = await GET(req, { params: Promise.resolve({ id: "s1" }) })

    expect(res.status).toBe(400)
    expect(prisma.student.count).not.toHaveBeenCalled()
  })
})
