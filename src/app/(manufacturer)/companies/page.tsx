"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

type CompanyWorkspace = {
  id: string
  name: string
  contactEmail: string
  address: string | null
  _count: { classes: number; students: number; batches: number }
}

export default function CompaniesPage() {
  const router = useRouter()
  const [workspaces, setWorkspaces] = useState<CompanyWorkspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    fetch(`/api/schools?workspace=company&limit=100&_t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    })
      .then(async response => {
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.error || "Failed to load company workspace")
        if (!active) return
        const items = (data.data || []) as CompanyWorkspace[]
        if (items.length === 1) {
          router.replace(`/companies/${items[0].id}`)
          return
        }
        setWorkspaces(items)
        setLoading(false)
      })
      .catch(fetchError => {
        if (!active) return
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load company workspace")
        setLoading(false)
      })
    return () => { active = false }
  }, [router])

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div className="login-spinner" style={{ width: 32, height: 32, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3b82f6" }} />
      </div>
    )
  }

  return (
    <>
      <div className="page-header">
        <h1>Company</h1>
        <p>Manage company ID cards and employee records</p>
      </div>
      <div className="page-body">
        {error ? (
          <div className="empty-state" style={{ background: "white", borderRadius: 16, border: "2px dashed #fecaca" }}>
            <h3>Company workspace could not be loaded</h3>
            <p>{error}</p>
          </div>
        ) : workspaces.length === 0 ? (
          <div className="empty-state" style={{ background: "white", borderRadius: 16, border: "2px dashed #e2e8f0" }}>
            <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="7" width="18" height="13" rx="2"/>
              <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <path d="M3 12h18"/>
            </svg>
            <h3>No company workspace found</h3>
            <p>A workspace with company or employee fields will appear here automatically.</p>
          </div>
        ) : (
          <div className="card-grid">
            {workspaces.map(workspace => (
              <div
                key={workspace.id}
                className="school-card"
                onClick={() => router.push(`/companies/${workspace.id}`)}
              >
                <div className="school-card-banner" style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }} />
                <div className="school-card-body">
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#2563eb" }}>
                      {workspace.name.charAt(0)}
                    </div>
                    <div>
                      <div className="school-card-name">{workspace.name}</div>
                      <div className="school-card-address">{workspace.address || workspace.contactEmail}</div>
                    </div>
                  </div>
                  <div className="school-card-stats">
                    <span className="school-card-stat"><strong>{workspace._count.classes}</strong> companies</span>
                    <span className="school-card-stat"><strong>{workspace._count.students}</strong> employees</span>
                  </div>
                  <button className="btn btn-outline" style={{ width: "100%", marginTop: 12 }}>Manage</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
