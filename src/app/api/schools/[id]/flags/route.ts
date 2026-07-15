import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { storageUpload, storagePublicUrl, ensureBucket } from "@/lib/storage"
import { getSchoolFlagCatalog } from "@/lib/school-flag-catalog"

const BUCKET = "student-photos"
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"]

let bucketReady = false

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
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

    const flags = await getSchoolFlagCatalog(schoolId)
    return NextResponse.json({
      success: true,
      data: {
        flags,
        colors: flags.map(flag => flag.color),
      },
    })
  } catch (error: any) {
    console.error("Flags GET error:", error)
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
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

    const ext = file.name.split(".").pop()?.toLowerCase() || ""
    const extToMime: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      bmp: "image/bmp",
    }
    const inferredType = extToMime[ext] || ""
    const effectiveType = file.type || inferredType
    if (!ALLOWED_TYPES.includes(effectiveType)) {
      return NextResponse.json({
        error: `Invalid file type "${file.type || ext || "unknown"}". Allowed: JPEG, PNG, WebP, GIF, BMP`,
      }, { status: 400 })
    }

    if (!bucketReady) {
      await ensureBucket(BUCKET)
      bucketReady = true
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const safeName = colorName.toLowerCase().replace(/[^a-z0-9]/g, "_")
    const finalExt = ext || "png"
    const filePath = `flags/${schoolId}/${safeName}.${finalExt}`
    const { error: uploadError } = await storageUpload(BUCKET, filePath, buffer, {
      contentType: effectiveType,
      upsert: true,
    })

    if (uploadError) {
      console.error(`Flag upload to ${filePath} failed:`, uploadError)
      return NextResponse.json({
        error: `Upload failed: ${uploadError.message || "storage error"}`,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: {
        color: colorName,
        imageUrl: storagePublicUrl(BUCKET, filePath),
        path: filePath,
      },
    })
  } catch (error: any) {
    console.error("Flag upload error:", error)
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 })
  }
}
