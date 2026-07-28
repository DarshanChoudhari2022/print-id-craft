import { describe, expect, it } from "vitest"
import { withStudentPhotoUrl } from "@/lib/student-photo-url"

describe("withStudentPhotoUrl text compatibility", () => {
  it("normalizes existing student data in API responses without mutating the database object", () => {
    const stored = {
      id: "student-1",
      photoUrl: "https://example.test/photo.jpg",
      fullName: "IQRA BANU RAVEEN",
      formData: {
        fullName: "IQRA BANU RAVEEN",
        address: "flat no. 307,hosing Residency,pune-411048",
        class: "III",
      },
    }

    const response = withStudentPhotoUrl(stored)

    expect(response.fullName).toBe("Iqra Banu Raveen")
    expect(response.formData).toEqual({
      fullName: "Iqra Banu Raveen",
      address: "Flat No. 307, Hosing Residency, Pune-411048",
      class: "III",
    })
    expect(stored.formData.fullName).toBe("IQRA BANU RAVEEN")
    expect(stored.formData.address).toBe("flat no. 307,hosing Residency,pune-411048")
  })
})
