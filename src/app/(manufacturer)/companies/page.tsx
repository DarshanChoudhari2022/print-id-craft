"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

type CompanyWorkspace = {
  id: string
  name: string
  contactEmail: string
  logoUrl: string | null
  address: string | null
  _count: { classes: number; students: number; batches: number }
  template: { id: string } | null
}

type CompanyStats = {
  totalSchools: number
  totalStudents: number
  totalBatches: number
}

export default function CompaniesPage() {
  const router = useRouter()
  const [workspaces, setWorkspaces] = useState<CompanyWorkspace[]>([])
  const [stats, setStats] = useState<CompanyStats>({
    totalSchools: 0,
    totalStudents: 0,
    totalBatches: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newAddress, setNewAddress] = useState("")
  const [newLogo, setNewLogo] = useState<File | null>(null)

  const fetchCompanies = useCallback(async () => {
    try {
      setError("")
      const response = await fetch(`/api/schools?workspace=company&limit=100&_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "Failed to load companies")
      setWorkspaces(data.data || [])
      if (data.stats) setStats(data.stats)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load companies")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchCompanies() }, [fetchCompanies])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    setCreating(true)
    try {
      let logoUrl = ""
      if (newLogo) {
        const form = new FormData()
        form.append("file", newLogo)
        form.append("folder", "logos")
        const uploadResponse = await fetch("/api/upload", { method: "POST", body: form })
        const uploadData = await uploadResponse.json()
        if (!uploadResponse.ok || !uploadData.success) {
          throw new Error(uploadData.error || "Company logo upload failed")
        }
        logoUrl = uploadData.url
      }

      const response = await fetch("/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceKind: "company",
          name: newName,
          contactEmail: newEmail,
          address: newAddress,
          logoUrl: logoUrl || undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || data.error || "Failed to create company")
      }

      toast.success("Company created with a representative login and General department.")
      setShowAdd(false)
      setNewName("")
      setNewEmail("")
      setNewAddress("")
      setNewLogo(null)
      router.push(`/companies/${data.data.id}`)
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : "Failed to create company")
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (workspace: CompanyWorkspace) => {
    const confirmed = prompt(`Type "DELETE" to remove "${workspace.name}" and all its employee data:`)
    if (confirmed !== "DELETE") return
    const response = await fetch(`/api/schools/${workspace.id}`, { method: "DELETE" })
    const data = await response.json()
    if (!response.ok || !data.success) {
      toast.error(data.error || "Failed to delete company")
      return
    }
    toast.success("Company deleted")
    await fetchCompanies()
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div className="login-spinner" style={{ width: 32, height: 32, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3b82f6" }} />
      </div>
    )
  }

  return (
    <>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1>Companies</h1>
          <p>Manage each company, its employees, representative login, templates, and print batches separately.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Add Company
        </button>
      </div>

      <div className="page-body">
        <div className="stat-grid">
          <div className="stat-card stat-card-animated">
            <div className="stat-card-label">Total Companies</div>
            <div className="stat-card-value">{stats.totalSchools.toLocaleString()}</div>
          </div>
          <div className="stat-card stat-card-animated" style={{ animationDelay: "80ms" }}>
            <div className="stat-card-label">Total Employees</div>
            <div className="stat-card-value">{stats.totalStudents.toLocaleString()}</div>
          </div>
        </div>

        {error ? (
          <div className="empty-state" style={{ marginTop: 24, background: "white", borderRadius: 16, border: "2px dashed #fecaca" }}>
            <h3>Companies could not be loaded</h3>
            <p>{error}</p>
            <button className="btn btn-outline" onClick={() => { setLoading(true); void fetchCompanies() }}>Retry</button>
          </div>
        ) : workspaces.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 24, background: "white", borderRadius: 16, border: "2px dashed #e2e8f0" }}>
            <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="7" width="18" height="13" rx="2"/>
              <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <path d="M3 12h18"/>
            </svg>
            <h3>No companies added</h3>
            <p>Add the first company to manage its employees and ID cards separately.</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAdd(true)}>Add First Company</button>
          </div>
        ) : (
          <div className="card-grid" style={{ marginTop: 24 }}>
            {workspaces.map(workspace => (
              <div key={workspace.id} className="school-card" onClick={() => router.push(`/companies/${workspace.id}`)}>
                <div className="school-card-banner" style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }} />
                <div className="school-card-body">
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb", fontWeight: 700, overflow: "hidden" }}>
                      {workspace.logoUrl
                        ? <img src={workspace.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        : workspace.name.charAt(0)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="school-card-name">{workspace.name}</div>
                      <div className="school-card-address">{workspace.address || workspace.contactEmail}</div>
                    </div>
                  </div>
                  <div className="school-card-stats">
                    <span className="school-card-stat"><strong>{workspace._count.students}</strong> employees</span>
                    <span className="status-badge" style={{ fontSize: 11, background: "#eff6ff", color: "#1d4ed8" }}>Independent Workspace</span>
                    {workspace.template && <span className="status-badge status-approved" style={{ fontSize: 11 }}>Template Ready</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="btn btn-outline" style={{ flex: 1 }} onClick={event => { event.stopPropagation(); router.push(`/companies/${workspace.id}`) }}>Manage</button>
                    <button className="btn btn-danger" onClick={event => { event.stopPropagation(); void handleDelete(workspace) }}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, padding: 16, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowAdd(false)}>
          <div style={{ width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", padding: 32, borderRadius: 16, background: "white" }} onClick={event => event.stopPropagation()}>
            <h2 style={{ fontSize: 20, marginBottom: 4 }}>Add New Company</h2>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>
              A separate employee workspace and Company Representative login will be created automatically.
            </p>
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="form-group">
                <label>Company Name *</label>
                <input required value={newName} onChange={event => setNewName(event.target.value)} placeholder="e.g. Precision CAD/CAM" />
              </div>
              <div className="form-group">
                <label>Representative Email *</label>
                <input required type="email" value={newEmail} onChange={event => setNewEmail(event.target.value)} placeholder="representative@company.com" />
              </div>
              <div className="form-group">
                <label>Company Address</label>
                <input value={newAddress} onChange={event => setNewAddress(event.target.value)} placeholder="Office address" />
              </div>
              <div className="form-group">
                <label>Company Logo (optional)</label>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setNewLogo(event.target.files?.[0] || null)} />
              </div>
              <div style={{ padding: 12, borderRadius: 10, background: "#eff6ff", color: "#1d4ed8", fontSize: 12 }}>
                Default representative password: <strong>Company@123</strong>. It can be reset from the company Overview.
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={creating}>
                  {creating ? "Creating..." : "Create Company"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
