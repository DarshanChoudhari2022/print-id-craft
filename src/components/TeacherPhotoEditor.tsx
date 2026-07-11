"use client"

import { useState } from "react"
import PhotoVerifier from "@/components/PhotoVerifier"
import PhotoCropper from "@/components/PhotoCropper"
import PhotoBgProcessor from "@/components/PhotoBgProcessor"
import {
  cancelTeacherCrop,
  initialTeacherPhotoState,
  nextTeacherPhotoStage,
  type TeacherPhotoMode,
  type TeacherPhotoStage,
} from "@/lib/teacher-photo-workflow"
import type { PhotoBgStatus } from "@/lib/photo-bg-status"

type Props = {
  currentPhotoUrl?: string
  mode: TeacherPhotoMode
  backgroundColor: string
  onReady: (photoDataUrl: string, status: PhotoBgStatus) => void
  onCancel: () => void
}

export default function TeacherPhotoEditor({
  currentPhotoUrl,
  mode,
  backgroundColor,
  onReady,
  onCancel,
}: Props) {
  const initialState = initialTeacherPhotoState(mode, currentPhotoUrl)
  const [stage, setStage] = useState<TeacherPhotoStage>(initialState.stage)
  const [sourceUrl, setSourceUrl] = useState(initialState.sourceUrl)
  const [croppedUrl, setCroppedUrl] = useState("")

  const chooseAgain = () => {
    if (cancelTeacherCrop(mode) === "close") {
      onCancel()
      return
    }
    setSourceUrl("")
    setCroppedUrl("")
    setStage((current) => nextTeacherPhotoStage(current, "CHOOSE_AGAIN"))
  }

  const stageTitle = stage === "select"
    ? "Choose or Take Student Photo"
    : stage === "crop"
      ? "Crop Student Photo"
      : stage === "confirm-ai"
        ? "Choose Background Option"
        : "Clean Photo Background"

  const stageDescription = stage === "crop"
    ? "Position the student, resize the crop, then tap Apply Crop."
    : stage === "confirm-ai"
      ? "Cropping is complete. AI will run only if you choose it below."
      : "The existing photo will not change until you save."

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(15,23,42,0.72)" }}
      onClick={onCancel}
    >
      <div
        style={{ width: "100%", maxWidth: 620, maxHeight: "92vh", overflowY: "auto", background: "white", borderRadius: 18, boxShadow: "0 25px 60px rgba(15,23,42,0.35)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "white" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#0f172a" }}>📷 {stageTitle}</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
              {stageDescription}
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close photo editor" style={{ width: 34, height: 34, border: 0, borderRadius: 9, background: "#f1f5f9", color: "#475569", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>

        <div style={{ padding: 20 }}>
          {stage === "select" && (
            <>
              {currentPhotoUrl && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: 10, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <img src={currentPhotoUrl} alt="Current student" style={{ width: 42, height: 56, objectFit: "cover", borderRadius: 7 }} />
                  <span style={{ fontSize: 12, color: "#64748b" }}>Current photo — choose a replacement below.</span>
                </div>
              )}
              <PhotoVerifier
                schoolBgColor={backgroundColor}
                onPhotoAccepted={(_file, previewUrl) => {
                  setSourceUrl(previewUrl)
                  setStage((current) => nextTeacherPhotoStage(current, "PHOTO_ACCEPTED"))
                }}
              />
            </>
          )}

          {stage === "crop" && sourceUrl && (
            <PhotoCropper
              photoUrl={sourceUrl}
              cancelLabel={mode === "crop-existing" ? "Cancel" : "Choose Another Photo"}
              onCancel={chooseAgain}
              onCropped={(dataUrl) => {
                setCroppedUrl(dataUrl)
                setStage((current) => nextTeacherPhotoStage(current, "CROP_APPLIED"))
              }}
            />
          )}

          {stage === "confirm-ai" && croppedUrl && (
            <div style={{ textAlign: "center" }}>
              <img
                src={croppedUrl}
                alt="Cropped student preview"
                style={{ width: 180, maxWidth: "65%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: 14, border: "2px solid #bfdbfe", background: "#f8fafc", boxShadow: "0 10px 24px rgba(15,23,42,0.12)" }}
              />

              <div style={{ margin: "18px auto 0", maxWidth: 460, padding: 14, borderRadius: 12, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: 13, lineHeight: 1.5 }}>
                <strong>Do you want to process the AI background?</strong><br />
                AI background processing may consume one credit. Keeping the cropped photo uses no AI credit.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => onReady(croppedUrl, "SKIPPED")}
                  style={{ padding: "12px 16px", border: 0, borderRadius: 10, background: "#16a34a", color: "white", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
                >
                  ✓ Use Cropped Photo — No AI
                </button>
                <button
                  type="button"
                  onClick={() => setStage((current) => nextTeacherPhotoStage(current, "PROCESS_AI_BACKGROUND"))}
                  style={{ padding: "12px 16px", border: "1px solid #f59e0b", borderRadius: 10, background: "#fff7ed", color: "#9a3412", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
                >
                  ✨ Process AI Background
                </button>
                <button
                  type="button"
                  onClick={() => setStage((current) => nextTeacherPhotoStage(current, "BACK_TO_CROP"))}
                  style={{ padding: "10px 16px", border: "1px solid #cbd5e1", borderRadius: 10, background: "white", color: "#475569", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  ← Back to Crop
                </button>
              </div>
            </div>
          )}

          {stage === "background" && croppedUrl && (
            <PhotoBgProcessor
              photoUrl={croppedUrl}
              defaultBgColor={backgroundColor}
              onProcessed={(processedDataUrl, status) => onReady(processedDataUrl, status)}
              onSkip={(status) => onReady(croppedUrl, status)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
