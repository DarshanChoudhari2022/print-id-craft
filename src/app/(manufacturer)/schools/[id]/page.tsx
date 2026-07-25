"use client"
import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react"
import { useParams, usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import dynamic from "next/dynamic"
import { prepareStudentPhotoForUpload } from "@/lib/client-photo-upload"
import {
  DEFAULT_CLASS_OPTIONS,
  SECTION_TYPE_LABELS,
  formatClassSection,
  resolveEffectiveClassOptions,
  resolveEffectiveDivisionOptions,
  type SectionType,
} from "@/lib/section-class"
import { photoCacheVersion, studentPhotoUrl as buildStudentPhotoUrl } from "@/lib/student-photo-url"
import { prepareSectionRename } from "@/lib/section-name"
import { getFieldRole, normalizeKey, resolveEditFieldValue } from "@/lib/field-resolver"
import {
  cardDimensionsForOrientation,
  DEFAULT_CARD_HEIGHT_MM,
  DEFAULT_CARD_WIDTH_MM,
} from "@/lib/card-dimensions"
import {
  stripIndianPrefix,
  validatePublicSubmissionDetails,
  type FormField,
} from "@/lib/form-validation"
import { resolveHouseImageUrl } from "@/lib/house-flags"
import { isCompanyWorkspace } from "@/lib/workspace-kind"
import { normalizeStudentFieldValue } from "@/lib/student-text-normalization"
import {
  applyFixedTemplateValuesToFormData,
  getFixedTemplateFieldKeys,
} from "@/lib/fixed-template-values"

const EDIT_ADDRESS_MIN_WORDS = 5
type DownloadExportStatus = "APPROVED" | "SUBMITTED" | "PRINTED"

const DOWNLOAD_EXPORT_STATUS_LABELS: Record<DownloadExportStatus, string> = {
  APPROVED: "Approved",
  SUBMITTED: "Submitted",
  PRINTED: "Printed",
}

type EditStudentField = FormField & {
  inputType: "flag" | "mobile" | "address" | "dob" | "text" | "textarea"
}

function canonicalEditStudentFieldKey(fieldKey: string, label: string): string {
  const normalized = normalizeKey(`${fieldKey} ${label}`)
  const isContactLike = /(contact|mobile|phone|tel|no|number)/.test(normalized)
  if (normalized.includes("emergency") && isContactLike) return "emergencyContact"
  if (normalized.includes("office") && isContactLike) return "officeNo"
  if (normalized.includes("employee") && isContactLike) return "mobile"
  return fieldKey
}

function getEditTemplateMappings(templateData: any): any[] {
  return [
    ...((templateData?.fieldMappings || []) as any[]),
    ...((templateData?.backFieldMappings || []) as any[]),
  ]
}

function buildEditStudentFields(templateData: any): EditStudentField[] {
  const mappings = getEditTemplateMappings(templateData)
  const fixedKeys = getFixedTemplateFieldKeys(mappings)
  const textMappings = mappings.filter(
    (m) => (
      m.type !== "photo" &&
      m.fieldKey !== "class" &&
      m.fieldKey !== "classSection" &&
      !m.useFixedValue &&
      !fixedKeys.has(normalizeKey(canonicalEditStudentFieldKey(m.fieldKey, m.label)))
    )
  )
  if (textMappings.length === 0) {
    return [
      { key: "fullName", label: "Full Name", type: "text", required: true, role: "name", inputType: "text" },
      { key: "phone", label: "Phone", type: "tel", required: true, role: "mobile", inputType: "mobile" },
      { key: "address", label: "Address", type: "text", required: true, role: "address", inputType: "address" },
    ]
  }
  const seenKeys = new Set<string>()
  return textMappings.map((m) => {
    const key = canonicalEditStudentFieldKey(m.fieldKey, m.label)
    const role = getFieldRole(m.fieldKey, m.label)
    let inputType: EditStudentField["inputType"] = "text"
    if (m.type === "flag") inputType = "flag"
    else if (role === "mobile") inputType = "mobile"
    else if (role === "address") inputType = "address"
    else if (role === "dob") inputType = "dob"
    else if (m.fieldKey.toLowerCase().includes("address")) inputType = "textarea"
    return {
      key,
      label: m.label,
      type: role === "mobile" ? "tel" : "text",
      required: true,
      role,
      inputType,
    }
  }).filter((field) => {
    if (seenKeys.has(field.key)) return false
    seenKeys.add(field.key)
    return true
  })
}

function normalizeEditMobileValue(value: string): string {
  const local = stripIndianPrefix(value)
  return local.length === 10 ? `+91 ${local}` : value.trim()
}

function hydrateEditFormFromStudent(
  templateData: any,
  fd: Record<string, string>
): { formFields: Record<string, string>; mobileLocals: Record<string, string> } {
  const fields = buildEditStudentFields(templateData)
  const formFields = applyFixedTemplateValuesToFormData(
    { ...fd },
    getEditTemplateMappings(templateData),
  ) as Record<string, string>
  const mobileLocals: Record<string, string> = {}

  for (const field of fields) {
    const resolved = resolveEditFieldValue(fd, field.key, field.label, field.role)
    if (resolved) {
      formFields[field.key] = field.inputType === "mobile"
        ? normalizeEditMobileValue(resolved)
        : resolved
    }
    if (field.inputType === "mobile") {
      mobileLocals[field.key] = stripIndianPrefix(formFields[field.key] || "")
    }
  }

  return { formFields, mobileLocals }
}

function editFieldWordCount(value: string): number {
  return (value || "").trim().split(/\s+/).filter(Boolean).length
}

// Lazy-load heavy components — only loaded when their tab is active
const IDCardPreview = dynamic(() => import("@/components/IDCardPreview"), { ssr: false })
const JpgTemplateMapper = dynamic(() => import("@/components/JpgTemplateMapper"), { ssr: false })
const JpgCardPreview = dynamic(() => import("@/components/JpgCardPreview"), { ssr: false })
const BatchGenerator = dynamic(() => import("@/components/BatchGenerator"), { ssr: false })
const ManufacturerPhotoBgEditor = dynamic(() => import("@/components/ManufacturerPhotoBgEditor"), { ssr: false })
const ManufacturerBgBatchProcessor = dynamic(() => import("@/components/ManufacturerBgBatchProcessor"), { ssr: false })
const PhotoCropper = dynamic(() => import("@/components/PhotoCropper"), { ssr: false })

type ClassData = {
  id: string
  name: string
  linkToken: string
  isActive: boolean
  expiresAt: string | null
  templateId: string | null
  sectionType: SectionType | null
  classOptions: string[]
  divisionOptions: string[]
  template: { id: string; name: string; templateImageUrl: string | null } | null
  _count: { students: number }
  studentBreakdown?: {
    byClass: Array<{ label: string; count: number }>
    byGrade: Array<{ grade: string; count: number }>
  }
  teachers: { id: string; name: string; email: string; isMainTeacher: boolean; isActive?: boolean; expiresAt?: string | null }[]
  createdAt: string
}

const SCHOOL_TAB_LABELS: Record<
  "overview" | "classes" | "students" | "template" | "generate" | "batches" | "export",
  string
> = {
  overview: "Overview",
  classes: "Section",
  students: "Students",
  template: "Template",
  generate: "Generate",
  batches: "Batches",
  export: "Export",
}

type SchoolTemplateSummary = {
  id: string
  name: string
  templateImageUrl: string | null
  hasBackSide: boolean
  _count?: { classes: number }
  frontLayout?: any
  backLayout?: any
  fieldMappings?: any
  fieldConfig?: any
  photoBgColor?: string
  cardWidthMm?: number
  cardHeightMm?: number
  printDpi?: number
  orientation?: "PORTRAIT" | "LANDSCAPE"
  backTemplateImageUrl?: string | null
  backFieldMappings?: any
  cardSizeLocked?: boolean
  printConfig?: any
}

type StudentData = {
  id: string
  serialNumber: string
  photoUrl: string
  photoPath?: string
  originalPhotoUrl?: string
  originalPhotoPath?: string
  photoUpdatedAt?: number
  updatedAt?: string
  photoBgStatus?: string
  photoAiRunCount?: number
  formData: any
  status: string
  flagNote: string | null
  teacherComment: string | null
  submittedAt: string
  classId: string
  class: { id: string; name: string }
}

function getStudentPhotoUrl(s: Pick<StudentData, "id" | "photoUrl" | "photoPath" | "formData" | "updatedAt" | "photoUpdatedAt">): string {
  const fromMedia = buildStudentPhotoUrl(s)
  if (fromMedia) return fromMedia
  const fd = s.formData as Record<string, string> | undefined
  const fromForm = fd?.photoUrl || fd?.["Photo URL"] || fd?.["photo url"]
  return typeof fromForm === "string" ? fromForm : ""
}

function studentPhotoCacheKey(s: Pick<StudentData, "id" | "updatedAt" | "photoUpdatedAt">): string {
  const version = photoCacheVersion(s)
  return version ? `${s.id}-${version}` : s.id
}

function studentHasPhoto(s: Pick<StudentData, "id" | "photoUrl" | "photoPath" | "formData">): boolean {
  return getStudentPhotoUrl(s).length > 0
}

type SchoolDetail = {
  id: string
  name: string
  workspaceKind: string
  contactEmail: string
  address: string | null
  logoUrl: string | null
  // School-wide registration link — single URL parents use, with a class
  // dropdown on the form. Replaces per-class link sharing.
  linkToken: string
  linkActive: boolean
  linkExpiresAt: string | null
  _count: { classes: number; students: number; batches: number }
  template: { id: string; fieldConfig: any } | null
  teachers?: any[]
}

type BatchData = {
  id: string
  studentCount: number
  status: string
  manifestPath: string | null
  frontPdfPath: string | null
  backPdfPath: string | null
  createdAt: string
}

export default function SchoolDetailPage() {
  const params = useParams()
  const router = useRouter()
  const pathname = usePathname()
  const schoolId = params.id as string
  const isCompanyRoute = pathname.startsWith("/companies/")

  const [tab, setTab] = useState<"overview"|"classes"|"students"|"template"|"generate"|"batches"|"export">("overview")
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [school, setSchool] = useState<SchoolDetail | null>(null)
  const [classes, setClasses] = useState<ClassData[]>([])
  const [classesLoadError, setClassesLoadError] = useState(false)
  const [students, setStudents] = useState<StudentData[]>([])
  const [batches, setBatches] = useState<BatchData[]>([])
  const [loading, setLoading] = useState(true)
  const [studentPage, setStudentPage] = useState(1)
  const [studentTotal, setStudentTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState("")
  const [bulkUpdatingStatus, setBulkUpdatingStatus] = useState<string | null>(null)
  const [classFilter, setClassFilter] = useState("")
  const [gradeClassFilter, setGradeClassFilter] = useState("")
  const [showStudentAddSection, setShowStudentAddSection] = useState(false)
  const [studentTabNewSectionName, setStudentTabNewSectionName] = useState("")
  const [exportingFormat, setExportingFormat] = useState<"csv" | "excel" | "status-excel" | "archive" | null>(null)
  const [downloadExportStatus, setDownloadExportStatus] = useState<DownloadExportStatus>("APPROVED")
  const [statusExportJob, setStatusExportJob] = useState<{
    jobId: string
    status: "running" | "ready" | "failed"
    exportStatus: DownloadExportStatus
    totalStudents?: number
    error?: string
  } | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tabLoading, setTabLoading] = useState(false)
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(new Set())

  // Add section (stored as Class row — one link per section)
  const [newClassName, setNewClassName] = useState("")
  const [newSectionType, setNewSectionType] = useState<SectionType | "">("")
  const [newExpiry, setNewExpiry] = useState("")
  const [addingClass, setAddingClass] = useState(false)

  // Inline section-name editor
  const [editingSectionNameFor, setEditingSectionNameFor] = useState<string | null>(null)
  const [editingSectionNameDraft, setEditingSectionNameDraft] = useState("")
  const [savingSectionName, setSavingSectionName] = useState(false)

  // Inline class-options editor (Roman numerals per section)
  const [editingClassOptionsFor, setEditingClassOptionsFor] = useState<string | null>(null)
  const [editingClassOptionsDraft, setEditingClassOptionsDraft] = useState("")
  const [editingSectionTypeDraft, setEditingSectionTypeDraft] = useState<SectionType | "">("")
  const [savingClassOptions, setSavingClassOptions] = useState(false)

  // Inline division-options editor (A, B, C… per section)
  const [editingDivisionOptionsFor, setEditingDivisionOptionsFor] = useState<string | null>(null)
  const [editingDivisionOptionsDraft, setEditingDivisionOptionsDraft] = useState("")
  const [savingDivisionOptions, setSavingDivisionOptions] = useState(false)

  // Inline expiry editor (per-row): which class is being edited + its draft value
  const [editingExpiryFor, setEditingExpiryFor] = useState<string | null>(null)
  const [editingExpiryValue, setEditingExpiryValue] = useState<string>("")
  const [editingTeacherExpiryFor, setEditingTeacherExpiryFor] = useState<string | null>(null)
  const [editingTeacherExpiryValue, setEditingTeacherExpiryValue] = useState<string>("")

  // Per-class template management
  const [schoolTemplates, setSchoolTemplates] = useState<SchoolTemplateSummary[]>([])
  const [classTemplateEditor, setClassTemplateEditor] = useState<{
    classId: string
    className: string
    templateId: string
    templateData: any
  } | null>(null)
  const [classTemplateEditorLoading, setClassTemplateEditorLoading] = useState(false)
  const [assigningTemplateFor, setAssigningTemplateFor] = useState<string | null>(null)
  const [creatingTemplate, setCreatingTemplate] = useState(false)

  // Batch generation
  const [generatingBatch, setGeneratingBatch] = useState(false)
  const batchPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const batchPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearBatchPolling = useCallback(() => {
    if (batchPollIntervalRef.current) {
      clearInterval(batchPollIntervalRef.current)
      batchPollIntervalRef.current = null
    }
    if (batchPollTimeoutRef.current) {
      clearTimeout(batchPollTimeoutRef.current)
      batchPollTimeoutRef.current = null
    }
  }, [])

  useEffect(() => clearBatchPolling, [clearBatchPolling])

  // Student detail modal
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null)
  const [templateData, setTemplateData] = useState<any>(null)

  // Logo upload
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoDragOver, setLogoDragOver] = useState(false)

  // Bulk import
  const [importOpen, setImportOpen] = useState(false)
  const [importStep, setImportStep] = useState<"upload" | "preview" | "result">("upload")
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importClassId, setImportClassId] = useState("")
  const [importUploading, setImportUploading] = useState(false)
  const [importPreview, setImportPreview] = useState<any>(null)
  const [importResult, setImportResult] = useState<any>(null)
  const [dragOver, setDragOver] = useState(false)

  // Information-only Excel update
  const [infoUpdateOpen, setInfoUpdateOpen] = useState(false)
  const [infoUpdateFile, setInfoUpdateFile] = useState<File | null>(null)
  const [infoUpdateUploading, setInfoUpdateUploading] = useState(false)
  const [infoUpdateResult, setInfoUpdateResult] = useState<any>(null)
  const [infoUpdateDragOver, setInfoUpdateDragOver] = useState(false)

  // Bulk photo upload
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false)
  const [photoUploadMode, setPhotoUploadMode] = useState<"bulk" | "replace">("bulk")
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoResult, setPhotoResult] = useState<any>(null)
  const [photoDragOver, setPhotoDragOver] = useState(false)
  const [photoUploadProgress, setPhotoUploadProgress] = useState(0)
  const [photoUploadStatus, setPhotoUploadStatus] = useState('')
  // Manual matching for unmatched photos
  const [unmatchedFileMap, setUnmatchedFileMap] = useState<Record<string, File>>({})
  const [manualAssigning, setManualAssigning] = useState<string>('')
  const [manualSearchQuery, setManualSearchQuery] = useState('')
  const [allStudentsList, setAllStudentsList] = useState<any[]>([])

  // Batch AI background (local, runs in browser on manufacturer PC)
  const [reprocessOpen, setReprocessOpen] = useState(false)
  const [reprocessBgColor, setReprocessBgColor] = useState("#FFFFFF")
  const [reprocessLoading, setReprocessLoading] = useState(false)
  const [reprocessInfo, setReprocessInfo] = useState<{
    skippedCount: number
    bgColor?: string
    clientAiAvailable: boolean
    students: Array<{ id: string; serialNumber: string; photoUrl: string; name?: string }>
  } | null>(null)
  const [bgEditorStudent, setBgEditorStudent] = useState<{
    id: string
    name: string
    photoUrl: string
    defaultBgColor: string
  } | null>(null)
  const [photoCrop, setPhotoCrop] = useState<{
    url: string
    target: "edit" | "detail"
    studentId?: string
  } | null>(null)

  // Memoized blob-URL map for unmatched photo thumbnails. Previously, the
  // render path called `URL.createObjectURL(file)` inline on every render
  // and never revoked it — a small bulk upload with 50 unmatched photos
  // and a few search keystrokes leaked hundreds of blob URLs and pinned
  // tens of MB of decoded image data per leak. We create each URL once
  // per (filename, file) and revoke them all when the map changes or the
  // component unmounts.
  const unmatchedThumbUrls = useMemo(() => {
    const urls: Record<string, string> = {}
    for (const [fn, f] of Object.entries(unmatchedFileMap)) {
      urls[fn] = URL.createObjectURL(f)
    }
    return urls
  }, [unmatchedFileMap])

  useEffect(() => {
    return () => {
      for (const url of Object.values(unmatchedThumbUrls)) {
        URL.revokeObjectURL(url)
      }
    }
  }, [unmatchedThumbUrls])

  // Flag management
  const [flagUploadOpen, setFlagUploadOpen] = useState(false)
  const [flagColors, setFlagColors] = useState<string[]>([])
  const [flagImages, setFlagImages] = useState<Record<string, string>>({})
  const [flagUploading, setFlagUploading] = useState<string>('')
  const [newHouseName, setNewHouseName] = useState('')
  const [newHouseFile, setNewHouseFile] = useState<File | null>(null)
  const [addingHouse, setAddingHouse] = useState(false)
  const schoolTemplatesLoadedRef = useRef(false)
  const templateLoadedRef = useRef(false)
  const flagsLoadedRef = useRef(false)

  const fetchSchool = async () => {
    try {
      const res = await fetch(`/api/schools/${schoolId}`)
      const data = await res.json()
      if (data.success) setSchool(data.data)
    } catch (err) { console.error(err) }
  }

  const fetchSchoolTemplates = async () => {
    try {
      const res = await fetch(`/api/schools/${schoolId}/templates`, { cache: 'no-store' })
      const data = await res.json()
      if (data.success) {
        setSchoolTemplates(data.data || [])
        schoolTemplatesLoadedRef.current = true
      }
    } catch (err) { console.error(err) }
  }

  const handleCreateTemplate = async (name: string) => {
    setCreatingTemplate(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`"${name}" template created!`)
        fetchSchoolTemplates()
      } else {
        toast.error(data.error || 'Failed to create template')
      }
    } catch (err) {
      toast.error('Failed to create template')
    } finally {
      setCreatingTemplate(false)
    }
  }

  const fetchClasses = async (showToast = true) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(`/api/schools/${schoolId}/classes`, { cache: 'no-store' })
        const data = await res.json()
        if (data.success) {
          setClasses(data.data)
          setClassesLoadError(false)
          return
        }
        throw new Error(data.error || `HTTP ${res.status}`)
      } catch (err) {
        console.error(`Failed to load classes attempt ${attempt}`, err)
        if (attempt === 2) {
          setClassesLoadError(true)
          if (showToast) toast.error(`Failed to load ${companyMode ? "departments" : "classes"}. ${companyMode ? "Employee" : "Student"} data can still load.`)
        } else {
          await new Promise((resolve) => setTimeout(resolve, 600))
        }
      }
    }
  }

  const fetchStudents = async (
    page = 1,
    overrides?: { status?: string; classId?: string; classGrade?: string; division?: string; search?: string }
  ) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" })
      const status = overrides?.status ?? statusFilter
      const classId = overrides?.classId ?? classFilter
      const classGrade = overrides?.classGrade ?? (gradeClassFilter ? gradeClassFilter.split("|")[0] : "")
      const division = overrides?.division ?? (gradeClassFilter ? gradeClassFilter.split("|")[1] || "" : "")
      const search = overrides?.search ?? searchQuery
      if (status) params.set("status", status)
      if (classId) params.set("classId", classId)
      if (classGrade) params.set("classGrade", classGrade)
      if (division) params.set("division", division)
      if (search) params.set("search", search)
      const res = await fetch(`/api/schools/${schoolId}/students?${params}`, { cache: 'no-store' })
      const data = await res.json()
      if (data.success) {
        setStudents(data.data)
        setStudentTotal(data.pagination.total)
        setStudentPage(data.pagination.page)
        setSelectedStudent((prev) => {
          if (!prev) return prev
          const fresh = data.data.find((s: StudentData) => s.id === prev.id)
          return fresh || prev
        })
      } else {
        toast.error(data.error || "Failed to load students")
      }
    } catch (err) {
      console.error(err)
      toast.error("Failed to load students")
    }
  }

  const fetchBatches = async () => {
    try {
      const res = await fetch(`/api/schools/${schoolId}/batches`)
      const data = await res.json()
      if (data.success) setBatches(data.data)
    } catch (err) { console.error(err) }
  }

  const fetchTemplate = async () => {
    try {
      // cache: 'no-store' ensures the live JpgCardPreview reflects the latest
      // mappings/photo styling immediately after onSave, instead of a stale
      // cached template (e.g. previous photoBorderRadius value).
      const res = await fetch(`/api/schools/${schoolId}/template`, { cache: 'no-store' })
      const data = await res.json()
      if (data.success) {
        setTemplateData(data.data)
        templateLoadedRef.current = true
      }
    } catch (err) { console.error(err) }
  }

  useEffect(() => {
    setStatusFilter("")
    setClassFilter("")
    setGradeClassFilter("")
    setSearchQuery("")
    setSearchInput("")
    setStudentPage(1)
    setStudents([])
    setStudentTotal(0)
    filtersInitialized.current = false
    schoolTemplatesLoadedRef.current = false
    templateLoadedRef.current = false
    flagsLoadedRef.current = false
    // Keep the first paint light; tab-specific data loads when that workflow opens.
    Promise.all([fetchSchool(), fetchClasses(false)]).finally(() => setLoading(false))
  }, [schoolId])

  // Re-fetch students when filters/search change (but not on initial tab switch)
  const filtersInitialized = useRef(false)
  useEffect(() => {
    if (!filtersInitialized.current) {
      filtersInitialized.current = true
      return
    }
    if (tab === "students") {
      setTabLoading(true)
      fetchStudents().finally(() => setTabLoading(false))
    }
  }, [statusFilter, classFilter, gradeClassFilter, searchQuery])

  useEffect(() => {
    setGradeClassFilter("")
    setStudentPage(1)
  }, [classFilter])

  // Lazy-load tab data when switching tabs
  useEffect(() => {
    if (tab === "students" && students.length === 0 && !loading) {
      setTabLoading(true)
      Promise.all([
        fetchStudents(),
        fetchClasses(false),
        templateLoadedRef.current ? Promise.resolve() : fetchTemplate(),
        schoolTemplatesLoadedRef.current ? Promise.resolve() : fetchSchoolTemplates(),
        flagsLoadedRef.current ? Promise.resolve() : fetchFlags(),
      ]).finally(() => setTabLoading(false))
    }
    if (tab === "students" && students.length > 0 && !loading) {
      fetchClasses(false)
    }
    if (tab === "classes" && !loading) {
      fetchClasses(false)
      if (!schoolTemplatesLoadedRef.current) {
        fetchSchoolTemplates()
      }
    }
    if (tab === "template" && !loading) {
      if (!templateLoadedRef.current) fetchTemplate()
      if (!schoolTemplatesLoadedRef.current) fetchSchoolTemplates()
      if (!flagsLoadedRef.current) fetchFlags()
    }
    if (tab === "batches" && batches.length === 0 && !loading) {
      setTabLoading(true)
      fetchBatches().finally(() => setTabLoading(false))
    }
  }, [tab])

  // Cleanup debounce timer
  useEffect(() => {
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [])

  const getExpiryBadge = (expiresAt: string | null) => {
    if (!expiresAt || !mounted) return null
    const exp = new Date(expiresAt)
    const now = new Date()
    const diffMs = exp.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    if (diffMs < 0) {
      return <span className="status-badge status-flagged" style={{ fontSize: 10 }} suppressHydrationWarning>Expired</span>
    } else if (diffDays <= 3) {
      return <span className="status-badge status-review" style={{ fontSize: 10 }} suppressHydrationWarning>Expires in {diffDays}d</span>
    } else {
      return <span style={{ fontSize: 11, color: '#94a3b8' }} suppressHydrationWarning>Expires in {diffDays}d</span>
    }
  }

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClassName.trim()) return
    setAddingClass(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClassName,
          expiresAt: newExpiry || null,
          sectionType: newSectionType || null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`${companyMode ? "Department" : "Section"} created!`)
        setNewClassName("")
        setNewSectionType("")
        setNewExpiry("")
        fetchClasses()
        fetchSchool()
      } else {
        toast.error(data.error || `Failed to create ${companyMode ? "department" : "section"}`)
      }
    } catch (err) {
      toast.error(`Failed to create ${companyMode ? "department" : "section"}`)
    } finally {
      setAddingClass(false)
    }
  }

  const handleAddSectionFromStudentsTab = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentTabNewSectionName.trim()) return
    setAddingClass(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: studentTabNewSectionName.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`${companyMode ? "Department" : "Section"} created!`)
        setStudentTabNewSectionName("")
        setShowStudentAddSection(false)
        await fetchClasses(false)
        if (data.data?.id) setClassFilter(data.data.id)
      } else {
        toast.error(data.error || `Failed to create ${companyMode ? "department" : "section"}`)
      }
    } catch {
      toast.error(`Failed to create ${companyMode ? "department" : "section"}`)
    } finally {
      setAddingClass(false)
    }
  }

  const selectedStudentSection = useMemo(
    () => classes.find((c) => c.id === classFilter) || null,
    [classes, classFilter]
  )

  const sectionClassPickerOptions = useMemo(() => {
    if (!selectedStudentSection) return []
    const grades = resolveEffectiveClassOptions(
      selectedStudentSection.classOptions,
      selectedStudentSection.sectionType,
      selectedStudentSection.name
    )
    const divisions = resolveEffectiveDivisionOptions(selectedStudentSection.divisionOptions)
    const seen = new Set<string>()
    const options: Array<{ value: string; label: string }> = []

    const addOption = (grade: string, division: string, label?: string) => {
      const value = `${grade}|${division}`
      if (seen.has(value)) return
      seen.add(value)
      options.push({
        value,
        label: label || formatClassSection(grade, division),
      })
    }

    for (const grade of grades) {
      for (const div of divisions) addOption(grade, div)
    }

    for (const { label } of selectedStudentSection.studentBreakdown?.byClass || []) {
      const parsed = label.match(/^(.+?)\s*-+\s*([a-zA-Z0-9]+)$/i)
      if (parsed) addOption(parsed[1].trim(), parsed[2].toUpperCase(), label)
      else if (label && label !== "Unassigned") addOption(label, "", label)
    }

    return options.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true })
    )
  }, [selectedStudentSection])

  const startEditClassOptions = (cls: ClassData) => {
    setEditingClassOptionsFor(cls.id)
    setEditingClassOptionsDraft((cls.classOptions || []).join(", "))
    setEditingSectionTypeDraft(cls.sectionType || "")
  }

  const cancelEditClassOptions = () => {
    setEditingClassOptionsFor(null)
    setEditingClassOptionsDraft("")
    setEditingSectionTypeDraft("")
  }

  const saveEditClassOptions = async (cid: string) => {
    const classOptions = editingClassOptionsDraft
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (classOptions.length === 0) {
      toast.error("Add at least one class (Roman numerals, comma-separated).")
      return
    }
    setSavingClassOptions(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/classes/${cid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classOptions,
          sectionType: editingSectionTypeDraft || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed")
      toast.success("Section classes updated.")
      cancelEditClassOptions()
      fetchClasses()
    } catch (e: any) {
      toast.error(e?.message || "Could not save class options.")
    } finally {
      setSavingClassOptions(false)
    }
  }

  const startEditDivisionOptions = (cls: ClassData) => {
    setEditingDivisionOptionsFor(cls.id)
    setEditingDivisionOptionsDraft((cls.divisionOptions || []).join(", "))
  }

  const cancelEditDivisionOptions = () => {
    setEditingDivisionOptionsFor(null)
    setEditingDivisionOptionsDraft("")
  }

  const saveEditDivisionOptions = async (cid: string) => {
    const divisionOptions = editingDivisionOptionsDraft
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    setSavingDivisionOptions(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/classes/${cid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionOptions }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed")
      toast.success(divisionOptions.length === 0 ? "Divisions reset to default (A–M)." : "Custom divisions saved.")
      cancelEditDivisionOptions()
      fetchClasses()
    } catch (e: any) {
      toast.error(e?.message || "Could not save division options.")
    } finally {
      setSavingDivisionOptions(false)
    }
  }

  const handleToggleClass = async (cid: string, isActive: boolean) => {
    await fetch(`/api/schools/${schoolId}/classes/${cid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    })
    toast.success(isActive ? "Class deactivated" : "Class activated")
    fetchClasses()
  }

  const startEditSectionName = (cls: ClassData) => {
    setEditingSectionNameFor(cls.id)
    setEditingSectionNameDraft(cls.name)
  }

  const cancelEditSectionName = () => {
    setEditingSectionNameFor(null)
    setEditingSectionNameDraft("")
  }

  const saveEditSectionName = async (cls: ClassData) => {
    const rename = prepareSectionRename(cls.name, editingSectionNameDraft)
    if (rename.error) {
      toast.error(rename.error)
      return
    }

    setSavingSectionName(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/classes/${cls.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: rename.name }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(typeof json.error === "string" ? json.error : "Could not rename section")
      }

      const savedName = typeof json.data?.name === "string" ? json.data.name : rename.name
      setClasses((current) => current.map((item) => (
        item.id === cls.id ? { ...item, name: savedName } : item
      )))
      cancelEditSectionName()
      toast.success(`${companyMode ? "Department" : "Section"} name updated`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename section")
    } finally {
      setSavingSectionName(false)
    }
  }

  // Open the inline expiry editor for a row, prefilled with the current value
  // (converted from ISO → "YYYY-MM-DDTHH:mm" for <input type="datetime-local">).
  const startEditExpiry = (cid: string, currentIso: string | null) => {
    let initial = ""
    if (currentIso) {
      const d = new Date(currentIso)
      if (!isNaN(d.getTime())) {
        // Build local datetime-local value (avoid UTC shift)
        const pad = (n: number) => String(n).padStart(2, "0")
        initial = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      }
    }
    setEditingExpiryFor(cid)
    setEditingExpiryValue(initial)
  }

  const toDateTimeLocalValue = (currentIso?: string | null) => {
    if (!currentIso) return ""
    const d = new Date(currentIso)
    if (Number.isNaN(d.getTime())) return ""
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const cancelEditExpiry = () => {
    setEditingExpiryFor(null)
    setEditingExpiryValue("")
  }

  // Save new expiry. If the class was expired/inactive and the new expiry is
  // in the future (or cleared), automatically reactivate it so the link works
  // again without a separate click.
  const saveEditExpiry = async (cid: string) => {
    const raw = editingExpiryValue.trim()
    const expiresAt = raw ? new Date(raw).toISOString() : null
    const willBeActive = !expiresAt || new Date(expiresAt).getTime() > Date.now()
    try {
      const res = await fetch(`/api/schools/${schoolId}/classes/${cid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expiresAt,
          // Reactivate when the new expiry is in the future (or removed entirely)
          ...(willBeActive ? { isActive: true } : {}),
        }),
      })
      if (!res.ok) throw new Error("Failed")
      toast.success(
        expiresAt
          ? willBeActive ? "Expiry updated — link reactivated" : "Expiry updated"
          : "Expiry removed — link reactivated"
      )
      cancelEditExpiry()
      fetchClasses()
    } catch {
      toast.error("Could not update expiry")
    }
  }

  const handleDeleteClass = async (cid: string, name: string) => {
    const confirmed = prompt(`Type "DELETE" to confirm removing ${companyMode ? "department" : "class"} "${name}" and all its ${companyMode ? "employees" : "students"}:`)
    if (confirmed !== "DELETE") return
    await fetch(`/api/schools/${schoolId}/classes/${cid}`, { method: "DELETE" })
    toast.success("Class deleted")
    fetchClasses()
    fetchSchool()
  }

  const getEffectiveTemplateId = (cls: ClassData) => {
    if (cls.templateId) return cls.templateId
    return schoolTemplates[0]?.id || null
  }

  const getEffectiveTemplateLabel = (cls: ClassData) => {
    const tid = getEffectiveTemplateId(cls)
    const tpl = schoolTemplates.find(t => t.id === tid) || cls.template
    if (!tpl) return "No template"
    return cls.templateId ? tpl.name : `${tpl.name} (default)`
  }

  const normalizeTemplateLookupName = (value: string) =>
    value
      .toLowerCase()
      .replace(/\b(template|school|id|card|class|standard|std)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()

  const hasTemplateContent = (template: any) => {
    if (!template) return false
    const frontMappings = Array.isArray(template.fieldMappings) ? template.fieldMappings : []
    const frontLayout = Array.isArray(template.frontLayout) ? template.frontLayout : []
    return Boolean(template.templateImageUrl || frontMappings.length > 0 || frontLayout.length > 0)
  }

  const resolveStudentTemplate = (
    studentClass: ClassData | undefined,
    student: StudentData,
    fallbackTemplate: any,
  ) => {
    const explicitTemplate = studentClass?.templateId
      ? schoolTemplates.find(t => t.id === studentClass.templateId) || studentClass.template
      : null

    if (hasTemplateContent(explicitTemplate)) return explicitTemplate

    const className =
      studentClass?.name ||
      student.class?.name ||
      student.formData?.class ||
      student.formData?.Class ||
      student.formData?.className ||
      student.formData?.["Class Name"] ||
      ""
    const normalizedClassName = normalizeTemplateLookupName(String(className))

    if (normalizedClassName) {
      const classMatchedTemplate = schoolTemplates
        .map((template) => {
          const normalizedTemplateName = normalizeTemplateLookupName(template.name || "")
          if (!normalizedTemplateName || !hasTemplateContent(template)) return { template, score: 0 }
          if (normalizedTemplateName === normalizedClassName) return { template, score: 100 }
          if (normalizedTemplateName.startsWith(`${normalizedClassName} `)) return { template, score: 80 }
          if (normalizedTemplateName.endsWith(` ${normalizedClassName}`)) return { template, score: 70 }
          if (normalizedTemplateName.includes(normalizedClassName)) return { template, score: 50 }
          return { template, score: 0 }
        })
        .sort((a, b) => b.score - a.score)[0]

      if (classMatchedTemplate?.score > 0) return classMatchedTemplate.template
    }

    const defaultTemplate = schoolTemplates.find(hasTemplateContent)
    return defaultTemplate || explicitTemplate || fallbackTemplate
  }

  const handleAssignClassTemplate = async (classId: string, templateId: string) => {
    setAssigningTemplateFor(classId)
    try {
      const res = await fetch(`/api/schools/${schoolId}/classes/${classId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: templateId || null }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Template assigned to ${companyMode ? "department" : "class"}`)
        fetchClasses()
      } else {
        toast.error(data.error || "Failed to assign template")
      }
    } catch {
      toast.error("Failed to assign template")
    } finally {
      setAssigningTemplateFor(null)
    }
  }

  const openClassTemplateEditor = async (cls: ClassData, createNew = false) => {
    setClassTemplateEditorLoading(true)
    try {
      let templateId = cls.templateId || schoolTemplates[0]?.id || null

      if (createNew) {
        const createRes = await fetch(`/api/schools/${schoolId}/templates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${cls.name} Template`, classId: cls.id }),
        })
        const createData = await createRes.json()
        if (!createRes.ok || !createData.success) {
          toast.error(createData.error || "Failed to create template")
          return
        }
        templateId = createData.data.id
        await fetchSchoolTemplates()
        await fetchClasses()
      }

      if (!templateId) {
        toast.error("No template available. Create one first.")
        return
      }

      const tplRes = await fetch(`/api/schools/${schoolId}/templates/${templateId}`, { cache: 'no-store' })
      const tplData = await tplRes.json()
      if (!tplRes.ok || !tplData.success) {
        toast.error("Failed to load template")
        return
      }

      setClassTemplateEditor({
        classId: cls.id,
        className: cls.name,
        templateId,
        templateData: tplData.data,
      })
    } catch {
      toast.error("Failed to open template editor")
    } finally {
      setClassTemplateEditorLoading(false)
    }
  }

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/submit/${token}`
    navigator.clipboard.writeText(url)
    toast.success("Link copied to clipboard!")
  }

  // ── School-wide link helpers ──
  // The school-level URL is the single link admins distribute. Parents
  // open it, pick their class from a dropdown, then fill the same form
  // they would have via a per-class link.
  const schoolFormUrl = school?.linkToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/submit/school/${school.linkToken}`
    : ""

  const copySchoolLink = () => {
    if (!schoolFormUrl) return
    navigator.clipboard.writeText(schoolFormUrl)
    toast.success(companyMode ? "Company link copied to clipboard!" : "School link copied to clipboard!")
  }

  const shareSchoolWhatsApp = () => {
    if (!schoolFormUrl || !school) return
    const msg = encodeURIComponent(
      companyMode
        ? `Employee ID Card Registration\n\nCompany: ${school.name}\n\nPlease open the link below, select your department, and fill the employee registration form:\n${schoolFormUrl}`
        : `📋 ID Card Registration\n\nSchool: ${school.name}\n\nPlease open the link below, select your child's class, and fill the registration form:\n${schoolFormUrl}`
    )
    window.open(`https://wa.me/?text=${msg}`, "_blank")
  }

  const shareSchoolEmail = () => {
    if (!schoolFormUrl || !school) return
    const subject = encodeURIComponent(`${companyMode ? "Employee " : ""}ID Card Registration - ${school.name}`)
    const body = encodeURIComponent(
      companyMode
        ? `Dear Employee,\n\nPlease open the link below, select your department, and fill the employee ID card registration form:\n\n${schoolFormUrl}\n\nRegards,\n${school.name}`
        : `Dear Parent/Student,\n\nPlease open the link below, select your child's class, and fill the ID card registration form:\n\n${schoolFormUrl}\n\nRegards,\n${school.name}`
    )
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

  const toggleSchoolLink = async () => {
    if (!school) return
    try {
      const res = await fetch(`/api/schools/${school.id}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkActive: !school.linkActive }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || "Failed")
      setSchool({ ...school, linkActive: json.data.linkActive })
      toast.success(json.data.linkActive
        ? `${companyMode ? "Company" : "School"} link is now active.`
        : `${companyMode ? "Company" : "School"} link closed.`)
    } catch (e: any) {
      toast.error(e?.message || "Could not update link.")
    }
  }

  const regenerateSchoolLink = async () => {
    if (!school) return
    if (!confirm("Generate a new link? The current URL will stop working immediately.")) return
    try {
      const res = await fetch(`/api/schools/${school.id}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || "Failed")
      setSchool({
        ...school,
        linkToken: json.data.linkToken,
        linkActive: json.data.linkActive,
        linkExpiresAt: json.data.linkExpiresAt,
      })
      toast.success("New link generated.")
    } catch (e: any) {
      toast.error(e?.message || "Could not regenerate link.")
    }
  }

  const shareWhatsApp = (token: string, className: string) => {
    const url = `${window.location.origin}/submit/${token}`
    const msg = encodeURIComponent(companyMode
      ? `Employee ID Card Registration Form\n\nCompany: ${school?.name}\nDepartment: ${className}\n\nOpen the link and fill the employee registration form:\n${url}`
      : `📋 ID Card Registration Form\n\nSchool: ${school?.name}\nSection: ${className}\n\nOpen the link, select your child's class and division, then fill the form:\n${url}`)
    window.open(`https://wa.me/?text=${msg}`, "_blank")
  }

  const shareEmail = (token: string, className: string) => {
    const url = `${window.location.origin}/submit/${token}`
    const subject = encodeURIComponent(`ID Card Registration - ${school?.name} - ${className}`)
    const body = encodeURIComponent(companyMode
      ? `Dear Employee,\n\nPlease open the link below and fill the employee ID card registration form for ${className}:\n\n${url}\n\nRegards,\n${school?.name}`
      : `Dear Parent/Student,\n\nPlease open the link below, select your child's class and division, and fill the ID card registration form for ${className}:\n\n${url}\n\nRegards,\n${school?.name}`)
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

  const handleStatusUpdate = async (sid: string, status: string) => {
    // Optimistic: update local state immediately for instant UI
    setStudents(prev => prev.map(s => s.id === sid ? { ...s, status } : s))
    toast.success(`Student status updated to ${status}`)

    // Fire API in background — revert on failure
    try {
      const res = await fetch(`/api/schools/${schoolId}/students/${sid}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error("API failed")
    } catch {
      toast.error("Failed to update status — reverting")
      fetchStudents(studentPage)
    }
  }

  const confirmBulkStatusWord = (status: "SUBMITTED" | "APPROVED" | "PRINTED", targetLabel: string) => {
    const typed = window.prompt(
      `This will change ${targetLabel} matching the current filters to ${status}.\n\nType ${status} to confirm.`
    )
    if (typed === null) return false
    if (typed.trim().toUpperCase() === status) return true
    toast.error(`Status change cancelled. Please type ${status} exactly to confirm.`)
    return false
  }

  const handleBulkStatusUpdate = async (status: "SUBMITTED" | "APPROVED" | "PRINTED") => {
    if (bulkUpdatingStatus || studentTotal === 0) return

    const [classGrade = "", division = ""] = gradeClassFilter ? gradeClassFilter.split("|") : ["", ""]
    const targetLabel = studentTotal === 1
      ? `1 ${companyMode ? "employee" : "student"}`
      : `${studentTotal} ${companyMode ? "employees" : "students"}`
    if (!confirmBulkStatusWord(status, targetLabel)) return

    setBulkUpdatingStatus(status)
    try {
      const res = await fetch(`/api/schools/${schoolId}/students`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulkStatus",
          status,
          filters: {
            status: statusFilter || undefined,
            classId: classFilter || undefined,
            classGrade: classGrade || undefined,
            division: division || undefined,
            search: searchQuery || undefined,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Bulk status update failed")
      toast.success(`${data.updated ?? 0} ${companyMode ? "employee" : "student"} record(s) changed to ${status}.`)
      await fetchStudents(studentPage)
      fetchSchool()
      fetchClasses(false)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || "Failed to update statuses")
    } finally {
      setBulkUpdatingStatus(null)
    }
  }

  const handleFlag = async (sid: string) => {
    const note = prompt("Enter flag reason:")
    if (!note) return

    // Optimistic: flag locally
    setStudents(prev => prev.map(s => s.id === sid ? { ...s, status: "FLAGGED", flagNote: note } : s))
    toast.success("Student flagged")

    try {
      const res = await fetch(`/api/schools/${schoolId}/students/${sid}/flag`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagNote: note }),
      })
      if (!res.ok) throw new Error("API failed")
    } catch {
      toast.error("Failed to flag — reverting")
      fetchStudents(studentPage)
    }
  }

  const handleUnflag = async (sid: string) => {
    // Optimistic: unflag locally, revert to SUBMITTED
    setStudents(prev => prev.map(s => s.id === sid ? { ...s, status: "SUBMITTED", flagNote: null } : s))
    toast.success("Student unflagged")

    try {
      const res = await fetch(`/api/schools/${schoolId}/students/${sid}/flag`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unflag: true }),
      })
      if (!res.ok) throw new Error("API failed")
    } catch {
      toast.error("Failed to unflag — reverting")
      fetchStudents(studentPage)
    }
  }

  const handleGenerateBatch = async () => {
    if (!confirm(`Generate print batch for all submitted/approved ${companyMode ? "employees" : "students"} in ${school?.name}?`)) return
    setGeneratingBatch(true)
    clearBatchPolling()
    try {
      const res = await fetch(`/api/schools/${schoolId}/batches`, { method: "POST" })
      const data = await res.json()
      if (data.success) {
        toast.success(`Batch generation started! ${data.data.studentCount} ${companyMode ? "employees" : "students"} included.`)
        // Poll for completion
        const batchId = data.data.batchId
        batchPollIntervalRef.current = setInterval(async () => {
          const r = await fetch(`/api/schools/${schoolId}/batches/${batchId}`)
          const d = await r.json()
          if (d.success && d.data.status === "READY") {
            clearBatchPolling()
            toast.success("Batch is ready for download!")
            fetchBatches()
            setGeneratingBatch(false)
          }
        }, 3000)
        // Safety timeout
        batchPollTimeoutRef.current = setTimeout(() => {
          clearBatchPolling()
          setGeneratingBatch(false)
          fetchBatches()
        }, 120000)
      } else {
        toast.error(data.error)
        setGeneratingBatch(false)
      }
    } catch (err) {
      toast.error("Failed to generate batch")
      setGeneratingBatch(false)
    }
  }

  // Bulk import handlers
  const handleImportValidate = async () => {
    if (!importFile) {
      toast.error("Please upload a file.")
      return
    }
    setImportUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", importFile)
      if (importClassId) fd.append("classId", importClassId)
      fd.append("mode", "validate")
      const res = await fetch(`/api/schools/${schoolId}/students/import`, { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) {
        setImportPreview(data.data)
        setImportStep("preview")
        // If flag colors were detected, update the flag state
        if (data.data.hasFlagColumn && data.data.uniqueFlagColors?.length > 0) {
          setFlagColors(prev => {
            const merged = new Set([...prev, ...data.data.uniqueFlagColors])
            return Array.from(merged)
          })
        }
      } else {
        toast.error(data.error || "Validation failed")
      }
    } catch (err) {
      toast.error("Failed to validate file")
    } finally {
      setImportUploading(false)
    }
  }

  const handleImportConfirm = async () => {
    if (!importFile) return
    setImportUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", importFile)
      if (importClassId) fd.append("classId", importClassId)
      fd.append("mode", "import")
      const res = await fetch(`/api/schools/${schoolId}/students/import`, { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) {
        setImportResult(data.data)
        setImportStep("result")
        toast.success(
          data.data.skippedDuplicates > 0
            ? `${data.data.imported} imported, ${data.data.skippedDuplicates} duplicates skipped`
            : `${data.data.imported} ${companyMode ? "employees" : "students"} imported!`
        )
        fetchStudents()
        fetchSchool() // Refreshes template.fieldConfig (auto-synced from Excel columns)
        fetchClasses()
        fetchTemplate() // Refresh template data for dynamic columns
      } else {
        toast.error(data.error || "Import failed")
      }
    } catch (err) {
      toast.error("Import failed")
    } finally {
      setImportUploading(false)
    }
  }

  // Delete-all-students workflow — lets admins wipe a school's roster so a
  // corrected Excel can be re-uploaded without serial-number collisions or
  // stale rows from a previous import.
  const [deletingAll, setDeletingAll] = useState(false)

  // Single-student edit / add modal
  const [editStudentOpen, setEditStudentOpen] = useState(false)
  const [editStudentTarget, setEditStudentTarget] = useState<StudentData | null>(null)
  const [editFormFields, setEditFormFields] = useState<Record<string, string>>({})
  const [editOriginalFormFields, setEditOriginalFormFields] = useState<Record<string, string>>({})
  const [editMobileLocals, setEditMobileLocals] = useState<Record<string, string>>({})
  const [editClassId, setEditClassId] = useState("")
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null)
  const [editPhotoPreview, setEditPhotoPreview] = useState("")
  const [editSaving, setEditSaving] = useState(false)

  const openAddStudent = () => {
    setEditStudentTarget(null)
    setEditFormFields({})
    setEditOriginalFormFields({})
    setEditMobileLocals({})
    setEditClassId(classes[0]?.id || "")
    setEditPhotoFile(null)
    setEditPhotoPreview("")
    setEditStudentOpen(true)
  }

  const openEditStudent = (s: StudentData) => {
    const fd = { ...(s.formData as Record<string, string>) }
    const hydrated = hydrateEditFormFromStudent(templateData, fd)
    setEditStudentTarget(s)
    setEditFormFields(hydrated.formFields)
    setEditOriginalFormFields(hydrated.formFields)
    setEditMobileLocals(hydrated.mobileLocals)
    setEditClassId(s.classId || s.class?.id || "")
    setEditPhotoFile(null)
    setEditPhotoPreview(getStudentPhotoUrl(s) || "")
    setEditStudentOpen(true)
  }

  const closePhotoCrop = () => {
    if (photoCrop?.url.startsWith("blob:")) URL.revokeObjectURL(photoCrop.url)
    setPhotoCrop(null)
  }

  const pickPhotoForCrop = (file: File, target: "edit" | "detail", studentId?: string) => {
    setPhotoCrop((prev) => {
      if (prev?.url.startsWith("blob:")) URL.revokeObjectURL(prev.url)
      return { url: URL.createObjectURL(file), target, studentId }
    })
  }

  const cropEditPhotoPreview = () => {
    if (!editPhotoPreview) {
      toast.error("No photo available to crop.")
      return
    }
    setPhotoCrop((prev) => {
      if (prev?.url.startsWith("blob:")) URL.revokeObjectURL(prev.url)
      return { url: editPhotoPreview, target: "edit" }
    })
  }

  const handlePhotoCropped = async (croppedDataUrl: string) => {
    if (!photoCrop) return
    const { target, studentId } = photoCrop
    try {
      if (target === "edit") {
        setEditPhotoPreview(croppedDataUrl)
        const file = await prepareStudentPhotoForUpload(croppedDataUrl, {
          fileName: `photo-${Date.now()}.jpg`,
        })
        setEditPhotoFile(file)
        closePhotoCrop()
        toast.success(`Photo cropped — save the ${companyMode ? "employee" : "student"} to upload.`)
        return
      }
      if (target === "detail" && studentId) {
        const file = await prepareStudentPhotoForUpload(croppedDataUrl, {
          fileName: `${studentId}.jpg`,
        })
        const fd = new FormData()
        fd.append("photo", file)
        fd.append("studentId", studentId)
        const res = await fetch(`/api/schools/${schoolId}/students/assign-photo`, { method: "POST", body: fd })
        const data = await res.json()
        closePhotoCrop()
        if (data.success) {
          toast.success("Photo updated!")
          if (selectedStudent?.id === studentId) {
            updateStudentPhotoInState(studentId, data.data.photoUrl, data.data.photoPath, data.data.updatedAt)
          }
          fetchStudents(studentPage)
        } else {
          toast.error(data.error || "Upload failed")
        }
      }
    } catch {
      toast.error("Could not save cropped photo")
    }
  }

  const handleSaveStudent = async () => {
    if (!editClassId) { toast.error(`Please select a ${companyMode ? "department" : "class"}`); return }

    const editFields = buildEditStudentFields(templateData)
    const formDataForSave = applyFixedTemplateValuesToFormData(
      editFormFields,
      getEditTemplateMappings(templateData),
    ) as Record<string, string>
    const shouldSendFormData = !editStudentTarget
      || JSON.stringify(editFormFields) !== JSON.stringify(editOriginalFormFields)
    if (shouldSendFormData) {
      const validation = validatePublicSubmissionDetails(formDataForSave, editFields)
      if (!validation.ok) {
        toast.error(validation.error)
        return
      }
    }

    setEditSaving(true)
    try {
      let photoUrl = editStudentTarget?.photoUrl || ""
      let photoPath = (editStudentTarget as any)?.photoPath || ""
      if (editPhotoFile) {
        const fd = new FormData()
        fd.append("file", editPhotoFile)
        fd.append("folder", `students/${schoolId}`)
        const res = await fetch("/api/upload", { method: "POST", body: fd })
        const data = await res.json()
        if (res.ok && data.success) {
          photoUrl = data.url
          photoPath = data.path || ""
        }
        else { toast.error(data.error || "Photo upload failed"); setEditSaving(false); return }
      }
      if (editStudentTarget) {
        const res = await fetch(`/api/schools/${schoolId}/students/${editStudentTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(shouldSendFormData ? { formData: formDataForSave } : {}),
            photoUrl,
            photoPath,
            classId: editClassId,
          }),
        })
        const data = await res.json()
        if (data.success) {
          toast.success(`${companyMode ? "Employee" : "Student"} updated!`)
          setStudents(prev => prev.map(s => s.id === editStudentTarget.id ? { ...s, ...data.data } : s))
          setEditStudentOpen(false)
        } else toast.error(data.error || "Update failed")
      } else {
        const res = await fetch(`/api/schools/${schoolId}/students`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formData: formDataForSave, classId: editClassId, photoUrl, photoPath }),
        })
        const data = await res.json()
        if (data.success) {
          toast.success(`${companyMode ? "Employee" : "Student"} added!`)
          fetchStudents(studentPage)
          fetchSchool()
          setEditStudentOpen(false)
        } else toast.error(data.error || "Create failed")
      }
    } catch { toast.error("Save failed") }
    finally { setEditSaving(false) }
  }

  const handleDeleteStudent = async (sid: string, name: string) => {
    if (!window.confirm(`Delete ${companyMode ? "employee" : "student"} "${name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/schools/${schoolId}/students/${sid}`, { method: "DELETE" })
      if (res.ok) {
        toast.success(`${companyMode ? "Employee" : "Student"} deleted`)
        setStudents(prev => prev.filter(s => s.id !== sid))
        setStudentTotal(prev => prev - 1)
      } else {
        const data = await res.json()
        toast.error(data.error || "Delete failed")
      }
    } catch { toast.error("Delete failed") }
  }

  const handleDeleteAllStudents = async () => {
    if (studentTotal === 0) {
      toast.info(`No ${companyMode ? "employees" : "students"} to delete.`)
      return
    }
    const confirm1 = window.prompt(
      `⚠️ This will PERMANENTLY delete ALL ${studentTotal} ${companyMode ? "employees" : "students"} for this ${companyMode ? "company" : "school"} ` +
      `(including their photos and QR codes from the database).\n\n` +
      `Type DELETE to confirm:`
    )
    if (confirm1 !== "DELETE") {
      if (confirm1 !== null) toast.info("Delete cancelled — confirmation text did not match.")
      return
    }
    setDeletingAll(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/students`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE_ALL" }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(`Deleted ${data.deleted} ${companyMode ? "employees" : "students"}. You can now re-upload your Excel.`)
        // Refresh local state
        setStudents([])
        setStudentTotal(0)
        setSelectedStudent(null)
        // Refetch in case anything else changed (e.g. classes from import-side-effects)
        fetchStudents()
      } else {
        toast.error(data.error || "Delete failed.")
      }
    } catch (err: any) {
      toast.error(err?.message || "Delete failed.")
    } finally {
      setDeletingAll(false)
    }
  }

  const resetImport = () => {
    setImportOpen(false)
    setImportStep("upload")
    setImportFile(null)
    setImportClassId("")
    setImportPreview(null)
    setImportResult(null)
  }

  const resetInfoUpdate = () => {
    setInfoUpdateOpen(false)
    setInfoUpdateFile(null)
    setInfoUpdateUploading(false)
    setInfoUpdateResult(null)
    setInfoUpdateDragOver(false)
  }

  const handleInfoUpdateExcel = async () => {
    if (!infoUpdateFile) {
      toast.error("Please select an Excel file.")
      return
    }

    setInfoUpdateUploading(true)
    setInfoUpdateResult(null)
    try {
      const fd = new FormData()
      fd.append("file", infoUpdateFile)
      const res = await fetch(`/api/schools/${schoolId}/students/update-info`, {
        method: "POST",
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Information update failed")
      }
      setInfoUpdateResult(data.data)
      toast.success(`Updated ${data.data.updated} ${companyMode ? "employee" : "student"} record(s). Photos preserved.`)
      fetchStudents(studentPage)
      fetchSchool()
    } catch (err: any) {
      toast.error(err?.message || "Information update failed")
    } finally {
      setInfoUpdateUploading(false)
    }
  }

  const updateMainTeacherLogin = async (
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    const res = await fetch(`/api/schools/${schoolId}/main-teacher`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || "Could not update coordinator login")
    toast.success(successMessage)
    fetchSchool()
  }

  const startEditTeacherExpiry = (teacherId: string, currentIso?: string | null) => {
    setEditingTeacherExpiryFor(teacherId)
    setEditingTeacherExpiryValue(toDateTimeLocalValue(currentIso))
  }

  const cancelEditTeacherExpiry = () => {
    setEditingTeacherExpiryFor(null)
    setEditingTeacherExpiryValue("")
  }

  const saveTeacherExpiry = async () => {
    const raw = editingTeacherExpiryValue.trim()
    const expiresAt = raw ? new Date(raw).toISOString() : null
    try {
      await updateMainTeacherLogin(
        { action: "expiry", expiresAt },
        expiresAt ? "Coordinator login expiry updated" : "Coordinator login expiry removed",
      )
      cancelEditTeacherExpiry()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update coordinator expiry")
    }
  }

  const openBulkPhotoUpload = (mode: "bulk" | "replace" = "bulk") => {
    setPhotoUploadMode(mode)
    setPhotoFiles([])
    setPhotoResult(null)
    setUnmatchedFileMap({})
    setPhotoUploadProgress(0)
    setPhotoUploadStatus("")
    setPhotoUploadOpen(true)
  }

  // Bulk photo upload handlers
  const handleBulkPhotoUpload = async () => {
    if (photoFiles.length === 0) {
      toast.error("Please select photos to upload.")
      return
    }
    setPhotoUploading(true)
    setPhotoUploadProgress(0)
    setPhotoUploadStatus('Preparing upload...')

    try {
      const totalFiles = photoFiles.length

      // -------------------------------------------------------------------
      // STEP 1 — Client-side compression
      // -------------------------------------------------------------------
      // ID cards render the photo at ~250×300 px. Uploading the camera-
      // original 3–5 MB JPEG is 20× wasted bandwidth and means each Vercel
      // request only fits 1–2 photos before hitting the 4.5 MB body limit.
      // We resize to a max 1024-px edge at quality 0.85 (~120–200 KB each)
      // which slashes total upload time roughly 15–20× for typical inputs.
      // Small files (<300 KB) are passed through unchanged.
      const compressPhoto = async (file: File): Promise<File> => {
        if (file.size < 300 * 1024) return file
        try {
          const bitmap = await createImageBitmap(file)
          const maxDim = 1024
          const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
          const w = Math.max(1, Math.round(bitmap.width * scale))
          const h = Math.max(1, Math.round(bitmap.height * scale))

          let blob: Blob | null = null
          if (typeof OffscreenCanvas !== 'undefined') {
            const oc = new OffscreenCanvas(w, h)
            const ctx = oc.getContext('2d')
            if (!ctx) throw new Error('no ctx')
            ctx.drawImage(bitmap, 0, 0, w, h)
            blob = await oc.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
          } else {
            const cv = document.createElement('canvas')
            cv.width = w; cv.height = h
            const ctx = cv.getContext('2d')
            if (!ctx) throw new Error('no ctx')
            ctx.drawImage(bitmap, 0, 0, w, h)
            blob = await new Promise<Blob>((res, rej) =>
              cv.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.85)
            )
          }
          // Always release the decoded bitmap immediately — it can hold 10s of MB.
          if (typeof (bitmap as any).close === 'function') (bitmap as any).close()

          if (!blob || blob.size >= file.size) return file
          // Preserve original basename (the server matches students by it),
          // but force a .jpg extension since we re-encoded as JPEG.
          const baseName = file.name.replace(/\.[^.]+$/, '')
          return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified })
        } catch {
          // Any decoding/encoding failure → fall back to the original file.
          return file
        }
      }

      // Compress in parallel with bounded concurrency. Too many in flight
      // exhausts main-thread memory on low-end devices; 4 keeps a steady
      // throughput while staying under typical mobile RAM limits.
      const compressed: File[] = new Array(totalFiles)
      {
        const COMPRESS_CONCURRENCY = 4
        let idx = 0
        let done = 0
        const worker = async () => {
          while (idx < totalFiles) {
            const my = idx++
            compressed[my] = await compressPhoto(photoFiles[my])
            done++
            if (done % 20 === 0 || done === totalFiles) {
              setPhotoUploadStatus(`Compressing ${done}/${totalFiles} photos...`)
              // 0–25% of the bar is the compression phase.
              setPhotoUploadProgress(Math.round((done / totalFiles) * 25))
            }
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(COMPRESS_CONCURRENCY, totalFiles) }, () => worker())
        )
      }

      // -------------------------------------------------------------------
      // STEP 2 — Size-aware batching
      // -------------------------------------------------------------------
      // Vercel's serverless body limit is ~4.5 MB per request. After
      // compression most batches hit BATCH_MAX_FILES first instead of bytes.
      const BATCH_MAX_BYTES = 3.5 * 1024 * 1024
      const BATCH_MAX_FILES = 25

      const batches: File[][] = []
      {
        let current: File[] = []
        let currentSize = 0
        for (const f of compressed) {
          const size = f.size
          if (current.length > 0 && (currentSize + size > BATCH_MAX_BYTES || current.length >= BATCH_MAX_FILES)) {
            batches.push(current)
            current = []
            currentSize = 0
          }
          current.push(f)
          currentSize += size
        }
        if (current.length > 0) batches.push(current)
      }

      let allMatched: any[] = []
      let allUnmatched: string[] = []
      let allErrors: any[] = []
      let completed = 0
      const totalBatches = batches.length

      // Track which compressed File belongs to which filename so we can
      // recover the bytes for any unmatched names afterwards without keeping
      // the entire `compressed` array alive.
      const filesByName = new Map<string, File>()
      for (const f of compressed) filesByName.set(f.name, f)

      // Upload one batch, with robust error handling against Vercel HTML pages.
      const uploadBatch = async (batch: File[]) => {
        const fd = new FormData()
        for (const file of batch) fd.append("photos", file)
        if (photoUploadMode === "replace") fd.append("mode", "replace-by-name")
        // One retry on transient network errors — bulk uploads frequently hit
        // a momentary network blip, and the server is idempotent (upsert).
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(`/api/schools/${schoolId}/students/bulk-photos`, { method: "POST", body: fd })
            const ct = res.headers.get("content-type") || ""
            if (ct.includes("application/json")) return await res.json()
            const text = await res.text().catch(() => "")
            return {
              success: false,
              error:
                res.status === 413
                  ? "Batch too large for server (try smaller photos)"
                  : `Server error ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`,
            }
          } catch (netErr: any) {
            if (attempt === 1) return { success: false, error: netErr?.message || "Network error" }
            // brief back-off before retry
            await new Promise(r => setTimeout(r, 500))
          }
        }
        return { success: false, error: "Upload failed" }
      }

      // Higher concurrency now that each request carries 25 compressed
      // photos instead of 1–2 originals — bandwidth, not CPU, is the limit.
      const CONCURRENCY = 8
      let cursor = 0
      const worker = async () => {
        while (cursor < batches.length) {
          const myIdx = cursor++
          const batch = batches[myIdx]
          const data = await uploadBatch(batch)
          if (data?.success) {
            if (data.data.matchedFiles) allMatched = allMatched.concat(data.data.matchedFiles)
            if (data.data.unmatchedFiles) allUnmatched = allUnmatched.concat(data.data.unmatchedFiles)
            if (data.data.errorFiles) allErrors = allErrors.concat(data.data.errorFiles)
          } else {
            for (const file of batch) {
              allErrors.push({ filename: file.name, error: data?.error || "Batch upload failed" })
            }
          }
          // Free the batch reference so V8 can release the underlying
          // Blob bytes as soon as the network layer is done with them.
          batches[myIdx] = null as any
          completed++
          setPhotoUploadStatus(`Uploading ${completed}/${totalBatches} batches (${Math.min(totalFiles, completed * BATCH_MAX_FILES)}/${totalFiles} photos)...`)
          // 25–100% of the bar is the upload phase.
          setPhotoUploadProgress(25 + Math.round((completed / totalBatches) * 75))
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, () => worker()))

      setPhotoUploadProgress(100)
      setPhotoUploadStatus('Complete!')

      // Build a map of unmatched filenames → File objects for manual assignment.
      // We use the lookup map (O(1)) instead of `find` on the original array,
      // which previously was O(N²) across the unmatched set.
      const fileMap: Record<string, File> = {}
      for (const filename of allUnmatched) {
        const file = filesByName.get(filename)
        if (file) fileMap[filename] = file
      }
      setUnmatchedFileMap(fileMap)
      // Release every other compressed File so the browser can reclaim memory.
      // Holding 1400 × 150 KB ≈ 200 MB of Blob bytes was a major contributor
      // to the "crash at 98 %" failure mode previously reported.
      filesByName.clear()

      // Fetch all students list for manual matching dropdown
      if (allUnmatched.length > 0) {
        try {
          const studRes = await fetch(`/api/schools/${schoolId}/students?limit=2000`)
          const studData = await studRes.json()
          if (studData.success) setAllStudentsList(studData.data)
        } catch {}
      }

      const result = {
        total: totalFiles,
        matched: allMatched.length,
        unmatched: allUnmatched.length,
        errors: allErrors.length,
        matchedFiles: allMatched.slice(0, 100),
        unmatchedFiles: allUnmatched.slice(0, 50),
        errorFiles: allErrors.slice(0, 20),
      }
      setPhotoResult(result)
      toast.success(
        photoUploadMode === "replace"
          ? `${result.matched} of ${totalFiles} photos replaced by ${companyMode ? "employee" : "student"} name!`
          : `${result.matched} of ${totalFiles} photos matched to ${companyMode ? "employees" : "students"}!`
      )
      fetchStudents(studentPage)
    } catch (err) {
      toast.error("Bulk photo upload failed")
    } finally {
      setPhotoUploading(false)
    }
  }

  // Handle folder selection via webkitdirectory
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => 
      f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(f.name)
    )
    if (files.length === 0) {
      toast.error('No image files found in the selected folder.')
      return
    }
    setPhotoFiles(files)
    toast.success(`${files.length} photos found in folder!`)
  }

  const resetPhotoUpload = () => {
    setPhotoUploadOpen(false)
    setPhotoUploadMode("bulk")
    setPhotoFiles([])
    setPhotoResult(null)
    setPhotoUploadProgress(0)
    setPhotoUploadStatus('')
    setUnmatchedFileMap({})
    setManualAssigning('')
    setManualSearchQuery('')
    setAllStudentsList([])
  }

  const fetchReprocessInfo = async () => {
    setReprocessLoading(true)
    try {
      const params = new URLSearchParams()
      if (classFilter) params.set("classId", classFilter)
      if (gradeClassFilter) {
        const [classGrade, division = ""] = gradeClassFilter.split("|")
        if (classGrade) params.set("classGrade", classGrade)
        if (division) params.set("division", division)
      }
      params.set("mode", "all")
      const res = await fetch(`/api/schools/${schoolId}/students/reprocess-photos?${params.toString()}`)
      const data = await res.json()
      if (data.success) {
        setReprocessInfo(data.data)
        if (data.data.bgColor) setReprocessBgColor(data.data.bgColor)
      } else {
        toast.error(data.error || "Failed to load reprocess info")
      }
    } catch {
      toast.error("Failed to load reprocess info")
    } finally {
      setReprocessLoading(false)
    }
  }

  const openBgEditorForStudent = (s: StudentData) => {
    const fd = s.formData as Record<string, string>
    const photoUrl = getStudentPhotoUrl(s)
    if (!photoUrl) {
      toast.error(`No photo on file for this ${companyMode ? "employee" : "student"}. Ask them to re-submit via the form link, or upload a photo manually.`)
      return
    }
    const studentClass = classes.find((c) => c.id === s.classId)
    const tpl = resolveStudentTemplate(studentClass, s, templateData)
    setBgEditorStudent({
      id: s.id,
      name: fd?.fullName || fd?.["Full Name"] || fd?.["Student Name"] || s.serialNumber,
      photoUrl,
      defaultBgColor: (tpl as { photoBgColor?: string })?.photoBgColor || reprocessBgColor || "#FFFFFF",
    })
  }

  const persistPhotoBgColor = useCallback(async (color: string) => {
    const normalized = color.toUpperCase()
    if (!/^#[0-9A-F]{6}$/.test(normalized)) {
      throw new Error("Enter a valid background colour like #FFFFFF")
    }

    const selectedClass = classFilter ? classes.find((c) => c.id === classFilter) : null
    const templateId = selectedClass?.templateId || schoolTemplates[0]?.id || templateData?.id
    const url = templateId
      ? `/api/schools/${schoolId}/templates/${templateId}`
      : `/api/schools/${schoolId}/template`
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoBgColor: normalized }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || "Failed to save background colour")
    }

    setReprocessBgColor(normalized)
    setTemplateData((prev: any) => prev ? { ...prev, photoBgColor: normalized } : prev)
    setSchoolTemplates((prev) => prev.map((tpl) => (
      tpl.id === data.data.id ? { ...tpl, photoBgColor: normalized } : tpl
    )))
    setClasses((prev) => prev.map((cls) => (
      cls.templateId === data.data.id && cls.template
        ? { ...cls, template: { ...cls.template, photoBgColor: normalized } as any }
        : cls
    )))
  }, [classFilter, classes, schoolId, schoolTemplates, templateData?.id])

  const updateStudentPhotoInState = useCallback((
    studentId: string,
    photoUrl: string,
    photoPath?: string,
    updatedAt?: string
  ) => {
    const photoUpdatedAt = updatedAt ? new Date(updatedAt).getTime() : Date.now()
    const update = (student: StudentData): StudentData =>
      student.id === studentId
        ? {
            ...student,
            photoUrl,
            photoPath: photoPath || student.photoPath,
            photoBgStatus: "REPROCESSED",
            photoUpdatedAt,
            updatedAt: updatedAt || new Date(photoUpdatedAt).toISOString(),
          }
        : student

    setStudents((prev) => prev.map(update))
    setSelectedStudent((prev) => prev ? update(prev) : prev)
    setReprocessInfo((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        students: prev.students.map((s) =>
          s.id === studentId
            ? { ...s, photoUrl: buildStudentPhotoUrl({ id: s.id, photoPath: photoPath || undefined, photoUrl, updatedAt, photoUpdatedAt }) }
            : s
        ),
      }
    })
  }, [])

  const applyUpdatedStudentInState = useCallback((updated: StudentData) => {
    const photoUpdatedAt = updated.updatedAt ? new Date(updated.updatedAt).getTime() : Date.now()
    const normalized = { ...updated, photoUpdatedAt }
    setStudents((prev) => prev.map((student) => student.id === normalized.id ? { ...student, ...normalized } : student))
    setSelectedStudent((prev) => prev?.id === normalized.id ? { ...prev, ...normalized } : prev)
    setReprocessInfo((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        students: prev.students.map((s) =>
          s.id === normalized.id
            ? { ...s, photoUrl: getStudentPhotoUrl(normalized), photoBgStatus: normalized.photoBgStatus }
            : s
        ),
      }
    })
  }, [])

  const openReprocessModal = async () => {
    if (!classFilter) {
      toast.error(`Select a ${companyMode ? "department" : "section/class"} first, then process photos for that ${companyMode ? "department" : "class"}.`)
      return
    }
    setReprocessOpen(true)
    await fetchReprocessInfo()
  }

  const handleBatchBgComplete = (stats: { processed: number; failed: number }) => {
    toast.success(`Background processing complete: ${stats.processed} saved, ${stats.failed} failed.`)
    fetchStudents(studentPage)
    fetchReprocessInfo()
  }

  const selectedBatchClassLabel = [
    selectedStudentSection?.name,
    gradeClassFilter && sectionClassPickerOptions.find((o) => o.value === gradeClassFilter)?.label,
  ].filter(Boolean).join(" / ") || `Selected ${isCompanyRoute ? "department" : "class"}`

  // Flag management handlers
  const fetchFlags = async () => {
    try {
      const res = await fetch(`/api/schools/${schoolId}/flags`)
      const data = await res.json()
      if (data.success) {
        setFlagColors(data.data.colors || [])
        const imgMap: Record<string, string> = {}
        for (const f of data.data.flags || []) {
          if (f.imageUrl) imgMap[f.color] = f.imageUrl
        }
        setFlagImages(imgMap)
        flagsLoadedRef.current = true
      }
    } catch (err) { console.error(err) }
  }

  const handleFlagUpload = async (color: string, file: File, opts: { silent?: boolean } = {}): Promise<{ ok: boolean; error?: string }> => {
    setFlagUploading(color)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("color", color)
      const res = await fetch(`/api/schools/${schoolId}/flags`, { method: "POST", body: fd })
      let data: any = null
      try { data = await res.json() } catch { /* non-JSON response */ }
      if (res.ok && data?.success) {
        if (!opts.silent) toast.success(`Flag image uploaded for "${color}"!`)
        setFlagImages(prev => ({ ...prev, [color]: data.data.imageUrl }))
        return { ok: true }
      }
      const errMsg = data?.error || `Flag upload failed (HTTP ${res.status})`
      if (!opts.silent) toast.error(errMsg)
      return { ok: false, error: errMsg }
    } catch (err: any) {
      const errMsg = err?.message || "Flag upload failed"
      if (!opts.silent) toast.error(errMsg)
      return { ok: false, error: errMsg }
    } finally {
      setFlagUploading('')
    }
  }

  const handleAddHouse = async () => {
    const name = newHouseName.trim()
    if (!name) {
      toast.error("Enter a house name")
      return
    }
    if (!newHouseFile) {
      toast.error("Select a house flag image")
      return
    }

    setAddingHouse(true)
    const result = await handleFlagUpload(name, newHouseFile, { silent: true })
    if (result.ok) {
      toast.success(`House "${name}" added`)
      setNewHouseName('')
      setNewHouseFile(null)
      await fetchFlags()
    } else {
      toast.error(result.error || "Could not add house")
    }
    setAddingHouse(false)
  }

  // Bulk flag upload — uses filename (without extension) as the color name.
  // If a detected student-color matches the filename, that exact casing is used;
  // otherwise the filename itself becomes a new flag color (capitalized for display).
  // This lets users upload flag images BEFORE importing students.
  const handleBulkFlagUpload = async (files: FileList) => {
    if (!files.length) return
    let uploaded = 0, failed = 0
    const errors: string[] = []

    for (const file of Array.from(files)) {
      const baseName = file.name.replace(/\.[^.]+$/, "").trim()
      if (!baseName) { failed++; continue }
      const lower = baseName.toLowerCase()
      // Prefer matching an existing student-derived color (preserves casing)
      let colorName = flagColors.find(c => c.toLowerCase().trim() === lower)
        || flagColors.find(c => lower.includes(c.toLowerCase().trim()) || c.toLowerCase().trim().includes(lower))
      // Otherwise create a new color from the filename
      if (!colorName) colorName = baseName.charAt(0).toUpperCase() + baseName.slice(1)

      const result = await handleFlagUpload(colorName, file, { silent: true })
      if (result.ok) {
        uploaded++
      } else {
        failed++
        if (result.error && !errors.includes(result.error)) errors.push(result.error)
      }
    }

    if (uploaded > 0) toast.success(`${uploaded} flag image(s) uploaded!`)
    if (failed > 0) {
      const detail = errors.length > 0 ? ` ${errors[0]}` : ''
      toast.error(`${failed} file(s) failed.${detail}`)
    }
    // Refresh to pick up any newly created colors
    await fetchFlags()
  }

  // Manual photo assignment handler
  const handleManualAssign = async (filename: string, studentId: string) => {
    const file = unmatchedFileMap[filename]
    if (!file || !studentId) return
    
    setManualAssigning(filename)
    try {
      const fd = new FormData()
      fd.append("photo", file)
      fd.append("studentId", studentId)
      const res = await fetch(`/api/schools/${schoolId}/students/assign-photo`, { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) {
        toast.success(`Photo "${filename}" assigned to ${data.data.studentName}!`)
        // Move from unmatched to matched
        setPhotoResult((prev: any) => ({
          ...prev,
          matched: prev.matched + 1,
          unmatched: prev.unmatched - 1,
          matchedFiles: [...(prev.matchedFiles || []), {
            filename,
            studentName: data.data.studentName,
            serialNumber: data.data.serialNumber,
            matchedBy: 'Manual',
          }],
          unmatchedFiles: (prev.unmatchedFiles || []).filter((f: string) => f !== filename),
        }))
        // Remove from unmatched file map
        setUnmatchedFileMap(prev => {
          const next = { ...prev }
          delete next[filename]
          return next
        })
        fetchStudents(studentPage)
      } else {
        toast.error(data.error || "Failed to assign photo")
      }
    } catch (err) {
      toast.error("Failed to assign photo")
    } finally {
      setManualAssigning('')
    }
  }

  const downloadJobFile = (jobId: string) => {
    const link = document.createElement("a")
    link.href = `/api/jobs/${jobId}/download`
    link.setAttribute("download", "")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const pollStatusExportJob = async (
    jobId: string,
    exportStatus: DownloadExportStatus,
    totalStudents?: number
  ) => {
    const statusLabel = DOWNLOAD_EXPORT_STATUS_LABELS[exportStatus]
    const maxAttempts = 450
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, 2000))
      const statusRes = await fetch(`/api/jobs/${jobId}`)
      const statusData = await statusRes.json()
      const job = statusData.data
      if (job?.status === "COMPLETED") {
        setStatusExportJob({ jobId, status: "ready", exportStatus, totalStudents })
        toast.success(`${statusLabel} backup ready. Click Download ${statusLabel} ZIP.`)
        return true
      }
      if (job?.status === "FAILED") {
        const error = job.error || `${statusLabel} backup failed`
        setStatusExportJob({ jobId, status: "failed", exportStatus, totalStudents, error })
        toast.error(error)
        return false
      }
      if (job?.status === "RUNNING" && attempt > 0 && attempt % 15 === 0) {
        const countLabel = totalStudents ? `${totalStudents.toLocaleString()} ${companyMode ? "employees" : "students"}` : "large export"
        toast.message(`Still preparing ${statusLabel.toLowerCase()} ${countLabel}... (${Math.round((attempt * 2) / 60)} min)`)
      }
    }
    setStatusExportJob(null)
    toast.error(`${statusLabel} backup is still running. Please try again in a few minutes.`)
    return false
  }

  const pollExportJob = async (jobId: string, successLabel: string, totalStudents?: number) => {
    const maxAttempts = 450
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, 2000))
      const statusRes = await fetch(`/api/jobs/${jobId}`)
      const statusData = await statusRes.json()
      const job = statusData.data
      if (job?.status === "COMPLETED") {
        downloadJobFile(jobId)
        toast.success(successLabel)
        return true
      }
      if (job?.status === "FAILED") {
        toast.error(job.error || "Export failed")
        return false
      }
      if (job?.status === "RUNNING" && attempt > 0 && attempt % 15 === 0) {
        const countLabel = totalStudents ? `${totalStudents.toLocaleString()} ${companyMode ? "employees" : "students"}` : "large export"
        toast.message(`Still preparing ${countLabel}… (${Math.round((attempt * 2) / 60)} min)`)
      }
    }
    toast.error("Export still running — check Operations → Recent Jobs and download when ready.")
    return false
  }

  const handleExport = async (
    format: "csv" | "excel" | "archive",
    options?: { statusOverride?: DownloadExportStatus }
  ) => {
    const params = new URLSearchParams()
    const exportKey = format === "excel" && options?.statusOverride ? "status-excel" : format
    if (classFilter) params.set("classId", classFilter)
    const effectiveStatus = options?.statusOverride ?? statusFilter
    if (effectiveStatus) params.set("status", effectiveStatus)
    setExportingFormat(exportKey)
    if (format === "excel" || format === "archive") {
      try {
        if (format === "excel") params.set("format", "excel")
        const selectedClassName = classFilter ? classes.find((c) => c.id === classFilter)?.name : ""
        const scopeLabel = selectedClassName ? `${selectedClassName} class` : "school"
        const exportStatusLabel = options?.statusOverride
          ? DOWNLOAD_EXPORT_STATUS_LABELS[options.statusOverride]
          : ""
        toast.message(format === "excel"
          ? `Preparing ${exportStatusLabel ? `${exportStatusLabel.toLowerCase()} ` : ""}${scopeLabel} backup with named photos...`
          : "Preparing archive export...")
        const res = await fetch(`/api/schools/${schoolId}/export/archive?${params}`)
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || "Export failed")
          setExportingFormat(null)
          return
        }
        const jobId = data.data?.jobId
        if (!jobId) {
          toast.error("Export did not return a job id")
          setExportingFormat(null)
          return
        }
        if (exportKey === "status-excel" && options?.statusOverride) {
          const totalStudents = data.data?.totalStudents
          setStatusExportJob({
            jobId,
            status: "running",
            exportStatus: options.statusOverride,
            totalStudents,
          })
          toast.success(`${exportStatusLabel} backup started. The button will change when the ZIP is ready.`)
          setExportingFormat(null)
          void pollStatusExportJob(jobId, options.statusOverride, totalStudents)
          return
        }
        await pollExportJob(
          jobId,
          format === "excel"
            ? "Backup ZIP ready - data and named photos downloaded"
            : "Archive ready — download started",
          data.data?.totalStudents
        )
      } catch {
        toast.error("Export failed")
      } finally {
        setExportingFormat(null)
      }
      return
    }
    window.open(`/api/schools/${schoolId}/export/${format}?${params}`, "_blank")
    setExportingFormat(null)
  }

  // Logo Upload Handler
  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", `logos`)
      const uploadRes = await fetch("/api/upload", { method: "POST", body: fd })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok || !uploadData.success) {
        toast.error(uploadData.error || "Failed to upload logo")
        return
      }
      const logoUrl = uploadData.url

      // Update school record
      const res = await fetch(`/api/schools/${schoolId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`${companyMode ? "Company" : "School"} logo updated!`)
        fetchSchool()
      } else {
        toast.error("Failed to update school record")
      }
    } catch (err) {
      toast.error("Logo upload failed")
    } finally {
      setUploadingLogo(false)
    }
  }

  // Template orientation updater — exact 58×100 mm cutter dimensions
  const handleOrientationChange = async (orientation: "PORTRAIT" | "LANDSCAPE") => {
    try {
      const { widthMm, heightMm } = cardDimensionsForOrientation(orientation)
      const res = await fetch(`/api/schools/${schoolId}/template`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orientation,
          cardWidthMm: widthMm,
          cardHeightMm: heightMm,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Card set to ${orientation === "LANDSCAPE" ? "Horizontal" : "Vertical"} (${widthMm} × ${heightMm} mm)`)
        fetchTemplate()
      } else {
        toast.error("Failed to update orientation")
      }
    } catch (err) {
      toast.error("Update failed")
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
    </div>
  )
  if (!school) return <div style={{ padding: 32 }}>{pathname.startsWith("/companies/") ? "Company" : "School"} not found.</div>
  // The route is available before any template request finishes. Trust it
  // immediately so company pages never flash school/student terminology.
  const companyRoute = isCompanyRoute || isCompanyWorkspace(
    school.name,
    (templateData?.fieldConfig || []) as Array<{ key?: string; label?: string }>,
    school.workspaceKind,
  )
  const companyMode = companyRoute
  const legacyCompanyPortfolio = companyMode && normalizeKey(school.name).includes("companyidcard")
  const directoryHref = companyRoute ? "/companies" : "/schools"
  const directoryLabel = companyRoute ? "Company" : "Schools"

  const toggleSectionExpanded = (sectionId: string) => {
    setExpandedSectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  const getSectionGradeRows = (cls: ClassData) => {
    const effectiveOptions = resolveEffectiveClassOptions(cls.classOptions, cls.sectionType, cls.name)
    const gradeCounts = new Map(
      (cls.studentBreakdown?.byGrade || []).map((entry) => [entry.grade, entry.count])
    )
    if (effectiveOptions.length > 0) {
      return effectiveOptions.map((grade) => ({ grade, count: gradeCounts.get(grade) || 0 }))
    }
    if (gradeCounts.size > 0) {
      return Array.from(gradeCounts.entries())
        .map(([grade, count]) => ({ grade, count }))
        .sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }))
    }
    return []
  }

  const renderSectionStudentCounts = (cls: ClassData) => {
    const breakdown = cls.studentBreakdown?.byClass || []
    if (breakdown.length === 0) {
      return <span className="status-badge status-submitted">{cls._count.students}</span>
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>
          {cls._count.students} total
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {breakdown.map(({ label, count }) => (
            <span
              key={label}
              className="status-badge status-submitted"
              style={{ fontSize: 11, whiteSpace: "nowrap" }}
            >
              {label}: {count}
            </span>
          ))}
        </div>
      </div>
    )
  }

  const statusExportLabel = DOWNLOAD_EXPORT_STATUS_LABELS[downloadExportStatus]
  const statusExportReady =
    statusExportJob?.status === "ready" &&
    statusExportJob.exportStatus === downloadExportStatus
  const statusExportRunning =
    (statusExportJob?.status === "running" &&
      statusExportJob.exportStatus === downloadExportStatus) ||
    exportingFormat === "status-excel"
  const hasStudentsForExport =
    studentTotal > 0 || classes.some((schoolClass) => schoolClass._count.students > 0)
  const statusExportDisabled =
    !statusExportReady &&
    (exportingFormat !== null || !hasStudentsForExport || statusExportRunning)
  const statusExportButtonLabel = statusExportReady
    ? `Download ${statusExportLabel} ZIP`
    : statusExportRunning
      ? `Preparing ${statusExportLabel} ZIP...`
      : statusExportJob?.status === "failed" &&
          statusExportJob.exportStatus === downloadExportStatus
        ? `Retry ${statusExportLabel} Download`
        : `Download ${statusExportLabel} Data + Photos`

  const handleStatusExportClick = () => {
    if (statusExportReady && statusExportJob?.jobId) {
      downloadJobFile(statusExportJob.jobId)
      setStatusExportJob(null)
      toast.success(`${statusExportLabel} backup download started.`)
      return
    }
    setStatusExportJob(null)
    void handleExport("excel", { statusOverride: downloadExportStatus })
  }

  const tabs = ["overview", "classes", "students", "template", "generate", "batches", "export"] as const

  return (
    <>
      {/* Breadcrumbs */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', marginBottom: 12, flexWrap: 'wrap' }}>
        <Link href="/dashboard" style={{ color: '#64748b', textDecoration: 'none' }}>Dashboard</Link>
        <span>›</span>
        <Link href={directoryHref} style={{ color: '#64748b', textDecoration: 'none' }}>{directoryLabel}</Link>
        <span>›</span>
        <span style={{ color: '#0f172a', fontWeight: 600 }}>{school.name}</span>
      </nav>

      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <button className="btn-ghost" onClick={() => router.push(directoryHref)} style={{ padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #1B4F8A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'white', flexShrink: 0 }}>
              {school.name.charAt(0)}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 'min(20px, 5vw)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{school.name}</h1>
              <p style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{school.address || school.contactEmail}</p>
            </div>
          </div>
          <Link href={`${companyRoute ? "/companies" : "/schools"}/${schoolId}/verify`} className="btn btn-outline" style={{ fontSize: 12, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="8" height="8" rx="1" /><rect x="14" y="2" width="8" height="8" rx="1" /><rect x="2" y="14" width="8" height="8" rx="1" /><rect x="14" y="14" width="4" height="4" rx="0.5" /></svg>
            <span className="hide-on-small-mobile">QR Verify</span>
          </Link>
        </div>

        <div className="school-tabs-scroll" style={{ display: 'flex', borderBottom: '1px solid var(--gray-200)', marginBottom: 24, paddingBottom: 0 }}>
          {(["overview", "classes", "students", "template", "generate", "batches", "export"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t as any)}
              className={`tab-item ${tab === t ? "active" : ""}`}
              style={{ 
                textTransform: 'capitalize', 
                padding: '12px 0px', 
                marginRight: 32, 
                background: 'none', 
                border: 'none',
                fontSize: 14,
                fontWeight: tab === t ? 700 : 500,
                color: tab === t ? 'var(--blue-600)' : 'var(--gray-500)',
                cursor: 'pointer'
              }}
            >
              {companyMode && t === "classes"
                ? (legacyCompanyPortfolio ? "Companies" : "Departments")
                : companyMode && t === "students"
                  ? "Employees"
                  : SCHOOL_TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <div className="fade-in">
            <div className="school-stats-mobile stat-grid">
              <div className="stat-card glass-card premium-shadow">
                <div className="stat-card-label">{companyMode ? (legacyCompanyPortfolio ? "Total Companies" : "Total Departments") : "Total Classes"}</div>
                <div className="stat-card-value text-blue-600">{school._count.classes}</div>
              </div>
              <div className="stat-card glass-card premium-shadow">
                <div className="stat-card-label">{companyMode ? "Total Employees" : "Total Students"}</div>
                <div className="stat-card-value text-blue-600">{school._count.students}</div>
              </div>
              <div className="stat-card glass-card premium-shadow">
                <div className="stat-card-label">Print Batches</div>
                <div className="stat-card-value text-blue-600">{school._count.batches}</div>
              </div>
              <div className="stat-card glass-card premium-shadow">
                <div className="stat-card-label">Template Status</div>
                <div className="stat-card-value" style={{ color: school.template ? 'var(--green-600)' : 'var(--gray-300)' }}>
                  {school.template ? "Active" : "None"}
                </div>
              </div>
            </div>

            {/* Workspace administrator login credentials */}
            <div style={{ marginTop: 24, background: 'linear-gradient(135deg, #f8fafc, #eff6ff)', borderRadius: 16, border: '1px solid #bfdbfe', padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e3a8a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🔑</span> {companyMode ? "ID Card Coordinator Login" : "Main ID Card Coordinator Login"}
              </h3>
              <p style={{ fontSize: 13, color: '#3b82f6', marginBottom: 16 }}>
                {companyMode ? (
                  <>These are the credentials for the ID card coordinator. They can log in, manage departments and employees, and map ID-card templates. Default password: <b>Company@123</b>.</>
                ) : (
                  <>These are the credentials for the main ID card coordinator. Hand these over so they can log in, add classes, map templates, and assign class coordinators. Note: default password is <b>Teacher@123</b>.</>
                )}
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {school.teachers?.filter((t: any) => t.isMainTeacher).map((t: any) => {
                  const teacherExpired = !!(t.expiresAt && new Date(t.expiresAt).getTime() <= Date.now())
                  const teacherClosed = t.isActive === false
                  const teacherBlocked = teacherClosed || teacherExpired
                  const statusText = teacherClosed ? "Closed" : teacherExpired ? "Expired" : "Active"
                  const statusColor = teacherBlocked ? "#dc2626" : "#16a34a"
                  return (
                  <div key={t.id} style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ marginBottom: 12 }}>
                      <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Login URL</span>
                      <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                        <span>{mounted ? `${window.location.origin}/login` : '/login'}</span>
                        <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 11, minHeight: 0 }} onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/login`); toast.success('Copied URL') }}>Copy</button>
                      </div>
                    </div>
                    
                    <div style={{ marginBottom: 0 }}>
                      <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Email Address (Username)</span>
                      <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                        <span style={{ wordBreak: 'break-all' }}>{t.email}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 11, minHeight: 0 }} onClick={() => { navigator.clipboard.writeText(t.email); toast.success('Copied Email') }}>Copy</button>
                          <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 11, minHeight: 0, color: '#dc2626' }} onClick={async () => {
                            if (confirm(companyMode ? "Reset the ID card coordinator password to Company@123?" : "Reset this coordinator's password to Teacher@123?")) {
                              const res = await fetch(`/api/schools/${schoolId}/main-teacher`, { method: "POST", body: JSON.stringify({ reset: true }) })
                              if (res.ok) toast.success("Password Reset!"); else toast.error("Failed to reset.")
                            }
                          }}>Reset Pw</button>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                        <div>
                          <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Login Status</span>
                          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: statusColor, display: 'inline-block' }} />
                            <span style={{ color: statusColor, fontSize: 13, fontWeight: 700 }}>{statusText}</span>
                            {t.expiresAt && (
                              <span style={{ color: '#64748b', fontSize: 12 }}>
                                Expires {new Date(t.expiresAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <button className="btn btn-outline" style={{ padding: '6px 10px', fontSize: 12, minHeight: 0, color: teacherBlocked ? '#16a34a' : '#dc2626' }} onClick={async () => {
                          try {
                            if (teacherBlocked) {
                              await updateMainTeacherLogin({ action: "reopen" }, "Coordinator login reopened")
                            } else if (confirm("Close this coordinator login? They will not be able to log in again until you reopen it.")) {
                              await updateMainTeacherLogin({ action: "close" }, "Coordinator login closed")
                            }
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Could not update login")
                          }
                        }}>
                          {teacherBlocked ? "Reopen Login" : "Close Login"}
                        </button>
                      </div>
                      {editingTeacherExpiryFor === t.id ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            type="datetime-local"
                            value={editingTeacherExpiryValue}
                            onChange={e => setEditingTeacherExpiryValue(e.target.value)}
                            style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13 }}
                          />
                          <button className="btn btn-primary" style={{ padding: '7px 10px', fontSize: 12, minHeight: 0 }} onClick={saveTeacherExpiry}>Save Expiry</button>
                          <button className="btn btn-outline" style={{ padding: '7px 10px', fontSize: 12, minHeight: 0 }} onClick={async () => {
                            setEditingTeacherExpiryValue("")
                            try {
                              await updateMainTeacherLogin({ action: "expiry", expiresAt: null }, "Coordinator login expiry removed")
                              cancelEditTeacherExpiry()
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : "Could not remove expiry")
                            }
                          }}>No Expiry</button>
                          <button className="btn btn-outline" style={{ padding: '7px 10px', fontSize: 12, minHeight: 0 }} onClick={cancelEditTeacherExpiry}>Cancel</button>
                        </div>
                      ) : (
                        <button className="btn btn-outline" style={{ padding: '6px 10px', fontSize: 12, minHeight: 0 }} onClick={() => startEditTeacherExpiry(t.id, t.expiresAt)}>
                          Set Expiry Date
                        </button>
                      )}
                    </div>
                  </div>
                  )
                })}
                
                {/* Manual Add Option (Always show as an alternative or if missing) */}
                {(!school.teachers || !school.teachers.some((t: any) => t.isMainTeacher)) && (
                  <div style={{ padding: 16, background: 'white', borderRadius: 12, border: '1px dashed #cbd5e1', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>Set up {companyMode ? "ID card coordinator" : "main ID card coordinator"} account</p>
                      <button 
                        className="btn btn-primary" 
                        style={{ width: '100%' }}
                        onClick={async () => {
                          if (!confirm(companyMode ? "Auto-generate an ID Card Coordinator login?" : "Auto-generate a Main ID Card Coordinator login?")) return
                          const res = await fetch(`/api/schools/${schoolId}/main-teacher`, { method: "POST" })
                          if (res.ok) { toast.success("Created!"); fetchSchool() } else toast.error("Error")
                        }}
                      >
                        🚀 Quick Auto-Generate
                      </button>
                    </div>
                    
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                      <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginBottom: 8 }}>OR ENTER EMAIL MANUALLY</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input 
                          type="email" 
                          id="manual-teacher-email" 
                          placeholder={companyMode ? "coordinator@company.com" : "coordinator@school.com"}
                          style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
                        />
                        <button 
                          className="btn btn-outline" 
                          style={{ minHeight: 0, padding: '0 12px' }}
                          onClick={async () => {
                            const email = (document.getElementById('manual-teacher-email') as HTMLInputElement).value
                            if (!email) return toast.error("Enter email")
                            const res = await fetch(`/api/schools/${schoolId}/main-teacher`, { method: "POST", body: JSON.stringify({ email }) })
                            if (res.ok) { toast.success("Created!"); fetchSchool() } else { const j = await res.json(); toast.error(j.error || "Error") }
                          }}
                        >Add</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Workspace logo upload section */}
            <div style={{ marginTop: 24, background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{companyMode ? "Company Logo" : "School Logo"}</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>Upload the {companyMode ? "company" : "school"} logo to appear on ID cards.</p>
              
              <div className="school-logo-section" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                {/* Current Logo Preview */}
                {school.logoUrl && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 120, height: 120, borderRadius: 12, overflow: 'hidden', border: '2px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={school.logoUrl} alt={companyMode ? "Company Logo" : "School Logo"} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>Current Logo</div>
                  </div>
                )}

                {/* Upload Zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setLogoDragOver(true) }}
                  onDragLeave={() => setLogoDragOver(false)}
                  onDrop={e => {
                    e.preventDefault()
                    setLogoDragOver(false)
                    const file = e.dataTransfer.files[0]
                    if (file && file.type.startsWith('image/')) handleLogoUpload(file)
                  }}
                  onClick={() => document.getElementById('logo-upload-input')?.click()}
                  style={{
                    flex: 1,
                    minWidth: 200,
                    border: `2px dashed ${logoDragOver ? '#3b82f6' : '#e2e8f0'}`,
                    borderRadius: 12,
                    padding: 32,
                    textAlign: 'center',
                    cursor: uploadingLogo ? 'wait' : 'pointer',
                    background: logoDragOver ? '#eff6ff' : '#fafafa',
                    transition: 'all 0.2s',
                  }}
                >
                  <input
                    id="logo-upload-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleLogoUpload(file)
                    }}
                  />
                  {uploadingLogo ? (
                    <>
                      <div className="login-spinner" style={{ width: 24, height: 24, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', margin: '0 auto 8px' }} />
                      <div style={{ fontSize: 13, color: '#3b82f6' }}>Uploading...</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🏫</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{school.logoUrl ? 'Replace Logo' : `Upload ${companyMode ? "Company" : "School"} Logo`}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>Drag & drop or click to browse</div>
                      <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>JPEG, PNG, WebP — Max 5MB</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CLASSES TAB */}
        {tab === "classes" && (
          <div className="fade-in">
            {/* ── School-wide registration link panel ──
                Single URL parents use; class dropdown on the form. Replaces
                per-class link distribution. Per-class share buttons in the
                table below remain available for backward-compat. */}
            {school && (
              <div style={{
                marginBottom: 24,
                padding: 16,
                borderRadius: 12,
                border: '1px solid #c7d2fe',
                background: 'linear-gradient(135deg, #eef2ff, #f0f9ff)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 16,
                  }}>🔗</div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                      {companyMode ? "Employee Registration Links" : "Section Registration Links"}
                    </div>
                    <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.45 }}>
                      {companyMode
                        ? `One registration URL for the whole company. Prefer sharing each ${legacyCompanyPortfolio ? "company" : "department"} link below.`
                        : "Optional fallback: one URL for the whole school. Prefer sharing each section link below."}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                    background: school.linkActive ? '#dcfce7' : '#fee2e2',
                    color: school.linkActive ? '#166534' : '#991b1b',
                  }}>
                    {school.linkActive ? '● ACTIVE' : '● CLOSED'}
                  </span>
                </div>

                <div style={{
                  display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10,
                  background: 'white', border: '1px solid #cbd5e1', borderRadius: 8,
                  padding: '8px 10px', flexWrap: 'wrap',
                }}>
                  <code style={{
                    flex: 1, minWidth: 200, fontSize: 12, color: '#334155',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {schoolFormUrl || 'Generating link…'}
                  </code>
                  <button
                    className="btn btn-outline"
                    onClick={copySchoolLink}
                    style={{ fontSize: 11, padding: '5px 10px' }}
                  >📋 Copy</button>
                  <button
                    className="btn btn-outline"
                    onClick={shareSchoolWhatsApp}
                    style={{ fontSize: 11, padding: '5px 10px', color: '#22c55e', borderColor: '#22c55e' }}
                  >💬 WhatsApp</button>
                  <button
                    className="btn btn-outline"
                    onClick={shareSchoolEmail}
                    style={{ fontSize: 11, padding: '5px 10px' }}
                  >📧 Email</button>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-outline"
                    onClick={toggleSchoolLink}
                    style={{
                      fontSize: 11, padding: '5px 10px',
                      color: school.linkActive ? '#dc2626' : '#16a34a',
                      borderColor: school.linkActive ? '#fecaca' : '#bbf7d0',
                    }}
                  >
                    {school.linkActive ? '🔒 Close Link' : '🔓 Reopen Link'}
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={regenerateSchoolLink}
                    style={{ fontSize: 11, padding: '5px 10px', color: '#7c3aed', borderColor: '#ddd6fe' }}
                  >🔄 Regenerate</button>
                  {school.linkExpiresAt && (
                    <span style={{
                      fontSize: 11, color: '#92400e', padding: '5px 10px',
                      background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6,
                    }}>
                      Expires {new Date(school.linkExpiresAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleAddClass} style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>
                  {companyMode ? (legacyCompanyPortfolio ? "Company name" : "Department name") : "Section name"}
                </label>
                <input
                  placeholder={companyMode ? (legacyCompanyPortfolio ? "e.g. Acme Industries" : "e.g. Engineering, Operations") : "e.g. Secondary, Pre Primary"}
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  required
                />
              </div>
              {!companyMode && <div className="form-group" style={{ width: 180 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Section type</label>
                <select
                  value={newSectionType}
                  onChange={(e) => {
                    const v = e.target.value as SectionType | ""
                    setNewSectionType(v)
                  }}
                  style={{ width: '100%', height: 44, padding: '0 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                >
                  <option value="">Custom classes</option>
                  {(Object.keys(SECTION_TYPE_LABELS) as SectionType[]).map((key) => (
                    <option key={key} value={key}>{SECTION_TYPE_LABELS[key]}</option>
                  ))}
                </select>
              </div>}
              <div className="form-group" style={{ width: 200 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Link expiry</label>
                <input type="datetime-local" value={newExpiry} onChange={e => setNewExpiry(e.target.value)} placeholder="Expiry (optional)" />
              </div>
              <button type="submit" className="btn btn-primary" style={{ height: 44 }} disabled={addingClass}>
                {addingClass ? "Adding..." : companyMode ? `Add ${legacyCompanyPortfolio ? "Company" : "Department"}` : "Add Section"}
              </button>
            </form>
            {!companyMode && newSectionType && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: -16, marginBottom: 20 }}>
                Default classes: {DEFAULT_CLASS_OPTIONS[newSectionType].join(", ")} · Divisions A–M on the form
              </div>
            )}

            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{companyMode ? (legacyCompanyPortfolio ? "Company" : "Department") : "Section"}</th>
                    {!companyMode && <th>Classes (Roman)</th>}
                    <th>Template</th>
                    <th>{companyMode ? `${legacyCompanyPortfolio ? "Company" : "Department"} Coordinator` : "Approval Coordinator"}</th>
                    <th>{companyMode ? "Employees" : "Students"}</th>
                    <th>Status</th>
                    <th>Link</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map(cls => {
                    const classTeacher = cls.teachers?.find(t => !t.isMainTeacher)
                    const isExpanded = expandedSectionIds.has(cls.id)
                    const gradeRows = getSectionGradeRows(cls)
                    const canExpand = !companyMode && gradeRows.length > 0
                    return (
                    <Fragment key={cls.id}>
                    <tr>
                      <td style={{ fontWeight: 600 }}>
                        <button
                          type="button"
                          onClick={() => toggleSectionExpanded(cls.id)}
                          disabled={!canExpand}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            background: "none",
                            border: "none",
                            padding: 0,
                            font: "inherit",
                            fontWeight: 600,
                            color: canExpand ? "#0f172a" : "#64748b",
                            cursor: canExpand ? "pointer" : "default",
                          }}
                          title={canExpand ? "Click to show classes under this section" : "Configure classes or add students to expand"}
                        >
                          <span style={{ fontSize: 10, color: "#94a3b8", width: 12, display: "inline-block" }}>
                            {canExpand ? (isExpanded ? "▼" : "▶") : "•"}
                          </span>
                          {cls.name}
                        </button>
                      </td>
                      {!companyMode && <td style={{ minWidth: 160, fontSize: 12, color: '#475569' }}>
                        {(cls.classOptions?.length ?? 0) > 0 ? (
                          <div>
                            <div style={{ lineHeight: 1.5 }}>{cls.classOptions.join(", ")}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>+ Division A–M on form</div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Not configured</span>
                        )}
                      </td>}
                      <td style={{ minWidth: 220 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <select
                            value={getEffectiveTemplateId(cls) || ""}
                            onChange={(e) => handleAssignClassTemplate(cls.id, e.target.value)}
                            disabled={assigningTemplateFor === cls.id || schoolTemplates.length === 0}
                            style={{
                              width: '100%',
                              fontSize: 12,
                              padding: '6px 8px',
                              border: '1px solid #cbd5e1',
                              borderRadius: 8,
                              background: 'white',
                            }}
                          >
                            {schoolTemplates.length === 0 ? (
                              <option value="">No templates yet</option>
                            ) : (
                              schoolTemplates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))
                            )}
                          </select>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => openClassTemplateEditor(cls, false)}
                              disabled={classTemplateEditorLoading || !getEffectiveTemplateId(cls)}
                              style={{ fontSize: 11, padding: '4px 8px' }}
                            >
                              ✏️ Edit Template
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => openClassTemplateEditor(cls, true)}
                              disabled={classTemplateEditorLoading}
                              style={{ fontSize: 11, padding: '4px 8px', color: '#6366f1', borderColor: '#c7d2fe' }}
                            >
                              ➕ New Template
                            </button>
                          </div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>
                            {getEffectiveTemplateLabel(cls)}
                            {cls.template?.templateImageUrl || schoolTemplates.find(t => t.id === getEffectiveTemplateId(cls))?.templateImageUrl
                              ? " · JPG ready"
                              : " · Not configured"}
                          </div>
                        </div>
                      </td>
                      <td>
                        {classTeacher ? (
                          <div style={{ fontSize: 12 }}>
                            <div style={{ fontWeight: 600, color: '#334155' }}>{classTeacher.name}</div>
                            <div style={{ color: '#94a3b8', fontSize: 11 }}>{classTeacher.email}</div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td>{renderSectionStudentCounts(cls)}</td>
                      <td>
                        <span className={`status-badge ${cls.isActive ? 'status-approved' : 'status-pending'}`}>
                          {cls.isActive ? "Active" : "Inactive"}
                        </span>
                        {cls.expiresAt && (
                          <div style={{ marginTop: 4 }}>
                            {getExpiryBadge(cls.expiresAt)}
                          </div>
                        )}
                      </td>
                      <td style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 12 }}>...{cls.linkToken.slice(-8)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-outline"
                            onClick={() => startEditSectionName(cls)}
                            style={{ fontSize: 11, padding: '5px 10px' }}
                            title={`Change this ${companyMode ? (legacyCompanyPortfolio ? "company" : "department") : "section"} name`}
                          >
                            ✏️ Edit {companyMode ? (legacyCompanyPortfolio ? "Company" : "Department") : "Name"}
                          </button>
                          {!companyMode && <button
                            className="btn btn-outline"
                            onClick={() => startEditClassOptions(cls)}
                            style={{ fontSize: 11, padding: '5px 10px' }}
                            title="Configure Roman class list for this section"
                          >
                            📚 Edit Classes
                          </button>}
                          {!companyMode && <button
                            className="btn btn-outline"
                            onClick={() => startEditDivisionOptions(cls)}
                            style={{ fontSize: 11, padding: '5px 10px' }}
                            title="Configure custom division list (e.g. A, B, C or custom names) for this section"
                          >
                            🏷️ Edit Divisions
                          </button>}
                          <button className="btn btn-outline" onClick={() => copyLink(cls.linkToken)} style={{ fontSize: 11, padding: '5px 10px' }}>📋 Copy</button>
                          <button className="btn btn-outline" onClick={() => shareWhatsApp(cls.linkToken, cls.name)} style={{ fontSize: 11, padding: '5px 10px', color: '#22c55e', borderColor: '#22c55e' }}>💬 WhatsApp</button>
                          <button className="btn btn-outline" onClick={() => shareEmail(cls.linkToken, cls.name)} style={{ fontSize: 11, padding: '5px 10px' }}>📧 Email</button>
                          <button
                            className="btn btn-outline"
                            onClick={() => startEditExpiry(cls.id, cls.expiresAt)}
                            style={{ fontSize: 11, padding: '5px 10px' }}
                            title="Edit when this link expires. Setting a future date will also reactivate an expired link."
                          >
                            📅 Edit Expiry
                          </button>
                          <button className="btn btn-outline" onClick={() => handleToggleClass(cls.id, cls.isActive)} style={{ fontSize: 11, padding: '5px 10px' }}>
                            {cls.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button className="btn btn-danger" onClick={() => handleDeleteClass(cls.id, cls.name)} style={{ fontSize: 11, padding: '5px 8px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
                          </button>
                        </div>
                        {editingSectionNameFor === cls.id && (
                          <div
                            style={{
                              marginTop: 8,
                              padding: 10,
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              borderRadius: 8,
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                              Rename {companyMode ? (legacyCompanyPortfolio ? "company" : "department") : "section"}
                            </div>
                            <input
                              value={editingSectionNameDraft}
                              onChange={(event) => setEditingSectionNameDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") cancelEditSectionName()
                                if (event.key === "Enter" && !savingSectionName && !prepareSectionRename(cls.name, editingSectionNameDraft).error) {
                                  event.preventDefault()
                                  void saveEditSectionName(cls)
                                }
                              }}
                              autoFocus
                              maxLength={120}
                              placeholder={companyMode ? (legacyCompanyPortfolio ? "Company name" : "Department name") : "Section name"}
                              style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', marginBottom: 8 }}
                            />
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button type="button" className="btn btn-outline" disabled={savingSectionName} onClick={cancelEditSectionName} style={{ fontSize: 11, padding: '4px 10px' }}>Cancel</button>
                              <button
                                type="button"
                                className="btn btn-primary"
                                disabled={savingSectionName || Boolean(prepareSectionRename(cls.name, editingSectionNameDraft).error)}
                                onClick={() => saveEditSectionName(cls)}
                                style={{ fontSize: 11, padding: '4px 10px' }}
                              >
                                {savingSectionName ? "Saving…" : "Save Name"}
                              </button>
                            </div>
                          </div>
                        )}
                        {editingClassOptionsFor === cls.id && (
                          <div
                            style={{
                              marginTop: 8,
                              padding: 10,
                              background: '#f0f9ff',
                              border: '1px solid #bae6fd',
                              borderRadius: 8,
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 8 }}>
                              Roman classes for {cls.name}
                            </div>
                            <select
                              value={editingSectionTypeDraft}
                              onChange={(e) => {
                                const v = e.target.value as SectionType | ""
                                setEditingSectionTypeDraft(v)
                                if (v) setEditingClassOptionsDraft(DEFAULT_CLASS_OPTIONS[v].join(", "))
                              }}
                              style={{ width: '100%', marginBottom: 8, padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1' }}
                            >
                              <option value="">Custom list</option>
                              {(Object.keys(SECTION_TYPE_LABELS) as SectionType[]).map((key) => (
                                <option key={key} value={key}>{SECTION_TYPE_LABELS[key]} defaults</option>
                              ))}
                            </select>
                            <input
                              value={editingClassOptionsDraft}
                              onChange={(e) => setEditingClassOptionsDraft(e.target.value)}
                              placeholder="e.g. VI, VII, VIII, IX, X"
                              style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', marginBottom: 8 }}
                            />
                            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
                              Comma-separated. Parents also pick Division A–M; card shows e.g. VII-A.
                            </div>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button type="button" className="btn btn-outline" onClick={cancelEditClassOptions} style={{ fontSize: 11, padding: '4px 10px' }}>Cancel</button>
                              <button type="button" className="btn btn-primary" disabled={savingClassOptions} onClick={() => saveEditClassOptions(cls.id)} style={{ fontSize: 11, padding: '4px 10px' }}>
                                {savingClassOptions ? "Saving…" : "Save"}
                              </button>
                            </div>
                          </div>
                        )}
                        {editingDivisionOptionsFor === cls.id && (
                          <div
                            style={{
                              marginTop: 8,
                              padding: 10,
                              background: '#fdf4ff',
                              border: '1px solid #e9d5ff',
                              borderRadius: 8,
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#7e22ce', marginBottom: 8 }}>
                              Custom divisions for {cls.name}
                            </div>
                            <input
                              value={editingDivisionOptionsDraft}
                              onChange={(e) => setEditingDivisionOptionsDraft(e.target.value)}
                              placeholder="e.g. A, B, C, D  (leave empty for default A–M)"
                              style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #d8b4fe', marginBottom: 8 }}
                            />
                            <div style={{ fontSize: 10, color: '#7c3aed', marginBottom: 8 }}>
                              Comma-separated. Leave empty to use defaults (A–M). Current: {cls.divisionOptions.length > 0 ? cls.divisionOptions.join(', ') : 'Default (A–M)'}
                            </div>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => { setEditingDivisionOptionsDraft(''); }}
                                style={{ fontSize: 11, padding: '4px 10px' }}
                                title="Clear to reset to default A–M divisions"
                              >
                                Reset to Default
                              </button>
                              <button type="button" className="btn btn-outline" onClick={cancelEditDivisionOptions} style={{ fontSize: 11, padding: '4px 10px' }}>Cancel</button>
                              <button type="button" className="btn btn-primary" disabled={savingDivisionOptions} onClick={() => saveEditDivisionOptions(cls.id)} style={{ fontSize: 11, padding: '4px 10px' }}>
                                {savingDivisionOptions ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </div>
                        )}
                        {/* Inline expiry editor — appears under the action buttons for the row being edited */}
                        {editingExpiryFor === cls.id && (
                          <div
                            style={{
                              marginTop: 8,
                              padding: 10,
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderRadius: 8,
                              display: 'flex',
                              gap: 6,
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              flexWrap: 'wrap',
                            }}
                          >
                            <input
                              type="datetime-local"
                              value={editingExpiryValue}
                              onChange={(e) => setEditingExpiryValue(e.target.value)}
                              style={{ fontSize: 12, padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6 }}
                            />
                            <button
                              className="btn btn-outline"
                              onClick={() => { setEditingExpiryValue("") }}
                              style={{ fontSize: 11, padding: '5px 10px' }}
                              title="Remove expiry (link never expires)"
                            >
                              Clear
                            </button>
                            <button
                              className="btn btn-primary"
                              onClick={() => saveEditExpiry(cls.id)}
                              style={{ fontSize: 11, padding: '5px 12px' }}
                            >
                              Save{(() => {
                                const raw = editingExpiryValue.trim()
                                const future = !raw || new Date(raw).getTime() > Date.now()
                                const isExpired = cls.expiresAt ? new Date(cls.expiresAt).getTime() < Date.now() : false
                                return future && (isExpired || !cls.isActive) ? " & Reactivate" : ""
                              })()}
                            </button>
                            <button className="btn btn-outline" onClick={cancelEditExpiry} style={{ fontSize: 11, padding: '5px 10px' }}>
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {!companyMode && isExpanded && gradeRows.map(({ grade, count }) => (
                      <tr key={`${cls.id}-grade-${grade}`} style={{ background: "#f8fafc" }}>
                        <td style={{ paddingLeft: 28, fontSize: 13, color: "#475569", fontWeight: 500 }}>
                          ↳ Class {grade}
                        </td>
                        <td style={{ fontSize: 12, color: "#94a3b8" }}>—</td>
                        <td colSpan={2} style={{ fontSize: 12, color: "#94a3b8" }}>—</td>
                        <td>
                          <span
                            className={`status-badge ${count > 0 ? "status-submitted" : ""}`}
                            style={count === 0 ? { background: "#f1f5f9", color: "#94a3b8" } : undefined}
                          >
                            {count} {count === 1 ? "student" : "students"}
                          </span>
                        </td>
                        <td colSpan={3} style={{ fontSize: 12, color: "#94a3b8" }}>—</td>
                      </tr>
                    ))}
                    </Fragment>
                  )})}
                  {classes.length === 0 && (
                    <tr><td colSpan={companyMode ? 7 : 8} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                      {classesLoadError ? (
                        <>
                          Could not load {companyMode ? (legacyCompanyPortfolio ? "companies" : "departments") : "classes"} (they may still exist in the database).{' '}
                          <button type="button" className="btn btn-outline" style={{ fontSize: 12, padding: '4px 10px', marginLeft: 8 }} onClick={() => fetchClasses()}>
                            Retry
                          </button>
                        </>
                      ) : (
                        companyMode
                          ? `No ${legacyCompanyPortfolio ? "companies" : "departments"} created yet. Add one above.`
                          : 'No classes created yet. Add one above.'
                      )}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {classTemplateEditor && (
              <div style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.55)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '24px 16px',
                overflowY: 'auto',
              }}>
                <div style={{
                  width: '100%',
                  maxWidth: 1200,
                  background: 'white',
                  borderRadius: 16,
                  border: '1px solid #e2e8f0',
                  padding: 24,
                  marginTop: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    <div>
                      <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                        Template for {classTemplateEditor.className}
                      </h3>
                      <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                        Same JPG Template Mapper as the Template tab — upload and map fields for this {companyMode ? (legacyCompanyPortfolio ? "company" : "department") : "class"}.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setClassTemplateEditor(null)}
                      style={{ fontSize: 13, padding: '8px 14px' }}
                    >
                      Close
                    </button>
                  </div>

                  <JpgTemplateMapper
                    schoolId={schoolId}
                    companyMode={companyMode}
                    templateId={classTemplateEditor.templateId}
                    templateImageUrl={classTemplateEditor.templateData?.templateImageUrl || null}
                    fieldMappings={(classTemplateEditor.templateData?.fieldMappings as any) || []}
                    fieldConfig={(classTemplateEditor.templateData?.fieldConfig as any[]) || []}
                    initialPhotoBgColor={classTemplateEditor.templateData?.photoBgColor || "#FFFFFF"}
                    initialCardSettings={classTemplateEditor.templateData ? {
                      cardSizePreset: "custom",
                      cardWidth: classTemplateEditor.templateData.cardWidthMm || DEFAULT_CARD_WIDTH_MM,
                      cardHeight: classTemplateEditor.templateData.cardHeightMm || DEFAULT_CARD_HEIGHT_MM,
                      cardOrientation: classTemplateEditor.templateData.orientation === "LANDSCAPE" ? "landscape" : "portrait",
                      printSides: classTemplateEditor.templateData.hasBackSide ? "both" : "front",
                      cardDpi: classTemplateEditor.templateData.printDpi || 300,
                      bleedMargin: 1,
                      backImageUrl: classTemplateEditor.templateData.backTemplateImageUrl || null,
                      backMappings: classTemplateEditor.templateData.backFieldMappings || [],
                      cardSizeLocked: classTemplateEditor.templateData.cardSizeLocked || false,
                      fixedBranch: (classTemplateEditor.templateData.printConfig as any)?.fixedBranch || "",
                    } : undefined}
                    previewStudent={students.find(s => s.classId === classTemplateEditor.classId) ? {
                      formData: students.find(s => s.classId === classTemplateEditor.classId)!.formData as Record<string, string>,
                      photoUrl: students.find(s => s.classId === classTemplateEditor.classId)!.photoUrl || null,
                    } : students[0] ? {
                      formData: students[0].formData as Record<string, string>,
                      photoUrl: students[0].photoUrl || null,
                    } : null}
                    onSave={async (templateImageUrl, fieldMappings, photoBgColor, cardSettings) => {
                      try {
                        const res = await fetch(`/api/schools/${schoolId}/templates/${classTemplateEditor.templateId}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            templateImageUrl,
                            fieldMappings,
                            photoBgColor,
                            ...(cardSettings ? {
                              cardWidthMm: cardSettings.cardWidth,
                              cardHeightMm: cardSettings.cardHeight,
                              printDpi: cardSettings.cardDpi,
                              orientation: cardSettings.cardOrientation === "landscape" ? "LANDSCAPE" : "PORTRAIT",
                              hasBackSide: cardSettings.printSides === "both",
                              backTemplateImageUrl: cardSettings.backImageUrl,
                              backFieldMappings: cardSettings.backMappings,
                              cardSizeLocked: cardSettings.cardSizeLocked,
                              printConfig: {
                                fixedBranch: cardSettings.fixedBranch || "",
                              },
                            } : {}),
                          }),
                        })
                        const data = await res.json()
                        if (data.success) {
                          toast.success(`Template saved for ${classTemplateEditor.className}!`)
                          setClassTemplateEditor(prev => prev ? { ...prev, templateData: data.data } : prev)
                          fetchSchoolTemplates()
                          fetchClasses()
                          if (classTemplateEditor.classId) {
                            await handleAssignClassTemplate(classTemplateEditor.classId, classTemplateEditor.templateId)
                          }
                        } else {
                          toast.error('Failed to save template')
                        }
                      } catch {
                        toast.error('Failed to save template')
                      }
                    }}
                    onUploadImage={async (file) => {
                      const fd = new FormData()
                      fd.append('file', file)
                      fd.append('folder', `templates`)
                      const res = await fetch('/api/upload', { method: 'POST', body: fd })
                      const data = await res.json()
                      if (!res.ok || !data.success) {
                        throw new Error(data.error || data.detail || 'Upload failed')
                      }
                      return data.url
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* STUDENTS TAB */}
        {tab === "students" && (
          <>
          <div className="fade-in">
            {/* Action Bar */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={() => setImportOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                Bulk Import Excel
              </button>
              <button className="btn btn-outline" onClick={() => openBulkPhotoUpload("bulk")} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderColor: '#8b5cf6', color: '#7c3aed' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                Bulk Upload Photos
              </button>
              <button className="btn btn-outline" onClick={() => openBulkPhotoUpload("replace")} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderColor: '#0ea5e9', color: '#0284c7' }} title={`Upload an edited photo folder again. Filenames must match ${companyMode ? "employee" : "student"} names and existing photos will be replaced.`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 1-15.3 6.4"/><path d="M3 12A9 9 0 0 1 18.3 5.6"/><path d="M3 19v-5h5"/><path d="M21 5v5h-5"/></svg>
                Reupload All Photos
              </button>
              <button className="btn btn-outline" onClick={() => setInfoUpdateOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderColor: '#14b8a6', color: '#0f766e' }} title={`Upload Excel to update existing ${companyMode ? "employee" : "student"} information by Serial Number. Existing photos are preserved.`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/><path d="M8 9h2"/></svg>
                Update Info Excel
              </button>
              <button className="btn btn-outline" onClick={() => openReprocessModal()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderColor: '#8b5cf6', color: '#7c3aed' }} title={companyMode ? "Select a department, then process and save every employee photo" : "Select a section/class, then run local AI background removal and auto-save every processed photo"}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                Process {companyMode ? "Department" : "Class"} Photos (AI Background)
              </button>
              <button className="btn btn-outline" onClick={openAddStudent} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderColor: '#22c55e', color: '#16a34a' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
                Add {companyMode ? "Employee" : "Student"}
              </button>
              {((): boolean => {
                const maps = (templateData?.fieldMappings as any[]) || []
                const conf = (templateData?.fieldConfig as any[]) || []
                const FLAG_KEYS = ["flagColor","houseFlag","house_flag","houseColor","house_color"]
                const FLAG_WORDS = ["house","flag","colour","color"]
                return maps.some((m: any) => m.type === 'flag') ||
                  conf.some((f: any) => FLAG_KEYS.includes(f.key) || FLAG_WORDS.some(w => (f.label||'').toLowerCase().includes(w)))
              })() && (
              <button className="btn btn-outline" onClick={() => { if (flagColors.length === 0) fetchFlags(); setFlagUploadOpen(true) }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderColor: '#f59e0b', color: '#d97706' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>
                Manage Flags{flagColors.length > 0 ? ` (${flagColors.length})` : ''}
              </button>
              )}
              <a href={`/api/schools/${schoolId}/students/import-template`} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', textDecoration: 'none', fontSize: 13 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                Download Template
              </a>
              <select
                value={downloadExportStatus}
                onChange={(event) => {
                  setDownloadExportStatus(event.target.value as DownloadExportStatus)
                  setStatusExportJob(null)
                }}
                disabled={statusExportRunning}
                aria-label="Data and photos export status"
                title="Choose which student status to include in the ZIP"
                style={{ height: 40, padding: '0 12px', border: '1.5px solid #22c55e', borderRadius: 8, color: '#166534', background: '#fff', fontSize: 13, fontWeight: 600, minWidth: 132 }}
              >
                <option value="APPROVED">Approved</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="PRINTED">Printed</option>
              </select>
              <button
                className="btn btn-outline"
                onClick={handleStatusExportClick}
                disabled={statusExportDisabled}
                title={statusExportReady
                  ? `Download the prepared ${statusExportLabel.toLowerCase()} ZIP now`
                  : `Download only ${statusExportLabel.toLowerCase()} ${companyMode ? "employee" : "student"} data with named photos${classFilter ? " for this class/section" : ""}`
                }
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderColor: '#22c55e', color: '#15803d', fontSize: 13, opacity: statusExportDisabled ? 0.6 : 1, cursor: statusExportDisabled ? 'not-allowed' : 'pointer' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/><path d="m9 18 2 2 4-4"/></svg>
                {statusExportButtonLabel}
              </button>
              {studentTotal > 0 && (
                <button
                  className="btn btn-outline"
                  onClick={handleDeleteAllStudents}
                  disabled={deletingAll}
                  title={`Permanently delete every ${companyMode ? "employee in this company" : "student in this school"} so you can re-upload a fresh Excel.`}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderColor: '#ef4444', color: '#dc2626', marginLeft: 'auto', fontSize: 13 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                  {deletingAll ? 'Deleting…' : `Delete All (${studentTotal})`}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input placeholder={companyMode ? "Search by employee name, ID, or serial..." : "Search by name or serial..."} value={searchInput} onChange={e => { const v = e.target.value; setSearchInput(v); if (searchTimerRef.current) clearTimeout(searchTimerRef.current); searchTimerRef.current = setTimeout(() => { setSearchQuery(v); setStudentPage(1); }, 400); }} style={{ height: 40, padding: '0 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, flex: 1, minWidth: 200 }} />
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setStudentPage(1) }} style={{ height: 40, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, minWidth: 130 }}>
                <option value="">All Status</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="APPROVED">Approved</option>
                <option value="FLAGGED">Flagged</option>
                <option value="PRINTED">Printed</option>
                <option value="PENDING">Pending</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: showStudentAddSection ? 8 : 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{companyMode ? (legacyCompanyPortfolio ? "Company" : "Department") : "1. Section"}</label>
                <select
                  value={classFilter}
                  onChange={(e) => { setClassFilter(e.target.value); setStudentPage(1) }}
                  style={{ height: 40, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, minWidth: 180 }}
                >
                  <option value="">{companyMode ? `All ${legacyCompanyPortfolio ? "Companies" : "Departments"}` : "All Sections"}</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {!companyMode && <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>2. Class</label>
                <select
                  value={gradeClassFilter}
                  onChange={(e) => { setGradeClassFilter(e.target.value); setStudentPage(1) }}
                  disabled={!classFilter}
                  style={{
                    height: 40,
                    padding: '0 12px',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: 10,
                    fontSize: 13,
                    minWidth: 180,
                    opacity: classFilter ? 1 : 0.55,
                    cursor: classFilter ? 'pointer' : 'not-allowed',
                  }}
                >
                  <option value="">{classFilter ? "All Classes in Section" : "Select section first"}</option>
                  {sectionClassPickerOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'flex-end' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'transparent' }}>.</label>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowStudentAddSection((v) => !v)}
                  style={{ height: 40, padding: '0 14px', fontSize: 13, whiteSpace: 'nowrap' }}
                >
                  + Add {companyMode ? (legacyCompanyPortfolio ? "Company" : "Department") : "Section"}
                </button>
              </div>
            </div>

            {showStudentAddSection && (
              <form
                onSubmit={handleAddSectionFromStudentsTab}
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 20,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  padding: 12,
                  background: '#f8fafc',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                }}
              >
                <input
                  placeholder={companyMode ? `New ${legacyCompanyPortfolio ? "company" : "department"} name` : "New section name (e.g. Pre Primary, Other)"}
                  value={studentTabNewSectionName}
                  onChange={(e) => setStudentTabNewSectionName(e.target.value)}
                  style={{ height: 38, padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, flex: 1, minWidth: 200 }}
                />
                <button type="submit" className="btn btn-primary" disabled={addingClass || !studentTabNewSectionName.trim()} style={{ height: 38, padding: '0 16px', fontSize: 13 }}>
                  {addingClass ? "Adding…" : `Create ${companyMode ? (legacyCompanyPortfolio ? "Company" : "Department") : "Section"}`}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setShowStudentAddSection(false)} style={{ height: 38, padding: '0 12px', fontSize: 13 }}>
                  Cancel
                </button>
              </form>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {studentTotal} {companyMode ? "employees" : "students"} found
                {classFilter && selectedStudentSection && (
                  <span style={{ marginLeft: 8, color: '#3b82f6' }}>
                    · {selectedStudentSection.name}
                    {gradeClassFilter && sectionClassPickerOptions.find((o) => o.value === gradeClassFilter)
                      ? ` · ${sectionClassPickerOptions.find((o) => o.value === gradeClassFilter)?.label}`
                      : ""}
                  </span>
                )}
                {(() => { const missing = students.filter(s => !studentHasPhoto(s)).length; return missing > 0 ? (
                  <span style={{ marginLeft: 12, fontSize: 12, fontWeight: 600, color: '#ef4444', background: '#fef2f2', padding: '3px 10px', borderRadius: 6 }}>
                    📷 {missing} missing photos
                  </span>
                ) : null; })()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Status filter:</span>
              {[
                { label: "All", value: "" },
                { label: "Submitted", value: "SUBMITTED" },
                { label: "Approved", value: "APPROVED" },
                { label: "Printed", value: "PRINTED" },
                { label: "Flagged", value: "FLAGGED" },
              ].map((option) => {
                const active = statusFilter === option.value
                return (
                  <button
                    key={option.value || "ALL"}
                    type="button"
                    className="btn btn-outline"
                    onClick={() => { setStatusFilter(option.value); setStudentPage(1) }}
                    style={{
                      fontSize: 12,
                      padding: '7px 12px',
                      borderColor: active ? '#2563eb' : '#cbd5e1',
                      color: active ? '#1d4ed8' : '#475569',
                      background: active ? '#eff6ff' : 'white',
                    }}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Bulk status:</span>
              <button
                className="btn btn-outline"
                disabled={studentTotal === 0 || bulkUpdatingStatus !== null}
                onClick={() => handleBulkStatusUpdate("APPROVED")}
                style={{ fontSize: 12, padding: '7px 12px', borderColor: '#22c55e', color: '#16a34a', opacity: studentTotal === 0 || bulkUpdatingStatus !== null ? 0.6 : 1 }}
              >
                {bulkUpdatingStatus === "APPROVED" ? "Approving..." : "Approve All"}
              </button>
              <button
                className="btn btn-outline"
                disabled={studentTotal === 0 || bulkUpdatingStatus !== null}
                onClick={() => handleBulkStatusUpdate("SUBMITTED")}
                style={{ fontSize: 12, padding: '7px 12px', borderColor: '#f59e0b', color: '#b45309', opacity: studentTotal === 0 || bulkUpdatingStatus !== null ? 0.6 : 1 }}
              >
                {bulkUpdatingStatus === "SUBMITTED" ? "Submitting..." : "Submitted All"}
              </button>
              <button
                className="btn btn-outline"
                disabled={studentTotal === 0 || bulkUpdatingStatus !== null}
                onClick={() => handleBulkStatusUpdate("PRINTED")}
                style={{ fontSize: 12, padding: '7px 12px', borderColor: '#0ea5e9', color: '#0369a1', opacity: studentTotal === 0 || bulkUpdatingStatus !== null ? 0.6 : 1 }}
              >
                {bulkUpdatingStatus === "PRINTED" ? "Marking printed..." : "Printed All"}
              </button>
            </div>

            <div className="data-table-wrapper" style={{ overflowX: 'auto', position: 'relative', opacity: tabLoading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
              {tabLoading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, background: 'rgba(255,255,255,0.6)', borderRadius: 14 }}><div className="login-spinner" style={{ width: 28, height: 28, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} /></div>}
              {(() => {
                // Derive columns from ACTUAL student formData keys — these are the ground
                // truth of what is stored regardless of template config state.
                // Labels come from: (1) fieldConfig label where key matches exactly,
                // (2) canonical DEFAULT_KEY_LABELS for common normalized keys,
                // (3) the key itself as a last resort.
                const DEFAULT_KEY_LABELS: Record<string, string> = {
                  srNo: "NO", fullName: "Name", grNo: "GR NO", photoId: "PHOTO NO.",
                  flagColor: "House", phone: "MOBILE", address: "Address", rollNo: "Roll No.",
                  fatherName: "Father", motherName: "Mother", branch: "Branch", section: "Section",
                  dob: "Date of Birth", bloodGroup: "Blood Group", name: "Name",
                  admissionNo: "Admission No.", father: "Father", mother: "Mother",
                  mobile: "Mobile", classSection: "Class-Section",
                }
                // Build label map from fieldConfig (key → label, exact key match only)
                const fcLabelMap: Record<string, string> = {}
                const rawFC = (templateData?.fieldConfig || []) as Array<{ key: string; label: string }>
                for (const f of rawFC) { if (f.key && f.label) fcLabelMap[f.key] = f.label }

                const SKIP_KEYS = new Set(["class", "classSection", "photoUrl", "photoPath"])
                const DUPLICATE_DISPLAY_GROUPS: string[][] = [
                  ["name", "fullName", "studentName"],
                  ["mobile", "mobile_no", "phone"],
                  ["address", "homeAddress", "home_address"],
                  ["dateOfBirth", "dob"],
                  ["bloodGroup", "blood_group", "blood group"],
                ]
                const normalizeDisplayKey = (key: string) => key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
                const duplicateGroupRank = (key: string) => {
                  const normalized = normalizeDisplayKey(key)
                  for (const group of DUPLICATE_DISPLAY_GROUPS) {
                    const rank = group.findIndex(item => normalizeDisplayKey(item) === normalized)
                    if (rank >= 0) return { group: normalizeDisplayKey(group[0]), rank }
                  }
                  return null
                }
                const isUsableDataKey = (key: string, value?: unknown) => {
                  const normalized = key.trim().toLowerCase()
                  if (!normalized) return false
                  if (SKIP_KEYS.has(key)) return false
                  if (normalized.startsWith("__empty")) return false
                  if (normalized === "empty" || normalized === "undefined" || normalized === "null") return false
                  if (value !== undefined && String(value).trim() === "") return false
                  return true
                }
                const keyToLabel: Record<string, string> = {}
                const keySet = new Set<string>()
                const allKeys: string[] = []
                for (const s of students) {
                  const fd = s.formData as any
                  if (fd && typeof fd === "object") {
                    for (const k of Object.keys(fd)) {
                      if (!keySet.has(k) && isUsableDataKey(k, fd[k])) {
                        keySet.add(k); allKeys.push(k)
                        keyToLabel[k] = fcLabelMap[k] || DEFAULT_KEY_LABELS[k] || k
                      }
                    }
                  }
                }

                let dataColumns: string[]
                if (allKeys.length > 0) {
                  dataColumns = allKeys
                } else {
                  // No students yet — fall back to fieldConfig or fieldMappings for column skeleton
                  const rawFM = (templateData?.fieldMappings || []) as Array<{ fieldKey: string; label: string; type: string }>
                  if (rawFC.length > 0) {
                    const visible = rawFC.filter(f => isUsableDataKey(f.key))
                    dataColumns = visible.map(f => f.key)
                    for (const f of visible) keyToLabel[f.key] = f.label
                  } else {
                    const visible = rawFM.filter(m => m.type !== "photo" && isUsableDataKey(m.fieldKey))
                    dataColumns = visible.map(m => m.fieldKey)
                    for (const m of visible) keyToLabel[m.fieldKey] = m.label
                  }
                }
                const selectedDuplicateGroups = new Map<string, { key: string; rank: number }>()
                for (const key of dataColumns) {
                  const info = duplicateGroupRank(key)
                  if (!info) continue
                  const current = selectedDuplicateGroups.get(info.group)
                  if (!current || info.rank < current.rank) selectedDuplicateGroups.set(info.group, { key, rank: info.rank })
                }
                dataColumns = dataColumns.filter(key => {
                  const info = duplicateGroupRank(key)
                  if (!info) return true
                  return selectedDuplicateGroups.get(info.group)?.key === key
                })
                const hasDynamicColumns = dataColumns.length > 0
                const totalCols = 1 + (hasDynamicColumns ? dataColumns.length : 2) + (companyMode ? 2 : 3)

                return (
                <table className="data-table" style={{ minWidth: hasDynamicColumns ? Math.max(800, dataColumns.length * 120) : 800 }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2, minWidth: 72 }}>Photo</th>
                      {hasDynamicColumns ? (
                        dataColumns.map(k => <th key={k}>{keyToLabel[k] || k}</th>)
                      ) : (
                        <>
                          <th>Serial No.</th>
                          <th>Name</th>
                        </>
                      )}
                      {!companyMode && <th>Class</th>}
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(s => {
                      const fd = s.formData as any
                      // Smart field resolver: try exact key, then common cross-school aliases.
                      // Needed because Excel import may store data under a different key than
                      // what the template fieldMapper uses (e.g. "fullName" vs "name").
                      const resolveCell = (key: string): string => {
                        if (!fd || typeof fd !== "object") return ""
                        if (fd[key] !== undefined && String(fd[key]).trim() !== "") return String(fd[key])
                        const ALIASES: Record<string, string[]> = {
                          name:       ["fullName", "Full Name", "Student Name", "StudentName", "student_name", "Name"],
                          fullName:   ["name", "Full Name", "Student Name", "StudentName", "Name"],
                          father:     ["fatherName", "Father Name", "Father's Name", "Father"],
                          fatherName: ["father", "Father Name", "Father's Name", "Father"],
                          mother:     ["motherName", "Mother Name", "Mother's Name", "Mother"],
                          motherName: ["mother", "Mother Name", "Mother's Name", "Mother"],
                          phone:      ["mobile", "Mobile", "MOBILE", "Phone", "mob", "MOB", "mob_father"],
                          mobile:     ["phone", "Phone", "MOBILE", "Mobile"],
                          flagColor:  ["houseFlag", "house", "House", "House Flag", "Flag", "Colour", "colour", "Color"],
                          houseFlag:  ["flagColor", "house", "House", "House Flag", "Flag"],
                          rollNo:     ["grNo", "GR NO", "GR No", "Roll No", "Roll No.", "roll no", "RollNo", "no", "NO", "srNo"],
                          grNo:       ["GR NO", "GR No", "GRNo", "gr_no", "Gr No"],
                          srNo:       ["no", "NO", "No", "sr_no", "Sr No", "rollNo"],
                          photoId:    ["Photo ID", "PHOTO NO.", "PHOTO NO", "Photo No", "photo_id", "PhotoId"],
                          branch:     ["Branch", "BRANCH"],
                          address:    ["Address", "ADD", "Add:"],
                        }
                        for (const alt of (ALIASES[key] || [])) {
                          if (fd[alt] !== undefined && String(fd[alt]).trim() !== "") return String(fd[alt])
                        }
                        // Case-insensitive fallback
                        const lk = key.toLowerCase()
                        for (const k of Object.keys(fd)) {
                          if (k.toLowerCase() === lk && String(fd[k]).trim() !== "") return String(fd[k])
                        }
                        return ""
                      }
                      const studentName = (fd?.fullName || fd?.name || fd?.["Full Name"] || fd?.["Student Name"] || "—") as string
                      const displayPhotoUrl = getStudentPhotoUrl(s)
                      const photoCacheKey = studentPhotoCacheKey(s)
                      const hasPhoto = studentHasPhoto(s)
                      const isNameColumn = (k: string) => ["fullName", "name", "studentName"].includes(k)

                      return (
                        <tr key={s.id}>
                          <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1, padding: '8px 10px' }}>
                            {displayPhotoUrl ? (
                              <button
                                type="button"
                                onClick={() => setSelectedStudent(s)}
                                title="View student photo"
                                style={{
                                  width: 52, height: 68, borderRadius: 8, overflow: 'hidden',
                                  border: '2px solid #e2e8f0', padding: 0, cursor: 'pointer', background: '#f8fafc', display: 'block',
                                }}
                              >
                                <img
                                  key={photoCacheKey}
                                  src={displayPhotoUrl}
                                  alt={studentName}
                                  loading="lazy"
                                  decoding="async"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none'
                                  }}
                                />
                              </button>
                            ) : (
                              <div style={{ width: 52, height: 68, borderRadius: 8, background: '#fef2f2', border: '2px dashed #fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2, color: '#ef4444', fontSize: 9, fontWeight: 600, textAlign: 'center', padding: 4 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                No photo
                              </div>
                            )}
                          </td>
                          {hasDynamicColumns ? (
                            dataColumns.map(k => {
                              const val = resolveCell(k)
                              const isPhotoIdCol = k === "photoId"
                              const isNumCol = k === "srNo" || k === "rollNo" || k === "grNo"
                              return (
                                <td key={k} style={{
                                  fontSize: 12,
                                  fontFamily: isPhotoIdCol || isNumCol ? 'monospace' : 'inherit',
                                  fontWeight: (k === "fullName" || k === "name" || k === "studentName") ? 500 : 'normal',
                                  color: !val ? '#cbd5e1' : isPhotoIdCol ? '#6366f1' : '#334155',
                                  maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isNameColumn(k) ? 'normal' : 'nowrap',
                                }}>
                                  {isNameColumn(k) ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                      {displayPhotoUrl && (
                                        <img
                                          key={photoCacheKey}
                                          src={displayPhotoUrl}
                                          alt=""
                                          loading="lazy"
                                          style={{ width: 32, height: 42, borderRadius: 6, objectFit: 'cover', border: '1px solid #e2e8f0', flexShrink: 0 }}
                                        />
                                      )}
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{val || "—"}</span>
                                    </div>
                                  ) : (val || "—")}
                                </td>
                              )
                            })
                          ) : (
                            <>
                              <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 13 }}>{s.serialNumber}</td>
                              <td style={{ fontWeight: 500 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {displayPhotoUrl && (
                                    <img key={photoCacheKey} src={displayPhotoUrl} alt="" loading="lazy" style={{ width: 32, height: 42, borderRadius: 6, objectFit: 'cover', border: '1px solid #e2e8f0' }} />
                                  )}
                                  {studentName}
                                </div>
                              </td>
                            </>
                          )}
                          {!companyMode && <td>{s.class?.name || "—"}</td>}
                          <td>
                            <span className={`status-badge ${
                              s.status === 'APPROVED' ? 'status-approved' :
                              s.status === 'FLAGGED' ? 'status-flagged' :
                              s.status === 'PRINTED' ? 'status-review' :
                              s.status === 'SUBMITTED' ? 'status-submitted' :
                              'status-pending'
                            }`}>{s.status}</span>
                            {!hasPhoto && <div style={{ fontSize: 10, color: '#ef4444', marginTop: 3, fontWeight: 600 }}>⚠ Photo missing</div>}
                            {hasPhoto && s.photoBgStatus !== "PROCESSED" && s.photoBgStatus !== "REPROCESSED" && s.photoBgStatus !== "PLAIN" && (
                              <div style={{ fontSize: 10, color: '#7c3aed', marginTop: 3, fontWeight: 600 }}>AI not run</div>
                            )}
                            {hasPhoto && (
                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, fontWeight: 600 }}>API AI runs: {s.photoAiRunCount || 0}</div>
                            )}
                            {s.flagNote && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>📌 {s.flagNote}</div>}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', borderColor: '#6366f1', color: '#4f46e5' }} onClick={() => setSelectedStudent(s)} title="View & edit">👁</button>
                              <button
                                className="btn btn-outline"
                                style={{ fontSize: 10, padding: '4px 7px', borderColor: '#8b5cf6', color: '#7c3aed', fontWeight: 700, minWidth: 32 }}
                                onClick={() => openBgEditorForStudent(s)}
                                disabled={!hasPhoto}
                                title={hasPhoto ? "AI plain background" : "No photo uploaded yet"}
                              >
                                AI
                              </button>
                              {hasPhoto && (
                                <a
                                  className="btn btn-outline"
                                  href={`/api/media/student-photo/${s.id}?variant=original&download=1`}
                                  style={{ fontSize: 10, padding: '4px 7px', borderColor: '#0ea5e9', color: '#0284c7', fontWeight: 700, minWidth: 32, textDecoration: 'none' }}
                                  title="Download original uploaded photo"
                                >
                                  DL
                                </a>
                              )}
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', borderColor: '#3b82f6', color: '#2563eb' }} onClick={() => openEditStudent(s)} title="Edit student">✏️</button>
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', borderColor: '#22c55e', color: '#16a34a' }} onClick={() => handleStatusUpdate(s.id, "APPROVED")}>✓</button>
                              {s.status === "FLAGGED" ? (
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', borderColor: '#3b82f6', color: '#2563eb' }} onClick={() => handleUnflag(s.id)}>Unflag</button>
                              ) : (
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', borderColor: '#f59e0b', color: '#d97706' }} onClick={() => handleFlag(s.id)}>🚩</button>
                              )}
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', borderColor: '#ef4444', color: '#dc2626' }} onClick={() => handleDeleteStudent(s.id, studentName)} title={`Delete ${companyMode ? "employee" : "student"}`}>🗑</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {students.length === 0 && (
                      <tr><td colSpan={totalCols} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No {companyMode ? "employees" : "students"} found</td></tr>
                    )}
                  </tbody>
                </table>
                )
              })()}
            </div>

            {/* Pagination */}
            {studentTotal > 50 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
                <button className="btn btn-outline" disabled={studentPage <= 1} onClick={() => fetchStudents(studentPage - 1)}>← Previous</button>
                <span style={{ padding: '8px 16px', fontSize: 13, color: '#64748b' }}>Page {studentPage} of {Math.ceil(studentTotal / 50)}</span>
                <button className="btn btn-outline" disabled={studentPage >= Math.ceil(studentTotal / 50)} onClick={() => fetchStudents(studentPage + 1)}>Next →</button>
              </div>
            )}
          </div>

          {/* EDIT / ADD STUDENT MODAL */}
          {editStudentOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => !editSaving && setEditStudentOpen(false)}>
              <div style={{ background: 'white', borderRadius: 20, maxWidth: 560, width: '100%', maxHeight: '92vh', overflow: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white', zIndex: 2 }}>
                  <div>
                    <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
                      {editStudentTarget
                        ? `✏️ Edit ${companyMode ? "Employee" : "Student"}`
                        : `➕ Add New ${companyMode ? "Employee" : "Student"}`}
                    </h2>
                    <p style={{ fontSize: 12, color: '#64748b' }}>{school?.name}</p>
                  </div>
                  <button onClick={() => setEditStudentOpen(false)} disabled={editSaving} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 15 }}>✕</button>
                </div>

                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

                  {/* Class selector */}
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>{companyMode ? (legacyCompanyPortfolio ? "Company" : "Department") : "Class"} <span style={{ color: '#ef4444' }}>*</span></label>
                    <select value={editClassId} onChange={e => setEditClassId(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}>
                      <option value="">— Select {companyMode ? (legacyCompanyPortfolio ? "company" : "department") : "class"} —</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Photo upload */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>Photo</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {editPhotoPreview ? (
                        <img src={editPhotoPreview} alt="Preview" style={{ width: 72, height: 90, objectFit: 'cover', borderRadius: 8, border: '2px solid #e2e8f0', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 72, height: 90, borderRadius: 8, border: '2px dashed #cbd5e1', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        </div>
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#374151' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                            {editPhotoPreview ? 'Change Photo' : 'Upload Photo'}
                            <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => {
                              const f = e.target.files?.[0]
                              if (!f) return
                              pickPhotoForCrop(f, "edit")
                              e.target.value = ""
                            }} />
                          </label>
                          {editPhotoPreview && (
                            <button
                              type="button"
                              onClick={cropEditPhotoPreview}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
                              Crop Photo
                            </button>
                          )}
                        </div>
                        {editPhotoFile && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{editPhotoFile.name}</div>}
                        {editPhotoPreview && !editPhotoFile && editStudentTarget && (
                          <div style={{ fontSize: 11, color: '#22c55e', marginTop: 4 }}>✓ Current photo loaded</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Template fields */}
                  {buildEditStudentFields(templateData).map((field) => (
                    <div key={field.key} className="form-group">
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>
                        {field.label} <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      {field.inputType === "flag" ? (
                        <select
                          value={editFormFields[field.key] || ''}
                          onChange={e => setEditFormFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                          style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
                        >
                          <option value="">— Select {field.label} —</option>
                          {flagColors.map((c: string) => <option key={c} value={c}>{c}</option>)}
                          <option value={editFormFields[field.key] || ''}>{editFormFields[field.key] && !flagColors.includes(editFormFields[field.key]) ? `Custom: ${editFormFields[field.key]}` : ''}</option>
                        </select>
                      ) : field.inputType === "mobile" ? (
                        <>
                          <div style={{
                            display: 'flex', alignItems: 'stretch',
                            border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden',
                            background: '#fff',
                          }}>
                            <span style={{
                              padding: '10px 12px', background: '#f1f5f9',
                              color: '#475569', fontWeight: 700, fontSize: 14,
                              display: 'flex', alignItems: 'center',
                              borderRight: '1px solid #e2e8f0',
                            }} aria-hidden>🇮🇳 +91</span>
                            <input
                              type="tel"
                              inputMode="numeric"
                              pattern="[0-9]{10}"
                              maxLength={10}
                              value={editMobileLocals[field.key] ?? stripIndianPrefix(editFormFields[field.key] || "")}
                              onChange={e => {
                                const onlyDigits = e.target.value.replace(/\D/g, "").slice(0, 10)
                                setEditMobileLocals(prev => ({ ...prev, [field.key]: onlyDigits }))
                                setEditFormFields(prev => ({
                                  ...prev,
                                  [field.key]: onlyDigits ? `+91 ${onlyDigits}` : "",
                                }))
                              }}
                              placeholder="9876543210"
                              style={{ flex: 1, border: 'none', outline: 'none', padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }}
                            />
                          </div>
                          <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                            Type only the 10-digit number — country code is added automatically.
                          </span>
                        </>
                      ) : field.inputType === "address" ? (
                        <>
                          <textarea
                            value={editFormFields[field.key] || ''}
                            onChange={e => setEditFormFields(prev => ({
                              ...prev,
                              [field.key]: normalizeStudentFieldValue(
                                field.key,
                                e.target.value,
                                field.label,
                                field.role,
                              ),
                            }))}
                            rows={3}
                            placeholder="e.g. House No 12, MG Road, Kothrud, Pune, 411038"
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
                          />
                          <span style={{
                            fontSize: 11,
                            marginTop: 4,
                            display: 'block',
                            color: editFieldWordCount(editFormFields[field.key] || "") >= EDIT_ADDRESS_MIN_WORDS ? '#22c55e' : '#94a3b8',
                          }}>
                            {editFieldWordCount(editFormFields[field.key] || "")}/{EDIT_ADDRESS_MIN_WORDS} words minimum
                          </span>
                        </>
                      ) : field.inputType === "textarea" ? (
                        <textarea
                          value={editFormFields[field.key] || ''}
                          onChange={e => setEditFormFields(prev => ({
                            ...prev,
                            [field.key]: normalizeStudentFieldValue(
                              field.key,
                              e.target.value,
                              field.label,
                              field.role,
                            ),
                          }))}
                          rows={3}
                          style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
                        />
                      ) : (
                        <input
                          type={field.inputType === "dob" ? "date" : "text"}
                          value={editFormFields[field.key] || ''}
                          onChange={e => setEditFormFields(prev => ({
                            ...prev,
                            [field.key]: normalizeStudentFieldValue(
                              field.key,
                              e.target.value,
                              field.label,
                              field.role,
                            ),
                          }))}
                          placeholder={`Enter ${field.label}`}
                          style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                        />
                      )}
                    </div>
                  ))}

                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: 'white' }}>
                  <button className="btn btn-outline" onClick={() => setEditStudentOpen(false)} disabled={editSaving} style={{ padding: '10px 20px', fontSize: 14 }}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSaveStudent} disabled={editSaving || !editClassId} style={{ padding: '10px 24px', fontSize: 14, fontWeight: 700, minWidth: 120 }}>
                    {editSaving ? (editStudentTarget ? 'Saving…' : 'Adding…') : (editStudentTarget ? '💾 Save Changes' : `➕ Add ${companyMode ? "Employee" : "Student"}`)}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* IMPORT MODAL */}
          {importOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={resetImport}>
              <div style={{ background: 'white', borderRadius: 20, maxWidth: 720, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                      {importStep === 'upload' ? `📊 Bulk Import ${companyMode ? "Employees" : "Students"}` : importStep === 'preview' ? '🔍 Preview & Validate' : '✅ Import Complete'}
                    </h2>
                    <p style={{ fontSize: 13, color: '#64748b' }}>
                      {importStep === 'upload' ? 'Upload an Excel or CSV file with student data' : importStep === 'preview' ? 'Review the data before importing' : 'Import results'}
                    </p>
                  </div>
                  <button onClick={resetImport} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 24 }}>
                  {/* STEP 1: UPLOAD */}
                  {importStep === 'upload' && (
                    <div>
                      {/* File upload zone */}
                      <div
                        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setImportFile(f) }}
                        style={{
                          border: `2px dashed ${dragOver ? '#3b82f6' : importFile ? '#22c55e' : '#e2e8f0'}`,
                          borderRadius: 16, padding: 40, textAlign: 'center', cursor: 'pointer',
                          background: dragOver ? '#eff6ff' : importFile ? '#f0fdf4' : '#fafafa',
                          transition: 'all 0.2s',
                        }}
                        onClick={() => document.getElementById('import-file-input')?.click()}
                      >
                        <input
                          id="import-file-input"
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) setImportFile(f) }}
                        />
                        {importFile ? (
                          <>
                            <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#16a34a', marginBottom: 4 }}>{importFile.name}</div>
                            <div style={{ fontSize: 13, color: '#64748b' }}>{(importFile.size / 1024).toFixed(1)} KB — Click to change</div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Drop your Excel/CSV file here</div>
                            <div style={{ fontSize: 13, color: '#94a3b8' }}>or click to browse • .xlsx, .xls, .csv supported • Max 10MB</div>
                          </>
                        )}
                      </div>

                      {/* Fallback class selector (optional) */}
                      <div style={{ marginTop: 16, padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Fallback {companyMode ? (legacyCompanyPortfolio ? "Company" : "Department") : "Class"} (optional)</label>
                        <select value={importClassId} onChange={e => setImportClassId(e.target.value)} style={{ width: '100%', height: 40, padding: '0 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
                          <option value="">Auto-detect from Excel column</option>
                          {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c._count.students} {companyMode ? "employees" : "students"})</option>)}
                        </select>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                          {companyMode
                            ? `Select the ${legacyCompanyPortfolio ? "company" : "department"} these employees belong to. Company information from Excel remains employee data.`
                            : 'If your Excel has a "Class-Section" column, classes are created automatically. Otherwise select a fallback class here.'}
                        </div>
                      </div>

                      {/* Info box */}
                      <div style={{ marginTop: 16, padding: 14, background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: 13, color: '#1e40af', fontWeight: 600, marginBottom: 4 }}>💡 Smart Import</div>
                        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#3b82f6', lineHeight: 1.8 }}>
                          <li>{companyMode
                            ? <><strong>Duplicate-safe:</strong> Employee/ID Code is used to skip records already imported</>
                            : <><strong>Mixed classes supported!</strong> Include a "Class-Section" column — classes are auto-created</>}</li>
                          <li><strong>Photo ID column</strong> — if present, used to match bulk photos later</li>
                          <li>{companyMode ? 'Employee columns such as "Employee Name", "Employee ID", contact numbers, designation, and office address are matched automatically.' : 'Column headers are matched automatically: "Student Name", "Father", "Mother", "Photo ID", etc.'}</li>
                          <li>Only <strong>{companyMode ? "Employee Name" : "Student Name"}</strong> is required — all other fields are optional</li>
                          <li>Max 2000 students per import</li>
                        </ul>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline" onClick={resetImport}>Cancel</button>
                        <button
                          className="btn btn-primary"
                          onClick={handleImportValidate}
                          disabled={!importFile || importUploading}
                          style={{ padding: '10px 24px' }}
                        >
                          {importUploading ? 'Validating...' : 'Validate & Preview →'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: PREVIEW */}
                  {importStep === 'preview' && importPreview && (
                    <div>
                      {/* Stats cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${importPreview.duplicateRows > 0 ? 4 : 3}, 1fr)`, gap: 12, marginBottom: 20 }}>
                        <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', textAlign: 'center' }}>
                          <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{importPreview.validRows}</div>
                          <div style={{ fontSize: 12, color: '#15803d' }}>Valid Rows</div>
                        </div>
                        <div style={{ padding: 16, background: importPreview.errorRows > 0 ? '#fef2f2' : '#f8fafc', borderRadius: 12, border: `1px solid ${importPreview.errorRows > 0 ? '#fecaca' : '#e2e8f0'}`, textAlign: 'center' }}>
                          <div style={{ fontSize: 24, fontWeight: 700, color: importPreview.errorRows > 0 ? '#dc2626' : '#64748b' }}>{importPreview.errorRows}</div>
                          <div style={{ fontSize: 12, color: importPreview.errorRows > 0 ? '#b91c1c' : '#64748b' }}>Errors</div>
                        </div>
                        <div style={{ padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                          <div style={{ fontSize: 24, fontWeight: 700, color: '#334155' }}>{importPreview.totalRows}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>Total Rows</div>
                        </div>
                        {importPreview.duplicateRows > 0 && (
                          <div style={{ padding: 16, background: '#fff7ed', borderRadius: 12, border: '1px solid #fed7aa', textAlign: 'center' }}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: '#c2410c' }}>{importPreview.duplicateRows}</div>
                            <div style={{ fontSize: 12, color: '#9a3412' }}>Already Imported</div>
                          </div>
                        )}
                      </div>

                      {/* Column Mapping */}
                      <div style={{ marginBottom: 20 }}>
                        <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>📋 Column Mapping</h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {importPreview.mappedColumns?.map((c: any, i: number) => (
                            <span key={i} style={{ padding: '4px 10px', background: '#eff6ff', borderRadius: 6, fontSize: 12, color: '#2563eb', border: '1px solid #bfdbfe' }}>
                              {c.excelColumn} → {c.label}
                            </span>
                          ))}
                        </div>
                        {importPreview.unmappedColumns?.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>Ignored columns: </span>
                            {importPreview.unmappedColumns.map((c: string, i: number) => (
                              <span key={i} style={{ padding: '2px 8px', background: '#f1f5f9', borderRadius: 4, fontSize: 11, color: '#64748b', marginRight: 4 }}>{c}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Data preview table */}
                      {importPreview.preview?.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>👀 Data Preview (first {importPreview.preview.length} rows)</h4>
                          <div className="data-table-wrapper" style={{ overflowX: 'auto', maxHeight: 240 }}>
                            <table className="data-table" style={{ fontSize: 12 }}>
                              <thead>
                                <tr>
                                  <th>Row</th>
                                  {importPreview.mappedColumns?.map((c: any) => <th key={c.mappedTo}>{c.label}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {importPreview.preview.map((row: any, i: number) => (
                                  <tr key={i}>
                                    <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{row._rowNum}</td>
                                    {importPreview.mappedColumns?.map((c: any) => (
                                      <td key={c.mappedTo} style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {row[c.mappedTo] || <span style={{ color: '#cbd5e1' }}>—</span>}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Errors */}
                      {importPreview.errors?.length > 0 && (
                        <div style={{ marginBottom: 20, padding: 14, background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>⚠️ Validation Errors ({importPreview.errorRows} rows)</h4>
                          <div style={{ maxHeight: 160, overflow: 'auto' }}>
                            {importPreview.errors.map((e: any, i: number) => (
                              <div key={i} style={{ fontSize: 12, color: '#b91c1c', padding: '3px 0' }}>
                                Row {e.row}: <strong>{e.field}</strong> — {e.message}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline" onClick={() => { setImportStep('upload'); setImportPreview(null) }}>← Back</button>
                        <button
                          className="btn btn-primary"
                          onClick={handleImportConfirm}
                          disabled={importPreview.validRows === 0 || importUploading}
                          style={{ padding: '10px 24px', background: importPreview.validRows > 0 ? 'linear-gradient(135deg, #22c55e, #16a34a)' : '#94a3b8' }}
                        >
                          {importUploading ? 'Importing...' : `Import ${importPreview.validRows} ${companyMode ? "Employees" : "Students"} ✓`}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 3: RESULT */}
                  {importStep === 'result' && importResult && (
                    <div>
                      <div style={{ textAlign: 'center', padding: 20 }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                        <h3 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                          {importResult.imported} {companyMode ? "Employees" : "Students"} Imported!
                        </h3>
                        {importResult.classesCreated > 0 && (
                          <p style={{ fontSize: 14, color: '#3b82f6', marginBottom: 4 }}>📚 {importResult.classesCreated} {companyMode ? "departments" : "classes"} auto-created</p>
                        )}
                        {importResult.failed > 0 && (
                          <p style={{ fontSize: 14, color: '#dc2626' }}>{importResult.failed} rows failed</p>
                        )}
                        {importResult.skippedDuplicates > 0 && (
                          <p style={{ fontSize: 14, color: '#c2410c' }}>{importResult.skippedDuplicates} duplicate rows skipped</p>
                        )}
                      </div>

                      {/* Show first few imported students */}
                      {importResult.students?.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Imported {companyMode ? "Employees" : "Students"}</h4>
                          <div className="data-table-wrapper" style={{ maxHeight: 240, overflowY: 'auto' }}>
                            <table className="data-table" style={{ fontSize: 12 }}>
                              <thead><tr><th>Serial Number</th><th>Name</th></tr></thead>
                              <tbody>
                                {importResult.students.map((s: any) => (
                                  <tr key={s.id}>
                                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.serialNumber}</td>
                                    <td>{s.name}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Errors */}
                      {importResult.errors?.length > 0 && (
                        <div style={{ marginTop: 16, padding: 12, background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>Failed Rows</h4>
                          {importResult.errors.map((e: any, i: number) => (
                            <div key={i} style={{ fontSize: 12, color: '#b91c1c' }}>Row {e.row}: {e.error}</div>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                        <button className="btn btn-primary" onClick={resetImport} style={{ padding: '10px 28px' }}>Done ✓</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* INFORMATION-ONLY EXCEL UPDATE MODAL */}
          {infoUpdateOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={() => { if (!infoUpdateUploading) resetInfoUpdate() }}>
              <div style={{ background: 'white', borderRadius: 20, maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Update Info Excel</h2>
                    <p style={{ fontSize: 13, color: '#64748b' }}>Update existing student information by Serial Number. Photos are preserved.</p>
                  </div>
                  {!infoUpdateUploading && <button onClick={resetInfoUpdate} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 16 }}>✕</button>}
                </div>

                <div style={{ padding: 24 }}>
                  {!infoUpdateResult ? (
                    <>
                      <div style={{ padding: 12, background: '#ecfdf5', border: '1px solid #86efac', borderRadius: 12, color: '#166534', fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
                        <strong>Safe update:</strong> This will update names, DOB, blood group, mobile, address, class grade, status, and search data for matching serial numbers. It will not use photo columns and will not replace existing photos.
                      </div>

                      <div
                        onClick={() => document.getElementById('info-update-excel-input')?.click()}
                        onDragOver={(e) => { e.preventDefault(); setInfoUpdateDragOver(true) }}
                        onDragLeave={() => setInfoUpdateDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault()
                          setInfoUpdateDragOver(false)
                          const file = e.dataTransfer.files?.[0]
                          if (file) setInfoUpdateFile(file)
                        }}
                        style={{
                          border: `2px dashed ${infoUpdateFile ? '#22c55e' : infoUpdateDragOver ? '#14b8a6' : '#cbd5e1'}`,
                          borderRadius: 16,
                          padding: 28,
                          textAlign: 'center',
                          cursor: infoUpdateUploading ? 'not-allowed' : 'pointer',
                          background: infoUpdateFile ? '#f0fdf4' : '#f8fafc',
                          marginBottom: 16,
                        }}
                      >
                        <input
                          id="info-update-excel-input"
                          type="file"
                          accept=".xlsx,.xls"
                          style={{ display: 'none' }}
                          disabled={infoUpdateUploading}
                          onChange={(e) => setInfoUpdateFile(e.target.files?.[0] || null)}
                        />
                        <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                        <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                          {infoUpdateFile ? infoUpdateFile.name : 'Choose Excel file'}
                        </div>
                        <p style={{ fontSize: 12, color: '#64748b' }}>Must include Serial Number column. Photo File / Photo URL columns are ignored.</p>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button className="btn btn-outline" onClick={resetInfoUpdate} disabled={infoUpdateUploading}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleInfoUpdateExcel} disabled={!infoUpdateFile || infoUpdateUploading} style={{ minWidth: 170 }}>
                          {infoUpdateUploading ? 'Updating...' : 'Update Information'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div>
                      <div style={{ padding: 16, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, marginBottom: 16 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#166534', marginBottom: 8 }}>Information update complete</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 13 }}>
                          <div><strong>{infoUpdateResult.totalRows}</strong><br /><span style={{ color: '#64748b' }}>Excel rows</span></div>
                          <div><strong>{infoUpdateResult.updated}</strong><br /><span style={{ color: '#64748b' }}>Updated</span></div>
                          <div><strong>{infoUpdateResult.unmatched}</strong><br /><span style={{ color: '#64748b' }}>Unmatched</span></div>
                        </div>
                        <p style={{ fontSize: 12, color: '#166534', marginTop: 10 }}>Photos preserved: {infoUpdateResult.photosPreserved ? 'Yes' : 'No'}</p>
                      </div>

                      {infoUpdateResult.unmatchedRows?.length > 0 && (
                        <div style={{ padding: 12, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, marginBottom: 16 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#9a3412', marginBottom: 8 }}>Unmatched serial numbers</h4>
                          <div style={{ maxHeight: 160, overflow: 'auto', fontSize: 12, color: '#9a3412' }}>
                            {infoUpdateResult.unmatchedRows.map((row: any, i: number) => (
                              <div key={i}>Row {row.row}: {row.serialNumber || '(missing serial number)'}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-primary" onClick={resetInfoUpdate} style={{ padding: '10px 28px' }}>Done ✓</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* BULK PHOTO UPLOAD MODAL */}
          {photoUploadOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={() => { if (!photoUploading) resetPhotoUpload() }}>
              <div style={{ background: 'white', borderRadius: 20, maxWidth: 700, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                      {photoUploadMode === "replace" ? "Reupload All Photos" : "📸 Bulk Upload Photos"}
                    </h2>
                    <p style={{ fontSize: 13, color: '#64748b' }}>
                      {photoResult
                        ? 'Upload results'
                        : photoUploading
                          ? 'Uploading photos...'
                          : photoUploadMode === "replace"
                            ? `Upload the edited photo folder again - filenames are matched strictly by ${companyMode ? "employee" : "student"} name and existing photos are replaced`
                            : companyMode
                              ? 'Upload company photos - matched only by Employee Code, Serial Number, or exact employee name'
                              : 'Upload a folder of student photos - auto-matched by Photo ID from Excel'}
                    </p>
                  </div>
                  {!photoUploading && <button onClick={resetPhotoUpload} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 16 }}>✕</button>}
                </div>

                <div style={{ padding: 24 }}>
                  {/* UPLOADING STATE — Progress Bar */}
                  {photoUploading && !photoResult && (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                      <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{photoUploadStatus}</h3>
                      <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                        <div style={{
                          width: `${photoUploadProgress}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #8b5cf6, #3b82f6)',
                          borderRadius: 4,
                          transition: 'width 0.4s ease',
                        }} />
                      </div>
                      <p style={{ fontSize: 13, color: '#64748b' }}>{photoUploadProgress}% — {photoFiles.length} photos being processed</p>
                      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Please don't close this window. Large folders may take a few minutes.</p>
                    </div>
                  )}

                  {/* UPLOAD FORM */}
                  {!photoResult && !photoUploading && (
                    <div>
                      {/* Two upload options: Folder (primary) or Individual Files */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                        {/* SELECT FOLDER — Primary option */}
                        <div
                          onClick={() => document.getElementById('bulk-photo-folder-input')?.click()}
                          style={{
                            border: `2px dashed ${photoFiles.length > 0 ? '#22c55e' : '#8b5cf6'}`,
                            borderRadius: 16, padding: 28, textAlign: 'center', cursor: 'pointer',
                            background: photoFiles.length > 0 ? '#f0fdf4' : '#f5f3ff',
                            transition: 'all 0.2s',
                          }}
                        >
                          <input
                            id="bulk-photo-folder-input"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            {...({ webkitdirectory: 'true', directory: '' } as any)}
                            style={{ display: 'none' }}
                            onChange={handleFolderSelect}
                          />
                          {photoFiles.length > 0 ? (
                            <>
                              <div style={{ fontSize: 32, marginBottom: 6 }}>✅</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>{photoFiles.length} photos ready</div>
                              <div style={{ fontSize: 12, color: '#64748b' }}>Click to change folder</div>
                            </>
                          ) : (
                            <>
                              <div style={{ fontSize: 32, marginBottom: 6 }}>📁</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: '#5b21b6', marginBottom: 4 }}>Select Folder</div>
                              <div style={{ fontSize: 12, color: '#7c3aed' }}>Pick the entire photos folder</div>
                            </>
                          )}
                        </div>

                        {/* DROP/SELECT INDIVIDUAL FILES — Secondary option */}
                        <div
                          onDragOver={e => { e.preventDefault(); setPhotoDragOver(true) }}
                          onDragLeave={() => setPhotoDragOver(false)}
                          onDrop={e => {
                            e.preventDefault()
                            setPhotoDragOver(false)
                            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
                            if (files.length > 0) {
                              setPhotoFiles(prev => [...prev, ...files])
                              toast.success(`${files.length} photos added!`)
                            }
                          }}
                          onClick={() => document.getElementById('bulk-photo-input')?.click()}
                          style={{
                            border: `2px dashed ${photoDragOver ? '#3b82f6' : '#e2e8f0'}`,
                            borderRadius: 16, padding: 28, textAlign: 'center', cursor: 'pointer',
                            background: photoDragOver ? '#eff6ff' : '#fafafa',
                            transition: 'all 0.2s',
                          }}
                        >
                          <input
                            id="bulk-photo-input"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            style={{ display: 'none' }}
                            onChange={e => {
                              const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
                              if (files.length > 0) {
                                setPhotoFiles(prev => [...prev, ...files])
                                toast.success(`${files.length} photos added!`)
                              }
                            }}
                          />
                          <div style={{ fontSize: 32, marginBottom: 6 }}>📷</div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Select Files</div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>Or drag & drop photos here</div>
                        </div>
                      </div>

                      {/* File list preview */}
                      {photoFiles.length > 0 && (
                        <div style={{ marginTop: 8, maxHeight: 180, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>📄 {photoFiles.length} Photos Selected — {(photoFiles.reduce((a, f) => a + f.size, 0) / (1024 * 1024)).toFixed(1)} MB total</span>
                            <button onClick={() => setPhotoFiles([])} style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear All</button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 4 }}>
                            {photoFiles.slice(0, 30).map((f, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: '#f8fafc', borderRadius: 6, fontSize: 11 }}>
                                <span style={{ color: '#3b82f6', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name.replace(/\.[^.]+$/, '')}</span>
                                <span style={{ color: '#cbd5e1', flexShrink: 0, fontSize: 10 }}>.{f.name.split('.').pop()}</span>
                              </div>
                            ))}
                            {photoFiles.length > 30 && <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: 4, gridColumn: '1/-1' }}>...and {photoFiles.length - 30} more</div>}
                          </div>
                        </div>
                      )}

                      {/* Photo ID matching guide */}
                      <div style={{ marginTop: 16, padding: 14, background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: 13, color: '#1e40af', fontWeight: 600, marginBottom: 6 }}>
                          {photoUploadMode === "replace" ? "How Reupload Matching Works" : "🔗 How Photo Matching Works"}
                        </div>
                        {photoUploadMode === "replace" ? (
                          <div style={{ fontSize: 12, color: '#2563eb', lineHeight: 1.8 }}>
                            Each filename must match the student name exactly after ignoring case, punctuation, and extra spaces. Example: <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>Mohammad Owais Sajid Hussain.jpg</code> replaces that student's current photo. Duplicate student names are reported as errors so the system does not guess.
                          </div>
                        ) : companyMode ? (
                          <>
                            <div style={{ fontSize: 12, color: '#2563eb', lineHeight: 1.8 }}>
                              Company photos are matched conservatively. Office/contact numbers are never used for matching, so Office No will not be touched.
                            </div>
                            <ol style={{ margin: '6px 0 0 0', paddingLeft: 20, fontSize: 12, color: '#3b82f6', lineHeight: 2 }}>
                              <li><strong>Employee Code / ID Code</strong> - e.g. <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>LPT047.jpg</code></li>
                              <li><strong>Serial Number</strong> - e.g. <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>LPT-0047.jpg</code></li>
                              <li><strong>Exact employee name</strong> - e.g. <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>Sahil Rana.png</code></li>
                            </ol>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: 12, color: '#2563eb', lineHeight: 1.8 }}>
                              Photos are matched to students automatically. The filename (without extension) is matched in this <strong>priority order</strong>:
                            </div>
                            <ol style={{ margin: '6px 0 0 0', paddingLeft: 20, fontSize: 12, color: '#3b82f6', lineHeight: 2 }}>
                              <li><strong>Photo ID</strong> column from Excel — e.g. <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>BB25035.jpg</code> matches Photo ID <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>BB25035</code></li>
                              <li><strong>Serial Number</strong> — e.g. <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>AARYAN-0078.jpg</code></li>
                              <li><strong>Roll No.</strong> — e.g. <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>23.jpg</code></li>
                              <li><strong>Full Name</strong> — e.g. <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>Aarav Sharma.png</code></li>
                            </ol>
                          </>
                        )}
                      </div>

                      {/* Tip for Photo ID */}
                      {photoUploadMode === "bulk" && (
                      <div style={{ marginTop: 10, padding: 12, background: '#fefce8', borderRadius: 10, border: '1px solid #fde68a' }}>
                        <div style={{ fontSize: 12, color: '#92400e' }}>
                          {companyMode ? (
                            <>Tip: Name files with Employee Code like <strong>LPT047.jpg</strong> or exact employee name. Office No/contact numbers are ignored for safety.</>
                          ) : (
                            <>💡 <strong>Tip:</strong> If your Excel has a &quot;<strong>Photo ID</strong>&quot; column (e.g. BB25035, DSC_8541), simply keep your photo filenames as-is — the system will match them automatically!</>
                          )}
                        </div>
                      </div>
                      )}

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline" onClick={resetPhotoUpload}>Cancel</button>
                        <button
                          className="btn btn-primary"
                          onClick={handleBulkPhotoUpload}
                          disabled={photoFiles.length === 0 || photoUploading}
                          style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
                        >
                          {photoUploadMode === "replace"
                            ? `Replace ${photoFiles.length} Photos`
                            : `Upload & Match ${photoFiles.length} Photos`}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* RESULTS */}
                  {photoResult && !photoUploading && (
                    <div>
                      <div style={{ textAlign: 'center', marginBottom: 20 }}>
                        <div style={{ fontSize: 48, marginBottom: 8 }}>{photoResult.matched > 0 ? '🎉' : '⚠️'}</div>
                        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                          {photoResult.matched} of {photoResult.total} Photos {photoUploadMode === "replace" ? "Replaced" : "Matched"}!
                        </h3>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                        <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', textAlign: 'center' }}>
                          <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{photoResult.matched}</div>
                          <div style={{ fontSize: 12, color: '#15803d' }}>Matched</div>
                        </div>
                        <div style={{ padding: 16, background: photoResult.unmatched > 0 ? '#fffbeb' : '#f8fafc', borderRadius: 12, border: `1px solid ${photoResult.unmatched > 0 ? '#fed7aa' : '#e2e8f0'}`, textAlign: 'center' }}>
                          <div style={{ fontSize: 28, fontWeight: 700, color: photoResult.unmatched > 0 ? '#d97706' : '#64748b' }}>{photoResult.unmatched}</div>
                          <div style={{ fontSize: 12, color: photoResult.unmatched > 0 ? '#b45309' : '#64748b' }}>No Match</div>
                        </div>
                        <div style={{ padding: 16, background: photoResult.errors > 0 ? '#fef2f2' : '#f8fafc', borderRadius: 12, border: `1px solid ${photoResult.errors > 0 ? '#fecaca' : '#e2e8f0'}`, textAlign: 'center' }}>
                          <div style={{ fontSize: 28, fontWeight: 700, color: photoResult.errors > 0 ? '#dc2626' : '#64748b' }}>{photoResult.errors}</div>
                          <div style={{ fontSize: 12, color: photoResult.errors > 0 ? '#b91c1c' : '#64748b' }}>Errors</div>
                        </div>
                      </div>

                      {/* Matched details */}
                      {photoResult.matchedFiles?.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', marginBottom: 8 }}>✅ Matched Photos ({photoResult.matched})</h4>
                          <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#f0fdf4', position: 'sticky', top: 0 }}>
                                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#15803d' }}>Photo File</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#15803d' }}>Student</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#15803d' }}>Serial No.</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#15803d' }}>Matched By</th>
                                </tr>
                              </thead>
                              <tbody>
                                {photoResult.matchedFiles.map((m: any, i: number) => (
                                  <tr key={i} style={{ borderBottom: '1px solid #dcfce7' }}>
                                    <td style={{ padding: '5px 10px', color: '#334155', fontFamily: 'monospace' }}>{m.filename}</td>
                                    <td style={{ padding: '5px 10px', color: '#16a34a', fontWeight: 600 }}>{m.studentName}</td>
                                    <td style={{ padding: '5px 10px', color: '#64748b', fontFamily: 'monospace' }}>{m.serialNumber}</td>
                                    <td style={{ padding: '5px 10px' }}><span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{m.matchedBy}</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Unmatched — Manual Matching UI */}
                      {photoResult.unmatchedFiles?.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>⚠️ Unmatched Photos ({photoResult.unmatchedFiles.length}) — Assign Manually</h4>
                            <input
                              type="text"
                              placeholder="🔍 Search students..."
                              value={manualSearchQuery}
                              onChange={e => setManualSearchQuery(e.target.value)}
                              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, width: 180, outline: 'none' }}
                            />
                          </div>
                          <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #fed7aa', borderRadius: 10, background: '#fffbeb' }}>
                            {photoResult.unmatchedFiles.map((filename: string, idx: number) => {
                              const thumbUrl = unmatchedThumbUrls[filename] || ''
                              // Always cap to 50 visible options. Without the cap, an unmatched
                              // batch of 50 photos × an `allStudentsList` of 2000 students would
                              // render 100,000 <option> nodes — a confirmed browser-killer.
                              const filteredStudents = (manualSearchQuery
                                ? allStudentsList.filter((s: any) => {
                                    const fd = s.formData as Record<string, string>
                                    const name = (fd?.fullName || fd?.["Full Name"] || fd?.["Student Name"] || fd?.name || '').toLowerCase()
                                    const serial = s.serialNumber.toLowerCase()
                                    const q = manualSearchQuery.toLowerCase()
                                    return name.includes(q) || serial.includes(q)
                                  })
                                : allStudentsList
                              ).slice(0, 50)

                              return (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: idx < photoResult.unmatchedFiles.length - 1 ? '1px solid #fde68a' : 'none' }}>
                                  {/* Photo thumbnail */}
                                  {thumbUrl && (
                                    <img
                                      src={thumbUrl}
                                      alt={filename}
                                      style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', border: '1px solid #fbbf24', flexShrink: 0 }}
                                    />
                                  )}
                                  {/* Filename */}
                                  <div style={{ flex: '0 0 120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e', fontFamily: 'monospace' }}>{filename.replace(/\.[^.]+$/, '')}</span>
                                    <span style={{ fontSize: 10, color: '#b45309' }}>.{filename.split('.').pop()}</span>
                                  </div>
                                  {/* Student dropdown */}
                                  <select
                                    id={`assign-${idx}`}
                                    style={{
                                      flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0',
                                      fontSize: 12, background: 'white', outline: 'none', minWidth: 0,
                                    }}
                                    defaultValue=""
                                  >
                                    <option value="">Select student...</option>
                                    {filteredStudents.map((s: any) => {
                                      const fd = s.formData as Record<string, string>
                                      const name = fd?.fullName || fd?.["Full Name"] || fd?.["Student Name"] || fd?.name || 'Unknown'
                                      return (
                                        <option key={s.id} value={s.id}>{name} ({s.serialNumber})</option>
                                      )
                                    })}
                                  </select>
                                  {/* Assign button */}
                                  <button
                                    onClick={() => {
                                      const select = document.getElementById(`assign-${idx}`) as HTMLSelectElement
                                      if (select?.value) handleManualAssign(filename, select.value)
                                      else toast.error('Please select a student first')
                                    }}
                                    disabled={manualAssigning === filename}
                                    style={{
                                      padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600,
                                      background: manualAssigning === filename ? '#94a3b8' : '#16a34a', color: 'white',
                                      cursor: manualAssigning === filename ? 'wait' : 'pointer', flexShrink: 0,
                                    }}
                                  >
                                    {manualAssigning === filename ? '...' : 'Assign'}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>Select a student from the dropdown and click "Assign" to manually match each photo.</p>
                        </div>
                      )}

                      {/* Errors */}
                      {photoResult.errorFiles?.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>❌ Upload Errors</h4>
                          <div style={{ maxHeight: 100, overflow: 'auto', padding: '8px 12px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
                            {photoResult.errorFiles.map((e: any, i: number) => (
                              <div key={i} style={{ fontSize: 12, color: '#b91c1c', padding: '2px 0' }}>{e.filename}: {e.error}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                        {photoResult.unmatched > 0 && (
                          <button className="btn btn-outline" onClick={() => { setPhotoResult(null); setPhotoFiles([]); setPhotoUploadProgress(0) }} style={{ borderColor: '#8b5cf6', color: '#7c3aed' }}>Upload More Photos</button>
                        )}
                        <button className="btn btn-primary" onClick={resetPhotoUpload} style={{ padding: '10px 28px' }}>Done ✓</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* REPROCESS SKIPPED PHOTOS MODAL */}
          {reprocessOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={() => setReprocessOpen(false)}>
              <div style={{ background: 'white', borderRadius: 20, maxWidth: 560, width: '100%', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                      Process {companyMode ? "Department" : "Class"} Photos - AI Background
                    </h2>
                    <p style={{ fontSize: 13, color: '#64748b' }}>
                      {selectedBatchClassLabel}: remove backgrounds, apply the selected plain colour, and automatically save each processed photo.
                    </p>
                  </div>
                  <button onClick={() => setReprocessOpen(false)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>
                <div style={{ padding: 24 }}>
                  {reprocessLoading ? (
                    <div style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>Loading…</div>
                  ) : reprocessInfo ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                        <div style={{ padding: 16, background: '#eef2ff', borderRadius: 12, textAlign: 'center' }}>
                          <div style={{ fontSize: 28, fontWeight: 700, color: '#4f46e5' }}>{reprocessInfo.skippedCount}</div>
                          <div style={{ fontSize: 12, color: '#6366f1' }}>
                            Photos in {selectedBatchClassLabel}
                          </div>
                        </div>
                        <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 12, textAlign: 'center' }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a' }}>
                            Local AI ready
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Runs on this PC · ISNet model</div>
                        </div>
                      </div>
                      <ManufacturerBgBatchProcessor
                        schoolId={schoolId}
                        students={reprocessInfo.students}
                        bgColor={reprocessBgColor}
                        onBgColorChange={setReprocessBgColor}
                        onBgColorCommit={persistPhotoBgColor}
                        onPhotoSaved={updateStudentPhotoInState}
                        onComplete={handleBatchBgComplete}
                        onClose={() => setReprocessOpen(false)}
                      />
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Could not load reprocess info.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* FLAG UPLOAD MODAL */}
          {flagUploadOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={() => setFlagUploadOpen(false)}>
              <div style={{ background: 'white', borderRadius: 20, maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>🏴 Manage Houses & Flags</h2>
                    <p style={{ fontSize: 13, color: '#64748b' }}>Add any number of houses and upload the matching image for the ID-card flag placeholder.</p>
                  </div>
                  <button onClick={() => setFlagUploadOpen(false)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 24 }}>
                  {/* Bulk Upload Section — always visible */}
                  <div style={{ marginBottom: 20, padding: 16, background: '#eff6ff', borderRadius: 14, border: '1.5px solid #bfdbfe' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', marginBottom: 10 }}>Add House</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) minmax(180px, 1fr) auto', gap: 10, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={newHouseName}
                        onChange={event => setNewHouseName(event.target.value)}
                        placeholder="e.g. Red House"
                        style={{ height: 42, padding: '0 12px', border: '1.5px solid #bfdbfe', borderRadius: 9, fontSize: 13 }}
                      />
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
                        onChange={event => setNewHouseFile(event.target.files?.[0] || null)}
                        style={{ fontSize: 12 }}
                      />
                      <button
                        className="btn btn-primary"
                        onClick={handleAddHouse}
                        disabled={addingHouse || !newHouseName.trim() || !newHouseFile}
                        style={{ minHeight: 42, padding: '8px 18px', whiteSpace: 'nowrap' }}
                      >
                        {addingHouse ? "Adding..." : "Add House"}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                      This name becomes a required option in the public House dropdown.
                    </div>
                  </div>

                  <div style={{ marginBottom: 20, padding: 16, background: '#fefce8', borderRadius: 14, border: '1.5px solid #fde68a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <span style={{ fontSize: 24 }}>📁</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e' }}>Upload Flag Images by Filename</div>
                        <div style={{ fontSize: 12, color: '#a16207' }}>
                          Each file's name (without extension) becomes the house/color name. Example: <strong>Yellow.png</strong> → Yellow house, <strong>Blue.jpg</strong> → Blue house. When students are imported with a matching <strong>House</strong> column, the correct flag is placed automatically on each ID card.
                        </div>
                      </div>
                    </div>
                    <input
                      id="bulk-flag-input"
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
                      style={{ display: 'none' }}
                      onChange={e => {
                        if (e.target.files && e.target.files.length > 0) handleBulkFlagUpload(e.target.files)
                        e.target.value = ''
                      }}
                    />
                    <button
                      className="btn btn-outline"
                      onClick={() => document.getElementById('bulk-flag-input')?.click()}
                      disabled={!!flagUploading}
                      style={{ fontSize: 13, padding: '10px 20px', borderColor: '#f59e0b', color: '#d97706', fontWeight: 600, width: '100%' }}
                    >
                      📷 Select Flag Images (color = filename)
                    </button>
                    {flagColors.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: 11, color: '#78716c', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <span>Expected filenames:</span>
                        {flagColors.map(c => <span key={c} style={{ background: '#fff', padding: '2px 8px', borderRadius: 4, border: '1px solid #e5e7eb', fontWeight: 600 }}>{c}.png</span>)}
                      </div>
                    )}
                  </div>

                  {flagColors.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
                      <div style={{ fontSize: 40, marginBottom: 8 }}>🏳️</div>
                      <p style={{ fontSize: 13, marginBottom: 6, color: '#475569', fontWeight: 600 }}>No flag images uploaded yet</p>
                      <p style={{ fontSize: 12, color: '#64748b', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
                        Use the upload box above to add flag images now (named by house/color), <strong>or</strong> import students with a <strong>"House"</strong> / <strong>"Flag Color"</strong> column first to auto-detect colors.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Individual Flag Assignment ({flagColors.filter(c => flagImages[c]).length}/{flagColors.length} uploaded)
                      </div>
                      {flagColors.map(color => {
                        const hasImage = !!flagImages[color]
                        return (
                          <div key={color} style={{
                            display: 'flex', alignItems: 'center', gap: 16, padding: 14,
                            background: hasImage ? '#f0fdf4' : '#fff',
                            border: `1.5px solid ${hasImage ? '#bbf7d0' : '#e2e8f0'}`,
                            borderRadius: 12,
                          }}>
                            {/* Color swatch */}
                            <div style={{
                              width: 44, height: 44, borderRadius: 10,
                              background: color.toLowerCase(),
                              border: '2px solid rgba(0,0,0,0.1)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 18, flexShrink: 0,
                            }}>
                              {hasImage ? '✓' : '🏴'}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', textTransform: 'capitalize', marginBottom: 2 }}>
                                {color}
                              </div>
                              {hasImage ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <img src={flagImages[color]} alt={`${color} flag`} style={{ width: 48, height: 32, objectFit: 'contain', borderRadius: 4, border: '1px solid #e2e8f0' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                  <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ Matched</span>
                                </div>
                              ) : (
                                <span style={{ fontSize: 11, color: '#d97706' }}>⚠ No flag image — upload or bulk-match</span>
                              )}
                            </div>
                            {/* Individual upload button */}
                            <div>
                              <input
                                id={`flag-input-${color}`}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
                                style={{ display: 'none' }}
                                onChange={e => {
                                  const f = e.target.files?.[0]
                                  if (f) handleFlagUpload(color, f)
                                  e.target.value = ''
                                }}
                              />
                              <button
                                className="btn btn-outline"
                                onClick={() => document.getElementById(`flag-input-${color}`)?.click()}
                                disabled={flagUploading === color}
                                style={{
                                  fontSize: 11, padding: '6px 14px',
                                  borderColor: hasImage ? '#22c55e' : '#e2e8f0',
                                  color: hasImage ? '#16a34a' : '#64748b',
                                }}
                              >
                                {flagUploading === color ? '...' : hasImage ? 'Replace' : 'Upload'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ marginTop: 20, padding: 14, background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.8 }}>
                      <strong>How it works:</strong><br/>
                      1. {companyMode ? 'Employees' : 'Students'} imported with a "House" column (e.g., Yellow, Blue, Red, Green) are auto-detected.<br/>
                      2. Upload flag images named by color (e.g., <strong>Yellow.png</strong>, <strong>Blue.jpg</strong>).<br/>
                      3. The system matches each flag to the correct house and places it on the ID card at the flag placeholder position.
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                    <button className="btn btn-primary" onClick={() => setFlagUploadOpen(false)} style={{ padding: '10px 28px' }}>Done</button>
                  </div>
                </div>
              </div>
            </div>
          )}
          </>
        )}

        {/* TEMPLATE TAB */}
        {tab === "template" && (
          <div className="template-tab-list" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Template tab header with count + add button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
                  ID Card Templates ({schoolTemplates.length})
                </h2>
                <p style={{ fontSize: 13, color: '#94a3b8' }}>Each template can be assigned to specific {companyMode ? "departments" : "classes (e.g. Primary, Secondary)"}.</p>
              </div>
              <button
                className="btn btn-primary"
                disabled={creatingTemplate}
                onClick={() => {
                  const name = prompt(companyMode ? 'Enter template name (e.g. "Employee ID Template"):' : 'Enter template name (e.g. "Secondary School Template", "Kindergarten Template"):')
                  if (name && name.trim()) handleCreateTemplate(name.trim())
                }}
                style={{ fontSize: 13, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
                {creatingTemplate ? 'Creating...' : 'Add Template'}
              </button>
            </div>

            {/* Render all templates */}
            {schoolTemplates.map((template, idx) => (
              <div key={template.id} className="responsive-template-card" style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: idx === 0 ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : idx === 1 ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: 'white',
                  }}>{idx + 1}</div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
                      {template.name || `Template ${idx + 1}`}
                    </h3>
                    <p style={{ fontSize: 13, color: '#94a3b8' }}>
                      {template._count?.classes
                        ? `Assigned to ${template._count.classes} ${companyMode ? `department${template._count.classes > 1 ? "s" : ""}` : `class${template._count.classes > 1 ? "es" : ""}`}`
                        : `Not assigned to any ${companyMode ? "department" : "class"} yet`}
                      {template.templateImageUrl ? ' • Template image uploaded' : ''}
                    </p>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                    background: template.templateImageUrl ? '#dcfce7' : '#fef3c7',
                    color: template.templateImageUrl ? '#166534' : '#92400e',
                  }}>
                    {template.templateImageUrl ? '✓ Ready' : '⚠ No Image'}
                  </span>
                </div>

                <JpgTemplateMapper
                  schoolId={schoolId}
                  companyMode={companyMode}
                  templateId={template.id}
                  templateImageUrl={template.templateImageUrl || null}
                  fieldMappings={(template.fieldMappings as any) || []}
                  fieldConfig={(template.fieldConfig as any[]) || []}
                  initialPhotoBgColor={template.photoBgColor || "#FFFFFF"}
                  initialCardSettings={{
                    cardSizePreset: "custom",
                    cardWidth: template.cardWidthMm || DEFAULT_CARD_WIDTH_MM,
                    cardHeight: template.cardHeightMm || DEFAULT_CARD_HEIGHT_MM,
                    cardOrientation: template.orientation === "LANDSCAPE" ? "landscape" : "portrait",
                    printSides: template.hasBackSide ? "both" : "front",
                    cardDpi: template.printDpi || 300,
                    bleedMargin: 1,
                    backImageUrl: template.backTemplateImageUrl || null,
                    backMappings: (template.backFieldMappings as any) || [],
                    cardSizeLocked: template.cardSizeLocked || false,
                    fixedBranch: (template.printConfig as any)?.fixedBranch || "",
                  }}
                  previewStudent={students[0] ? {
                    formData: students[0].formData as Record<string, string>,
                    photoUrl: students[0].photoUrl || null,
                  } : null}
                  onSave={async (templateImageUrl, fieldMappings, photoBgColor, cardSettings) => {
                    try {
                      const res = await fetch(`/api/schools/${schoolId}/templates/${template.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          name: template.name,
                          templateImageUrl,
                          fieldMappings,
                          photoBgColor,
                          ...(cardSettings ? {
                            cardWidthMm: cardSettings.cardWidth,
                            cardHeightMm: cardSettings.cardHeight,
                            printDpi: cardSettings.cardDpi,
                            orientation: cardSettings.cardOrientation === "landscape" ? "LANDSCAPE" : "PORTRAIT",
                            hasBackSide: cardSettings.printSides === "both",
                            backTemplateImageUrl: cardSettings.backImageUrl,
                            backFieldMappings: cardSettings.backMappings,
                            cardSizeLocked: cardSettings.cardSizeLocked,
                            printConfig: {
                              fixedBranch: cardSettings.fixedBranch || "",
                            },
                          } : {}),
                        }),
                      })
                      const data = await res.json()
                      if (data.success) {
                        toast.success(`${template.name || 'Template'} saved!`)
                        fetchTemplate()
                        fetchSchoolTemplates()
                      } else {
                        toast.error(`Failed to save ${template.name || 'template'}`)
                      }
                    } catch (err) {
                      toast.error(`Failed to save ${template.name || 'template'}`)
                    }
                  }}
                  onUploadImage={async (file) => {
                    const fd = new FormData()
                    fd.append('file', file)
                    fd.append('folder', `templates`)
                    const res = await fetch('/api/upload', { method: 'POST', body: fd })
                    const data = await res.json()
                    if (!res.ok || !data.success) {
                      throw new Error(data.error || data.detail || 'Upload failed')
                    }
                    return data.url
                  }}
                />
              </div>
            ))}

            {schoolTemplates.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, background: 'white', borderRadius: 16, border: '2px dashed #e2e8f0' }}>
                <p style={{ fontSize: 15, color: '#64748b', marginBottom: 12 }}>No templates yet. Create your first template to get started.</p>
                <button
                  className="btn btn-primary"
                  disabled={creatingTemplate}
                  onClick={() => handleCreateTemplate('Default Template')}
                >{creatingTemplate ? 'Creating...' : 'Create Default Template'}</button>
              </div>
            )}
          </div>
        )}

        {/* BATCHES TAB */}
        {tab === "batches" && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>Print Batches</h3>
              <button className="btn btn-primary" onClick={handleGenerateBatch} disabled={generatingBatch}>
                {generatingBatch ? "Generating..." : "Generate New Batch"}
              </button>
            </div>

            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Batch ID</th>
                    <th>{companyMode ? "Employees" : "Students"}</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th style={{ textAlign: 'right' }}>Downloads</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => (
                    <tr key={b.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>...{b.id.slice(-8)}</td>
                      <td><strong>{b.studentCount}</strong></td>
                      <td>
                        <span className={`status-badge ${
                          b.status === 'READY' ? 'status-approved' :
                          b.status === 'GENERATING' ? 'status-review' :
                          b.status === 'DOWNLOADED' ? 'status-submitted' :
                          'status-pending'
                        }`}>{b.status}</span>
                      </td>
                      <td style={{ fontSize: 13, color: '#64748b' }} suppressHydrationWarning>
                        {mounted ? new Date(b.createdAt).toLocaleDateString() : b.createdAt.split('T')[0]}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {b.status === "READY" || b.status === "DOWNLOADED" ? (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {b.frontPdfPath && (
                              <a href={`/api/schools/${schoolId}/batches/${b.id}/download/front`} className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}>📄 Front PDF</a>
                            )}
                            {b.backPdfPath && (
                              <a href={`/api/schools/${schoolId}/batches/${b.id}/download/back`} className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}>📄 Back PDF</a>
                            )}
                            {b.manifestPath && (
                              <a href={`/api/schools/${schoolId}/batches/${b.id}/download/manifest`} className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}>📊 Manifest</a>
                            )}
                          </div>
                        ) : b.status === "GENERATING" ? (
                          <span style={{ fontSize: 12, color: '#f59e0b' }}>⏳ Generating...</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {batches.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No batches generated yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* GENERATE ID CARDS TAB */}
        {tab === "generate" && (
          <BatchGenerator
            schoolId={schoolId}
            schoolName={school.name}
            classes={classes}
            companyMode={companyMode}
          />
        )}

        {/* EXPORT TAB */}
        {tab === "export" && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 32 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Export {companyMode ? "Employee" : "Student"} Data</h3>
            <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24 }}>
              Download readable {companyMode ? "employee records with company and department names" : "student records with school and class names"}, including photo locations — not raw database IDs.
            </p>

            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <select value={classFilter} onChange={e => setClassFilter(e.target.value)} style={{ height: 40, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
                <option value="">All {companyMode ? "Departments" : "Classes"}</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ height: 40, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
                <option value="">All Status</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="APPROVED">Approved</option>
                <option value="FLAGGED">Flagged</option>
                <option value="PRINTED">Printed</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              <button className="btn btn-outline" style={{ padding: '14px 28px' }} onClick={() => handleExport("csv")}>
                📄 Download CSV
              </button>
              <button className="btn btn-primary" style={{ padding: '14px 28px' }} onClick={() => handleExport("excel")}>
                📊 Download Excel + Photos
              </button>
              <button className="btn btn-outline" style={{ padding: '14px 28px' }} onClick={() => handleExport("archive")}>
                🗂️ Complete Archive
              </button>
            </div>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 16, lineHeight: 1.6 }}>
              <strong>Excel + Photos</strong> handles up to <strong>15,000 students</strong> in one export — photos download in parallel and save by student name.
              <code>students-complete.json</code> keeps a full backup so no data is lost. Large {companyMode ? "companies" : "schools"} may take several minutes.
              CSV is spreadsheet-only. Complete Archive also includes QR codes and print files.
            </p>
          </div>
        )}
      </div>

      {/* STUDENT DETAIL MODAL */}
      {selectedStudent && (() => {
        const editFd = { ...(selectedStudent.formData as Record<string, string>) }
        const studentName = editFd.fullName || editFd["Full Name"] || editFd["Student Name"] || editFd.Student_Name || editFd.name || ""
        const fatherVal = editFd.fatherName || editFd["Father"] || editFd["Father Name"] || editFd.father || ""
        const motherVal = editFd.motherName || editFd["Mother"] || editFd["Mother Name"] || editFd.mother || ""

        const studentClass = classes.find(c => c.id === selectedStudent.classId)
        const studentTemplate = resolveStudentTemplate(studentClass, selectedStudent, templateData)

        const detailPhotoUrl = getStudentPhotoUrl(selectedStudent)
        const detailPhotoCacheKey = studentPhotoCacheKey(selectedStudent)

        // Determine critical missing fields
        const missingItems: string[] = []
        if (!studentHasPhoto(selectedStudent)) missingItems.push("Photo")
        if (!studentName) missingItems.push(companyMode ? "Employee Name" : "Student Name")

        return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={() => setSelectedStudent(null)}>
          <div style={{ background: 'white', borderRadius: 20, maxWidth: 960, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{companyMode ? "Employee" : "Student"} Detail — Edit</h2>
                <p style={{ fontSize: 13, color: '#64748b' }}>{selectedStudent.serialNumber} · {selectedStudent.class?.name}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {missingItems.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca' }}>
                    ⚠ Missing: {missingItems.join(', ')}
                  </span>
                )}
                <button onClick={() => setSelectedStudent(null)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
            </div>

            <div style={{ padding: 24 }}>
              {/* Student Info — Editable */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '20px', marginBottom: 28 }}>
                {/* Photo — clickable to upload */}
                <div style={{ position: 'relative' }}>
                  <div
                    style={{ width: 120, height: 156, borderRadius: 12, overflow: 'hidden', border: detailPhotoUrl ? '2px solid #e2e8f0' : '2px dashed #fca5a5', background: detailPhotoUrl ? '#f8fafc' : '#fef2f2', cursor: 'pointer' }}
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = 'image/*'
                      input.onchange = (e: any) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        pickPhotoForCrop(file, "detail", selectedStudent.id)
                      }
                      input.click()
                    }}
                  >
                    {detailPhotoUrl ? (
                      <img key={detailPhotoCacheKey} src={detailPhotoUrl} alt={studentName || `${companyMode ? "Employee" : "Student"} photo`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4, color: '#ef4444' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <span style={{ fontSize: 9, fontWeight: 600 }}>Click to add</span>
                      </div>
                    )}
                  </div>
                  <div style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: '#64748b', background: 'white', padding: '1px 6px', borderRadius: 4, border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                    📷 Click to change
                  </div>
                </div>

                {/* Editable Fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                  {Object.entries(selectedStudent.formData as Record<string, string>).map(([key, value]) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize', marginBottom: 2 }}>{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</div>
                      <input
                        type="text"
                        defaultValue={String(value || '')}
                        onBlur={(e) => {
                          if (e.target.value !== String(value || '')) {
                            const updatedFormData = {
                              ...(selectedStudent.formData as Record<string, string>),
                              [key]: normalizeStudentFieldValue(key, e.target.value),
                            }
                            setSelectedStudent({ ...selectedStudent, formData: updatedFormData })
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          border: `1px solid ${!value ? '#fca5a5' : '#e2e8f0'}`,
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 500,
                          color: '#0f172a',
                          background: !value ? '#fffbeb' : 'white',
                          outline: 'none',
                        }}
                      />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Status</div>
                    <span className={`status-badge ${selectedStudent.status === 'APPROVED' ? 'status-approved' : selectedStudent.status === 'FLAGGED' ? 'status-flagged' : selectedStudent.status === 'PRINTED' ? 'status-review' : 'status-submitted'}`}>{selectedStudent.status}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Submitted At</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }} suppressHydrationWarning>
                      {mounted ? new Date(selectedStudent.submittedAt).toLocaleString() : selectedStudent.submittedAt}
                    </div>
                  </div>
                </div>
              </div>

              {/* Flag note */}
              {selectedStudent.flagNote && (
                <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#ef4444', fontSize: 13, marginBottom: 20 }}>
                  📌 <strong>Flag Note:</strong> {selectedStudent.flagNote}
                </div>
              )}

              {studentTemplate?.templateImageUrl && studentTemplate?.fieldMappings && (studentTemplate.fieldMappings as any[]).length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>ID Card Preview (JPG Template)</h3>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textAlign: 'center' }}>FRONT SIDE</div>
                      <JpgCardPreview
                        key={detailPhotoCacheKey}
                        templateImageUrl={studentTemplate.templateImageUrl}
                        fieldMappings={studentTemplate.fieldMappings as any[]}
                        formData={selectedStudent.formData as Record<string, string>}
                        studentPhoto={detailPhotoUrl}
                        flagImageUrl={resolveHouseImageUrl(selectedStudent.formData as Record<string, string>, flagImages)}
                        scale={1}
                        watermark="PREVIEW"
                        schoolName={school.name}
                        cardWidthMm={(studentTemplate as any).cardWidthMm}
                        cardHeightMm={(studentTemplate as any).cardHeightMm}
                        photoBgColor={(studentTemplate as any).photoBgColor || "#FFFFFF"}
                      />
                    </div>
                    {studentTemplate.hasBackSide && studentTemplate.backTemplateImageUrl && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textAlign: 'center' }}>BACK SIDE</div>
                        <JpgCardPreview
                          key={`back-${detailPhotoCacheKey}`}
                          templateImageUrl={studentTemplate.backTemplateImageUrl}
                          fieldMappings={studentTemplate.backFieldMappings as any[] || []}
                          formData={selectedStudent.formData as Record<string, string>}
                          studentPhoto={detailPhotoUrl}
                          flagImageUrl={resolveHouseImageUrl(selectedStudent.formData as Record<string, string>, flagImages)}
                          scale={1}
                          watermark="PREVIEW"
                          schoolName={school.name}
                          cardWidthMm={(studentTemplate as any).cardWidthMm}
                          cardHeightMm={(studentTemplate as any).cardHeightMm}
                          photoBgColor={(studentTemplate as any).photoBgColor || "#FFFFFF"}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ID Card Preview (Canvas-based, fallback) */}
              {studentTemplate && !studentTemplate.templateImageUrl && (
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>ID Card Preview</h3>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8, textAlign: 'center' }}>FRONT</div>
                      <IDCardPreview
                        key={detailPhotoCacheKey}
                        layout={studentTemplate.frontLayout || []}
                        widthMm={studentTemplate.cardWidthMm || DEFAULT_CARD_WIDTH_MM}
                        heightMm={studentTemplate.cardHeightMm || DEFAULT_CARD_HEIGHT_MM}
                        formData={selectedStudent.formData as Record<string, string>}
                        studentPhoto={detailPhotoUrl}
                        schoolLogo={school?.logoUrl || undefined}
                        serialNumber={selectedStudent.serialNumber}
                        scale={3.5}
                      />
                    </div>
                    {studentTemplate.hasBackSide && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8, textAlign: 'center' }}>BACK</div>
                        <IDCardPreview
                          layout={studentTemplate.backLayout || []}
                          widthMm={studentTemplate.cardWidthMm || DEFAULT_CARD_WIDTH_MM}
                          heightMm={studentTemplate.cardHeightMm || DEFAULT_CARD_HEIGHT_MM}
                          formData={selectedStudent.formData as Record<string, string>}
                          serialNumber={selectedStudent.serialNumber}
                          scale={3.5}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 24, borderTop: '1px solid #e2e8f0', paddingTop: 20, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: 13, borderColor: '#8b5cf6', color: '#7c3aed' }}
                    disabled={!studentHasPhoto(selectedStudent)}
                    onClick={() => openBgEditorForStudent(selectedStudent)}
                  >
                    AI Background
                  </button>
                  {studentHasPhoto(selectedStudent) && (
                    <a
                      className="btn btn-outline"
                      href={`/api/media/student-photo/${selectedStudent.id}?variant=original&download=1`}
                      style={{ fontSize: 13, borderColor: '#0ea5e9', color: '#0284c7', textDecoration: 'none' }}
                    >
                      Download Original
                    </a>
                  )}
                  <button className="btn btn-outline" style={{ fontSize: 13, borderColor: '#22c55e', color: '#16a34a' }} onClick={() => { handleStatusUpdate(selectedStudent.id, "APPROVED"); setSelectedStudent(null) }}>✓ Approve</button>
                  {selectedStudent.status === "FLAGGED" ? (
                    <button className="btn btn-outline" style={{ fontSize: 13, borderColor: '#3b82f6', color: '#2563eb' }} onClick={() => { handleUnflag(selectedStudent.id); setSelectedStudent(null) }}>Unflag</button>
                  ) : (
                    <button className="btn btn-outline" style={{ fontSize: 13, borderColor: '#ef4444', color: '#dc2626' }} onClick={() => { handleFlag(selectedStudent.id); setSelectedStudent(null) }}>🚩 Flag</button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 13, background: '#8b5cf6', padding: '8px 20px' }}
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/schools/${schoolId}/students/${selectedStudent.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ formData: selectedStudent.formData }),
                        })
                        const data = await res.json()
                        if (data.success) {
                          toast.success(`${companyMode ? "Employee" : "Student"} data saved!`)
                          fetchStudents(studentPage)
                        } else {
                          toast.error(data.error || "Save failed")
                        }
                      } catch { toast.error("Save failed") }
                    }}
                  >
                    💾 Save Changes
                  </button>
                  <button className="btn btn-outline" onClick={() => setSelectedStudent(null)} style={{ fontSize: 13 }}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {photoCrop && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16 }} onClick={closePhotoCrop}>
          <div style={{ background: 'white', borderRadius: 16, maxWidth: 560, width: '100%', maxHeight: '92vh', overflow: 'auto', padding: 20, boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Crop Photo</h3>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>Full photo is shown below — zoom/pan, then crop for the ID card.</p>
            <PhotoCropper
              photoUrl={photoCrop.url}
              aspectRatio={3 / 4}
              onCropped={handlePhotoCropped}
              onCancel={closePhotoCrop}
            />
          </div>
        </div>
      )}

      {bgEditorStudent && (
        <ManufacturerPhotoBgEditor
          schoolId={schoolId}
          studentId={bgEditorStudent.id}
          studentName={bgEditorStudent.name}
          photoUrl={bgEditorStudent.photoUrl}
          defaultBgColor={bgEditorStudent.defaultBgColor}
          onBgColorCommit={persistPhotoBgColor}
          onSaved={(newPhotoUrl, newPhotoPath, savedBgColor, updatedAt) => {
            toast.success("Photo background updated!")
            if (savedBgColor) setReprocessBgColor(savedBgColor)
            updateStudentPhotoInState(bgEditorStudent.id, newPhotoUrl, newPhotoPath, updatedAt)
            setBgEditorStudent(null)
            fetchStudents(studentPage)
          }}
          onClose={() => setBgEditorStudent(null)}
        />
      )}
    </>
  )
}
