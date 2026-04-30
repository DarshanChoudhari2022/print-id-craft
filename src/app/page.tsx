"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useRef, useEffect, useState, useMemo } from 'react';
import {
  motion,
  useScroll,
  useInView,
  useSpring,
  useTransform,
  AnimatePresence,
} from 'framer-motion';
import {
  Menu,
  X,
  Download,
  ArrowRight,
  Phone,
  Mail,
  MapPin,
  Instagram,
  Facebook,
  Sparkles,
  Crown,
  Truck,
  HeartHandshake,
  GraduationCap,
  Briefcase,
  Shirt,
  Footprints,
  IdCard,
  Tag as TagIcon,
  ShoppingBag,
  BookOpen,
  Coffee,
  Pen,
  Image as ImageIcon,
  Camera,
  type LucideIcon,
} from 'lucide-react';

/* ─── WiseMelon Brand System ─── */
const NAVY = '#0D1238';
const NAVY_DEEP = '#080B25';
const GOLD = '#F5B921';
const GOLD_LIGHT = '#FFD66E';
const GOLD_DEEP = '#C99514';
const CREAM = '#FAF7EE';
const INK = '#0D1238';
const MUTED = '#3C4358';

// Stagger animation helpers
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.15 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const } },
};
const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } },
};

// Animated counter component
function AnimatedCounter({ value, suffix = "" }: { value: string; suffix?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [display, setDisplay] = useState("0");
  
  useEffect(() => {
    if (!isInView) return;
    const numericValue = parseInt(value.replace(/[^0-9]/g, ''));
    const duration = 1500;
    const steps = 40;
    const increment = numericValue / steps;
    let current = 0;
    let step = 0;
    
    const timer = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), numericValue);
      setDisplay(current.toLocaleString());
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [isInView, value]);
  
  return <span ref={ref}>{display}{suffix}</span>;
}

/* ─── Catalogue data (sourced from WiseMelon Ventures Pvt. Ltd. Product Catalogue) ─── */
const PRODUCT_CATEGORIES = [
  { label: 'Uniforms',         Icon: Shirt },
  { label: 'Footwear',         Icon: Footprints },
  { label: 'ID Cards',         Icon: IdCard },
  { label: 'Lanyards',         Icon: TagIcon },
  { label: 'Office Bags',      Icon: ShoppingBag },
  { label: 'Notebooks',        Icon: BookOpen },
  { label: 'Mugs',             Icon: Coffee },
  { label: 'T-Shirt Printing', Icon: Shirt },
  { label: 'Caps & Badges',    Icon: Crown },
  { label: 'Pens & Diaries',   Icon: Pen },
  { label: 'Photo Frames',     Icon: ImageIcon },
  { label: 'Photography',      Icon: Camera },
];

const CATALOGUE_PAGES = [
  '/catalogue/page-01.jpg',
  '/catalogue/page-04.jpg',
  '/catalogue/page-06.jpg',
  '/catalogue/page-08.jpg',
  '/catalogue/page-10.jpg',
  '/catalogue/page-15.jpg',
  '/catalogue/page-18.jpg',
];

const SCHOOL_OFFERINGS = [
  'Complete Uniform Solutions (Regular & PT)',
  'School Shoes, Socks & Bags',
  'Customized Notebooks & Student Diaries',
  'Identity Cards & Multicolor Lanyards',
  'Pre-primary Customized Books',
];

const CORPORATE_OFFERINGS = [
  'Office & Corporate Uniforms',
  'Branded Diaries, Office Bags & Calendars',
  'Custom-Printed T-shirts, Caps & Mugs',
  'Keychains, Bottles, Badges & Accessories',
  'Logo & Branding Solutions for Merchandise',
];

const WHY_US = [
  { title: 'Customization at its Best', desc: 'Personalize everything from material to branding.', Icon: Sparkles },
  { title: 'Premium Quality',          desc: 'Comfortable fabrics, durable finishes, vivid prints.',  Icon: Crown },
  { title: 'Bulk + On-time',           desc: 'Hassle-free services for institutions & corporates.',   Icon: Truck },
  { title: 'Year-round Support',       desc: 'Alterations, new admissions & urgent replacements.',    Icon: HeartHandshake },
];

/* ─── Reusable presentational components ─── */

type SectionLabelProps = {
  children: React.ReactNode;
  center?: boolean;
  light?: boolean;
  ink?: string;
};
function SectionLabel({ children, center, light, ink }: SectionLabelProps) {
  const color = ink ?? (light ? GOLD_LIGHT : GOLD_DEEP);
  return (
    <div className={center ? 'flex justify-center' : ''}>
      <div className="inline-flex items-center gap-2.5">
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            background: GOLD,
            transform: 'rotate(45deg)',
            borderRadius: 2,
            boxShadow: `0 0 0 3px ${NAVY}`,
          }}
        />
        <span
          className="font-bold uppercase"
          style={{ color, fontSize: 11, letterSpacing: '0.22em' }}
        >
          {children}
        </span>
        <span
          aria-hidden
          style={{
            width: 32,
            height: 1,
            background: light ? `${GOLD_LIGHT}88` : `${GOLD}aa`,
          }}
        />
      </div>
    </div>
  );
}

