import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import crypto from "crypto"

const classSchema = z.object({
  name: z.string().min(1, "Class name is required"),
  expiresAt: z.string().datetime().optional().nullable(),
})

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const classes = await prisma.class.findMany({
      where: { schoolId: params.id },
      include: {
        _count: { select: { students: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ success: true, data: classes })
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify school exists
    const school = await prisma.school.findUnique({ where: { id: params.id } })
    if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 })

    const body = await req.json()
    const validated = classSchema.parse(body)

    const newClass = await prisma.class.create({
      data: {
        name: validated.name,
        schoolId: params.id,
        linkToken: crypto.randomUUID(),
        expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : null,
      },
    })

    return NextResponse.json({ success: true, data: newClass }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
