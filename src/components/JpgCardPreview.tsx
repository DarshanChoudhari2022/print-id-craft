"use client"
import { useRef, useEffect, useState, useCallback, memo } from "react"
import { resolveFieldValue as resolveFieldValueShared } from "@/lib/field-resolver"

type FieldMapping = {
  id: string
  fieldKey: string
  label: string
  type: "text" | "photo" | "flag"
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontColor: string
  fontWeight: "normal" | "bold"
  fontFamily: string
  textAlign?: "left" | "center" | "right"
  // How long text is handled inside the box:
  //   "nowrap"    → single line, truncated with "…" on overflow.
  //   "wrap"      → single line, auto-shrunk so the full text fits (default,
  //                  matches legacy behaviour).
  //   "multiline" → wraps onto multiple lines AT THE USER'S CHOSEN font size.
  //                  Used for long addresses where shrinking would be illegible.
  textWrap?: "nowrap" | "wrap" | "multiline"
  // Photo styling (rounded corners + border) — kept optional so older
  // saved templates without these props still render correctly.
  photoBorderRadius?: number
  photoBorderWidth?: number
  photoBorderColor?: string
}

/**
 * Draws a rounded-rectangle path on the given canvas context.
 * Used to clip photo regions with rounded corners (incl. full-circle when
 * radius is >= min(w,h)/2). Falls back to a plain rectangle when radius is 0.
 */
function pathRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  if (radius <= 0) {
    ctx.rect(x, y, w, h)
    return
  }
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

type JpgCardPreviewProps = {
  templateImageUrl: string
  fieldMappings: FieldMapping[]
  formData: Record<string, string>
  studentPhoto?: string
  flagImageUrl?: string
  scale?: number
  className?: string
  watermark?: string
}

const MAPPER_REFERENCE_WIDTH = 600

// In-memory cache for loaded images to speed up rendering
const imageCache: Record<string, HTMLImageElement> = {}

async function loadImage(url: string): Promise<HTMLImageElement> {
  if (imageCache[url]) return imageCache[url]
  const img = new Image()
  img.crossOrigin = "anonymous"
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("Failed to load: " + url))
    img.src = url
  })
  imageCache[url] = img
  return img
}

const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "")

const FIELD_GROUPS: Record<string, string[]> = {
  name: ["fullname", "studentname", "name", "student_name", "full_name"],
  father: ["fathername", "father", "fatherphone", "mobfather", "mob_father", "fatherno"],
  mother: ["mothername", "mother", "motherphone", "motherno"],
  mob_father: ["mobfather", "mob_father", "fatherphone", "father", "fathername", "phone"],
  phone: ["phone", "mobile", "contact", "fatherphone", "mobfather"],
  class: ["class", "classsection", "class_section"],
  branch: ["branch"],
  rollno: ["rollno", "roll", "srno", "no", "admissionno"],
  address: ["address", "addr"],
  dateofbirth: ["dob", "dateofbirth", "birthdate"],
  bloodgroup: ["bloodgroup"],
  admissionno: ["admissionno", "admno"],
  photoid: ["photoid", "photo_id", "photono", "photo_no", "photonumber", "img", "imgno", "img_no", "imageno", "image_no"],
  serialnumber: ["serialnumber", "serial"],
  flagcolor: ["flagcolor", "flag_color", "flag", "house", "housecolor", "house_color", "colour", "color", "team"],
}

// Delegate to the canonical shared resolver so all field-key aliases
// (including "mobile" → "phone"/"fatherphone") stay in sync across the app.
export function resolveFieldValue(fd: Record<string, string>, fieldKey: string): string {
  return resolveFieldValueShared(fd, fieldKey)
}

/**
 * Word-wrap + (optionally) auto-shrink text to fit a fixed box.
 *
 * Honours the field's `textWrap` mode:
 *   • "wrap"      → legacy auto-fit. Try single line shrinking down to ~30%
 *                    of box height, otherwise wrap and keep shrinking.
 *   • "nowrap"    → single line at the user's chosen font size (truncated
 *                    with "…" if it overflows the box width).
 *   • "multiline" → wrap onto multiple lines AT THE USER'S CHOSEN font size.
 *                    Font is NEVER shrunk for width; lines that overflow the
 *                    box vertically are clipped by the caller's ctx.rect clip.
 *
 * `userFontSizeEditorPx` is the value the user set in the side panel (stored
 * in editor pixels, relative to a ~600 px reference image). We scale it to
 * canvas pixels here so what they see in the editor matches the preview.
 */
function fitTextToBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  boxW: number,
  boxH: number,
  fontFamily: string,
  fontWeight: string,
  scale: number,
  canvasW: number,
  userFontSizeEditorPx?: number,
  wrapMode: "nowrap" | "wrap" | "multiline" = "wrap",
): { lines: string[]; fontSize: number; lineHeight: number } {
  const padding = 4 * scale
  const maxW = Math.max(1, boxW - padding * 2)
  const maxH = Math.max(1, boxH - padding * 2)
  const fontPrefix = fontWeight === "bold" ? "bold " : ""

  const setFont = (s: number) => { ctx.font = `${fontPrefix}${s}px ${fontFamily}` }

  // Word-wrap helper used by both nowrap (for ellipsis fallback) and multiline.
  const wrap = (size: number): string[] => {
    setFont(size)
    const words = text.split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let current = ""
    for (const w of words) {
      const tentative = current ? current + " " + w : w
      if (ctx.measureText(tentative).width <= maxW) {
        current = tentative
      } else {
        if (current) lines.push(current)
        // Single word is wider than the box → hard-break char-by-char
        if (ctx.measureText(w).width > maxW) {
          let chunk = ""
          for (const ch of w) {
            const t2 = chunk + ch
            if (ctx.measureText(t2).width <= maxW) chunk = t2
            else { if (chunk) lines.push(chunk); chunk = ch }
          }
          current = chunk
        } else {
          current = w
        }
      }
    }
    if (current) lines.push(current)
    return lines
  }

  // Resolve the user's chosen font size into canvas pixels. We scale by the
  // canvas width vs the editor reference width so the on-card text looks the
  // same size as in the editor at any DPI.
  const userPx =
    userFontSizeEditorPx && userFontSizeEditorPx > 0
      ? (userFontSizeEditorPx * canvasW) / MAPPER_REFERENCE_WIDTH
      : boxH * 0.6

  // ── MULTILINE: preserve the user's font size, wrap to as many lines as needed.
  if (wrapMode === "multiline") {
    const lines = wrap(userPx)
    return { lines, fontSize: userPx, lineHeight: userPx * 1.2 }
  }

  // ── NO WRAP: single line at the user's font size, truncate with "…".
  if (wrapMode === "nowrap") {
    setFont(userPx)
    if (ctx.measureText(text).width <= maxW) {
      return { lines: [text], fontSize: userPx, lineHeight: userPx * 1.15 }
    }
    // Truncate with ellipsis
    const ellipsis = "…"
    let lo = 0, hi = text.length
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      const trial = text.slice(0, mid) + ellipsis
      if (ctx.measureText(trial).width <= maxW) lo = mid
      else hi = mid - 1
    }
    return { lines: [text.slice(0, lo) + ellipsis], fontSize: userPx, lineHeight: userPx * 1.15 }
  }

  // ── WRAP (legacy auto-fit): shrink to one line, fall back to wrapped+shrunk.
  const minFont = Math.max(7 * scale, boxH * 0.28)
  let fontSize = boxH * 0.78
  setFont(fontSize)
  while (ctx.measureText(text).width > maxW && fontSize > minFont) {
    fontSize -= 0.5
    setFont(fontSize)
  }
  if (ctx.measureText(text).width <= maxW) {
    return { lines: [text], fontSize, lineHeight: fontSize * 1.15 }
  }

  let lines = wrap(fontSize)
  let lineHeight = fontSize * 1.15
  while (lines.length * lineHeight > maxH && fontSize > minFont) {
    fontSize -= 0.5
    lines = wrap(fontSize)
    lineHeight = fontSize * 1.15
  }
  return { lines, fontSize, lineHeight }
}

