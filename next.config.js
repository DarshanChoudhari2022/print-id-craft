/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true, 
  },
  // Disable SWC Minify due to SyntaxError in onnxruntime-web pre-compiled code
  swcMinify: false,
  // Performance: enable React strict mode (catches bugs early)
  reactStrictMode: true,
  // Performance: compress responses
  compress: true,
  // Security: power-hide
  poweredByHeader: false,
  // Performance: optimize images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
  },
  // Performance: optimize builds — tree-shake large packages
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'framer-motion',
      '@react-pdf/renderer',
      'sonner',
      '@supabase/supabase-js',
      'zod',
    ],
    serverComponentsExternalPackages: ['@imgly/background-removal', 'onnxruntime-web'],
  },
  // Security-relevant headers (augments middleware headers)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
      // Cache static assets aggressively
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
  // Webpack: handle @imgly/background-removal (loaded dynamically at runtime only)
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    }

    // Externalize heavy WASM/ONNX packages from server bundle
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push('@imgly/background-removal')
      config.externals.push('onnxruntime-web')
      config.externals.push('onnxruntime-web/webgpu')
    } else {
      // Client: resolve ONNX runtime modules that may not exist at build time
      config.resolve = config.resolve || {}
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'onnxruntime-web/webgpu': false,
      }
    }

    return config
  },
}

module.exports = nextConfig
