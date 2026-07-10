import { describe, expect, it } from "vitest"
import {
  buildProcessedPhotoPath,
  contentTypeFromPhotoPath,
  nextAiRunCount,
} from "@/lib/student-photo-ai"

describe("student photo API AI helpers", () => {
  it("increments missing or existing AI run counts", () => {
    expect(nextAiRunCount(null)).toBe(1)
    expect(nextAiRunCount(undefined)).toBe(1)
    expect(nextAiRunCount(3)).toBe(4)
  })

  it("builds a stable processed photo path for a run", () => {
    expect(buildProcessedPhotoPath("school_1", "student_1", 2)).toBe(
      "students/school_1/api-ai/student_1-run-2.jpg",
    )
  })

  it("detects content type from stored photo path", () => {
    expect(contentTypeFromPhotoPath("students/s1/photo.png")).toBe("image/png")
    expect(contentTypeFromPhotoPath("students/s1/photo.webp")).toBe("image/webp")
    expect(contentTypeFromPhotoPath("students/s1/photo.jpg")).toBe("image/jpeg")
    expect(contentTypeFromPhotoPath("students/s1/photo")).toBe("image/jpeg")
  })
})
