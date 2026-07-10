export type TeacherPhotoStage = "select" | "crop" | "background"
export type TeacherPhotoEvent = "PHOTO_ACCEPTED" | "CROP_APPLIED" | "CHOOSE_AGAIN"

export function nextTeacherPhotoStage(
  stage: TeacherPhotoStage,
  event: TeacherPhotoEvent,
): TeacherPhotoStage {
  if (event === "CHOOSE_AGAIN") return "select"
  if (stage === "select" && event === "PHOTO_ACCEPTED") return "crop"
  if (stage === "crop" && event === "CROP_APPLIED") return "background"
  return stage
}
