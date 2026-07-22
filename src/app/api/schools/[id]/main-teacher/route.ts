import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { isCompanyWorkspace } from "@/lib/workspace-kind"

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await req.json().catch(() => ({}))
    const { email: manualEmail, reset, action, expiresAt } = body

    const school = await prisma.school.findUnique({
      where: { id: params.id },
      include: {
        teachers: { where: { isMainTeacher: true } },
        templates: { select: { fieldConfig: true } },
      }
    })

    if (!school) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
    }
    const companyMode = isCompanyWorkspace(
      school.name,
      school.templates.flatMap(template =>
        Array.isArray(template.fieldConfig)
          ? template.fieldConfig as Array<{ key?: string; label?: string }>
          : []
      ),
      school.workspaceKind,
    )
    const defaultPasswordText = companyMode ? "Company@123" : "Teacher@123"
    const accountLabel = companyMode ? "ID card coordinator" : "Main ID card coordinator"

    if (reset && school.teachers.length > 0) {
      const teacher = school.teachers[0]
      const defaultPassword = await bcrypt.hash(defaultPasswordText, 12)
      await prisma.user.update({
        where: { id: teacher.id },
        data: { password: defaultPassword, isActive: true, expiresAt: null }
      })
      return NextResponse.json({ success: true, message: `Password reset to ${defaultPasswordText}` })
    }

    if (action && school.teachers.length > 0) {
      const teacher = school.teachers[0]
      if (action === "close") {
        await prisma.user.update({
          where: { id: teacher.id },
          data: { isActive: false },
        })
        return NextResponse.json({ success: true, message: "Coordinator login closed" })
      }
      if (action === "reopen") {
        await prisma.user.update({
          where: { id: teacher.id },
          data: { isActive: true, expiresAt: null },
        })
        return NextResponse.json({ success: true, message: "Coordinator login reopened" })
      }
      if (action === "expiry") {
        const parsedExpiry = expiresAt ? new Date(expiresAt) : null
        if (expiresAt && Number.isNaN(parsedExpiry?.getTime())) {
          return NextResponse.json({ error: "Invalid expiry date" }, { status: 400 })
        }
        await prisma.user.update({
          where: { id: teacher.id },
          data: {
            isActive: !parsedExpiry || parsedExpiry.getTime() > Date.now(),
            expiresAt: parsedExpiry,
          },
        })
        return NextResponse.json({ success: true, message: parsedExpiry ? "Coordinator login expiry updated" : "Coordinator login expiry removed" })
      }
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    if (school.teachers.length > 0 && !manualEmail) {
      return NextResponse.json({ error: `${accountLabel} already exists` }, { status: 400 })
    }

    const defaultPassword = await bcrypt.hash(defaultPasswordText, 12)
    const email = manualEmail || school.contactEmail ||
      `${companyMode ? "representative" : "admin"}_${school.id.substring(0, 8)}@${companyMode ? "company" : "school"}.com`

    // Check if email already taken
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser && existingUser.schoolId !== school.id) {
        return NextResponse.json({ error: "This email is already in use by another account." }, { status: 400 })
    }

    if (existingUser) {
        await prisma.user.update({
            where: { id: existingUser.id },
            data: { isMainTeacher: true, role: "TEACHER", schoolId: school.id, isActive: true, expiresAt: null }
        })
    } else {
        await prisma.user.create({
            data: {
                email,
                password: defaultPassword,
                name: companyMode ? `${school.name} ID Card Coordinator` : `${school.name} ID Card Coordinator`,
                role: "TEACHER",
                schoolId: school.id,
                isMainTeacher: true,
            }
        })
    }

    return NextResponse.json({ success: true, message: `${accountLabel} account updated successfully` })
  } catch (error) {
    console.error(`POST /api/schools/${params.id}/main-teacher error:`, error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
