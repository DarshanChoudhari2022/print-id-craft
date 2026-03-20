import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname

    // Manufacturer routes
    if (path.startsWith("/dashboard") || path.startsWith("/schools")) {
      if (token?.role !== "MANUFACTURER") {
        return NextResponse.redirect(new URL("/login", req.url))
      }
    }

    // Teacher routes
    if (path.startsWith("/teacher")) {
      if (token?.role !== "TEACHER") {
        return NextResponse.redirect(new URL("/login", req.url))
      }
    }

    // API route protection
    if (path.startsWith("/api/schools") || path.startsWith("/api/admin")) {
      if (token?.role !== "MANUFACTURER") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    if (path.startsWith("/api/teacher")) {
      if (token?.role !== "TEACHER") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    // Login redirect if already authenticated
    if (path === "/login" && token) {
      if (token.role === "MANUFACTURER") {
        return NextResponse.redirect(new URL("/dashboard", req.url))
      }
      if (token.role === "TEACHER") {
        return NextResponse.redirect(new URL("/teacher/dashboard", req.url))
      }
    }
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname
        // Allow public routes without auth
        if (
          path === "/" ||
          path.startsWith("/submit/") ||
          path.startsWith("/api/submit/") ||
          path.startsWith("/api/auth/") ||
          path.startsWith("/api/health") ||
          path === "/login"
        ) {
          return true
        }
        return !!token
      },
    },
  }
)

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/schools/:path*",
    "/teacher/:path*",
    "/login",
    "/api/schools/:path*",
    "/api/teacher/:path*",
    "/api/admin/:path*",
  ],
}
