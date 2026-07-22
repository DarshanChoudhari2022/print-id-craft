import "dotenv/config"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { PrismaClient } from "@prisma/client"
import { createClient } from "@supabase/supabase-js"
import sharp from "sharp"

const APPLY = process.argv.includes("--apply")
const OUTPUT_DIR = path.resolve("outputs/company-photo-match")
const FOLDER_URL =
  "https://drive.google.com/drive/folders/1CjGeOLhWfjVxJn2rRXx22lTrq6tNU2_4WT24ylTAvCGMik-MguxHu3K9JstJPlCRfRbyaAUu?usp=sharing"
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1Oh7JYCm1FGztA7nVtuz0rBDDgk1d5Ucq/export?format=csv&gid=1420672850"
const SCROLLED_FOLDER_FILES_PATH = path.join(OUTPUT_DIR, "drive-folder-scroll-files.json")
const BUCKET = "student-photos"
const execFileAsync = promisify(execFile)
const PDFTOPPM_CMD = "C:\\Users\\choud\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\poppler\\Library\\bin\\pdftoppm.exe"

type PhotoCandidate = {
  source: "folder" | "sheet"
  fileId: string
  rawName: string
  personName: string
  employeeCode: string
  downloadUrl: string
}

type StudentRecord = {
  id: string
  schoolId: string
  serialNumber: string
  fullName: string
  formData: unknown
  photoUrl: string
  photoPath: string
  originalPhotoUrl: string
  originalPhotoPath: string
  photoBgStatus: string
}

const prisma = new PrismaClient()

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim()
}

function norm(value: unknown): string {
  return clean(value).toLowerCase().replace(/^mr\.?\s+/, "").replace(/[^a-z0-9]+/g, "")
}

function nameTokens(value: unknown): string[] {
  return clean(value).toLowerCase().replace(/^mr\.?\s+/, "").split(/[^a-z0-9]+/g).filter(Boolean)
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

function folderPersonName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.(jpe?g|png|webp)$/i, "")
  const afterDash = withoutExtension.includes(" - ")
    ? withoutExtension.split(" - ").slice(1).join(" - ")
    : withoutExtension
  return clean(afterDash.replace(/^[_\-\s\dA-Z]+(?=\s+[A-Z][a-z])/u, ""))
}

function extractGoogleDriveFileId(url: string): string {
  const text = clean(url)
  return (
    text.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ||
    text.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
    ""
  )
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]
    const next = csv[index + 1]
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else if (char !== "\r") {
      field += char
    }
  }
  row.push(field)
  if (row.some(cell => cell.trim())) rows.push(row)
  return rows
}

async function readFolderPhotos(): Promise<PhotoCandidate[]> {
  try {
    const scrolledFiles = JSON.parse(await fs.readFile(SCROLLED_FOLDER_FILES_PATH, "utf8")) as Array<{ id: string; name: string }>
    return scrolledFiles.map(file => ({
      source: "folder",
      fileId: file.id,
      rawName: file.name,
      personName: folderPersonName(file.name),
      employeeCode: "",
      downloadUrl: `https://drive.google.com/uc?export=download&id=${file.id}`,
    }))
  } catch {
    // Fall back to the initially rendered Drive HTML when the full scroll scrape
    // has not been captured yet.
  }

  const html = await fetch(FOLDER_URL).then(response => response.text())
  const seen = new Set<string>()
  const photos: PhotoCandidate[] = []
  const filePattern = /data-id="([a-zA-Z0-9_-]{20,})"[\s\S]{0,2500}?aria-label="([^"]+\.(?:jpe?g|png|webp)) Image(?: Shared)?"/gi
  for (const match of html.matchAll(filePattern)) {
    const fileId = match[1]
    const rawName = decodeHtml(match[2])
    if (seen.has(fileId)) continue
    seen.add(fileId)
    photos.push({
      source: "folder",
      fileId,
      rawName,
      personName: folderPersonName(rawName),
      employeeCode: "",
      downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
    })
  }
  return photos
}

async function readSheetPhotos(): Promise<PhotoCandidate[]> {
  const csv = await fetch(SHEET_CSV_URL).then(response => response.text())
  const rows = parseCsv(csv)
  const headers = rows[0] || []
  const nameIndex = headers.findIndex(header => norm(header) === "employeename")
  const codeIndex = headers.findIndex(header => norm(header) === "employeecode")
  const photoIndex = headers.findIndex(header => clean(header) === "")
  if (nameIndex < 0 || codeIndex < 0 || photoIndex < 0) {
    throw new Error("Could not find Employee Code/Employee Name/photo-link columns.")
  }

  return rows.slice(1).flatMap((row): PhotoCandidate[] => {
    const personName = clean(row[nameIndex])
    const employeeCode = clean(row[codeIndex])
    const photoUrl = clean(row[photoIndex])
    const fileId = extractGoogleDriveFileId(photoUrl)
    if (!personName || !fileId) return []
    return [{
      source: "sheet",
      fileId,
      rawName: personName,
      personName,
      employeeCode,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
    }]
  })
}

