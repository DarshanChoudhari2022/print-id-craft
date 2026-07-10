import { describe, expect, it } from "vitest"
import { updateTeacherStudentWithPhotoAiFallback } from "@/lib/teacher-student-edit"

describe("teacher student edit compatibility", () => {
  it("returns the updated student when the optional AI counter column is missing", async () => {
    await expect(updateTeacherStudentWithPhotoAiFallback(
      async () => { throw Object.assign(new Error("missing"), { code: "P2022" }) },
      async () => ({ id: "s1", photoUrl: "updated.jpg" }),
    )).resolves.toEqual({ id: "s1", photoUrl: "updated.jpg", photoAiRunCount: 0 })
  })

  it("does not retry unrelated database errors", async () => {
    const connectionError = Object.assign(new Error("offline"), { code: "P1001" })

    await expect(updateTeacherStudentWithPhotoAiFallback(
      async () => { throw connectionError },
      async () => ({ id: "s1" }),
    )).rejects.toBe(connectionError)
  })
})
