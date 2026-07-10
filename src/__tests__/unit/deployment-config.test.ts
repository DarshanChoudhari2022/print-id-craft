import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("deployment configuration", () => {
  it("deploys Prisma migrations before the Vercel application build", () => {
    const config = JSON.parse(readFileSync(resolve("vercel.json"), "utf8"))

    expect(config.buildCommand).toBe("npm run db:migrate:deploy && npm run build")
  })
})
