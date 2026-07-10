import { describe, expect, it } from "vitest"
import { runWithMissingColumnFallback } from "@/lib/prisma-query-compat"

describe("Prisma query compatibility", () => {
  it("uses the compatibility query when Prisma reports a missing column", async () => {
    const rows = [{ id: "s1" }, { id: "s2" }]

    await expect(runWithMissingColumnFallback(
      async () => { throw Object.assign(new Error("missing"), { code: "P2022" }) },
      async () => rows,
    )).resolves.toEqual(rows)
  })

  it("does not hide unrelated query failures", async () => {
    const error = Object.assign(new Error("connection"), { code: "P1001" })

    await expect(runWithMissingColumnFallback(
      async () => { throw error },
      async () => [],
    )).rejects.toBe(error)
  })
})
