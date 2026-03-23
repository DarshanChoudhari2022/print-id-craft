import Link from "next/link"

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: 'white',
      fontFamily: 'Inter, -apple-system, sans-serif', padding: 24,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div style={{ fontSize: 80, fontWeight: 800, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1, marginBottom: 16 }}>
          404
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Page Not Found</h1>
        <p style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.6, marginBottom: 32 }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/" style={{
            padding: '12px 28px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            borderRadius: 10, color: 'white', fontWeight: 600, fontSize: 14,
            textDecoration: 'none', transition: 'transform 0.15s',
          }}>
            Go Home
          </Link>
          <Link href="/login" style={{
            padding: '12px 28px', background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
            color: '#e2e8f0', fontWeight: 600, fontSize: 14, textDecoration: 'none',
          }}>
            Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}
