export default function ManufacturerLoading() {
  return (
    <>
      <div className="page-header">
        <div style={{ height: 24, width: 180, background: '#f1f5f9', borderRadius: 8, marginBottom: 8 }} />
        <div style={{ height: 14, width: 260, background: '#f1f5f9', borderRadius: 6 }} />
      </div>
      <div className="page-body">
        <div className="stat-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card" style={{ animation: 'fadeIn 0.3s ease-out forwards', animationDelay: `${i * 80}ms`, opacity: 0 }}>
              <div className="skeleton" style={{ height: 14, width: 100, borderRadius: 6, marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 32, width: 60, borderRadius: 6 }} />
            </div>
          ))}
        </div>
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, marginTop: 24 }}>
          <div className="skeleton" style={{ height: 18, width: 160, borderRadius: 6, marginBottom: 20 }} />
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 14, width: '60%', borderRadius: 6, marginBottom: 6 }} />
                <div className="skeleton" style={{ height: 11, width: '40%', borderRadius: 4 }} />
              </div>
              <div className="skeleton" style={{ height: 30, width: 80, borderRadius: 8 }} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
