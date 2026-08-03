import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("unprocessed photo AI button", () => {
  it("opens batch processing in unprocessed-only mode from the students toolbar", () => {
    const source = readFileSync(
      resolve("src/app/(manufacturer)/schools/[id]/page.tsx"),
      "utf8",
    )

    expect(source).toContain('const [reprocessMode, setReprocessMode] = useState<"all" | "unprocessed">("all")')
    expect(source).toContain('params.set("mode", mode)')
    expect(source).toContain('openReprocessModal("unprocessed")')
    expect(source).toContain("Run AI On Unprocessed Photos")
    expect(source).toContain('mode === "all" && !classFilter')
  })

  it("loads every matching unprocessed photo instead of capping the batch list", () => {
    const source = readFileSync(
      resolve("src/app/api/schools/[id]/students/reprocess-photos/route.ts"),
      "utf8",
    )

    expect(source).toContain('const PHOTO_BG_MODES = new Set(["skipped", "unprocessed", "all"])')
    expect(source).toContain('photoBgStatus: { in: ["", PHOTO_BG_STATUS.SKIPPED] }')
    expect(source).not.toContain("MAX_STUDENTS_LIST")
  })
})
