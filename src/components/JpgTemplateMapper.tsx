"use client"
import { useState, useRef, useEffect, useCallback } from "react"

const BG_COLOR_PRESETS = [
  { id: "white", label: "White", hex: "#FFFFFF", textColor: "#333" },
  { id: "light-blue", label: "Light Blue", hex: "#DBEAFE", textColor: "#333" },
  { id: "sky-blue", label: "Sky Blue", hex: "#BAE6FD", textColor: "#333" },
  { id: "light-grey", label: "Light Grey", hex: "#F1F5F9", textColor: "#333" },
  { id: "maroon", label: "Maroon", hex: "#7F1D1D", textColor: "#fff" },
  { id: "cream", label: "Cream", hex: "#FEF3C7", textColor: "#333" },
]

type FieldMapping = {
  id: string
  fieldKey: string
  label: string
  type: "text" | "photo"
  x: number // percentage from left
  y: number // percentage from top
  width: number // percentage of image width
  height: number // percentage of image height
  fontSize: number // in px relative to the image
  fontColor: string
  fontWeight: "normal" | "bold"
  fontFamily: string
  textAlign?: "left" | "center" | "right"
}

type JpgTemplateMapperProps = {
  schoolId: string
  templateImageUrl: string | null
  fieldMappings: FieldMapping[]
  fieldConfig: { key: string; label: string; type: string; required: boolean }[]
  onSave: (templateImageUrl: string, fieldMappings: FieldMapping[], photoBgColor?: string) => Promise<void>
  onUploadImage: (file: File) => Promise<string>
  initialPhotoBgColor?: string
}

const SAMPLE_DATA: Record<string, string> = {
  name: "Avneesh Abhishek Awachat",
  fullName: "Avneesh Abhishek Awachat",
  Student_Name: "Avneesh Abhishek Awachat",
  class: "Playgroup-Sparkling Starfish(B1)",
  branch: "Bibwewadi",
  father: "9650319700",
  mother: "8850257336",
  mob_father: "9650319700",
  fatherName: "Mr. Abhishek Awachat",
  motherName: "Mrs. Priya Awachat",
  fatherPhone: "9650319700",
  motherPhone: "8850257336",
  phone: "9650319700",
  rollNo: "1",
  srNo: "1",
  NO: "1",
  dateOfBirth: "15/08/2022",
  bloodGroup: "B+",
  address: "Flat No. 503, A-Wing, Sai Shilp Society, Pune",
  admissionNo: "ADM-2025-001",
  photoId: "BB25035",
  serialNumber: "PLAY-B1-0001",
}

