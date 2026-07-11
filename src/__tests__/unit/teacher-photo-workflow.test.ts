import { describe, expect, it } from "vitest"
import {
  cancelTeacherCrop,
  initialTeacherPhotoState,
  nextTeacherPhotoStage,
} from "@/lib/teacher-photo-workflow"

describe("teacher photo workflow", () => {
  it("requires manual cropping between photo selection and background cleanup", () => {
    expect(nextTeacherPhotoStage("select", "PHOTO_ACCEPTED")).toBe("crop")
    expect(nextTeacherPhotoStage("crop", "CROP_APPLIED")).toBe("background")
  })

  it("returns to photo selection when the teacher chooses another photo", () => {
    expect(nextTeacherPhotoStage("crop", "CHOOSE_AGAIN")).toBe("select")
  })

  it("does not allow photo acceptance to skip directly to background cleanup", () => {
    expect(nextTeacherPhotoStage("crop", "PHOTO_ACCEPTED")).toBe("crop")
  })

  it("starts replacement mode at photo selection", () => {
    expect(initialTeacherPhotoState("replace", "https://example.com/current.jpg")).toEqual({
      stage: "select",
      sourceUrl: "",
    })
  })

  it("starts existing-photo mode directly at crop", () => {
    expect(initialTeacherPhotoState("crop-existing", "https://example.com/current.jpg")).toEqual({
      stage: "crop",
      sourceUrl: "https://example.com/current.jpg",
    })
  })

  it("cancels crop to the correct destination for each mode", () => {
    expect(cancelTeacherCrop("replace")).toBe("select")
    expect(cancelTeacherCrop("crop-existing")).toBe("close")
  })
})
