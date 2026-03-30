"use client"
import { useState, useCallback } from "react"
import { toast } from "sonner"

type FieldMapping = {
  id: string
  fieldKey: string
  label: string
  type: "text" | "photo"
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontColor: string
  fontWeight: "normal" | "bold"
  fontFamily: string
}

type StudentRenderData = {
  id: string
  serialNumber: string
  photoUrl: string
  qrCodeUrl: string | null
  className: string
  formData: Record<string, string>
}

type BatchGeneratorProps = {
  schoolId: string
  schoolName: string
  classes: { id: string; name: string; _count: { students: number } }[]
}

/**
 * Normalized key helper
 */
const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "")

const FIELD_GROUPS: Record<string, string[]> = {
  name: ["fullname", "studentname", "name", "student_name", "full_name", "full name", "student name"],
  father: ["fathername", "father", "fatherphone", "mobfather", "mob_father", "fatherno", "father name", "father mobile"],
  mother: ["mothername", "mother", "motherphone", "motherno", "mother name", "mother mobile"],
  mob_father: ["mobfather", "mob_father", "fatherphone", "father", "fathername", "phone", "mobile no", "contact no", "telephone"],
  phone: ["phone", "mobile", "contact", "fatherphone", "mobfather", "contact no", "mobile no"],
  class: ["class", "classsection", "class_section", "standard", "grade"],
  branch: ["branch", "campus", "location"],
  rollno: ["rollno", "roll", "srno", "no", "admissionno", "roll number"],
  address: ["address", "addr", "location"],
  dateofbirth: ["dob", "dateofbirth", "birthdate", "birthday"],
  bloodgroup: ["bloodgroup", "blood group", "bg"],
  admissionno: ["admissionno", "admno", "registrationno", "regno"],
  photoid: ["photoid", "photo_id", "imageid", "imgid"],
  serialnumber: ["serialnumber", "serial", "sr"],
}

function resolveFieldValue(fd: Record<string, string>, fieldKey: string): string {
  if (fd[fieldKey] && String(fd[fieldKey]).trim()) return String(fd[fieldKey])
  const fdNormalized: Record<string, string> = {}
  for (const [k, v] of Object.entries(fd)) {
    if (v) fdNormalized[normalizeKey(k)] = String(v)
  }
  const normKey = normalizeKey(fieldKey)
  if (fdNormalized[normKey]) return fdNormalized[normKey]
  const patterns = FIELD_GROUPS[normKey]
  if (patterns) {
    for (const p of patterns) {
      if (fdNormalized[p]) return fdNormalized[p]
      const simpleP = normalizeKey(p)
      for (const [nk, nv] of Object.entries(fdNormalized)) {
        if (nk.includes(simpleP) || simpleP.includes(nk)) return nv
      }
    }
  }
  return ""
}

const imageCache: Record<string, HTMLImageElement> = {}

async function getCachedImage(url: string): Promise<HTMLImageElement | null> {
  if (imageCache[url]) return imageCache[url]
  try {
    const img = new Image()
    img.crossOrigin = "anonymous"
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject()
      img.src = url
    })
    imageCache[url] = img
    return img
  } catch { return null }
}

