import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

export const dynamic = "force-dynamic"

const schoolSchema = z.object({
  name: z.string().min(2, "School name must be at least 2 characters"),
  contactEmail: z.string().email("Invalid contact email"),
  address: z.string().optional(),
  logoUrl: z.string().optional(),
})

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schools = await prisma.school.findMany({
      include: {
        _count: {
          select: { classes: true, students: true, batches: true }
        },
        template: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ success: true, data: schools })
  } catch (error) {
    console.error("GET /api/schools error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validated = schoolSchema.parse(body)

    const school = await prisma.school.create({
      data: {
        name: validated.name,
        contactEmail: validated.contactEmail,
        address: validated.address || null,
        logoUrl: validated.logoUrl || null,
      },
    })

    // Create empty template for this school
    await prisma.template.create({
      data: {
        schoolId: school.id,
        frontLayout: [],
        backLayout: [],
        fieldConfig: [], // Auto-generated when admin maps fields on JPG template
      },
    })

    return NextResponse.json({ success: true, data: school }, { status: 201 })
  } catch (error) {
    console.error("POST /api/schools error:", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
