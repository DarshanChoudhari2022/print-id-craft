export default function TeacherLoading() {
  return (
    <div className="teacher-page">
      <div className="teacher-container">
        {/* Header skeleton */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div className="skeleton" style={{ height: 22, width: 200, borderRadius: 8, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 14, width: 160, borderRadius: 6 }} />
          </div>
          <div className="skeleton" style={{ height: 38, width: 90, borderRadius: 10 }} />
        </div>

        {/* Stats skeleton */}
        <div className="stat-grid" style={{ marginBottom: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card" style={{ animation: 'fadeIn 0.3s ease-out forwards', animationDelay: `${i * 80}ms`, opacity: 0 }}>
              <div className="skeleton" style={{ height: 12, width: 100, borderRadius: 4, marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 28, width: 50, borderRadius: 6 }} />
            </div>
          ))}
        </div>

        {/* Progress bar skeleton */}
        <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 24, border: '1px solid #e2e8f0' }}>
          <div className="skeleton" style={{ height: 8, borderRadius: 4, width: '100%' }} />
        </div>

        {/* Table skeleton */}
        <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' }}>
          <div className="skeleton" style={{ height: 16, width: 140, borderRadius: 6, marginBottom: 16 }} />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
              <div className="skeleton" style={{ height: 14, width: 80, borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 14, width: 120, borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 14, width: 60, borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 22, width: 70, borderRadius: 6, marginLeft: 'auto' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
