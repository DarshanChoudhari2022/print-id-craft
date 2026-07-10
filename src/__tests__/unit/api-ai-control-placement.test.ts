import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("API AI control placement", () => {
  it("does not expose manual API AI actions in the teacher portal", () => {
    const source = readFileSync(resolve("src/app/teacher/dashboard/page.tsx"), "utf8")

    expect(source).not.toContain("handleRunPhotoAi")
    expect(source).not.toContain("API AI")
  })

  it("does not duplicate API AI as a standalone manufacturer action", () => {
    const source = readFileSync(resolve("src/app/(manufacturer)/schools/[id]/page.tsx"), "utf8")

    expect(source).not.toContain("handleRunApiPhotoAi")
    expect(source).not.toContain("Running API AI")
  })
})
