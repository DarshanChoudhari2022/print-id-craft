export default function Loading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="login-spinner" style={{ width: 36, height: 36, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', margin: '0 auto 16px' }} />
        <div style={{ fontSize: 14, color: '#64748b' }}>Loading school data...</div>
      </div>
    </div>
  )
}