function uniqueCandidate(candidates: PhotoCandidate[], key: string): PhotoCandidate | null {
  const exact = candidates.filter(candidate => norm(candidate.personName) === key)
  const uniqueFileIds = new Set(exact.map(candidate => candidate.fileId))
  return exact.length >= 1 && uniqueFileIds.size === 1 ? exact[0] : null
}

function uniqueFolderCandidate(
  candidates: PhotoCandidate[],
  studentFullName: string,
  allStudentFullNames: string[],
): PhotoCandidate | null {
  const key = norm(studentFullName)
  const exact = uniqueCandidate(candidates, key)
  if (exact) return exact

  const studentTokens = nameTokens(studentFullName)
  const first = studentTokens[0]
  const last = studentTokens[studentTokens.length - 1]
  if (!first || !last || first === last) return null

  const folderFirstLastMatches = candidates.filter(candidate => {
    const tokens = nameTokens(candidate.personName)
    return tokens.length >= 2 && tokens[0] === first && tokens[tokens.length - 1] === last
  })
  const matchingStudentCount = allStudentFullNames.filter(name => {
    const tokens = nameTokens(name)
    return tokens[0] === first && tokens[tokens.length - 1] === last
  }).length
  const uniqueFileIds = new Set(folderFirstLastMatches.map(candidate => candidate.fileId))
  return matchingStudentCount === 1 && uniqueFileIds.size === 1 ? folderFirstLastMatches[0] : null
}

function uniqueSheetCandidate(candidates: PhotoCandidate[], nameKey: string, employeeCode: string): PhotoCandidate | null {
  const exact = candidates.filter(candidate =>
    norm(candidate.personName) === nameKey && norm(candidate.employeeCode) === norm(employeeCode)
  )
  const uniqueFileIds = new Set(exact.map(candidate => candidate.fileId))
  return exact.length >= 1 && uniqueFileIds.size === 1 ? exact[0] : null
}

function extensionFor(contentType: string): string {
  if (contentType.includes("png")) return "png"
  if (contentType.includes("webp")) return "webp"
  return "jpg"
}

function imageContentTypeFromBytes(bytes: Buffer): string {
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("ascii") === "%PDF") return "application/pdf"
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg"
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png"
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp"
  }
  return ""
}