export default function JpgCardPreview({
  templateImageUrl,
  fieldMappings,
  formData,
  studentPhoto,
  flagImageUrl,
  scale = 1,
  className,
  watermark,
}: JpgCardPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 380 })

  const render = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    try {
      const img = await loadImage(templateImageUrl)
      const w = img.naturalWidth * scale
      const h = img.naturalHeight * scale
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        setDimensions({ width: w, height: h })
      }

      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)

      for (const field of fieldMappings) {
        const fx = (field.x / 100) * w
        const fy = (field.y / 100) * h
        const fw = (field.width / 100) * w
        const fh = (field.height / 100) * h

        if (field.type === "photo") {
          // Honour the template's saved rounded-corner + border settings so the
          // live student preview matches the editor exactly. Radius is stored
          // in editor px (relative to a ~600 px reference image); we scale it
          // to the rendered canvas so circles stay circular at any DPI.
          const radiusEditorPx = field.photoBorderRadius || 0
          const radiusPx = (radiusEditorPx / MAPPER_REFERENCE_WIDTH) * w
          const borderPx = ((field.photoBorderWidth || 0) / MAPPER_REFERENCE_WIDTH) * w
          if (studentPhoto) {
            try {
              const photoImg = await loadImage(studentPhoto)
              // Contain-fit: show the ENTIRE photo, no cropping. Prevents heads
              // from being cut off and stops the photo from bleeding out of
              // its mapped box into surrounding template content.
              const photoAspect = photoImg.naturalWidth / photoImg.naturalHeight
              const boxAspect = fw / fh
              let dx: number, dy: number, dw: number, dh: number
              if (photoAspect > boxAspect) {
                dw = fw
                dh = fw / photoAspect
                dx = fx
                dy = fy + (fh - dh) / 2
              } else {
                dh = fh
                dw = fh * photoAspect
                dx = fx + (fw - dw) / 2
                dy = fy
              }
              ctx.save()
              pathRoundedRect(ctx, fx, fy, fw, fh, radiusPx)
              ctx.clip()
              ctx.drawImage(photoImg, 0, 0, photoImg.naturalWidth, photoImg.naturalHeight, dx, dy, dw, dh)
              ctx.restore()
            } catch (err) {
              ctx.save()
              pathRoundedRect(ctx, fx, fy, fw, fh, radiusPx)
              ctx.clip()
              ctx.fillStyle = "#e2e8f0"
              ctx.fillRect(fx, fy, fw, fh)
              ctx.restore()
            }
          }
          // Draw the border on top of the (clipped) photo so rounded corners
          // are stroked cleanly. Skip when width is 0.
          if (borderPx > 0) {
            ctx.save()
            ctx.lineWidth = borderPx
            ctx.strokeStyle = field.photoBorderColor || "#000000"
            // Inset by half the line width so the stroke sits inside the box.
            const inset = borderPx / 2
            pathRoundedRect(
              ctx,
              fx + inset, fy + inset,
              fw - borderPx, fh - borderPx,
              Math.max(0, radiusPx - inset),
            )
            ctx.stroke()
            ctx.restore()
          }
        } else if (field.type === "flag") {
          if (flagImageUrl) {
            try {
              const flagImg = await loadImage(flagImageUrl)
              ctx.drawImage(flagImg, 0, 0, flagImg.naturalWidth, flagImg.naturalHeight, fx, fy, fw, fh)
            } catch (err) {
              // Flag image failed to load — skip silently
            }
          }
        } else {
          const value = resolveFieldValue(formData, field.fieldKey)
          if (value) {
            const padding = 4 * scale
            const fontFamily = field.fontFamily || "Arial"
            const fontWeight = field.fontWeight || "normal"
            const { lines, fontSize, lineHeight } = fitTextToBox(
              ctx, String(value), fw, fh, fontFamily, fontWeight, scale,
              w, field.fontSize, field.textWrap || "wrap",
            )

            ctx.fillStyle = field.fontColor || "#000"
            const align = field.textAlign || "left"
            ctx.textAlign = align
            ctx.textBaseline = "middle"
            ctx.save()
            ctx.beginPath()
            ctx.rect(fx, fy, fw, fh)
            ctx.clip()
            const textX = align === "center" ? fx + fw / 2 : align === "right" ? fx + fw - padding : fx + padding
            // Vertically position the text block.
            //   • multiline → top-align so the first line is always visible
            //     even if the address overflows the bottom of the box.
            //   • everything else → centered (legacy behaviour).
            const totalH = lines.length * lineHeight
            const isMultiline = (field.textWrap || "wrap") === "multiline"
            const firstLineY = isMultiline
              ? fy + padding + lineHeight / 2
              : fy + (fh - totalH) / 2 + lineHeight / 2
            for (let i = 0; i < lines.length; i++) {
              ctx.fillText(lines[i], textX, firstLineY + i * lineHeight)
            }
            ctx.restore()
          }
        }
      }

      if (watermark) {
        ctx.save()
        ctx.globalAlpha = 0.15
        const wmFontSize = Math.max(w * 0.05, 20)
        ctx.font = `bold ${wmFontSize}px Arial`
        ctx.fillStyle = "#ef4444"
        ctx.textAlign = "center"
        ctx.translate(w / 2, h / 2)
        ctx.rotate(-Math.PI / 6)
        for (let row = -2; row <= 2; row++) {
          ctx.fillText(watermark, 0, row * wmFontSize * 2.5)
        }
        ctx.restore()
      }
    } catch (err) {
      console.error("Render failed", err)
    }
  }, [templateImageUrl, fieldMappings, formData, studentPhoto, flagImageUrl, scale, watermark])

  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Debounce canvas rendering to prevent lag on rapid form edits
    if (renderTimerRef.current) clearTimeout(renderTimerRef.current)
    renderTimerRef.current = setTimeout(() => {
      render()
    }, 50)
    return () => {
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current)
    }
  }, [render])

  return (
    <div className={`${className} fade-in`} style={{ display: "inline-block" }}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "auto",
          maxWidth: Math.round(dimensions.width / (scale > 1 ? scale : 1)),
          borderRadius: 12,
          boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
        }}
      />
    </div>
  )
}

