"use client"

import { useState, useRef, Suspense } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

type RoleOption = "MANUFACTURER" | "TEACHER"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isAdminMode = searchParams.get("mode") === "admin"
  const [selectedRole, setSelectedRole] = useState<RoleOption>(isAdminMode ? "MANUFACTURER" : "TEACHER")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showAdminToggle, setShowAdminToggle] = useState(isAdminMode)
  const logoClickCount = useRef(0)
  const logoClickTimer = useRef<NodeJS.Timeout | null>(null)

  // Hidden admin access: triple-click logo to reveal manufacturer login
  const handleLogoClick = () => {
    logoClickCount.current++
    if (logoClickTimer.current) clearTimeout(logoClickTimer.current)
    logoClickTimer.current = setTimeout(() => { logoClickCount.current = 0 }, 600)
    if (logoClickCount.current >= 3) {
      setShowAdminToggle(true)
      setSelectedRole("MANUFACTURER")
      logoClickCount.current = 0
      toast.info("Admin mode enabled")
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (res?.error) {
        toast.error("Invalid email or password")
        setLoading(false)
        return
      }

      toast.success("Login successful! Redirecting...")
      // The middleware will redirect based on actual role from session
      if (selectedRole === "MANUFACTURER") {
        router.push("/dashboard")
      } else {
        router.push("/teacher/dashboard")
      }
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error("An unexpected error occurred")
      setLoading(false)
    }
  }

  return (
    <div className="login-container fade-in">
      {/* Left Panel - Dark Branding */}
      <div className="login-left" style={{ animationDelay: '0.1s' }}>
        <div className="login-left-content">
          <div className="login-logo" onClick={handleLogoClick} style={{ cursor: 'pointer' }}>
            <div className="login-logo-icon">P</div>
            <span className="login-logo-text">Print ID Craft</span>
          </div>

          {/* ID Card Illustration */}
          <div className="login-illustration">
            <div className="id-card-mock">
              <div className="id-card-mock-inner">
                <div className="id-card-header-bar" />
                <div className="id-card-avatar">
                  <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="16" r="8" fill="#94a3b8"/>
                    <ellipse cx="20" cy="34" rx="14" ry="10" fill="#94a3b8"/>
                  </svg>
                </div>
                <div className="id-card-lines">
                  <div className="id-card-line long" />
                  <div className="id-card-line short" />
                  <div className="id-card-line medium" />
                </div>
                <div className="id-card-qr">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                    <rect x="2" y="2" width="8" height="8" rx="1" />
                    <rect x="14" y="2" width="8" height="8" rx="1" />
                    <rect x="2" y="14" width="8" height="8" rx="1" />
                    <rect x="14" y="14" width="4" height="4" rx="0.5" />
                    <rect x="20" y="14" width="2" height="2" rx="0.25" />
                    <rect x="14" y="20" width="2" height="2" rx="0.25" />
                    <rect x="18" y="18" width="4" height="4" rx="0.5" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="floating-dot dot-1" />
            <div className="floating-dot dot-2" />
            <div className="floating-dot dot-3" />
          </div>

          <p className="login-tagline">
            School ID Card Management Portal<br />
            <span>Secure • Simple • Smart</span>
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="login-right">
        <div className="login-form-wrapper">
          <h1 className="login-heading">Welcome back</h1>
          <p className="login-subheading">
            {showAdminToggle ? "Admin login — Manage schools & printing" : "Sign in to manage your school's ID cards"}
          </p>

          {/* Manufacturer toggle - hidden by default, shown via triple-click or ?mode=admin */}
          {showAdminToggle && (
            <div style={{ 
              display: 'flex', gap: 8, marginBottom: 20, padding: 4, 
              background: '#f1f5f9', borderRadius: 10 
            }}>
              <button
                type="button"
                onClick={() => setSelectedRole("TEACHER")}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: selectedRole === "TEACHER" ? 'white' : 'transparent',
                  color: selectedRole === "TEACHER" ? '#22c55e' : '#94a3b8',
                  boxShadow: selectedRole === "TEACHER" ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                🏫 Teacher
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole("MANUFACTURER")}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: selectedRole === "MANUFACTURER" ? 'white' : 'transparent',
                  color: selectedRole === "MANUFACTURER" ? '#3b82f6' : '#94a3b8',
                  boxShadow: selectedRole === "MANUFACTURER" ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                🏭 Manufacturer
              </button>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="login-form">
            {error && <div className="login-error" role="alert">{error}</div>}

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                placeholder={showAdminToggle && selectedRole === "MANUFACTURER" ? "admin@printidcraft.com" : "teacher@school.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? (
                <span className="login-spinner" />
              ) : (
                <>
                  Sign In
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </>
              )}
            </button>
          </form>

          {/* Photo Guidelines hint for teachers */}
          {!showAdminToggle && (
            <div style={{ 
              marginTop: 20, padding: '14px 16px', 
              background: '#f0fdf4', borderRadius: 10, 
              border: '1px solid #bbf7d0' 
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d', marginBottom: 4 }}>📸 Photo Guidelines for Students</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: '#16a34a', lineHeight: 1.7 }}>
                <li>Minimum 300 pixels width</li>
                <li>Plain/solid background only</li>
                <li>Passport-size format (3:4 ratio)</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
