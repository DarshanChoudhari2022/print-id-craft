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
      : "Clean Photo Background"

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
              {stage === "crop" ? "Position the student, resize the crop, then tap Apply Crop." : "The existing photo will not change until you save."}
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
