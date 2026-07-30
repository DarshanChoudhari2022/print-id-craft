import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("student submission calendar wiring", () => {
  it("adds a filtered API mode for month counts and selected date details", () => {
    const source = readFileSync(
      resolve("src/app/api/schools/[id]/students/route.ts"),
      "utf8",
    )

    expect(source).toContain('mode === "submission-calendar"')
    expect(source).toContain("indiaMonthRange(month)")
    expect(source).toContain("indiaDayRange(selectedDate)")
    expect(source).toContain('url.searchParams.get("submittedDate")')
    expect(source).toContain("where.submittedAt = { gte: dayRange.start, lt: dayRange.end }")
    expect(source).toContain("applyStudentListFilters(baseWhere")
    expect(source).toContain("counts: Array.from(countsByDate.entries())")
    expect(source).toContain("students: selectedStudents.map(withStudentPhotoUrl)")
  })

  it("shows a calendar and selected-date student details in the Students tab", () => {
    const source = readFileSync(
      resolve("src/app/(manufacturer)/schools/[id]/page.tsx"),
      "utf8",
    )

    expect(source).toContain("Submission Calendar")
    expect(source).toContain("submissionCalendarDate")
    expect(source).toContain("studentSubmittedDateFilter")
    expect(source).toContain("submissionCalendarMonth")
    expect(source).toContain('type="date"')
    expect(source).toContain('type="month"')
    expect(source).toContain("buildMonthCalendarCells(submissionCalendarMonth)")
    expect(source).toContain('mode: "submission-calendar"')
    expect(source).toContain('params.set("submittedDate", submittedDate)')
    expect(source).toContain("Submitted on {formatSubmissionDate(studentSubmittedDateFilter)}")
    expect(source).toContain("getCalendarStudentAddress(student)")
  })
})
