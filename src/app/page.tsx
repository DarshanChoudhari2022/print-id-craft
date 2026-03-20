import Link from "next/link"

export default function LandingPage() {
  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-logo">
            <div className="landing-logo-icon">P</div>
            <span className="landing-logo-text">Print ID Craft</span>
          </div>
          <Link href="/login" className="btn btn-primary" style={{ padding: '10px 24px' }}>
            Sign In →
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-hero-badge">🚀 Trusted by ID Card Manufacturers Nationwide</div>
        <h1 className="landing-hero-title">
          Multi-School ID Card <br />
          <span className="landing-hero-gradient">Management & Print Portal</span>
        </h1>
        <p className="landing-hero-subtitle">
          The complete SaaS platform for ID card manufacturers. Onboard schools in minutes,
          collect student data via smart links, design beautiful ID cards, and generate
          print-ready PDFs with guaranteed front-back page matching.
        </p>
        <div className="landing-hero-actions">
          <Link href="/login" className="btn btn-primary" style={{ padding: '14px 32px', fontSize: 16 }}>
            Get Started Free
          </Link>
          <a href="#features" className="btn btn-outline" style={{ padding: '14px 32px', fontSize: 16 }}>
            See How It Works
          </a>
        </div>
        <div className="landing-hero-stats">
          <div className="landing-hero-stat">
            <strong>50+</strong>
            <span>Schools Managed</span>
          </div>
          <div className="landing-hero-stat-divider" />
          <div className="landing-hero-stat">
            <strong>25,000+</strong>
            <span>Cards Printed</span>
          </div>
          <div className="landing-hero-stat-divider" />
          <div className="landing-hero-stat">
            <strong>99.9%</strong>
            <span>Match Accuracy</span>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="landing-features" id="features">
        <div className="landing-section-header">
          <h2>Everything You Need to Scale</h2>
          <p>A powerful toolkit designed specifically for ID card manufacturers serving multiple schools.</p>
        </div>
        <div className="landing-features-grid">
          <div className="landing-feature-card">
            <div className="landing-feature-icon" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>
            </div>
            <h3>Multi-School Management</h3>
            <p>Manage unlimited schools from a single dashboard. Track classes, students, submissions, and print batches per school.</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </div>
            <h3>Smart Link System</h3>
            <p>Generate unique form links per class. Share via WhatsApp, email, or QR code. Students fill forms on their phones.</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon" style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <h3>Student Data Collection</h3>
            <p>Dynamic multi-step forms with photo upload, crop, and live validation. Mobile-optimized for 320px screens.</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>
            </div>
            <h3>ID Card Designer</h3>
            <p>Drag-and-drop canvas builder with front & back sides. Add text, photos, logos, QR codes, and custom fields.</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
            </div>
            <h3>Print Batch Export</h3>
            <p>Generate high-quality PDFs with precise card dimensions. Download front PDF, back PDF, and print manifest CSV.</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon" style={{ background: 'rgba(6,182,212,0.1)', color: '#06b6d4' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" x2="17" y1="12" y2="12"/></svg>
            </div>
            <h3>Front-Back Matching</h3>
            <p>Guaranteed page-level matching. Page 1 of front PDF always matches page 1 of back PDF — zero errors.</p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="landing-process">
        <div className="landing-section-header">
          <h2>How It Works</h2>
          <p>Four simple steps from school registration to print-ready PDFs.</p>
        </div>
        <div className="landing-process-steps">
          <div className="landing-process-step">
            <div className="landing-process-number">1</div>
            <h3>Add School</h3>
            <p>Register the school, upload their logo, and create class groups for each section.</p>
          </div>
          <div className="landing-process-connector" />
          <div className="landing-process-step">
            <div className="landing-process-number">2</div>
            <h3>Share Links</h3>
            <p>Generate unique form links per class. Share via WhatsApp or email to parents and students.</p>
          </div>
          <div className="landing-process-connector" />
          <div className="landing-process-step">
            <div className="landing-process-number">3</div>
            <h3>Collect Data</h3>
            <p>Students fill the mobile-optimized form with photo upload. Teachers review and approve submissions.</p>
          </div>
          <div className="landing-process-connector" />
          <div className="landing-process-step">
            <div className="landing-process-number">4</div>
            <h3>Print & Deliver</h3>
            <p>Design the card template, generate print batches, and download PDFs with matching front-back pages.</p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="landing-testimonials">
        <div className="landing-section-header">
          <h2>Trusted by Manufacturers</h2>
          <p>See what our customers say about Print ID Craft.</p>
        </div>
        <div className="landing-testimonials-grid">
          <div className="landing-testimonial-card">
            <div className="landing-testimonial-stars">★★★★★</div>
            <p>&quot;We used to manually match front and back cards for 2,000+ students. Print ID Craft eliminated that entirely. The front-back PDF matching is flawless.&quot;</p>
            <div className="landing-testimonial-author">
              <div className="landing-testimonial-avatar" style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>RK</div>
              <div>
                <strong>Rajesh Kumar</strong>
                <span>ID Card Solutions, Delhi</span>
              </div>
            </div>
          </div>
          <div className="landing-testimonial-card">
            <div className="landing-testimonial-stars">★★★★★</div>
            <p>&quot;The smart link system is brilliant. We share a single link with the school, and student data flows in automatically. No more Excel sheets.&quot;</p>
            <div className="landing-testimonial-author">
              <div className="landing-testimonial-avatar" style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>PS</div>
              <div>
                <strong>Priya Sharma</strong>
                <span>CardPrint Pro, Mumbai</span>
              </div>
            </div>
          </div>
          <div className="landing-testimonial-card">
            <div className="landing-testimonial-stars">★★★★★</div>
            <p>&quot;Managing 15 schools used to take a whole team. Now I handle it alone with Print ID Craft. The template designer is incredibly intuitive.&quot;</p>
            <div className="landing-testimonial-author">
              <div className="landing-testimonial-avatar" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>AM</div>
              <div>
                <strong>Ankit Mehta</strong>
                <span>National ID Services, Pune</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <div className="landing-logo">
              <div className="landing-logo-icon">P</div>
              <span className="landing-logo-text" style={{ color: '#e2e8f0' }}>Print ID Craft</span>
            </div>
            <p>Multi-School ID Card Management & Print Portal for manufacturers who serve schools at scale.</p>
          </div>
          <div className="landing-footer-links">
            <div>
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#features">How It Works</a>
              <Link href="/login">Sign In</Link>
            </div>
            <div>
              <h4>Contact</h4>
              <a href="mailto:support@printidcraft.com">support@printidcraft.com</a>
              <a href="tel:+919876543210">+91 98765 43210</a>
            </div>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <p>© 2026 Print ID Craft. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
