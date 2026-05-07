import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { storageUpload, storagePublicUrl, ensureBucket, storageList } from "@/lib/storage"

const BUCKET = "student-photos"
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB per flag image
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"]

let bucketReady = false

// GET - List all flag images for a school
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schoolId = params.id

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, template: { select: { fieldConfig: true } } },
    })
    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 })
    }

    // Get unique flag colors from students' formData
    const students = await prisma.student.findMany({
      where: { schoolId },
      select: { formData: true },
    })

    // Map of safeName -> displayName (preserves original casing from student data)
    const colorMap = new Map<string, string>()
    for (const s of students) {
      const fd = s.formData as Record<string, string>
      const color = fd?.flagColor || fd?.["Flag Color"] || fd?.["flag_color"] || fd?.["House"] || fd?.["house"] || fd?.["Colour"] || fd?.["colour"] || ""
      const trimmed = color.trim()
      if (trimmed) {
        const safe = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "_")
        if (!colorMap.has(safe)) colorMap.set(safe, trimmed)
      }
    }

    // Also list any flag images already uploaded for this school (orphan flags
    // — uploaded before students were imported). Add them as detected colors so
    // the UI shows them even when no students exist yet.
    try {
      const { data: storedFiles } = await storageList(BUCKET, `flags/${schoolId}`)
      for (const f of storedFiles || []) {
        const base = f.name.replace(/\.[^.]+$/, "").trim()
        if (!base) continue
        const safe = base.toLowerCase().replace(/[^a-z0-9]/g, "_")
        if (!colorMap.has(safe)) {
          // Capitalize first letter for display
          const display = base.charAt(0).toUpperCase() + base.slice(1)
          colorMap.set(safe, display)
        }
      }
    } catch (e) {
      // listing is best-effort
    }

    // Build flag URLs by convention: flags/{schoolId}/{safeName}.{ext}
    const flags: Array<{ color: string; imageUrl: string | null }> = []
    const EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"]
    const storedNames = new Set<string>()
    try {
      const { data: storedFiles } = await storageList(BUCKET, `flags/${schoolId}`)
      for (const f of storedFiles || []) storedNames.add(f.name)
    } catch {}

    for (const [safeName, displayName] of Array.from(colorMap.entries())) {
      let flagUrl: string | null = null
      for (const ext of EXTENSIONS) {
        const fileName = `${safeName}.${ext}`
        if (storedNames.size > 0 ? storedNames.has(fileName) : true) {
          const path = `flags/${schoolId}/${fileName}`
          const url = storagePublicUrl(BUCKET, path)
          if (url && (storedNames.size === 0 || storedNames.has(fileName))) {
            flagUrl = url
            break
          }
        }
      }
      flags.push({ color: displayName, imageUrl: flagUrl })
    }

    const flagColors = Array.from(colorMap.values())

    return NextResponse.json({
      success: true,
      data: {
        flags,
        colors: Array.from(flagColors),
      },
    })
  } catch (error: any) {
    console.error("Flags GET error:", error)
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 })
  }
}

// POST - Upload a flag image for a specific color
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schoolId = params.id

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    })
    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 })
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const colorName = (formData.get("color") as string || "").trim()

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    if (!colorName) {
      return NextResponse.json({ error: "Color name is required" }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum 5MB." }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF, BMP" }, { status: 400 })
    }

    // Ensure bucket
    if (!bucketReady) {
      await ensureBucket(BUCKET)
      bucketReady = true
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const ext = file.name.split(".").pop()?.toLowerCase() || "png"
    const safeName = colorName.toLowerCase().replace(/[^a-z0-9]/g, "_")
    const filePath = `flags/${schoolId}/${safeName}.${ext}`

    const { error: uploadError } = await storageUpload(BUCKET, filePath, buffer, {
      contentType: file.type,
      upsert: true,
    })

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const publicUrl = storagePublicUrl(BUCKET, filePath)

    return NextResponse.json({
      success: true,
      data: {
        color: colorName,
        imageUrl: publicUrl,
        path: filePath,
      },
    })
  } catch (error: any) {
    console.error("Flag upload error:", error)
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 })
  }
}
