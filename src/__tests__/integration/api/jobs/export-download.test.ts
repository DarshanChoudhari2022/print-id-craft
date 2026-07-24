import { beforeEach, describe, expect, it, vi } from "vitest"
import { getServerSession } from "next-auth/next"
import { prisma } from "@/lib/prisma"

vi.mock("@/lib/storage", () => ({
  storageDownload: vi.fn(async (_bucket: string, storagePath: string) => ({
    data: Buffer.from(storagePath.endsWith("001") ? "first-" : "second"),
    error: null,
  })),
}))

import { GET } from "@/app/api/jobs/[id]/download/route"

describe("GET /api/jobs/[id]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getServerSession as any).mockResolvedValue({
      user: { id: "manufacturer-1", role: "MANUFACTURER" },
    })
  })

  it("streams multipart storage objects as one ZIP response", async () => {
    ;(prisma.job.findUnique as any).mockResolvedValue({
      id: "job-1",
      status: "COMPLETED",
      schoolId: "school-1",
      result: {
        fileName: "approved-students.zip",
        storagePath: "exports/approved-students.zip",
        bytes: 12,
        storageParts: [
          { storagePath: "exports/approved-students.zip.part-001", bytes: 6 },
          { storagePath: "exports/approved-students.zip.part-002", bytes: 6 },
        ],
      },
    })

    const response = await GET(
      new Request("http://localhost:3000/api/jobs/job-1/download"),
      { params: Promise.resolve({ id: "job-1" }) }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-length")).toBe("12")
    expect(response.headers.get("content-disposition")).toContain("approved-students.zip")
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("first-second")
  })
})
