export type TeacherPhotoStage = "select" | "crop" | "confirm-ai" | "background"
export type TeacherPhotoEvent =
  | "PHOTO_ACCEPTED"
  | "CROP_APPLIED"
  | "CHOOSE_AGAIN"
  | "PROCESS_AI_BACKGROUND"
  | "BACK_TO_CROP"
export type TeacherPhotoMode = "replace" | "crop-existing"

export function initialTeacherPhotoState(
  mode: TeacherPhotoMode,
  currentPhotoUrl?: string,
): { stage: TeacherPhotoStage; sourceUrl: string } {
  if (mode === "crop-existing" && currentPhotoUrl) {
    return { stage: "crop", sourceUrl: currentPhotoUrl }
  }

  return { stage: "select", sourceUrl: "" }
}

export function cancelTeacherCrop(mode: TeacherPhotoMode): "select" | "close" {
  return mode === "crop-existing" ? "close" : "select"
}

export function nextTeacherPhotoStage(
  stage: TeacherPhotoStage,
  event: TeacherPhotoEvent,
): TeacherPhotoStage {
  if (event === "CHOOSE_AGAIN") return "select"
  if (stage === "select" && event === "PHOTO_ACCEPTED") return "crop"
  if (stage === "crop" && event === "CROP_APPLIED") return "confirm-ai"
  if (stage === "confirm-ai" && event === "PROCESS_AI_BACKGROUND") return "background"
  if (stage === "confirm-ai" && event === "BACK_TO_CROP") return "crop"
  return stage
}
