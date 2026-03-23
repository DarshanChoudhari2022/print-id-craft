"use client"
import { useState, useEffect } from "react"
import { useSession, signOut } from "next-auth/react"

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

type DashboardData = {
  school: { name: string; logoUrl: string | null } | null
  classes: any[]
  students: StudentData[]
  stats: { total: number; submitted: number; approved: number; flagged: number; pending: number; printed: number }
}

export default function TeacherDashboard() {
  const { data: session } = useSession()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [classFilter, setClassFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")

  const fetchData = async () => {
    try {
      const res = await fetch("/api/teacher/dashboard")
      const json = await res.json()
      if (json.success) setData(json.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleApprove = async (sid: string) => {
    try {
      await fetch(`/api/schools/${getSchoolId()}/students/${sid}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      })
      fetchData()
    } catch (err) { console.error(err) }
  }

  const handleFlag = async (sid: string) => {
    const note = prompt("Enter reason for flagging:")
    if (!note) return
    try {
      await fetch(`/api/schools/${getSchoolId()}/students/${sid}/flag`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagNote: note }),
      })
      fetchData()
    } catch (err) { console.error(err) }
  }

  const handleUnflag = async (sid: string) => {
    try {
      await fetch(`/api/schools/${getSchoolId()}/students/${sid}/flag`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unflag: true }),
      })
      fetchData()
    } catch (err) { console.error(err) }
  }

  const getSchoolId = () => session?.user?.schoolId || ""

  const filtered = data?.students?.filter(s => {
    if (classFilter && s.class?.name !== classFilter) return false
    if (statusFilter && s.status !== statusFilter) return false
    return true
  }) || []

  if (loading) return (
    <div className="teacher-page">
      <div className="teacher-container">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
        </div>
      </div>
    </div>
  )

  return (
    <div className="teacher-page">
      <div className="teacher-container">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
              {data?.school?.name || "Teacher Dashboard"}
            </h1>
            <p style={{ fontSize: 14, color: '#64748b' }}>Welcome, {session?.user?.name || session?.user?.email}</p>
          </div>
          <button className="btn btn-outline" onClick={() => signOut({ callbackUrl: "/login" })}>Sign Out</button>
        </div>

        {/* Stats */}
        <div className="stat-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-card-label">Total Submissions</div>
            <div className="stat-card-value">{data?.stats.total || 0}</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#22c55e' }}>
            <div className="stat-card-label">Approved</div>
            <div className="stat-card-value" style={{ color: '#16a34a' }}>{data?.stats.approved || 0}</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#f59e0b' }}>
            <div className="stat-card-label">Pending Review</div>
            <div className="stat-card-value" style={{ color: '#d97706' }}>{data?.stats.submitted || 0}</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#ef4444' }}>
            <div className="stat-card-label">Flagged</div>
            <div className="stat-card-value" style={{ color: '#dc2626' }}>{data?.stats.flagged || 0}</div>
          </div>
        </div>

        {/* Progress Bar */}
        {data && data.stats.total > 0 && (
          <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 24, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', marginBottom: 8 }}>
              <span>Approval Progress</span>
              <span>{Math.round(((data.stats.approved + data.stats.printed) / data.stats.total) * 100)}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: '#f1f5f9', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #22c55e, #16a34a)', width: `${((data.stats.approved + data.stats.printed) / data.stats.total) * 100}%`, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {/* Share Links */}
        {data?.classes && data.classes.length > 0 && (
          <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>📋 Class Form Links</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.classes.map((c: any) => {
                const linkToken = c.linkToken || (c.students?.[0]?.class?.linkToken)
                if (!linkToken) return null
                const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/submit/${linkToken}`
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', flex: 1, minWidth: 100 }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', flex: 2, minWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
                    <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { navigator.clipboard.writeText(url); alert('Link copied!') }}>📋 Copy</button>
                    <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px', color: '#22c55e', borderColor: '#22c55e' }} onClick={() => { const msg = encodeURIComponent(`📋 ID Card Registration Form\n\nSchool: ${data?.school?.name}\nClass: ${c.name}\n\nPlease fill your details:\n${url}`); window.open(`https://wa.me/?text=${msg}`, '_blank') }}>💬 WhatsApp</button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <select value={classFilter} onChange={e => setClassFilter(e.target.value)} style={{ height: 38, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
            <option value="">All Classes</option>
            {data?.classes.map(c => <option key={c.id} value={c.name}>{c.name} ({c._count.students})</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ height: 38, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
            <option value="">All Status</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="FLAGGED">Flagged</option>
            <option value="PRINTED">Printed</option>
          </select>
          <span style={{ fontSize: 13, color: '#64748b', padding: '10px 0' }}>{filtered.length} students</span>
        </div>

        {/* Student Table */}
        <div className="data-table-wrapper" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Serial</th>
                <th>Name</th>
                <th>Class</th>
                <th>Roll No.</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const fd = s.formData as any
                return (
                  <tr key={s.id}>
                    <td>
                      {s.photoUrl ? (
                        <img src={s.photoUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f1f5f9', border: '2px dashed #cbd5e1' }} />
                      )}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.serialNumber}</td>
                    <td style={{ fontWeight: 500 }}>{fd.fullName || "—"}</td>
                    <td>{s.class?.name || "—"}</td>
                    <td>{fd.rollNo || "—"}</td>
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
                        {s.status !== "APPROVED" && s.status !== "PRINTED" && (
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', color: '#22c55e', borderColor: '#22c55e' }} onClick={() => handleApprove(s.id)}>✓ Approve</button>
                        )}
                        {s.status === "FLAGGED" ? (
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', color: '#3b82f6', borderColor: '#3b82f6' }} onClick={() => handleUnflag(s.id)}>Unflag</button>
                        ) : s.status !== "PRINTED" ? (
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', color: '#ef4444', borderColor: '#ef4444' }} onClick={() => handleFlag(s.id)}>🚩</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No students found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