async function renderPdfFirstPageToJpeg(bytes: Buffer): Promise<Buffer> {
  const tmpRoot = path.join(process.cwd(), "tmp", "pdfs")
  await fs.mkdir(tmpRoot, { recursive: true })
  const tmpDir = await fs.mkdtemp(path.join(tmpRoot, "company-photo-"))
  const inputPath = path.join(tmpDir, "input.pdf")
  const outputPrefix = path.join(tmpDir, "page")
  const outputPath = `${outputPrefix}.jpg`
  await fs.writeFile(inputPath, bytes)
  try {
    await execFileAsync(PDFTOPPM_CMD, ["-f", "1", "-l", "1", "-singlefile", "-jpeg", "-r", "300", inputPath, outputPrefix], {
      env: {
        ...process.env,
        PATH: [
          path.dirname(PDFTOPPM_CMD),
          process.env.PATH || "",
        ].join(path.delimiter),
      },
    })
    const rendered = await fs.readFile(outputPath)
    return await sharp(rendered).rotate().jpeg({ quality: 92 }).toBuffer()
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

async function downloadImage(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const response = await fetch(url, { redirect: "follow" })
  let contentType = response.headers.get("content-type") || "image/jpeg"
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!response.ok || bytes.length === 0) {
    throw new Error(`Photo download failed (${response.status}, ${contentType}).`)
  }
  contentType = imageContentTypeFromBytes(bytes) || contentType
  if (contentType === "application/pdf") {
    return { bytes: await renderPdfFirstPageToJpeg(bytes), contentType: "image/jpeg" }
  }
  if (contentType.startsWith("image/")) {
    return { bytes, contentType }
  }
  try {
    const converted = await sharp(bytes).rotate().jpeg({ quality: 92 }).toBuffer()
    return { bytes: converted, contentType: "image/jpeg" }
  } catch {
    throw new Error(`Photo download did not return a decodable image (${response.status}, ${contentType}).`)
  }
}

async function clearStudentPhoto(studentId: string) {
  await prisma.student.update({
    where: { id: studentId },
    data: {
      photoUrl: "",
      photoPath: "",
      originalPhotoUrl: "",
      originalPhotoPath: "",
      photoBgStatus: "",
    },
  })
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (APPLY && (!supabaseUrl || !supabaseKey)) {
    throw new Error("Supabase service-role configuration is required for --apply.")
  }
  const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

  const [folderPhotos, sheetPhotos, companies] = await Promise.all([
    readFolderPhotos(),
    readSheetPhotos(),
    prisma.school.findMany({
      where: { workspaceKind: "company" },
      select: {
        id: true,
        name: true,
        students: {
          select: {
            id: true,
            schoolId: true,
            serialNumber: true,
            fullName: true,
            formData: true,
            photoUrl: true,
            photoPath: true,
            originalPhotoUrl: true,
            originalPhotoPath: true,
            photoBgStatus: true,
          },
          orderBy: { submittedAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ])

  const students = companies.flatMap(company =>
    company.students.map(student => ({ ...student, companyName: company.name }))
  ) as Array<StudentRecord & { companyName: string }>
  const allStudentFullNames = students.map(student => student.fullName)
  const studentKeys = new Map<string, number>()
  for (const student of students) studentKeys.set(norm(student.fullName), (studentKeys.get(norm(student.fullName)) || 0) + 1)

  const decisions = students.map(student => {
    const key = norm(student.fullName)
    const employeeCode = clean((student.formData as Record<string, unknown> | null)?.employeeCode)
    const duplicateStudentName = (studentKeys.get(key) || 0) > 1
    const folderMatch = duplicateStudentName ? null : uniqueFolderCandidate(folderPhotos, student.fullName, allStudentFullNames)
    const sheetMatch = duplicateStudentName || folderMatch ? null : uniqueSheetCandidate(sheetPhotos, key, employeeCode)
    const candidate = folderMatch || sheetMatch
    const folderCandidateCount = folderPhotos.filter(photo => norm(photo.personName) === key).length
    const folderFirstLastCandidateCount = folderPhotos.filter(photo => {
      const studentTokens = nameTokens(student.fullName)
      const photoTokens = nameTokens(photo.personName)
      return (
        studentTokens.length >= 2 &&
        photoTokens.length >= 2 &&
        photoTokens[0] === studentTokens[0] &&
        photoTokens[photoTokens.length - 1] === studentTokens[studentTokens.length - 1]
      )
    }).length
    const sheetCandidateCount = sheetPhotos.filter(photo =>
      norm(photo.personName) === key && norm(photo.employeeCode) === norm(employeeCode)
    ).length
    return {
      student,
      action: candidate ? "set-photo" : "clear-photo",
      candidate,
      reason: candidate
        ? `unique ${candidate.source} name match`
        : !employeeCode
          ? "missing employee code for sheet fallback"
        : duplicateStudentName
          ? "duplicate employee name in company records"
          : `no unique exact/first-last folder match or sheet name+code match ` +
            `(folderExact=${folderCandidateCount}, folderFirstLast=${folderFirstLastCandidateCount}, sheet=${sheetCandidateCount})`,
    }
  })

  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const report = {
    mode: APPLY ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    folderPhotos: folderPhotos.length,
    sheetPhotos: sheetPhotos.length,
    companies: companies.map(company => ({ id: company.id, name: company.name, students: company.students.length })),
    totals: {
      students: decisions.length,
      setPhoto: decisions.filter(decision => decision.action === "set-photo").length,
      clearPhoto: decisions.filter(decision => decision.action === "clear-photo").length,
      fromFolder: decisions.filter(decision => decision.candidate?.source === "folder").length,
      fromSheet: decisions.filter(decision => decision.candidate?.source === "sheet").length,
    },
    decisions: decisions.map(decision => ({
      id: decision.student.id,
      serialNumber: decision.student.serialNumber,
      company: decision.student.companyName,
      fullName: decision.student.fullName,
      action: decision.action,
      reason: decision.reason,
      source: decision.candidate?.source || "",
      sourceName: decision.candidate?.rawName || "",
      fileId: decision.candidate?.fileId || "",
    })),
  }
  await fs.writeFile(path.join(OUTPUT_DIR, APPLY ? "apply-report.json" : "dry-run-report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report.totals, null, 2))

  if (!APPLY) return

  await fs.writeFile(
    path.join(OUTPUT_DIR, `rollback-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
    JSON.stringify(students, null, 2)
  )

  let updated = 0
  let failed = 0
  for (const decision of decisions) {
    try {
      if (!decision.candidate) {
        await clearStudentPhoto(decision.student.id)
        updated += 1
        continue
      }
      if (!supabase) throw new Error("Supabase client is unavailable.")
      const image = await downloadImage(decision.candidate.downloadUrl)
      const ext = extensionFor(image.contentType)
      const photoPath = `students/${decision.student.schoolId}/originals/${decision.student.id}.${ext}`
      const { error } = await supabase.storage.from(BUCKET).upload(photoPath, image.bytes, {
        contentType: image.contentType,
        upsert: true,
      })
      if (error) throw error
      const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(photoPath).data.publicUrl
      await prisma.student.update({
        where: { id: decision.student.id },
        data: {
          photoUrl: publicUrl,
          photoPath,
          originalPhotoUrl: publicUrl,
          originalPhotoPath: photoPath,
          photoBgStatus: "PLAIN",
        },
      })
      updated += 1
    } catch (error) {
      failed += 1
      await clearStudentPhoto(decision.student.id)
      console.error(`Failed ${decision.student.fullName}:`, error)
    }
  }
  console.log(JSON.stringify({ updated, failed }, null, 2))
  if (failed) process.exitCode = 1
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