async function renderIdCard(
  templateImageUrl: string,
  fieldMappings: FieldMapping[],
  student: StudentRenderData,
  outputScale: number = 1
): Promise<string> {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context failed")

  const templateImg = await getCachedImage(templateImageUrl)
  if (!templateImg) throw new Error("Failed to load template")

  canvas.width = templateImg.naturalWidth * outputScale
  canvas.height = templateImg.naturalHeight * outputScale
  const w = canvas.width
  const h = canvas.height

  ctx.drawImage(templateImg, 0, 0, w, h)

  for (const field of fieldMappings) {
    const fx = (field.x / 100) * w
    const fy = (field.y / 100) * h
    const fw = (field.width / 100) * w
    const fh = (field.height / 100) * h

    if (field.type === "photo") {
      if (student.photoUrl) {
        const photoImg = await getCachedImage(student.photoUrl)
        if (photoImg) {
          const aspectRatio = photoImg.naturalWidth / photoImg.naturalHeight
          const targetAspect = fw / fh
          let sx = 0, sy = 0, sw = photoImg.naturalWidth, sh = photoImg.naturalHeight
          if (aspectRatio > targetAspect) {
            sw = photoImg.naturalHeight * targetAspect
            sx = (photoImg.naturalWidth - sw) / 2
          } else {
            sh = photoImg.naturalWidth / targetAspect
            sy = (photoImg.naturalHeight - sh) / 2
          }
          ctx.drawImage(photoImg, sx, sy, sw, sh, fx, fy, fw, fh)
        }
      }
    } else {
      const pId = field.fieldKey === "photoId" ? "photoid" : field.fieldKey
      const val = resolveFieldValue(student.formData, pId) || 
                  (field.fieldKey === "class" ? student.className : 
                   field.fieldKey === "serialNumber" ? student.serialNumber : "")
      
      const value = String(val || "").trim()
      if (value) {
        const padding = 4 * outputScale
        const maxWidth = fw - padding * 2
        const fontPrefix = field.fontWeight === "bold" ? "bold " : ""
        let fontSize = fh * 0.78
        const minFontSize = Math.max(8 * outputScale, fh * 0.3)
        
        ctx.font = `${fontPrefix}${fontSize}px ${field.fontFamily || "Inter, Arial"}`
        let textWidth = ctx.measureText(value).width
        while (textWidth > maxWidth && fontSize > minFontSize) {
          fontSize -= 0.5
          ctx.font = `${fontPrefix}${fontSize}px ${field.fontFamily || "Inter, Arial"}`
          textWidth = ctx.measureText(value).width
        }

        ctx.fillStyle = field.fontColor || "#0f172a"
        ctx.textAlign = "left"
        ctx.textBaseline = "middle"
        ctx.save()
        ctx.beginPath()
        ctx.rect(fx, fy, fw, fh)
        ctx.clip()
        ctx.fillText(value, fx + padding, fy + fh / 2)
        ctx.restore()
      }
    }
  }
  return canvas.toDataURL("image/jpeg", 0.9)
}

