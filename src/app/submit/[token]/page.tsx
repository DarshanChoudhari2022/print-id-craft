"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import { useParams } from "next/navigation"
import ReactCrop, { type Crop } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"

type FieldConfig = { key: string; label: string; type: string; required: boolean }

type FormConfig = {
  schoolName: string
  schoolLogo: string | null
  className: string
  schoolId: string
  classId: string
  fieldConfig: FieldConfig[]
}

export default function SubmitPage() {
  const params = useParams()
  const token = params.token as string

  const [step, setStep] = useState<"loading" | "error" | "form" | "photo" | "review" | "success">("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [config, setConfig] = useState<FormConfig | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState("")
  const [crop, setCrop] = useState<Crop>({ unit: "%", width: 75, height: 100, x: 12.5, y: 0 })
  const [croppedPhoto, setCroppedPhoto] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ serialNumber: string; studentId: string } | null>(null)

  const imgRef = useRef<HTMLImageElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/submit/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setConfig(data.data)
          setStep("form")
        } else {
          setErrorMsg(data.error || "Invalid link")
          setStep("error")
        }
      })
      .catch(() => { setErrorMsg("Failed to load form"); setStep("error") })
  }, [token])

  const handleFieldChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert("Photo must be less than 5MB")
      return
    }
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
    setCrop({ unit: "%", width: 75, height: 100, x: 12.5, y: 0 })
  }

  const generateCroppedPhoto = useCallback(async () => {
    if (!imgRef.current || !crop.width || !crop.height) return
    const img = imgRef.current
    const canvas = document.createElement("canvas")
    const scaleX = img.naturalWidth / img.width
    const scaleY = img.naturalHeight / img.height
    const pixelCrop = {
      x: (crop.x / 100) * img.width * scaleX,
      y: (crop.y / 100) * img.height * scaleY,
      width: (crop.width / 100) * img.width * scaleX,
      height: (crop.height / 100) * img.height * scaleY,
    }

    // Target: 3:4 ratio, max 600x800
    const TARGET_W = 600
    const TARGET_H = 800
    canvas.width = TARGET_W
    canvas.height = TARGET_H
    const ctx = canvas.getContext("2d")!
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(img, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, TARGET_W, TARGET_H)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85)
    setCroppedPhoto(dataUrl)
    return dataUrl
  }, [crop])

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!photoFile) {
      setStep("photo")
      return
    }
    handleReview()
  }

  const handleReview = async () => {
    if (photoPreview && !croppedPhoto) {
      await generateCroppedPhoto()
    }
    setStep("review")
  }

  const handleSubmit = async () => {
    if (!config) return
    setSubmitting(true)
    try {
      // Upload photo if exists
      let photoUrl = ""
      if (croppedPhoto) {
        try {
          const blob = await fetch(croppedPhoto).then(r => r.blob())
          // Upload to Supabase via client-side API
          const { createClient } = await import("@supabase/supabase-js")
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || "",
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
          )
          const fileName = `students/${config.schoolId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`
          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from("student-photos")
            .upload(fileName, blob, { contentType: "image/jpeg", upsert: true })
          if (uploadErr) {
            console.error("Photo upload error:", uploadErr)
          }
          if (!uploadErr && uploadData) {
            const { data: urlData } = supabase.storage.from("student-photos").getPublicUrl(fileName)
            photoUrl = urlData.publicUrl
          }
        } catch (photoErr) {
          console.error("Photo upload failed:", photoErr)
          // Continue with submission even if photo upload fails
        }
      }

      const res = await fetch(`/api/submit/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData, photoUrl }),
      })
      const data = await res.json()
      if (data.success) {
        setResult(data.data)
        setStep("success")
      } else {
        alert(data.error || "Submission failed")
        setSubmitting(false)
      }
    } catch (err) {
      console.error(err)
      alert("Submission failed. Please try again.")
      setSubmitting(false)
    }
  }

  // Loading state
  if (step === "loading") return (
    <div className="submit-page">
      <div className="submit-container">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60 }}>
          <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
          <p style={{ marginTop: 16, color: '#64748b', fontSize: 14 }}>Loading form...</p>
        </div>
      </div>
    </div>
  )

  // Error state  
  if (step === "error") return (
    <div className="submit-page">
      <div className="submit-container">
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
            {errorMsg === "Invalid link" ? "Invalid Form Link" :
             errorMsg === "This link is closed" ? "Form Closed" :
             errorMsg === "This link has expired" ? "Link Expired" : "Error"}
          </h2>
          <p style={{ fontSize: 14, color: '#64748b' }}>{errorMsg}</p>
        </div>
      </div>
    </div>
  )

  // Success state
  if (step === "success") return (
    <div className="submit-page">
      <div className="submit-container" style={{ maxWidth: 480 }}>
        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>✓</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Submitted Successfully!</h2>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>Your ID card registration has been received.</p>
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Serial Number</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>{result?.serialNumber}</p>
          </div>
          <p style={{ fontSize: 13, color: '#94a3b8' }}>Please save this serial number for your records. Your school will review the submission.</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="submit-page">
      <div className="submit-container">
        {/* School Header */}
        <div style={{ textAlign: 'center', padding: '28px 20px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #3b82f6, #1B4F8A)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 22, fontWeight: 700, color: 'white' }}>
            {config?.schoolName.charAt(0)}
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{config?.schoolName}</h1>
          <p style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>ID Registration — {config?.className}</p>
        </div>

        {/* Step Indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '16px 20px', background: '#f8fafc' }}>
          {["Details", "Photo", "Review"].map((s, i) => {
            const isActive = (step === "form" && i === 0) || (step === "photo" && i === 1) || (step === "review" && i === 2)
            const isDone = (step === "photo" && i === 0) || (step === "review" && i <= 1)
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                  background: isActive ? '#3b82f6' : isDone ? '#22c55e' : '#e2e8f0',
                  color: isActive || isDone ? 'white' : '#94a3b8',
                }}>
                  {isDone ? "✓" : i + 1}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? '#0f172a' : '#94a3b8' }}>{s}</span>
                {i < 2 && <div style={{ width: 20, height: 1, background: '#e2e8f0' }} />}
              </div>
            )
          })}
        </div>

        <div style={{ padding: 24 }}>
          {/* FORM STEP */}
          {step === "form" && (
            <form onSubmit={handleFormSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {config?.fieldConfig.filter(f => f.key !== "class").map(field => (
                  <div key={field.key} className="form-group">
                    <label>
                      {field.label}
                      {field.required && <span style={{ color: '#ef4444' }}> *</span>}
                    </label>
                    {field.type === "select" && field.key === "bloodGroup" ? (
                      <select
                        required={field.required}
                        value={formData[field.key] || ""}
                        onChange={e => handleFieldChange(field.key, e.target.value)}
                      >
                        <option value="">Select...</option>
                        {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        required={field.required}
                        value={formData[field.key] || ""}
                        onChange={e => handleFieldChange(field.key, e.target.value)}
                        rows={3}
                        style={{ resize: 'vertical', minHeight: 60 }}
                      />
                    ) : (
                      <input
                        type={field.type === "tel" ? "tel" : field.type === "date" ? "date" : "text"}
                        required={field.required}
                        value={formData[field.key] || ""}
                        onChange={e => handleFieldChange(field.key, e.target.value)}
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                      />
                    )}
                  </div>
                ))}
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 24, padding: '14px', fontSize: 15 }}>
                Next: Upload Photo →
              </button>
            </form>
          )}

          {/* PHOTO STEP */}
          {step === "photo" && (
            <div>
              <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
                Upload a passport-size photo. It will be cropped to 3:4 ratio.
              </p>

              {!photoPreview ? (
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{ border: '2px dashed #e2e8f0', borderRadius: 16, padding: 40, textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
                >
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📷</div>
                  <p style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Click to upload photo</p>
                  <p style={{ fontSize: 12, color: '#94a3b8' }}>JPG, PNG up to 5MB</p>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
                </div>
              ) : (
                <div style={{ maxWidth: 400, margin: '0 auto' }}>
                  <ReactCrop crop={crop} onChange={(_, pc) => setCrop(pc)} aspect={3 / 4}>
                    <img ref={imgRef} src={photoPreview} alt="Preview" style={{ maxWidth: '100%' }} />
                  </ReactCrop>
                  <button onClick={() => { setPhotoPreview(""); setPhotoFile(null); setCroppedPhoto("") }} className="btn btn-outline" style={{ width: '100%', marginTop: 12 }}>
                    Choose Different Photo
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setStep("form")}>← Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={!photoPreview} onClick={async () => { await generateCroppedPhoto(); setStep("review") }}>
                  Review →
                </button>
              </div>
            </div>
          )}

          {/* REVIEW STEP */}
          {step === "review" && (
            <div>
              <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>Please review your details before submitting.</p>

              <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
                {croppedPhoto && (
                  <div style={{ width: 120, height: 160, borderRadius: 10, overflow: 'hidden', border: '2px solid #e2e8f0', flexShrink: 0 }}>
                    <img src={croppedPhoto} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  {config?.fieldConfig.filter(f => f.key !== "class").map(field => (
                    formData[field.key] && (
                      <div key={field.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 13, color: '#64748b' }}>{field.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{formData[field.key]}</span>
                      </div>
                    )
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>Class</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{config?.className}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setStep("photo")}>← Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={submitting} onClick={handleSubmit}>
                  {submitting ? "Submitting..." : "Submit Registration"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