export default function JpgTemplateMapper({
  schoolId,
  templateImageUrl: initialImageUrl,
  fieldMappings: initialMappings,
  fieldConfig,
  onSave,
  onUploadImage,
  initialPhotoBgColor,
}: JpgTemplateMapperProps) {
  const [imageUrl, setImageUrl] = useState(initialImageUrl || "")
  const [mappings, setMappings] = useState<FieldMapping[]>(
    initialMappings && initialMappings.length > 0 ? initialMappings : []
  )
  const [photoBgColor, setPhotoBgColor] = useState(initialPhotoBgColor || "#FFFFFF")

  // Sync state when props change
  useEffect(() => {
    if (initialImageUrl) setImageUrl(initialImageUrl)
    if (initialMappings && initialMappings.length > 0) setMappings(initialMappings)
  }, [initialImageUrl, initialMappings])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [dragState, setDragState] = useState<{
    id: string
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    origH: number
    mode: "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
  } | null>(null)
  const [imageDragOver, setImageDragOver] = useState(false)

  // Custom field creation
  const [newFieldLabel, setNewFieldLabel] = useState("")
  const [newFieldType, setNewFieldType] = useState<"text" | "tel">("text")

  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file (JPG, PNG, or WebP)")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("File too large. Maximum 10MB allowed.")
      return
    }
    setUploading(true)
    try {
      const url = await onUploadImage(file)
      setImageUrl(url)
    } catch (err: any) {
      console.error("Upload failed:", err)
      alert(err?.message || "Upload failed. Please ensure the storage bucket is set up correctly.")
    } finally {
      setUploading(false)
    }
  }

  // Convert label → unique key: "Mob.- Father -" → "mob_father"
  const labelToKey = (label: string): string => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || `field_${Date.now()}`
  }

  const addFieldMapping = (fieldKey: string, label: string, type: "text" | "photo" = "text") => {
    // Prevent duplicate fieldKeys
    if (mappings.find((m) => m.fieldKey === fieldKey)) {
      alert(`Field "${label}" is already placed on the template.`)
      return
    }

    const newMapping: FieldMapping = {
      id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fieldKey,
      label,
      type,
      x: type === "photo" ? 5 : 40,
      y: type === "photo" ? 25 : 30 + mappings.filter((m) => m.type === "text").length * 6,
      width: type === "photo" ? 18 : 30,
      height: type === "photo" ? 32 : 4.5,
      fontSize: 14,
      fontColor: "#000000",
      fontWeight: fieldKey === "name" || fieldKey === "fullName" ? "bold" : "normal",
      fontFamily: "Arial",
      textAlign: "left",
    }
    setMappings((prev) => [...prev, newMapping])
    setSelectedId(newMapping.id)
  }

  const addCustomField = () => {
    const label = newFieldLabel.trim()
    if (!label) return
    const key = labelToKey(label)
    addFieldMapping(key, label, "text")
    setNewFieldLabel("")
  }

  const removeFieldMapping = (id: string) => {
    setMappings((prev) => prev.filter((m) => m.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const updateMapping = (id: string, updates: Partial<FieldMapping>) => {
    setMappings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    )
  }

  // Mouse/touch handlers for dragging fields on the image
  const handleMouseDown = (
    e: React.MouseEvent,
    id: string,
    mode: "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" = "move"
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const mapping = mappings.find((m) => m.id === id)
    if (!mapping) return
    setSelectedId(id)
    setDragState({
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: mapping.x,
      origY: mapping.y,
      origW: mapping.width,
      origH: mapping.height,
      mode,
    })
  }

  const lastMoveTimeRef = useRef(0)

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState || !containerRef.current) return
      // Throttle to ~60fps for smooth but not excessive updates
      const now = performance.now()
      if (now - lastMoveTimeRef.current < 16) return
      lastMoveTimeRef.current = now

      const rect = containerRef.current.getBoundingClientRect()
      const dx = ((e.clientX - dragState.startX) / rect.width) * 100
      const dy = ((e.clientY - dragState.startY) / rect.height) * 100

      if (dragState.mode === "move") {
        updateMapping(dragState.id, {
          x: Math.max(0, Math.min(95, dragState.origX + dx)),
          y: Math.max(0, Math.min(95, dragState.origY + dy)),
        })
      } else {
        const mapping = mappings.find((m) => m.id === dragState.id)
        if (!mapping) return

        let newX = dragState.origX
        let newY = dragState.origY
        let newW = dragState.origW
        let newH = dragState.origH

        if (dragState.mode.includes("e")) newW = Math.max(2, dragState.origW + dx)
        if (dragState.mode.includes("s")) newH = Math.max(2, dragState.origH + dy)
        if (dragState.mode.includes("w")) {
            const maxWAdd = dragState.origW - 2
            const actualDx = Math.min(dx, maxWAdd)
            newX = dragState.origX + actualDx
            newW = dragState.origW - actualDx
        }
        if (dragState.mode.includes("n")) {
            const maxHAdd = dragState.origH - 2
            const actualDy = Math.min(dy, maxHAdd)
            newY = dragState.origY + actualDy
            newH = dragState.origH - actualDy
        }

        updateMapping(dragState.id, {
          x: newX,
          y: newY,
          width: newW,
          height: newH,
        })
      }
    },
    [dragState, mappings]
  )

  const handleMouseUp = useCallback(() => {
    setDragState(null)
  }, [])

  useEffect(() => {
    if (dragState) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
      return () => {
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [dragState, handleMouseMove, handleMouseUp])

  const handleSave = async () => {
    if (!imageUrl) return
    setSaving(true)
    try {
      await onSave(imageUrl, mappings, photoBgColor)
    } finally {
      setSaving(false)
    }
  }

  const selectedMapping = mappings.find((m) => m.id === selectedId)

  // ---------------------------------------------------------------
  // UPLOAD UI — if no image uploaded yet
  // ---------------------------------------------------------------
  if (!imageUrl) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            background: "white",
            borderRadius: 20,
            border: "1px solid #e2e8f0",
            padding: 40,
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 20,
                background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: 36,
              }}
            >
              🖼️
            </div>
            <h3
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#0f172a",
                marginBottom: 8,
              }}
            >
              Step 1: Upload School ID Card Template
            </h3>
            <p style={{ fontSize: 14, color: "#64748b", maxWidth: 480, margin: "0 auto" }}>
              Upload the pre-designed JPG/PNG template image of the school's ID
              card. You'll then place text boxes in front of each printed field.
            </p>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setImageDragOver(true)
            }}
            onDragLeave={() => setImageDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setImageDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file) handleImageUpload(file)
            }}
            onClick={() =>
              document.getElementById("jpg-template-upload")?.click()
            }
            style={{
              border: `3px dashed ${imageDragOver ? "#3b82f6" : "#e2e8f0"}`,
              borderRadius: 16,
              padding: 48,
              textAlign: "center",
              cursor: uploading ? "wait" : "pointer",
              background: imageDragOver
                ? "linear-gradient(135deg, #eff6ff, #f0f9ff)"
                : "#fafafa",
              transition: "all 0.2s",
            }}
          >
            <input
              id="jpg-template-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImageUpload(file)
              }}
            />
            {uploading ? (
              <>
                <div
                  className="login-spinner"
                  style={{
                    width: 32,
                    height: 32,
                    borderColor: "rgba(59,130,246,0.2)",
                    borderTopColor: "#3b82f6",
                    margin: "0 auto 12px",
                  }}
                />
                <div style={{ fontSize: 14, color: "#3b82f6", fontWeight: 600 }}>
                  Uploading template...
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📤</div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: 4,
                  }}
                >
                  Drop your ID card template here
                </div>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>
                  or click to browse • JPG, PNG, WebP • Max 10MB
                </div>
              </>
            )}
          </div>

          {/* How it works */}
          <div
            style={{
              marginTop: 32,
              padding: 20,
              background: "#f0f9ff",
              borderRadius: 14,
              border: "1px solid #bae6fd",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#0369a1",
                marginBottom: 12,
              }}
            >
              💡 How it works
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                "Upload the school's printed ID card JPG template",
                "Place text boxes in front of each field (Name, Class, etc.)",
                "Add custom fields like Father, Mother, Phone, etc.",
                "Save → Form auto-generates for students to fill",
                "Generate ID cards with student data auto-filled",
              ].map((text, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    color: "#0c4a6e",
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "#0ea5e9",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  {text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------
  // MAIN MAPPER UI — image loaded, map fields
  // ---------------------------------------------------------------
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#0f172a",
              marginBottom: 2,
            }}
          >
            Step 2: Place Text Boxes on Template
          </h3>
          <p style={{ fontSize: 13, color: "#94a3b8" }}>
            Add fields and drag them in front of the printed labels on the template
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-outline"
            onClick={() => setShowPreview(!showPreview)}
            style={{ fontSize: 13, padding: "8px 16px" }}
          >
            {showPreview ? "📝 Edit Mode" : "👁 Preview"}
          </button>
          <button
            className="btn btn-outline"
            onClick={() => {
              if (confirm("Replace the template image? Your field positions will be reset.")) {
                setImageUrl("")
                setMappings([])
              }
            }}
            style={{
              fontSize: 13,
              padding: "8px 16px",
              borderColor: "#ef4444",
              color: "#dc2626",
            }}
          >
            🗑 Replace Template
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
            style={{ fontSize: 13, padding: "8px 20px" }}
          >
            {saving ? "Saving..." : "💾 Save Template"}
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          alignItems: "flex-start",
        }}
        className="mapper-layout"
      >
        {/* Left: Image Canvas */}
        <div
          style={{
            flex: "1 1 min(100%, 600px)",
            background: "#0f172a",
            borderRadius: 16,
            padding: 20,
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          <div
            ref={containerRef}
            style={{
              position: "relative",
              display: "inline-block",
              width: "100%",
              background: "#f8fafc",
              border: "1px dashed #cbd5e1",
              borderRadius: 12,
              overflow: "hidden",
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setImageDragOver(true)
            }}
            onDragLeave={() => setImageDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setImageDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file) handleImageUpload(file)
            }}
          >
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Template"
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                borderRadius: 8,
              }}
              draggable={false}
            />

            {/* Field overlays */}
            {mappings.map((m) => {
              const isSelected = m.id === selectedId
              const sampleValue =
                showPreview
                  ? m.type === "photo"
                    ? ""
                    : SAMPLE_DATA[m.fieldKey] || m.label
                  : m.label

              return (
                <div
                  key={m.id}
                  onMouseDown={(e) => handleMouseDown(e, m.id, "move")}
                  style={{
                    position: "absolute",
                    left: `${m.x}%`,
                    top: `${m.y}%`,
                    width: `${m.width}%`,
                    height: `${m.height}%`,
                    border: showPreview
                      ? "none"
                      : `2px ${isSelected ? "solid" : "dashed"} ${
                          isSelected ? "#3b82f6" : "rgba(255,255,255,0.6)"
                        }`,
                    borderRadius: m.type === "photo" ? 4 : 2,
                    background: showPreview
                      ? "transparent"
                      : m.type === "photo"
                      ? "rgba(59, 130, 246, 0.15)"
                      : isSelected
                      ? "rgba(59, 130, 246, 0.1)"
                      : "rgba(255, 255, 255, 0.08)",
                    cursor: showPreview ? "default" : "move",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: m.type === "photo" ? "center" : "flex-start",
                    padding: m.type === "photo" ? 0 : "0 4px",
                    overflow: "hidden",
                    boxShadow: isSelected
                      ? "0 0 0 2px rgba(59,130,246,0.3)"
                      : "none",
                    transition: "box-shadow 0.15s",
                    zIndex: isSelected ? 10 : 1,
                  }}
                >
                  {m.type === "photo" ? (
                    showPreview ? (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          background: "#ddd",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#94a3b8"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </div>
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="rgba(255,255,255,0.8)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                      </div>
                    )
                  ) : (
                    <span
                      style={{
                        fontSize: showPreview ? m.fontSize * 0.65 : 11,
                        color: showPreview ? m.fontColor : "white",
                        fontWeight: showPreview ? m.fontWeight : 600,
                        fontFamily: showPreview ? m.fontFamily : "inherit",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        textShadow: showPreview ? "none" : "0 1px 2px rgba(0,0,0,0.5)",
                        width: "100%",
                        textAlign: showPreview ? (m.textAlign || "left") : "left",
                        display: "block",
                      }}
                    >
                      {sampleValue}
                    </span>
                  )}

                  {/* Resize handles */}
                  {isSelected && !showPreview && (
                    <>
                      {/* Corners */}
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "nw")} style={{ position: "absolute", left: -4, top: -4, width: 8, height: 8, background: "#3b82f6", cursor: "nwse-resize", border: "1px solid white", borderRadius: 2 }} />
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "ne")} style={{ position: "absolute", right: -4, top: -4, width: 8, height: 8, background: "#3b82f6", cursor: "nesw-resize", border: "1px solid white", borderRadius: 2 }} />
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "sw")} style={{ position: "absolute", left: -4, bottom: -4, width: 8, height: 8, background: "#3b82f6", cursor: "nesw-resize", border: "1px solid white", borderRadius: 2 }} />
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "se")} style={{ position: "absolute", right: -4, bottom: -4, width: 8, height: 8, background: "#3b82f6", cursor: "nwse-resize", border: "1px solid white", borderRadius: 2 }} />
                      
                      {/* Edges */}
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "n")} style={{ position: "absolute", left: "50%", top: -4, transform: "translateX(-50%)", width: 8, height: 8, background: "#3b82f6", cursor: "ns-resize", border: "1px solid white", borderRadius: 2 }} />
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "s")} style={{ position: "absolute", left: "50%", bottom: -4, transform: "translateX(-50%)", width: 8, height: 8, background: "#3b82f6", cursor: "ns-resize", border: "1px solid white", borderRadius: 2 }} />
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "w")} style={{ position: "absolute", left: -4, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, background: "#3b82f6", cursor: "ew-resize", border: "1px solid white", borderRadius: 2 }} />
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "e")} style={{ position: "absolute", right: -4, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, background: "#3b82f6", cursor: "ew-resize", border: "1px solid white", borderRadius: 2 }} />
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Sidebar */}
        <div style={{ flex: "1 1 320px", maxWidth: "100%", display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 20, maxHeight: "calc(100vh - 40px)", overflowY: "auto", paddingRight: 4 }}>
          {/* Selected Field Properties */}
          {selectedMapping && !showPreview && (
            <div
              style={{
                background: "white",
                borderRadius: 14,
                border: "1px solid #3b82f6",
                padding: 16,
              }}
            >
              <h4
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 16 }}>⚙️</span> {selectedMapping.label}{" "}
                Properties
              </h4>

              {selectedMapping.type === "text" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  {/* Field Form Label */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Form Question Title (What students see)
                    </label>
                    <input
                      type="text"
                      value={selectedMapping.label}
                      onChange={(e) =>
                        updateMapping(selectedMapping.id, {
                          label: e.target.value,
                        })
                      }
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1.5px solid #e2e8f0",
                        fontSize: 13,
                        outline: "none",
                      }}
                      placeholder="e.g. Father's Mobile Number"
                    />
                  </div>
                  
                  {/* Font Size */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Font Size: {selectedMapping.fontSize}px
                    </label>
                    <input
                      type="range"
                      min="8"
                      max="48"
                      value={selectedMapping.fontSize}
                      onChange={(e) =>
                        updateMapping(selectedMapping.id, {
                          fontSize: Number(e.target.value),
                        })
                      }
                      style={{ width: "100%", accentColor: "#3b82f6" }}
                    />
                  </div>

                  {/* Font Color */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Font Color
                    </label>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="color"
                        value={selectedMapping.fontColor}
                        onChange={(e) =>
                          updateMapping(selectedMapping.id, {
                            fontColor: e.target.value,
                          })
                        }
                        style={{
                          width: 36,
                          height: 36,
                          border: "1px solid #e2e8f0",
                          borderRadius: 8,
                          cursor: "pointer",
                          padding: 2,
                        }}
                      />
                      {["#000000", "#ffffff", "#1e3a5f", "#dc2626", "#16a34a"].map(
                        (color) => (
                          <button
                            key={color}
                            onClick={() =>
                              updateMapping(selectedMapping.id, {
                                fontColor: color,
                              })
                            }
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              background: color,
                              border: `2px solid ${
                                selectedMapping.fontColor === color
                                  ? "#3b82f6"
                                  : "#e2e8f0"
                              }`,
                              cursor: "pointer",
                            }}
                          />
                        )
                      )}
                    </div>
                  </div>

                  {/* Font Weight */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Font Weight
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() =>
                          updateMapping(selectedMapping.id, {
                            fontWeight: "normal",
                          })
                        }
                        style={{
                          flex: 1,
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: `1.5px solid ${
                            selectedMapping.fontWeight === "normal"
                              ? "#3b82f6"
                              : "#e2e8f0"
                          }`,
                          background:
                            selectedMapping.fontWeight === "normal"
                              ? "#eff6ff"
                              : "white",
                          color:
                            selectedMapping.fontWeight === "normal"
                              ? "#2563eb"
                              : "#64748b",
                          fontSize: 12,
                          fontWeight: 400,
                          cursor: "pointer",
                        }}
                      >
                        Normal
                      </button>
                      <button
                        onClick={() =>
                          updateMapping(selectedMapping.id, {
                            fontWeight: "bold",
                          })
                        }
                        style={{
                          flex: 1,
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: `1.5px solid ${
                            selectedMapping.fontWeight === "bold"
                              ? "#3b82f6"
                              : "#e2e8f0"
                          }`,
                          background:
                            selectedMapping.fontWeight === "bold"
                              ? "#eff6ff"
                              : "white",
                          color:
                            selectedMapping.fontWeight === "bold"
                              ? "#2563eb"
                              : "#64748b",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Bold
                      </button>
                    </div>
                  </div>

                  {/* Font Family */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Font Family
                    </label>
                    <select
                      value={selectedMapping.fontFamily}
                      onChange={(e) =>
                        updateMapping(selectedMapping.id, {
                          fontFamily: e.target.value,
                        })
                      }
                      style={{
                        width: "100%",
                        height: 36,
                        padding: "0 8px",
                        border: "1.5px solid #e2e8f0",
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    >
                      <option value="Arial">Arial</option>
                      <option value="Helvetica">Helvetica</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Verdana">Verdana</option>
                      <option value="Courier New">Courier New</option>
                      <option value="Impact">Impact</option>
                    </select>
                  </div>

                  {/* Text Alignment */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Text Alignment
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {(["left", "center", "right"] as const).map((align) => (
                        <button
                          key={align}
                          onClick={() =>
                            updateMapping(selectedMapping.id, {
                              textAlign: align,
                            })
                          }
                          style={{
                            flex: 1,
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: `1.5px solid ${
                              (selectedMapping.textAlign || "left") === align
                                ? "#3b82f6"
                                : "#e2e8f0"
                            }`,
                            background:
                              (selectedMapping.textAlign || "left") === align
                                ? "#eff6ff"
                                : "white",
                            color:
                              (selectedMapping.textAlign || "left") === align
                                ? "#2563eb"
                                : "#64748b",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            textTransform: "capitalize",
                          }}
                        >
                          {align === "left" ? "◁ Left" : align === "center" ? "◈ Center" : "▷ Right"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Position (fine-tune) with numeric inputs */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Position & Size (%)
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 6,
                      }}
                    >
                      {[
                        { label: "X", key: "x" as const, min: 0, max: 95 },
                        { label: "Y", key: "y" as const, min: 0, max: 95 },
                        { label: "W", key: "width" as const, min: 2, max: 60 },
                        { label: "H", key: "height" as const, min: 2, max: 50 },
                      ].map(({ label: lbl, key, min, max }) => (
                        <div key={key}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#94a3b8", flex: 1 }}>
                              {lbl}:
                            </span>
                            <input
                              type="number"
                              min={min}
                              max={max}
                              step={0.5}
                              value={Number(selectedMapping[key]).toFixed(1)}
                              onChange={(e) =>
                                updateMapping(selectedMapping.id, {
                                  [key]: Math.max(min, Math.min(max, Number(e.target.value))),
                                })
                              }
                              style={{
                                width: 52,
                                padding: "2px 4px",
                                border: "1px solid #e2e8f0",
                                borderRadius: 4,
                                fontSize: 11,
                                textAlign: "right",
                              }}
                            />
                          </div>
                          <input
                            type="range"
                            min={min}
                            max={max}
                            step={0.5}
                            value={selectedMapping[key]}
                            onChange={(e) =>
                              updateMapping(selectedMapping.id, {
                                [key]: Number(e.target.value),
                              })
                            }
                            style={{ width: "100%", accentColor: "#3b82f6" }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions: Duplicate & Delete */}
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button
                      onClick={() => {
                        const dup: FieldMapping = {
                          ...selectedMapping,
                          id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                          fieldKey: `${selectedMapping.fieldKey}_copy`,
                          label: `${selectedMapping.label} (Copy)`,
                          y: Math.min(95, selectedMapping.y + 5),
                        }
                        setMappings(prev => [...prev, dup])
                        setSelectedId(dup.id)
                      }}
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        borderRadius: 6,
                        border: "1.5px solid #e2e8f0",
                        background: "white",
                        color: "#334155",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      📋 Duplicate
                    </button>
                    <button
                      onClick={() => removeFieldMapping(selectedMapping.id)}
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        borderRadius: 6,
                        border: "1.5px solid #fecaca",
                        background: "#fef2f2",
                        color: "#dc2626",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              )}

              {selectedMapping.type === "photo" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#64748b",
                      marginBottom: 4,
                      display: "block",
                    }}
                  >
                    Adjust photo area size and position using the handles on the
                    image, or fine-tune below.
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 6,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>
                        X: {selectedMapping.x.toFixed(1)}%
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="80"
                        step="0.5"
                        value={selectedMapping.x}
                        onChange={(e) =>
                          updateMapping(selectedMapping.id, {
                            x: Number(e.target.value),
                          })
                        }
                        style={{ width: "100%", accentColor: "#3b82f6" }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>
                        Y: {selectedMapping.y.toFixed(1)}%
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="80"
                        step="0.5"
                        value={selectedMapping.y}
                        onChange={(e) =>
                          updateMapping(selectedMapping.id, {
                            y: Number(e.target.value),
                          })
                        }
                        style={{ width: "100%", accentColor: "#3b82f6" }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>
                        W: {selectedMapping.width.toFixed(1)}%
                      </span>
                      <input
                        type="range"
                        min="5"
                        max="50"
                        step="0.5"
                        value={selectedMapping.width}
                        onChange={(e) =>
                          updateMapping(selectedMapping.id, {
                            width: Number(e.target.value),
                          })
                        }
                        style={{ width: "100%", accentColor: "#3b82f6" }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>
                        H: {selectedMapping.height.toFixed(1)}%
                      </span>
                      <input
                        type="range"
                        min="5"
                        max="60"
                        step="0.5"
                        value={selectedMapping.height}
                        onChange={(e) =>
                          updateMapping(selectedMapping.id, {
                            height: Number(e.target.value),
                          })
                        }
                        style={{ width: "100%", accentColor: "#3b82f6" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Quick Add Common Fields */}
          <div
            style={{
              background: "white",
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              padding: 16,
            }}
          >
            <h4
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#0f172a",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}>⚡</span> Quick Add
            </h4>

            {/* Photo button */}
            {!mappings.find((m) => m.type === "photo") && (
              <button
                onClick={() => addFieldMapping("photo", "Student Photo", "photo")}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1.5px dashed #3b82f6",
                  borderRadius: 8,
                  background: "#eff6ff",
                  color: "#2563eb",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                📷 Add Photo Placeholder
              </button>
            )}

            {/* Common fields - quick add buttons */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                { key: "name", label: "Student Name" },
                { key: "class", label: "Class-Section" },
                { key: "branch", label: "Branch" },
                { key: "rollNo", label: "Roll No. / NO" },
                { key: "father", label: "Father (No.)" },
                { key: "mother", label: "Mother (No.)" },
                { key: "fatherName", label: "Father's Name" },
                { key: "motherName", label: "Mother's Name" },
                { key: "mob_father", label: "Mob.- Father" },
                { key: "phone", label: "Phone" },
                { key: "address", label: "Address" },
                { key: "dateOfBirth", label: "Date of Birth" },
                { key: "bloodGroup", label: "Blood Group" },
                { key: "admissionNo", label: "Admission No." },
                { key: "photoId", label: "Photo ID" },
                { key: "serialNumber", label: "Serial Number" },
              ]
                .filter((f) => !mappings.find((m) => m.fieldKey === f.key))
                .map((f) => (
                  <button
                    key={f.key}
                    onClick={() => addFieldMapping(f.key, f.label)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #e2e8f0",
                      borderRadius: 6,
                      background: "white",
                      color: "#334155",
                      fontSize: 12,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f8fafc"
                      e.currentTarget.style.borderColor = "#3b82f6"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "white"
                      e.currentTarget.style.borderColor = "#e2e8f0"
                    }}
                  >
                    <span style={{ color: "#3b82f6" }}>+</span> {f.label}
                  </button>
                ))}
            </div>
          </div>

          {/* Custom Field Creator */}
          <div
            style={{
              background: "white",
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              padding: 16,
            }}
          >
            <h4
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#0f172a",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}>✏️</span> Add Custom Field
            </h4>
            <p style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>
              Type the exact label as printed on your ID card template
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomField()}
                placeholder="e.g. Father, Adhar No."
                style={{
                  flex: 1,
                  height: 36,
                  padding: "0 10px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: 13,
                }}
              />
              <button
                onClick={addCustomField}
                disabled={!newFieldLabel.trim()}
                style={{
                  height: 36,
                  padding: "0 14px",
                  borderRadius: 8,
                  border: "none",
                  background: newFieldLabel.trim() ? "#3b82f6" : "#e2e8f0",
                  color: newFieldLabel.trim() ? "white" : "#94a3b8",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: newFieldLabel.trim() ? "pointer" : "default",
                  whiteSpace: "nowrap",
                }}
              >
                + Add
              </button>
            </div>
          </div>

          {/* Placed Fields */}
          <div
            style={{
              background: "white",
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              padding: 16,
            }}
          >
            <h4
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#0f172a",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}>📋</span> Placed Fields ({mappings.length})
            </h4>

            {/* Photo Background Color Picker */}
            <div
              style={{
                background: "#faf5ff",
                borderRadius: 12,
                border: "1px solid #e9d5ff",
                padding: 14,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#7c3aed",
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 14 }}>🎨</span> Student Photo Background
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#8b5cf6",
                  marginBottom: 10,
                  lineHeight: 1.5,
                }}
              >
                AI will auto-replace the photo background with this color during student submission.
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                {BG_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setPhotoBgColor(preset.hex)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: preset.hex,
                      border:
                        photoBgColor === preset.hex
                          ? "3px solid #7c3aed"
                          : "2px solid #d1d5db",
                      cursor: "pointer",
                      boxShadow:
                        photoBgColor === preset.hex
                          ? "0 0 0 2px rgba(124,58,237,0.3)"
                          : "none",
                      transition: "all 0.15s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    title={preset.label}
                  >
                    {photoBgColor === preset.hex && (
                      <span style={{ fontSize: 14, color: preset.textColor }}>✓</span>
                    )}
                  </button>
                ))}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#a78bfa",
                  marginTop: 6,
                  textAlign: "center",
                }}
              >
                {BG_COLOR_PRESETS.find((p) => p.hex === photoBgColor)?.label || "Custom"} selected
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {mappings.map((m) => (
                <div
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1.5px solid ${
                      m.id === selectedId ? "#3b82f6" : "#e2e8f0"
                    }`,
                    background:
                      m.id === selectedId ? "#eff6ff" : "white",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "all 0.15s",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#334155",
                    }}
                  >
                    {m.type === "photo" ? "📷 " : ""}
                    {m.label}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFieldMapping(m.id)
                    }}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      border: "none",
                      background: "#fef2f2",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: 11,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {mappings.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: 16,
                    color: "#94a3b8",
                    fontSize: 12,
                  }}
                >
                  No fields placed yet.
                  <br />
                  Use Quick Add or Create Custom Field above.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