export async function generateJpgCard(
  templateImageUrl: string,
  fieldMappings: FieldMapping[],
  formData: Record<string, string>,
  studentPhoto?: string,
  outputScale: number = 1,
  flagImageUrl?: string
): Promise<string> {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context failed")

  const img = await loadImage(templateImageUrl)
  const w = img.naturalWidth * outputScale
  const h = img.naturalHeight * outputScale
  canvas.width = w
  canvas.height = h

  ctx.drawImage(img, 0, 0, w, h)

  for (const field of fieldMappings) {
    const fx = (field.x / 100) * w
    const fy = (field.y / 100) * h
    const fw = (field.width / 100) * w
    const fh = (field.height / 100) * h

    if (field.type === "photo") {
      // Scale saved editor-px values (border width + corner radius) to the
      // generated canvas so PDFs match what's shown in the on-screen preview.
      const radiusPx = ((field.photoBorderRadius || 0) / MAPPER_REFERENCE_WIDTH) * w
      const borderPx = ((field.photoBorderWidth || 0) / MAPPER_REFERENCE_WIDTH) * w
      if (studentPhoto) {
        try {
          const photoImg = await loadImage(studentPhoto)
          // Contain-fit: show entire photo, no cropping
          const photoAspect = photoImg.naturalWidth / photoImg.naturalHeight
          const boxAspect = fw / fh
          let dx: number, dy: number, dw: number, dh: number
          if (photoAspect > boxAspect) {
            dw = fw; dh = fw / photoAspect
            dx = fx; dy = fy + (fh - dh) / 2
          } else {
            dh = fh; dw = fh * photoAspect
            dx = fx + (fw - dw) / 2; dy = fy
          }
          ctx.save()
          pathRoundedRect(ctx, fx, fy, fw, fh, radiusPx)
          ctx.clip()
          ctx.drawImage(photoImg, 0, 0, photoImg.naturalWidth, photoImg.naturalHeight, dx, dy, dw, dh)
          ctx.restore()
        } catch {}
      }
      if (borderPx > 0) {
        ctx.save()
        ctx.lineWidth = borderPx
        ctx.strokeStyle = field.photoBorderColor || "#000000"
        const inset = borderPx / 2
        pathRoundedRect(
          ctx,
          fx + inset, fy + inset,
          fw - borderPx, fh - borderPx,
          Math.max(0, radiusPx - inset),
        )
        ctx.stroke()
        ctx.restore()
      }
    } else if (field.type === "flag" && flagImageUrl) {
      try {
        const flagImg = await loadImage(flagImageUrl)
        ctx.drawImage(flagImg, 0, 0, flagImg.naturalWidth, flagImg.naturalHeight, fx, fy, fw, fh)
      } catch {}
    } else if (field.type === "text") {
      const value = resolveFieldValue(formData, field.fieldKey)
      if (value) {
        const padding = 4 * outputScale
        const fontFamily = field.fontFamily || "Arial"
        const fontWeight = field.fontWeight || "normal"
        const { lines, fontSize, lineHeight } = fitTextToBox(
          ctx, String(value), fw, fh, fontFamily, fontWeight, outputScale,
          w, field.fontSize, field.textWrap || "wrap",
        )

        ctx.fillStyle = field.fontColor || "#000"
        const align = field.textAlign || "left"
        ctx.textAlign = align
        ctx.textBaseline = "middle"
        ctx.save()
        ctx.beginPath()
        ctx.rect(fx, fy, fw, fh)
        ctx.clip()
        const textX = align === "center" ? fx + fw / 2 : align === "right" ? fx + fw - padding : fx + padding
        const totalH = lines.length * lineHeight
        const isMultiline = (field.textWrap || "wrap") === "multiline"
        const firstLineY = isMultiline
          ? fy + padding + lineHeight / 2
          : fy + (fh - totalH) / 2 + lineHeight / 2
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], textX, firstLineY + i * lineHeight)
        }
        ctx.restore()
      }
    }
  }

  return canvas.toDataURL("image/jpeg", 0.92)
}