type DiamondCardProps = {
  color: string;
  accent: string;
  title: string;
  children: React.ReactNode;
  inverted?: boolean;
};
function DiamondCard({ color, accent, title, children, inverted }: DiamondCardProps) {
  const ink = inverted ? NAVY : '#fff';
  const muted = inverted ? `${NAVY}cc` : '#E5E9F5';
  return (
    <div className="relative" style={{ paddingBottom: 4 }}>
      {/* gold accent diamond */}
      <div
        aria-hidden
        className="absolute"
        style={{
          left: -10,
          top: -10,
          width: 40,
          height: 40,
          background: accent,
          transform: 'rotate(45deg)',
          borderRadius: 6,
          opacity: 0.85,
        }}
      />
      <div
        className="relative rounded-2xl p-7"
        style={{
          background: color,
          boxShadow: `0 16px 38px -16px ${NAVY}40`,
          border: inverted ? `1px solid ${NAVY}22` : 'none',
        }}
      >
        <h3 className="font-extrabold mb-3" style={{ color: ink, fontSize: 18, letterSpacing: '-0.01em' }}>
          {title}
        </h3>
        <p style={{ color: muted, fontSize: 13.5, lineHeight: 1.65 }}>{children}</p>
      </div>
    </div>
  );
}

type PillarCardProps = {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  items: string[];
  bgFrom: string;
  bgTo: string;
  accent: string;
  ink: string;
};
function PillarCard({ title, subtitle, Icon, items, bgFrom, bgTo, accent, ink }: PillarCardProps) {
  return (
    <motion.div
      className="relative rounded-3xl p-8 md:p-10 overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${bgFrom} 0%, ${bgTo} 100%)`,
        color: ink,
        minHeight: 380,
        boxShadow: `0 24px 56px -28px ${bgFrom}80`,
      }}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
    >
      {/* decorative diamond */}
      <div
        aria-hidden
        className="absolute"
        style={{
          right: '-10%',
          bottom: '-15%',
          width: 220,
          height: 220,
          background: `${accent}22`,
          transform: 'rotate(45deg)',
          borderRadius: 20,
        }}
      />
      <div
        className="relative rounded-xl flex items-center justify-center"
        style={{
          width: 56,
          height: 56,
          background: accent,
          color: ink,
          boxShadow: `0 12px 28px -12px ${accent}88`,
        }}
      >
        <Icon size={28} strokeWidth={2.4} />
      </div>
      <div className="mt-5 relative">
        <div
          className="font-bold uppercase"
          style={{ color: accent, fontSize: 11, letterSpacing: '0.18em' }}
        >
          {subtitle}
        </div>
        <h3
          className="font-extrabold mt-1.5"
          style={{ color: ink, fontSize: 'clamp(1.4rem, 2.4vw, 1.75rem)', letterSpacing: '-0.015em', lineHeight: 1.15 }}
        >
          {title}
        </h3>
      </div>
      <ul className="mt-6 space-y-3 relative">
        {items.map((it, i) => (
          <motion.li
            key={it}
            className="flex items-start gap-3"
            style={{ color: ink === '#fff' ? '#E5E9F5' : `${NAVY}cc`, fontSize: 14, lineHeight: 1.6 }}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 + i * 0.08, duration: 0.5 }}
          >
            <span
              className="flex-shrink-0 mt-1.5"
              aria-hidden
              style={{
                width: 7,
                height: 7,
                background: accent,
                transform: 'rotate(45deg)',
                borderRadius: 1,
              }}
            />
            <span>{it}</span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}