async function downloadAsZip(
  cards: { name: string; dataUrl: string }[],
  zipName: string
) {
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()
  for (const card of cards) {
    const base64 = card.dataUrl.split(",")[1]
    zip.file(card.name, base64, { base64: true })
  }
  const blob = await zip.generateAsync({ type: "blob" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = zipName
  a.click()
  URL.revokeObjectURL(url)
}

export default function BatchGenerator({ schoolId, schoolName, classes }: BatchGeneratorProps) {
  const [selectedClassId, setSelectedClassId] = useState("")
  const [statusFilter, setStatusFilter] = useState("APPROVED")
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, status: "" })
  const [previewCards, setPreviewCards] = useState<{ serialNumber: string; dataUrl: string }[]>([])

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setProgress({ current: 0, total: 0, status: "Preparing data..." })
    setPreviewCards([])

    try {
      const params = new URLSearchParams({ status: statusFilter })
      if (selectedClassId) params.set("classId", selectedClassId)

      const res = await fetch(`/api/schools/${schoolId}/generate?${params}`)
      const data = await res.json()

      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to fetch data")
        setGenerating(false)
        return
      }

      const { templateImageUrl, fieldMappings, students, totalCount } = data.data
      setProgress({ current: 0, total: totalCount, status: "Rendering..." })

      const renderedCards: any[] = []
      const CHUNK_SIZE = 4 // Parallel rendering

      for (let i = 0; i < students.length; i += CHUNK_SIZE) {
        const chunk = students.slice(i, i + CHUNK_SIZE)
        const promises = chunk.map(async (student: any, idx: number) => {
          try {
            const dataUrl = await renderIdCard(templateImageUrl, fieldMappings, student, 1)
            return {
              name: `${student.serialNumber}.jpg`,
              serialNumber: student.serialNumber,
              dataUrl,
              id: student.id,
            }
          } catch (err) {
            console.error(`Error rendering ${student.serialNumber}`, err)
            return null
          }
        })

        const results = await Promise.all(promises)
        results.forEach(c => { if(c) renderedCards.push(c) })

        const currentProgress = Math.min(i + CHUNK_SIZE, totalCount)
        setProgress({ 
          current: currentProgress, 
          total: totalCount, 
          status: `Generated ${currentProgress}/${totalCount} cards...` 
        })
        
        // Small break for the main thread
        await new Promise(r => setTimeout(r, 0))
      }

      setPreviewCards(renderedCards.slice(0, 8))

      setProgress({ current: totalCount, total: totalCount, status: "Zipping files..." })
      const className = classes.find((c) => c.id === selectedClassId)?.name || "All"
      await downloadAsZip(renderedCards, `${schoolName}-${className}.zip`)

      const studentIds = renderedCards.map((c) => c.id)
      await fetch(`/api/schools/${schoolId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentIds }),
      })

      setProgress({ current: totalCount, total: totalCount, status: "Done!" })
      toast.success(`${renderedCards.length} cards exported!`)
    } catch (err: any) {
      console.error(err)
      toast.error("Generation failed")
    } finally {
      setGenerating(false)
    }
  }, [schoolId, schoolName, selectedClassId, statusFilter, classes])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Controls */}
      <div
        style={{
          background: "white",
          borderRadius: 16,
          border: "1px solid #e2e8f0",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg, #22c55e, #16a34a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
          >
            🖨️
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>
              Generate ID Cards
            </h3>
            <p style={{ fontSize: 13, color: "#94a3b8" }}>
              Render student data onto the JPG template and download as ZIP
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ flex: "1 1 200px" }}>
            <label
              style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, display: "block" }}
            >
              Select Class
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              style={{
                width: "100%",
                height: 42,
                padding: "0 12px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 10,
                fontSize: 14,
              }}
            >
              <option value="">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c._count.students} students)
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: "1 1 160px" }}>
            <label
              style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, display: "block" }}
            >
              Student Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: "100%",
                height: 42,
                padding: "0 12px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 10,
                fontSize: 14,
              }}
            >
              <option value="APPROVED">Approved Only</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="PRINTED">Already Printed</option>
            </select>
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={generating}
          style={{
            padding: "14px 32px",
            fontSize: 15,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {generating ? (
            <>
              <div
                className="login-spinner"
                style={{
                  width: 18,
                  height: 18,
                  borderColor: "rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                }}
              />
              Generating...
            </>
          ) : (
            <>🖨️ Generate & Download ID Cards</>
          )}
        </button>
      </div>

      {/* Progress */}
      {(generating || progress.total > 0) && (
        <div
          style={{
            background: "white",
            borderRadius: 16,
            border: "1px solid #e2e8f0",
            padding: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              color: "#64748b",
              marginBottom: 8,
            }}
          >
            <span>{progress.status}</span>
            {progress.total > 0 && (
              <span style={{ fontWeight: 600 }}>
                {progress.current}/{progress.total}
              </span>
            )}
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              background: "#f1f5f9",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 4,
                background: progress.status === "Done!"
                  ? "linear-gradient(90deg, #22c55e, #16a34a)"
                  : "linear-gradient(90deg, #3b82f6, #2563eb)",
                width: progress.total > 0
                  ? `${(progress.current / progress.total) * 100}%`
                  : "0%",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Preview Grid */}
      {previewCards.length > 0 && (
        <div
          style={{
            background: "white",
            borderRadius: 16,
            border: "1px solid #e2e8f0",
            padding: 24,
          }}
        >
          <h4 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>
            Preview ({previewCards.length} of {progress.total})
          </h4>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 16,
            }}
          >
            {previewCards.map((card) => (
              <div key={card.serialNumber}>
                <img
                  src={card.dataUrl}
                  alt={`ID Card ${card.serialNumber}`}
                  style={{
                    width: "100%",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                />
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#64748b",
                    marginTop: 6,
                    fontFamily: "monospace",
                  }}
                >
                  {card.serialNumber}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
