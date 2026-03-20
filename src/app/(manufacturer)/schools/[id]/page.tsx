"use client"
import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"

type ClassData = {
  id: string
  name: string
  linkToken: string
  isActive: boolean
  expiresAt: string | null
  _count: { students: number }
  createdAt: string
}

type StudentData = {
  id: string
  serialNumber: string
  photoUrl: string
  formData: any
  status: string
  flagNote: string | null
  submittedAt: string
  class: { name: string }
}

type SchoolDetail = {
  id: string
  name: string
  contactEmail: string
  address: string | null
  logoUrl: string | null
  _count: { classes: number; students: number; batches: number }
  template: { id: string; fieldConfig: any } | null
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
  const schoolId = params.id as string

  const [tab, setTab] = useState<"overview"|"classes"|"students"|"template"|"batches"|"export">("overview")
  const [school, setSchool] = useState<SchoolDetail | null>(null)
  const [classes, setClasses] = useState<ClassData[]>([])
  const [students, setStudents] = useState<StudentData[]>([])
  const [batches, setBatches] = useState<BatchData[]>([])
  const [loading, setLoading] = useState(true)
  const [studentPage, setStudentPage] = useState(1)
  const [studentTotal, setStudentTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState("")
  const [classFilter, setClassFilter] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  // Add class
  const [newClassName, setNewClassName] = useState("")
  const [newExpiry, setNewExpiry] = useState("")
  const [addingClass, setAddingClass] = useState(false)

  // Batch generation
  const [generatingBatch, setGeneratingBatch] = useState(false)

  const fetchSchool = async () => {
    try {
      const res = await fetch(`/api/schools/${schoolId}`)
      const data = await res.json()
      if (data.success) setSchool(data.data)
    } catch (err) { console.error(err) }
  }

  const fetchClasses = async () => {
    try {
      const res = await fetch(`/api/schools/${schoolId}/classes`)
      const data = await res.json()
      if (data.success) setClasses(data.data)
    } catch (err) { console.error(err) }
  }

  const fetchStudents = async (page = 1) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" })
      if (statusFilter) params.set("status", statusFilter)
      if (classFilter) params.set("classId", classFilter)
      if (searchQuery) params.set("search", searchQuery)
      const res = await fetch(`/api/schools/${schoolId}/students?${params}`)
      const data = await res.json()
      if (data.success) {
        setStudents(data.data)
        setStudentTotal(data.pagination.total)
        setStudentPage(data.pagination.page)
      }
    } catch (err) { console.error(err) }
  }

  const fetchBatches = async () => {
    try {
      const res = await fetch(`/api/schools/${schoolId}/batches`)
      const data = await res.json()
      if (data.success) setBatches(data.data)
    } catch (err) { console.error(err) }
  }

  useEffect(() => {
    Promise.all([fetchSchool(), fetchClasses()]).finally(() => setLoading(false))
  }, [schoolId])

  useEffect(() => {
    if (tab === "students") fetchStudents()
    if (tab === "batches") fetchBatches()
  }, [tab, statusFilter, classFilter, searchQuery])

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClassName.trim()) return
    setAddingClass(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newClassName, expiresAt: newExpiry || null }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success("Class created!")
        setNewClassName("")
        setNewExpiry("")
        fetchClasses()
        fetchSchool()
      }
    } catch (err) {
      toast.error("Failed to create class")
    } finally {
      setAddingClass(false)
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

  const handleDeleteClass = async (cid: string, name: string) => {
    const confirmed = prompt(`Type "DELETE" to confirm removing class "${name}" and all its students:`)
    if (confirmed !== "DELETE") return
    await fetch(`/api/schools/${schoolId}/classes/${cid}`, { method: "DELETE" })
    toast.success("Class deleted")
    fetchClasses()
    fetchSchool()
  }

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/submit/${token}`
    navigator.clipboard.writeText(url)
    toast.success("Link copied to clipboard!")
  }

  const shareWhatsApp = (token: string, className: string) => {
    const url = `${window.location.origin}/submit/${token}`
    const msg = encodeURIComponent(`📋 ID Card Registration Form\n\nSchool: ${school?.name}\nClass: ${className}\n\nPlease fill your details:\n${url}`)
    window.open(`https://wa.me/?text=${msg}`, "_blank")
  }

  const shareEmail = (token: string, className: string) => {
    const url = `${window.location.origin}/submit/${token}`
    const subject = encodeURIComponent(`ID Card Registration - ${school?.name} - ${className}`)
    const body = encodeURIComponent(`Dear Parent/Student,\n\nPlease fill the ID card registration form for ${className}:\n\n${url}\n\nRegards,\n${school?.name}`)
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

  const handleStatusUpdate = async (sid: string, status: string) => {
    await fetch(`/api/schools/${schoolId}/students/${sid}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    toast.success(`Student status updated to ${status}`)
    fetchStudents(studentPage)
  }

  const handleFlag = async (sid: string) => {
    const note = prompt("Enter flag reason:")
    if (!note) return
    await fetch(`/api/schools/${schoolId}/students/${sid}/flag`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagNote: note }),
    })
    toast.success("Student flagged")
    fetchStudents(studentPage)
  }

  const handleUnflag = async (sid: string) => {
    await fetch(`/api/schools/${schoolId}/students/${sid}/flag`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unflag: true }),
    })
    toast.success("Student unflagged")
    fetchStudents(studentPage)
  }

  const handleGenerateBatch = async () => {
    if (!confirm(`Generate print batch for all submitted/approved students in ${school?.name}?`)) return
    setGeneratingBatch(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/batches`, { method: "POST" })
      const data = await res.json()
      if (data.success) {
        toast.success(`Batch generation started! ${data.data.studentCount} students included.`)
        // Poll for completion
        const batchId = data.data.batchId
        const poll = setInterval(async () => {
          const r = await fetch(`/api/schools/${schoolId}/batches/${batchId}`)
          const d = await r.json()
          if (d.success && d.data.status === "READY") {
            clearInterval(poll)
            toast.success("Batch is ready for download!")
            fetchBatches()
            setGeneratingBatch(false)
          }
        }, 3000)
        // Safety timeout
        setTimeout(() => { clearInterval(poll); setGeneratingBatch(false); fetchBatches() }, 120000)
      } else {
        toast.error(data.error)
        setGeneratingBatch(false)
      }
    } catch (err) {
      toast.error("Failed to generate batch")
      setGeneratingBatch(false)
    }
  }

  const handleExport = (format: "csv" | "excel") => {
    const params = new URLSearchParams()
    if (classFilter) params.set("classId", classFilter)
    if (statusFilter) params.set("status", statusFilter)
    window.open(`/api/schools/${schoolId}/export/${format}?${params}`, "_blank")
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
    </div>
  )
  if (!school) return <div style={{ padding: 32 }}>School not found.</div>

  const tabs = ["overview", "classes", "students", "template", "batches", "export"] as const

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <button className="btn-ghost" onClick={() => router.push('/schools')} style={{ padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #1B4F8A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'white' }}>
              {school.name.charAt(0)}
            </div>
            <div>
              <h1>{school.name}</h1>
              <p>{school.address || school.contactEmail}</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginTop: 16, background: '#f1f5f9', borderRadius: 10, padding: 4, overflowX: 'auto' }}>
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: tab === t ? 'white' : 'transparent',
                color: tab === t ? '#0f172a' : '#64748b',
                boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
                textTransform: 'capitalize',
                whiteSpace: 'nowrap',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-label">Total Classes</div>
              <div className="stat-card-value">{school._count.classes}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Total Students</div>
              <div className="stat-card-value">{school._count.students}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Print Batches</div>
              <div className="stat-card-value">{school._count.batches}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Template</div>
              <div className="stat-card-value">{school.template ? "✓" : "—"}</div>
            </div>
          </div>
        )}

        {/* CLASSES TAB */}
        {tab === "classes" && (
          <div>
            <form onSubmit={handleAddClass} style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
                <input placeholder="New class name (e.g. Grade 10-A)" value={newClassName} onChange={e => setNewClassName(e.target.value)} required />
              </div>
              <div className="form-group" style={{ width: 200 }}>
                <input type="datetime-local" value={newExpiry} onChange={e => setNewExpiry(e.target.value)} placeholder="Expiry (optional)" />
              </div>
              <button type="submit" className="btn btn-primary" style={{ height: 44 }} disabled={addingClass}>
                {addingClass ? "Adding..." : "Add Class"}
              </button>
            </form>

            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Class Name</th>
                    <th>Students</th>
                    <th>Status</th>
                    <th>Link</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map(cls => (
                    <tr key={cls.id}>
                      <td style={{ fontWeight: 600 }}>{cls.name}</td>
                      <td><span className="status-badge status-submitted">{cls._count.students}</span></td>
                      <td>
                        <span className={`status-badge ${cls.isActive ? 'status-approved' : 'status-pending'}`}>
                          {cls.isActive ? "Active" : "Inactive"}
                        </span>
                        {cls.expiresAt && (
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                            Expires: {new Date(cls.expiresAt).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 12 }}>...{cls.linkToken.slice(-8)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button className="btn btn-outline" onClick={() => copyLink(cls.linkToken)} style={{ fontSize: 11, padding: '5px 10px' }}>📋 Copy</button>
                          <button className="btn btn-outline" onClick={() => shareWhatsApp(cls.linkToken, cls.name)} style={{ fontSize: 11, padding: '5px 10px', color: '#22c55e', borderColor: '#22c55e' }}>💬 WhatsApp</button>
                          <button className="btn btn-outline" onClick={() => shareEmail(cls.linkToken, cls.name)} style={{ fontSize: 11, padding: '5px 10px' }}>📧 Email</button>
                          <button className="btn btn-outline" onClick={() => handleToggleClass(cls.id, cls.isActive)} style={{ fontSize: 11, padding: '5px 10px' }}>
                            {cls.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button className="btn btn-danger" onClick={() => handleDeleteClass(cls.id, cls.name)} style={{ fontSize: 11, padding: '5px 8px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {classes.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No classes created yet. Add one above.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* STUDENTS TAB */}
        {tab === "students" && (
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <input placeholder="Search by name or serial..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value) }} style={{ height: 40, padding: '0 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, flex: 1, minWidth: 200 }} />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ height: 40, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
                <option value="">All Status</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="APPROVED">Approved</option>
                <option value="FLAGGED">Flagged</option>
                <option value="PRINTED">Printed</option>
                <option value="PENDING">Pending</option>
              </select>
              <select value={classFilter} onChange={e => setClassFilter(e.target.value)} style={{ height: 40, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
                <option value="">All Classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{studentTotal} students found</div>

            <div className="data-table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Serial No.</th>
                    <th>Name</th>
                    <th>Class</th>
                    <th>Roll No.</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => {
                    const fd = s.formData as any
                    return (
                      <tr key={s.id}>
                        <td>
                          {s.photoUrl ? (
                            <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '2px solid #e2e8f0' }}>
                              <img src={s.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                          ) : (
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f1f5f9', border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            </div>
                          )}
                        </td>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 13 }}>{s.serialNumber}</td>
                        <td style={{ fontWeight: 500 }}>{fd.fullName || fd["Full Name"] || "—"}</td>
                        <td>{s.class?.name || "—"}</td>
                        <td>{fd.rollNo || fd["Roll No."] || "—"}</td>
                        <td>
                          <span className={`status-badge ${
                            s.status === 'APPROVED' ? 'status-approved' :
                            s.status === 'FLAGGED' ? 'status-flagged' :
                            s.status === 'PRINTED' ? 'status-review' :
                            s.status === 'SUBMITTED' ? 'status-submitted' :
                            'status-pending'
                          }`}>{s.status}</span>
                          {s.flagNote && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>📌 {s.flagNote}</div>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', borderColor: '#22c55e', color: '#16a34a' }} onClick={() => handleStatusUpdate(s.id, "APPROVED")}>✓</button>
                            {s.status === "FLAGGED" ? (
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', borderColor: '#3b82f6', color: '#2563eb' }} onClick={() => handleUnflag(s.id)}>Unflag</button>
                            ) : (
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', borderColor: '#ef4444', color: '#dc2626' }} onClick={() => handleFlag(s.id)}>🚩</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {students.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No students found</td></tr>
                  )}
                </tbody>
              </table>
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
        )}

        {/* TEMPLATE TAB */}
        {tab === "template" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', justifyContent: 'center', padding: 40, background: 'white', borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>ID Card Template Studio</h3>
            <p style={{ color: '#94a3b8', maxWidth: 380, textAlign: 'center', fontSize: 14 }}>Design your ID card front and back using a drag-and-drop canvas. Add student photos, dynamic text fields, QR codes, and more.</p>
            <Link href={`/schools/${schoolId}/template`} className="btn btn-primary" style={{ marginTop: 8, padding: '12px 28px', fontSize: 15 }}>
              Open Template Studio →
            </Link>
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
                    <th>Students</th>
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
                      <td style={{ fontSize: 13, color: '#64748b' }}>{new Date(b.createdAt).toLocaleDateString()}</td>
                      <td style={{ textAlign: 'right' }}>
                        {b.status === "READY" || b.status === "DOWNLOADED" ? (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            {b.manifestPath && (
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => toast.info("Manifest CSV download coming soon")}>📄 Manifest</button>
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

        {/* EXPORT TAB */}
        {tab === "export" && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 32 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Export Student Data</h3>
            <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24 }}>Download student records in your preferred format.</p>

            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <select value={classFilter} onChange={e => setClassFilter(e.target.value)} style={{ height: 40, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
                <option value="">All Classes</option>
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
              <button className="btn btn-primary" style={{ padding: '14px 28px' }} onClick={() => handleExport("csv")}>
                📄 Download CSV
              </button>
              <button className="btn btn-outline" style={{ padding: '14px 28px' }} onClick={() => handleExport("excel")}>
                📊 Download Excel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