type ProductDiamondProps = {
  label: string;
  Icon: LucideIcon;
};
function ProductDiamond({ label, Icon }: ProductDiamondProps) {
  return (
    <div className="relative group cursor-default" style={{ paddingTop: '100%' }}>
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ transform: 'rotate(45deg)' }}
      >
        <div
          className="w-[70%] h-[70%] flex items-center justify-center transition-all duration-500 group-hover:shadow-2xl"
          style={{
            background: NAVY,
            borderRadius: 14,
            boxShadow: `0 12px 28px -12px ${NAVY}66`,
          }}
        >
          <div
            style={{ transform: 'rotate(-45deg)', textAlign: 'center', padding: 12 }}
          >
            <div
              className="mx-auto rounded-xl flex items-center justify-center mb-2"
              style={{
                width: 44,
                height: 44,
                background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})`,
                color: NAVY,
              }}
            >
              <Icon size={22} strokeWidth={2.4} />
            </div>
            <div
              className="font-bold"
              style={{ color: '#fff', fontSize: 12.5, letterSpacing: '0.01em' }}
            >
              {label}
            </div>
          </div>
        </div>
      </div>
      {/* gold corner accent */}
      <div
        aria-hidden
        className="absolute transition-transform duration-500 group-hover:scale-110"
        style={{
          left: '6%',
          top: '50%',
          width: 14,
          height: 14,
          background: GOLD,
          transform: 'translate(-50%, -50%) rotate(45deg)',
          borderRadius: 2,
        }}
      />
    </div>
  );
}

/* ─── HeroFrames: scroll-driven 3D logo frame sequence ─── */
const HERO_FRAME_COUNT = 60;
const HERO_FRAME_PATH = (i: number) =>
  `/hero-frames/frame-${String(i).padStart(3, '0')}.webp`;

function HeroFrames() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const currentRef = useRef(0);
  const targetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Preload frames
  useEffect(() => {
    let cancelled = false;
    const imgs: HTMLImageElement[] = [];
    let done = 0;
    for (let i = 0; i < HERO_FRAME_COUNT; i++) {
      const img = new window.Image();
      img.src = HERO_FRAME_PATH(i);
      img.onload = () => {
        done++;
        if (done === HERO_FRAME_COUNT && !cancelled) setLoaded(true);
      };
      img.onerror = () => {
        done++;
        if (done === HERO_FRAME_COUNT && !cancelled) setLoaded(true);
      };
      imgs.push(img);
    }
    imagesRef.current = imgs;
    return () => { cancelled = true; };
  }, []);

  // Draw the current frame
  const draw = (idx: number) => {
    const canvas = canvasRef.current;
    const img = imagesRef.current[idx];
    if (!canvas || !img || !img.complete || !img.naturalWidth) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Match canvas internal size to its display size (DPR-aware)
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    // Cover-fit: scale image to cover canvas
    const ir = img.naturalWidth / img.naturalHeight;
    const cr = w / h;
    let dw, dh, dx, dy;
    if (ir > cr) {
      dh = h;
      dw = h * ir;
      dx = (w - dw) / 2;
      dy = 0;
    } else {
      dw = w;
      dh = w / ir;
      dx = 0;
      dy = (h - dh) / 2;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, dx, dy, dw, dh);
  };

  // Smooth animation loop toward target frame
  useEffect(() => {
    if (!loaded) return;
    const tick = () => {
      const cur = currentRef.current;
      const tgt = targetRef.current;
      if (cur !== tgt) {
        // ease toward target
        const next = cur + (tgt - cur) * 0.18;
        const idx = Math.abs(tgt - cur) < 0.5 ? tgt : next;
        currentRef.current = idx;
        draw(Math.round(idx));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    // Initial draw
    draw(0);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [loaded]);

  // Scroll listener — map wrapper position within viewport to frame index
  useEffect(() => {
    const onScroll = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      // Progress 0..1 as element center moves through viewport
      const elementHeight = rect.height || 600;
      const totalRange = elementHeight + vh;
      const traveled = vh - rect.top;
      const raw = traveled / totalRange;
      const p = Math.min(1, Math.max(0, raw));
      targetRef.current = Math.round(p * (HERO_FRAME_COUNT - 1));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [loaded]);

  return (
    <div
      ref={wrapperRef}
      className="relative w-full"
      style={{ aspectRatio: '16 / 9', maxWidth: 880, margin: '0 auto' }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 24,
          boxShadow: `0 30px 80px -30px ${GOLD}40, 0 0 0 1px ${GOLD}33 inset`,
        }}
      />
      {/* Loading shimmer */}
      {!loaded && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${NAVY}, ${NAVY_DEEP})`,
            borderRadius: 24,
          }}
        >
          <Image
            src="/wisemelon-icon.png"
            alt="WiseMelon"
            width={140}
            height={140}
            style={{ objectFit: 'contain', opacity: 0.85 }}
          />
        </div>
      )}
    </div>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const heroRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll();
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });
  // Hero parallax transforms
  const heroLogoY = useTransform(heroProgress, [0, 1], [0, -80]);
  const heroLogoScale = useTransform(heroProgress, [0, 1], [1, 0.85]);
  const heroTextY = useTransform(heroProgress, [0, 1], [0, 60]);
  const heroTextOpacity = useTransform(heroProgress, [0, 0.7], [1, 0]);

  // Memoize year to avoid hydration mismatch
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  
  useEffect(() => {
    setMounted(true);
    const h = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  return (
    <>
      <div
        className="landing-page relative min-h-screen overflow-x-hidden"
        style={{
          fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
          backgroundColor: '#ffffff',
          color: INK,
        }}
      >
        {/* ═══ SCROLL PROGRESS BAR ═══ */}
        <motion.div
          className="fixed top-0 left-0 right-0 z-[60]"
          style={{
            height: 3,
            background: `linear-gradient(90deg, ${GOLD_DEEP}, ${GOLD}, ${GOLD_LIGHT})`,
            scaleX: smoothProgress,
            transformOrigin: '0%',
          }}
        />

        {/* ═══ NAVIGATION ═══ */}
        <nav
          className="sticky top-0 z-50 transition-all duration-300"
          style={{
            backgroundColor: scrolled ? 'rgba(255, 255, 255, 0.94)' : 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            boxShadow: scrolled ? '0 12px 32px -16px rgba(13, 18, 56, 0.18)' : 'none',
            borderBottom: scrolled ? `1px solid rgba(245, 185, 33, 0.18)` : '1px solid transparent',
          }}
        >
          <div className="landing-nav-inner flex justify-between items-center w-full px-6 md:px-8 py-3 max-w-7xl mx-auto">
            {/* Brand */}
            <Link href="/" className="flex items-center gap-3 group">
              <motion.div
                className="relative flex-shrink-0"
                style={{ width: 44, height: 44 }}
                whileHover={{ rotate: [0, -8, 8, 0] }}
                transition={{ duration: 0.6 }}
              >
                <Image
                  src="/wisemelon-icon.png"
                  alt="WiseMelon Ventures"
                  width={44}
                  height={44}
                  priority
                  style={{ objectFit: 'contain' }}
                />
              </motion.div>
              <div className="flex flex-col">
                <span className="font-extrabold tracking-tight leading-none" style={{ color: NAVY, fontSize: 16 }}>
                  WiseMelon
                </span>
                <span className="font-medium tracking-[0.2em] uppercase leading-none" style={{ color: GOLD_DEEP, fontSize: 9, marginTop: 3 }}>
                  Ventures Pvt. Ltd.
                </span>
              </div>
            </Link>

            {/* Center links */}
            <div className="landing-nav-links hidden md:flex items-center gap-7">
              {[
                { label: 'About',     href: '#about' },
                { label: 'Services',  href: '#services' },
                { label: 'Products',  href: '#products' },
                { label: 'Catalogue', href: '#catalogue' },
                { label: 'Contact',   href: '#contact' },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="relative font-semibold transition-colors"
                  style={{ color: NAVY, fontSize: 13.5, letterSpacing: '0.02em' }}
                >
                  <span className="hover:opacity-70 transition-opacity">{link.label}</span>
                </a>
              ))}
            </div>

            {/* Right CTAs */}
            <div className="landing-nav-links hidden md:flex items-center gap-3">
              <a
                href="/wisemelon-catalogue.pdf"
                download
                className="rounded-full font-semibold flex items-center gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]"
                style={{
                  padding: '10px 18px',
                  fontSize: 13,
                  background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD} 60%, ${GOLD_DEEP})`,
                  color: NAVY,
                  boxShadow: `0 8px 24px -8px ${GOLD}80`,
                }}
              >
                <Download size={15} strokeWidth={2.6} />
                Catalogue
              </a>
              <Link
                href="/login"
                className="rounded-full font-semibold transition-all hover:scale-[1.03] active:scale-[0.97]"
                style={{
                  padding: '10px 18px',
                  fontSize: 13,
                  background: NAVY,
                  color: '#fff',
                  boxShadow: `0 8px 24px -8px ${NAVY}80`,
                }}
              >
                Login →
              </Link>
            </div>

            {/* Mobile hamburger */}
            <button
              className="landing-mobile-toggle"
              style={{
                display: 'none',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: 10,
                border: `1px solid ${GOLD}55`,
                background: 'white',
                cursor: 'pointer',
              }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={20} color={NAVY} /> : <Menu size={20} color={NAVY} />}
            </button>
          </div>

          {/* Mobile menu dropdown */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                style={{ overflow: 'hidden', borderTop: `1px solid ${GOLD}33` }}
              >
                <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'About',     href: '#about' },
                    { label: 'Services',  href: '#services' },
                    { label: 'Products',  href: '#products' },
                    { label: 'Catalogue', href: '#catalogue' },
                    { label: 'Contact',   href: '#contact' },
                  ].map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        color: NAVY,
                        fontWeight: 600,
                        fontSize: 14,
                      }}
                    >
                      {link.label}
                    </a>
                  ))}
                  <a
                    href="/wisemelon-catalogue.pdf"
                    download
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      textAlign: 'center',
                      padding: '12px',
                      borderRadius: 12,
                      fontWeight: 700,
                      fontSize: 14,
                      marginTop: 4,
                      background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD}, ${GOLD_DEEP})`,
                      color: NAVY,
                    }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Download size={15} /> Download Catalogue
                  </a>
                  <Link
                    href="/login"
                    style={{
                      display: 'block',
                      textAlign: 'center',
                      color: 'white',
                      padding: '12px',
                      borderRadius: 12,
                      fontWeight: 600,
                      fontSize: 14,
                      background: NAVY,
                    }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Login →
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        {/* ═══ HERO ═══ */}
        <section
          ref={heroRef}
          id="home"
          className="relative w-full overflow-hidden"
          style={{
            background: `radial-gradient(1200px 700px at 50% 10%, #1a2050 0%, ${NAVY} 45%, ${NAVY_DEEP} 100%)`,
            color: '#fff',
            paddingTop: 'clamp(60px, 9vw, 110px)',
            paddingBottom: 'clamp(80px, 12vw, 160px)',
          }}
        >
          {/* Decorative gold rings */}
          <motion.div
            aria-hidden
            className="absolute"
            style={{
              left: '50%', top: '20%', transform: 'translate(-50%,-50%)',
              width: 720, height: 720, borderRadius: '50%',
              border: `1px solid ${GOLD}33`,
              filter: 'blur(0.5px)',
              pointerEvents: 'none',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
          />
          <motion.div
            aria-hidden
            className="absolute"
            style={{
              left: '50%', top: '20%', transform: 'translate(-50%,-50%)',
              width: 540, height: 540, borderRadius: '50%',
              border: `1px dashed ${GOLD}55`,
              pointerEvents: 'none',
            }}
            animate={{ rotate: -360 }}
            transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}
          />

          {/* Floating diamonds */}
          {[
            { left: '8%',  top: '15%', size: 22, delay: 0 },
            { left: '88%', top: '20%', size: 16, delay: 0.6 },
            { left: '15%', top: '70%', size: 18, delay: 1.2 },
            { left: '82%', top: '60%', size: 24, delay: 0.3 },
            { left: '50%', top: '85%', size: 14, delay: 1.5 },
          ].map((d, i) => (
            <motion.div
              key={i}
              aria-hidden
              className="absolute"
              style={{
                left: d.left, top: d.top,
                width: d.size, height: d.size,
                background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD_DEEP})`,
                transform: 'rotate(45deg)',
                borderRadius: 3,
                opacity: 0.55,
              }}
              animate={{ y: [0, -14, 0], rotate: [45, 60, 45] }}
              transition={{ duration: 6, delay: d.delay, repeat: Infinity, ease: 'easeInOut' }}
            />
          ))}

          <div className="max-w-7xl mx-auto px-6 md:px-8 relative">
            {/* Scroll-driven 3D logo reveal */}
            <motion.div
              className="relative"
              style={{ y: heroLogoY, scale: heroLogoScale, marginBottom: 28 }}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={mounted ? { opacity: 1, scale: 1 } : { opacity: 0 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Soft gold halo behind the canvas */}
              <div
                aria-hidden
                className="absolute"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%,-50%)',
                  width: '70%',
                  height: '70%',
                  background: `radial-gradient(circle, ${GOLD}33 0%, transparent 70%)`,
                  filter: 'blur(40px)',
                  pointerEvents: 'none',
                }}
              />
              <HeroFrames />
              {/* Scroll hint */}
              <motion.div
                aria-hidden
                className="absolute left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2"
                style={{ bottom: -36, color: '#C7CCEA', fontSize: 10, letterSpacing: '0.22em', fontWeight: 600 }}
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <span>SCROLL TO REVEAL</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD_LIGHT} strokeWidth="2" strokeLinecap="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </motion.div>
            </motion.div>

            {/* Brand title */}
            <motion.div
              className="text-center"
              style={{ y: heroTextY, opacity: heroTextOpacity }}
              variants={staggerContainer}
              initial="hidden"
              animate={mounted ? 'visible' : 'hidden'}
            >
              <motion.div
                variants={fadeUp}
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-6"
                style={{
                  border: `1px solid ${GOLD}55`,
                  background: 'rgba(245, 185, 33, 0.08)',
                  color: GOLD_LIGHT,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                }}
              >
                <Sparkles size={12} />
                <span>EST. 2012 · TRUSTED BY 50+ INSTITUTIONS</span>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="font-extrabold leading-[1.05] tracking-tight"
                style={{
                  fontSize: 'clamp(2.4rem, 6.2vw, 5.4rem)',
                  letterSpacing: '-0.025em',
                }}
              >
                WiseMelon{' '}
                <span
                  style={{
                    background: `linear-gradient(135deg, ${GOLD_LIGHT} 10%, ${GOLD} 50%, ${GOLD_DEEP} 90%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Ventures
                </span>
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="mx-auto mt-6 leading-relaxed"
                style={{
                  color: '#E0E4F4',
                  fontSize: 'clamp(1rem, 1.6vw, 1.3rem)',
                  maxWidth: 760,
                  lineHeight: 1.65,
                }}
              >
                <span style={{ color: GOLD_LIGHT, fontWeight: 600 }}>
                  Perfect Solution for School Essentials &amp; Corporate Gifting.
                </span>
                <br />
                Premium uniforms, ID cards, lanyards, branded merchandise &amp; more — crafted with care, delivered on time.
              </motion.p>

              <motion.div
                variants={fadeUp}
                className="flex flex-wrap justify-center items-center gap-4 mt-10"
              >
                <a
                  href="/wisemelon-catalogue.pdf"
                  download
                  className="rounded-full font-bold flex items-center gap-2 transition-transform hover:scale-105 active:scale-95"
                  style={{
                    padding: '16px 30px',
                    fontSize: 15,
                    background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD} 55%, ${GOLD_DEEP})`,
                    color: NAVY,
                    boxShadow: `0 14px 38px -10px ${GOLD}, 0 0 0 1px ${GOLD_LIGHT}55 inset`,
                  }}
                >
                  <Download size={17} strokeWidth={2.6} />
                  Download Catalogue
                </a>
                <a
                  href="#products"
                  className="rounded-full font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                  style={{
                    padding: '16px 30px',
                    fontSize: 15,
                    background: 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.18)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  Explore Products <ArrowRight size={16} />
                </a>
              </motion.div>

              <motion.div
                variants={fadeUp}
                className="mt-14 flex flex-wrap items-center justify-center gap-x-10 gap-y-5"
                style={{ color: '#C7CCEA' }}
              >
                {[
                  { v: '50',  s: '+',  l: 'Schools served' },
                  { v: '12',  s: '+',  l: 'Years in industry' },
                  { v: '24',  s: 'hr', l: 'Standard dispatch' },
                  { v: '100', s: '%',  l: 'Customizable' },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="font-extrabold leading-none" style={{ color: GOLD_LIGHT, fontSize: 26 }}>
                      <AnimatedCounter value={s.v} suffix={s.s} />
                    </div>
                    <div className="text-xs uppercase tracking-[0.18em]" style={{ fontSize: 10.5 }}>
                      {s.l}
                    </div>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>

          <svg
            aria-hidden
            viewBox="0 0 1440 120"
            preserveAspectRatio="none"
            style={{ position: 'absolute', left: 0, right: 0, bottom: -1, width: '100%', height: 60, pointerEvents: 'none' }}
          >
            <path d="M0,80 Q360,10 720,60 T1440,40 L1440,120 L0,120 Z" fill={GOLD} opacity="0.95" />
          </svg>
        </section>

        {/* ═══ ABOUT ═══ */}
        <section id="about" className="max-w-7xl mx-auto px-6 md:px-8 py-20 md:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            <motion.div
              className="lg:col-span-7"
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <SectionLabel>About Us</SectionLabel>
              <h2 className="font-extrabold mt-3" style={{ color: NAVY, fontSize: 'clamp(1.8rem, 3.6vw, 2.8rem)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                Crafting institutional identity since <span style={{ color: GOLD_DEEP }}>2012</span>.
              </h2>
              <div className="mt-6 space-y-4" style={{ color: MUTED, fontSize: 'clamp(0.95rem, 1.2vw, 1.05rem)', lineHeight: 1.8 }}>
                <p>
                  WiseMelon Ventures has been supplying both public and private sectors since
                  <strong style={{ color: NAVY }}> 2012</strong> — initially as
                  <strong style={{ color: NAVY }}> 3rd Eye Technovision</strong> — and was reorganised
                  in <strong style={{ color: NAVY }}>January 2025</strong> as <strong style={{ color: NAVY }}>WiseMelon Ventures Pvt. Ltd.</strong>
                </p>
                <p>
                  We carry vast experience in ID cards, school equipment and corporate
                  gifting products. We serve <strong style={{ color: NAVY }}>50+ schools</strong> and
                  corporate organisations and aim to complete most standard orders within
                  <strong style={{ color: NAVY }}> 24 hours</strong>.
                </p>
                <p>
                  Through many years in this industry we&apos;ve built long-standing relationships with
                  our clients — and offer an unbeatable selection of merchandise at competitive prices.
                </p>
              </div>
            </motion.div>

            <motion.div
              className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-5"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              variants={staggerContainer}
            >
              <motion.div variants={scaleIn}>
                <DiamondCard color={NAVY} accent={GOLD} title="Our Mission">
                  Premium-quality uniforms, accessories &amp; customized gifts —
                  affordable, tailor-made, and delivered through seamless bulk ordering.
                </DiamondCard>
              </motion.div>
              <motion.div variants={scaleIn} className="sm:mt-12">
                <DiamondCard color={GOLD} accent={NAVY} title="Our Vision" inverted>
                  To be a leading provider of school &amp; corporate gifting solutions —
                  enhancing identity, unity, and professional branding.
                </DiamondCard>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ═══ TWO PILLARS — SERVICES ═══ */}
        <section id="services" style={{ background: CREAM }}>
          <div className="max-w-7xl mx-auto px-6 md:px-8 py-20 md:py-28">
            <div className="text-center mb-14">
              <SectionLabel center>What We Offer</SectionLabel>
              <h2 className="font-extrabold mt-3" style={{ color: NAVY, fontSize: 'clamp(1.8rem, 3.6vw, 2.8rem)', letterSpacing: '-0.02em' }}>
                Two pillars. <span style={{ color: GOLD_DEEP }}>One promise.</span>
              </h2>
              <p className="mt-3 mx-auto" style={{ color: MUTED, fontSize: 15, maxWidth: 640, lineHeight: 1.7 }}>
                From classroom essentials to corporate gifting — every product carries our quality and customization commitment.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              <PillarCard
                title="School Essentials"
                subtitle="Institutional Attire & Identity"
                Icon={GraduationCap}
                items={SCHOOL_OFFERINGS}
                bgFrom={NAVY}
                bgTo={NAVY_DEEP}
                accent={GOLD_LIGHT}
                ink="#fff"
              />
              <PillarCard
                title="Corporate Gifting"
                subtitle="Branded Merchandise & Apparel"
                Icon={Briefcase}
                items={CORPORATE_OFFERINGS}
                bgFrom={GOLD}
                bgTo={GOLD_DEEP}
                accent={NAVY}
                ink={NAVY}
              />
            </div>
          </div>
        </section>

        {/* ═══ PRODUCT CATEGORIES ═══ */}
        <section id="products" className="max-w-7xl mx-auto px-6 md:px-8 py-20 md:py-28">
          <div className="text-center mb-14">
            <SectionLabel center>Our Expertise</SectionLabel>
            <h2 className="font-extrabold mt-3" style={{ color: NAVY, fontSize: 'clamp(1.8rem, 3.6vw, 2.8rem)', letterSpacing: '-0.02em' }}>
              Twelve product lines. <span style={{ color: GOLD_DEEP }}>One trusted partner.</span>
            </h2>
          </div>

          <motion.div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
          >
            {PRODUCT_CATEGORIES.map((cat) => (
              <motion.div
                key={cat.label}
                variants={scaleIn}
                whileHover={{ y: -6 }}
                transition={{ type: 'spring', stiffness: 280, damping: 18 }}
              >
                <ProductDiamond label={cat.label} Icon={cat.Icon} />
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ═══ CATALOGUE GALLERY ═══ */}
        <section id="catalogue" className="relative py-20 md:py-28 overflow-hidden" style={{ background: NAVY }}>
          <div className="max-w-7xl mx-auto px-6 md:px-8 text-center mb-12 relative z-10">
            <SectionLabel center light>Catalogue Preview</SectionLabel>
            <h2 className="font-extrabold mt-3" style={{ color: '#fff', fontSize: 'clamp(1.8rem, 3.6vw, 2.8rem)', letterSpacing: '-0.02em' }}>
              Browse a sneak-peek <span style={{ color: GOLD_LIGHT }}>of our 28-page catalogue.</span>
            </h2>
            <p className="mt-3 mx-auto" style={{ color: '#C7CCEA', fontSize: 15, maxWidth: 640, lineHeight: 1.7 }}>
              Tap any page to download the full PDF and explore our complete range of products.
            </p>
          </div>

          <div className="catalogue-marquee">
            <div className="catalogue-marquee-track">
              {[...CATALOGUE_PAGES, ...CATALOGUE_PAGES].map((src, i) => (
                <a
                  key={i}
                  href="/wisemelon-catalogue.pdf"
                  download
                  className="catalogue-marquee-item"
                  style={{ boxShadow: `0 22px 50px -22px ${GOLD}55, 0 0 0 1px ${GOLD}33` }}
                  aria-label="Download full catalogue"
                >
                  <Image
                    src={src}
                    alt={`Catalogue page preview ${i + 1}`}
                    width={300}
                    height={424}
                    style={{ objectFit: 'cover', display: 'block' }}
                  />
                  <div className="catalogue-marquee-overlay">
                    <Download size={20} />
                    <span style={{ fontSize: 12, fontWeight: 700, marginTop: 6 }}>Download PDF</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ WHY US ═══ */}
        <section className="max-w-7xl mx-auto px-6 md:px-8 py-20 md:py-28">
          <div className="text-center mb-14">
            <SectionLabel center>Why WiseMelon</SectionLabel>
            <h2 className="font-extrabold mt-3" style={{ color: NAVY, fontSize: 'clamp(1.8rem, 3.6vw, 2.8rem)', letterSpacing: '-0.02em' }}>
              Built on trust. <span style={{ color: GOLD_DEEP }}>Delivered with care.</span>
            </h2>
          </div>

          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
          >
            {WHY_US.map((w) => (
              <motion.div
                key={w.title}
                variants={fadeUp}
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 250, damping: 18 }}
                className="rounded-2xl p-7"
                style={{
                  background: '#fff',
                  border: `1px solid ${GOLD}33`,
                  boxShadow: `0 12px 32px -16px ${NAVY}1a`,
                }}
              >
                <div
                  className="rounded-xl flex items-center justify-center"
                  style={{
                    width: 52, height: 52,
                    background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})`,
                    color: NAVY,
                  }}
                >
                  <w.Icon size={26} strokeWidth={2.4} />
                </div>
                <h3 className="font-extrabold mt-4" style={{ color: NAVY, fontSize: 17, letterSpacing: '-0.01em' }}>
                  {w.title}
                </h3>
                <p className="mt-2" style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.65 }}>
                  {w.desc}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ═══ CATALOGUE DOWNLOAD BANNER ═══ */}
        <section className="px-4 sm:px-6 md:px-8 pb-8">
          <motion.div
            className="max-w-7xl mx-auto rounded-3xl px-8 md:px-14 py-14 md:py-20 relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${GOLD_LIGHT} 0%, ${GOLD} 45%, ${GOLD_DEEP} 100%)`,
              boxShadow: `0 30px 80px -30px ${GOLD}80`,
            }}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              aria-hidden
              className="absolute"
              style={{
                right: '-3%', top: '50%',
                transform: 'translateY(-50%) rotate(45deg)',
                width: 280, height: 280,
                background: `${NAVY}11`, borderRadius: 24,
              }}
            />
            <div
              aria-hidden
              className="absolute"
              style={{
                right: '6%', top: '50%',
                transform: 'translateY(-50%) rotate(45deg)',
                width: 180, height: 180,
                background: `${NAVY}1a`, borderRadius: 18,
              }}
            />

            <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <SectionLabel ink={NAVY}>Get the Full Catalogue</SectionLabel>
                <h2 className="font-extrabold mt-3" style={{ color: NAVY, fontSize: 'clamp(1.8rem, 3.6vw, 2.6rem)', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
                  All 28 pages. <br />Every product. <br />One download.
                </h2>
                <p className="mt-4" style={{ color: NAVY, opacity: 0.78, fontSize: 15, maxWidth: 480, lineHeight: 1.65 }}>
                  Take the full WiseMelon Ventures product catalogue with you — share it with your purchase committee, principal, or admin team.
                </p>
              </div>
              <div className="flex flex-wrap items-center md:justify-end gap-4">
                <a
                  href="/wisemelon-catalogue.pdf"
                  download
                  className="rounded-full font-bold flex items-center gap-2 transition-transform hover:scale-105 active:scale-95"
                  style={{
                    padding: '18px 32px',
                    fontSize: 16,
                    background: NAVY,
                    color: '#fff',
                    boxShadow: `0 18px 40px -12px ${NAVY}99`,
                  }}
                >
                  <Download size={18} strokeWidth={2.6} />
                  Download PDF (4.5 MB)
                </a>
                <a
                  href="#contact"
                  className="rounded-full font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                  style={{
                    padding: '18px 28px',
                    fontSize: 15,
                    background: 'rgba(13,18,56,0.08)',
                    color: NAVY,
                    border: `1.5px solid ${NAVY}33`,
                  }}
                >
                  Talk to Sales <ArrowRight size={16} />
                </a>
              </div>
            </div>
          </motion.div>
        </section>

        {/* ═══ CONTACT / FOOTER ═══ */}
        <motion.footer
          id="contact"
          className="px-4 sm:px-8 mt-12"
          style={{ background: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`, color: '#fff' }}
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="landing-footer-inner max-w-7xl mx-auto pt-24 pb-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
              {/* Brand block */}
              <motion.div
                className="lg:col-span-5 flex flex-col gap-5"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.05 }}
              >
                <div className="flex items-center gap-4">
                  <div className="relative" style={{ width: 64, height: 64 }}>
                    <Image
                      src="/wisemelon-icon.png"
                      alt="WiseMelon Ventures"
                      fill
                      sizes="64px"
                      style={{ objectFit: 'contain' }}
                    />
                  </div>
                  <div>
                    <div className="font-extrabold tracking-tight leading-none" style={{ fontSize: 22 }}>
                      WiseMelon
                    </div>
                    <div
                      className="font-medium tracking-[0.2em] uppercase"
                      style={{ color: GOLD_LIGHT, fontSize: 10, marginTop: 4 }}
                    >
                      Ventures Pvt. Ltd.
                    </div>
                  </div>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.7, maxWidth: 420 }}>
                  Perfect Solution for School Essentials &amp; Corporate Gifting. Premium uniforms, ID cards, branded merchandise &amp; more — trusted by 50+ institutions across India.
                </p>
                <a
                  href="/wisemelon-catalogue.pdf"
                  download
                  className="self-start rounded-full font-bold flex items-center gap-2 transition-transform hover:scale-105 active:scale-95 mt-2"
                  style={{
                    padding: '12px 22px',
                    fontSize: 13,
                    background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD}, ${GOLD_DEEP})`,
                    color: NAVY,
                    boxShadow: `0 12px 30px -10px ${GOLD}80`,
                  }}
                >
                  <Download size={15} strokeWidth={2.6} />
                  Download Catalogue
                </a>
              </motion.div>

              {/* Quick links */}
              <motion.div
                className="lg:col-span-3"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.15 }}
              >
                <div className="font-bold uppercase mb-4" style={{ color: GOLD_LIGHT, fontSize: 11, letterSpacing: '0.18em' }}>
                  Explore
                </div>
                <ul className="space-y-3">
                  {[
                    { label: 'About Us',     href: '#about' },
                    { label: 'Services',     href: '#services' },
                    { label: 'Products',     href: '#products' },
                    { label: 'Catalogue',    href: '#catalogue' },
                    { label: 'School Login', href: '/login' },
                  ].map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        className="transition-colors hover:text-white"
                        style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13.5 }}
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </motion.div>

              {/* Contact */}
              <motion.div
                className="lg:col-span-4"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.25 }}
              >
                <div className="font-bold uppercase mb-4" style={{ color: GOLD_LIGHT, fontSize: 11, letterSpacing: '0.18em' }}>
                  Get in Touch
                </div>
                <ul className="space-y-4" style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13.5 }}>
                  <li className="flex items-start gap-3">
                    <Phone size={16} style={{ color: GOLD_LIGHT, marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <a href="tel:+919881877607" className="hover:text-white transition-colors">+91 98818 77607</a>
                      <span className="opacity-50"> · </span>
                      <a href="tel:+918888740323" className="hover:text-white transition-colors">+91 88887 40323</a>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Mail size={16} style={{ color: GOLD_LIGHT, marginTop: 2, flexShrink: 0 }} />
                    <a href="mailto:wisemelonventures@gmail.com" className="hover:text-white transition-colors">
                      wisemelonventures@gmail.com
                    </a>
                  </li>
                  <li className="flex items-start gap-3">
                    <MapPin size={16} style={{ color: GOLD_LIGHT, marginTop: 2, flexShrink: 0 }} />
                    <span style={{ lineHeight: 1.6 }}>
                      Lane No-16/A, Madina Manzil, 1st Floor,<br />
                      Sayyed Nagar, Hadapsar, Pune-411028
                    </span>
                  </li>
                </ul>
                {/* Social */}
                <div className="flex gap-3 mt-6">
                  {[
                    { Icon: Instagram, href: 'https://instagram.com/wisemelon_1512_', label: 'Instagram' },
                    { Icon: Facebook,  href: 'https://facebook.com/',                   label: 'Facebook' },
                  ].map(({ Icon, href, label }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="rounded-full flex items-center justify-center transition-all hover:scale-110"
                      style={{
                        width: 38,
                        height: 38,
                        background: 'rgba(255,255,255,0.06)',
                        border: `1px solid ${GOLD}33`,
                        color: GOLD_LIGHT,
                      }}
                    >
                      <Icon size={16} />
                    </a>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* Footer bottom */}
            <div
              className="landing-footer-bottom w-full mt-16 pt-8 flex flex-col md:flex-row justify-between items-center gap-4"
              style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div suppressHydrationWarning style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 500 }}>
                © {currentYear} WiseMelon Ventures Pvt. Ltd. · All rights reserved.
              </div>
              <div className="flex flex-wrap justify-center gap-6">
                <a href="#" className="transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Privacy Policy</a>
                <a href="#" className="transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Terms of Service</a>
                <a href="https://www.wisemelonventures.com" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                  www.wisemelonventures.com
                </a>
              </div>
            </div>
          </div>
        </motion.footer>
      </div>
    </>
  );
}
