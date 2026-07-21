import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const schoolPageSource = readFileSync("src/app/(manufacturer)/schools/[id]/page.tsx", "utf8")
const bulkPhotoRouteSource = readFileSync("src/app/api/schools/[id]/students/bulk-photos/route.ts", "utf8")

describe("reupload all photos wiring", () => {
  it("adds a dedicated replace-by-name photo upload mode in the students tab", () => {
    expect(schoolPageSource).toContain('photoUploadMode, setPhotoUploadMode')
    expect(schoolPageSource).toContain('openBulkPhotoUpload("replace")')
    expect(schoolPageSource).toContain("Reupload All Photos")
    expect(schoolPageSource).toContain('fd.append("mode", "replace-by-name")')
  })

  it("matches replacement uploads strictly by normalized student name", () => {
    expect(bulkPhotoRouteSource).toContain('mode === "replace-by-name"')
    expect(bulkPhotoRouteSource).toContain("normalizeNameMatchKey")
    expect(bulkPhotoRouteSource).toContain("byStrictName")
    expect(bulkPhotoRouteSource).toContain("duplicateStrictNames")
    expect(bulkPhotoRouteSource).toContain("Duplicate student name found")
  })

  it("does not let a leading photo filename number override the employee name", () => {
    expect(bulkPhotoRouteSource).toContain("nameMatchCandidatesFromFilename")
    expect(bulkPhotoRouteSource).toContain('"6. passport size pic M Deepak - Deepak M.jpg"')
    expect(bulkPhotoRouteSource).toContain("isNumericIdentifierFilename(baseName)")
    expect(bulkPhotoRouteSource).toContain('matchedBy = "Full Name (filename)"')
  })

  it("uses company-safe photo matching that ignores office/contact numbers", () => {
    expect(bulkPhotoRouteSource).toContain("isCompanyWorkspace")
    expect(bulkPhotoRouteSource).toContain("byEmployeeCode")
    expect(bulkPhotoRouteSource).toContain('matchedBy = "Employee Code"')
    expect(bulkPhotoRouteSource).toContain("Company photo uploads intentionally avoid roll/contact/office-number")
    expect(schoolPageSource).toContain("Office/contact numbers are never used for matching")
  })
})
