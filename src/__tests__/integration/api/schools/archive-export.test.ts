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
})
