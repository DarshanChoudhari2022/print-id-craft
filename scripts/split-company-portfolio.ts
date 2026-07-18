import "dotenv/config"
import bcrypt from "bcryptjs"
import { Prisma, PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const LEGACY_WORKSPACE_NAME = "Company ID Cards"
const DEFAULT_PASSWORD = "Company@123"

type TemplateSnapshot = {
  id: string
  name: string
  frontLayout: Prisma.JsonValue
  backLayout: Prisma.JsonValue
  cardWidthMm: number
  cardHeightMm: number
  printDpi: number
  orientation: "PORTRAIT" | "LANDSCAPE"
  fieldConfig: Prisma.JsonValue
  templateImageUrl: string | null
  backTemplateImageUrl: string | null
  fieldMappings: Prisma.JsonValue
  backFieldMappings: Prisma.JsonValue
  hasBackSide: boolean
  photoBgColor: string
  cardSizeLocked: boolean
  printConfig: Prisma.JsonValue | null
}

function asInputJson(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function optionalInputJson(
  value: Prisma.JsonValue | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : asInputJson(value)
}

function representativeEmail(companyName: string, sourceClassId: string): string {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 40) || "company"
  return `representative.${slug}.${sourceClassId.slice(-6)}@wisemelon.com`
}

function findCompanyAddress(
  students: Array<{ formData: Prisma.JsonValue }>,
): string | null {
  const acceptedKeys = new Set([
    "officeaddress",
    "corporateaddress",
    "corporateofficeaddress",
    "companyaddress",
  ])

  for (const student of students) {
    if (!student.formData || typeof student.formData !== "object" || Array.isArray(student.formData)) {
      continue
    }
    for (const [key, rawValue] of Object.entries(student.formData)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "")
      if (!acceptedKeys.has(normalizedKey)) continue
      const value = String(rawValue ?? "").replace(/\s+/g, " ").trim()
      if (value) return value
    }
  }
  return null
}

function templateCreateData(
  template: TemplateSnapshot,
  schoolId: string,
  companyName: string,
): Prisma.TemplateUncheckedCreateInput {
  return {
    schoolId,
    name: `${companyName} Employee Template`,
    frontLayout: asInputJson(template.frontLayout),
    backLayout: asInputJson(template.backLayout),
    cardWidthMm: template.cardWidthMm,
    cardHeightMm: template.cardHeightMm,
    printDpi: template.printDpi,
    orientation: template.orientation,
    fieldConfig: asInputJson(template.fieldConfig),
    templateImageUrl: template.templateImageUrl,
    backTemplateImageUrl: template.backTemplateImageUrl,
    fieldMappings: asInputJson(template.fieldMappings),
    backFieldMappings: asInputJson(template.backFieldMappings),
    hasBackSide: template.hasBackSide,
    photoBgColor: template.photoBgColor,
    cardSizeLocked: template.cardSizeLocked,
    printConfig: optionalInputJson(template.printConfig),
  }
}

async function loadLegacyWorkspace(client: PrismaClient | Prisma.TransactionClient) {
  return client.school.findFirst({
    where: { name: { equals: LEGACY_WORKSPACE_NAME, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      classes: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          templateId: true,
          students: { select: { id: true, formData: true } },
          teachers: { select: { id: true } },
        },
      },
      templates: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          frontLayout: true,
          backLayout: true,
          cardWidthMm: true,
          cardHeightMm: true,
          printDpi: true,
          orientation: true,
          fieldConfig: true,
          templateImageUrl: true,
          backTemplateImageUrl: true,
          fieldMappings: true,
          backFieldMappings: true,
          hasBackSide: true,
          photoBgColor: true,
          cardSizeLocked: true,
          printConfig: true,
        },
      },
      _count: {
        select: {
          students: true,
          batches: true,
          teachers: true,
        },
      },
    },
  })
}

async function main() {
  const legacy = await loadLegacyWorkspace(prisma)

  if (!legacy) {
    console.log(`No '${LEGACY_WORKSPACE_NAME}' legacy workspace exists. Nothing to split.`)
    return
  }
  if (legacy.classes.length === 0) {
    throw new Error("Legacy company workspace has no company groups.")
  }
  if (legacy._count.batches > 0) {
    throw new Error(
      `Migration stopped safely: ${legacy._count.batches} print batch(es) still belong to the legacy workspace.`,
    )
  }

  const sourceTemplateById = new Map(
    legacy.templates.map(template => [template.id, template]),
  )
  const fallbackTemplate = legacy.templates[0]
  if (!fallbackTemplate) {
    throw new Error("Migration stopped safely: the legacy workspace has no template to clone.")
  }

  const duplicateNames = await prisma.school.findMany({
    where: {
      id: { not: legacy.id },
      name: { in: legacy.classes.map(group => group.name), mode: "insensitive" },
    },
    select: { id: true, name: true },
  })
  if (duplicateNames.length > 0) {
    throw new Error(
      `Migration stopped safely: company workspace(s) already exist for ${duplicateNames.map(item => item.name).join(", ")}.`,
    )
  }

  const plan = legacy.classes.map(group => ({
    sourceClassId: group.id,
    companyName: group.name.trim(),
    employeeCount: group.students.length,
    sourceTemplate: group.templateId
      ? sourceTemplateById.get(group.templateId) || fallbackTemplate
      : fallbackTemplate,
    companyAddress: findCompanyAddress(group.students),
    representativeEmail: representativeEmail(group.name, group.id),
    managerCount: group.teachers.length,
  }))
  const plannedEmployeeCount = plan.reduce((sum, item) => sum + item.employeeCount, 0)

  console.log(`${APPLY ? "APPLY" : "DRY RUN"}: split '${legacy.name}' into ${plan.length} independent companies`)
  for (const item of plan) {
    console.log(
      `- ${item.companyName}: ${item.employeeCount} employees, template '${item.sourceTemplate.name}', ${item.managerCount} existing manager(s)`,
    )
  }
  console.log(`Total employees protected by transaction: ${plannedEmployeeCount}`)

  if (plannedEmployeeCount !== legacy._count.students) {
    throw new Error(
      `Migration stopped safely: grouped employee count ${plannedEmployeeCount} does not match workspace count ${legacy._count.students}.`,
    )
  }
  if (!APPLY) {
    console.log("Dry run complete. Re-run with --apply to perform the atomic conversion.")
    return
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12)
  const migrated = await prisma.$transaction(async tx => {
    const source = await loadLegacyWorkspace(tx)
    if (!source || source.id !== legacy.id) {
      throw new Error("Legacy workspace changed after planning; transaction cancelled.")
    }
    if (source._count.students !== plannedEmployeeCount || source.classes.length !== plan.length) {
      throw new Error("Legacy employee/group counts changed after planning; transaction cancelled.")
    }

    const newCompanies: Array<{ id: string; name: string; employeeCount: number }> = []
    for (const item of plan) {
      const company = await tx.school.create({
        data: {
          name: item.companyName,
          workspaceKind: "company",
          address: item.companyAddress,
          contactEmail: item.representativeEmail,
          logoUrl: source.logoUrl,
        },
      })
      const template = await tx.template.create({
        data: templateCreateData(
          item.sourceTemplate as TemplateSnapshot,
          company.id,
          item.companyName,
        ),
      })
      const generalGroup = await tx.class.create({
        data: {
          name: "General",
          schoolId: company.id,
          templateId: template.id,
        },
      })

      const movedEmployees = await tx.student.updateMany({
        where: {
          schoolId: source.id,
          classId: item.sourceClassId,
        },
        data: {
          schoolId: company.id,
          classId: generalGroup.id,
        },
      })
      if (movedEmployees.count !== item.employeeCount) {
        throw new Error(
          `${item.companyName}: expected ${item.employeeCount} employees, moved ${movedEmployees.count}.`,
        )
      }

      await tx.user.updateMany({
        where: {
          schoolId: source.id,
          classId: item.sourceClassId,
        },
        data: {
          schoolId: company.id,
          classId: generalGroup.id,
          isMainTeacher: false,
        },
      })
      await tx.user.create({
        data: {
          email: item.representativeEmail,
          password: passwordHash,
          name: `${item.companyName} Representative`,
          role: "TEACHER",
          schoolId: company.id,
          isMainTeacher: true,
        },
      })

      newCompanies.push({
        id: company.id,
        name: company.name,
        employeeCount: movedEmployees.count,
      })
    }

    const remainingEmployees = await tx.student.count({ where: { schoolId: source.id } })
    const migratedEmployees = await tx.student.count({
      where: { schoolId: { in: newCompanies.map(company => company.id) } },
    })
    if (remainingEmployees !== 0 || migratedEmployees !== plannedEmployeeCount) {
      throw new Error(
        `Verification failed: legacy=${remainingEmployees}, migrated=${migratedEmployees}, expected=${plannedEmployeeCount}.`,
      )
    }

    await tx.user.deleteMany({ where: { schoolId: source.id } })
    await tx.class.deleteMany({ where: { schoolId: source.id } })
    await tx.template.deleteMany({ where: { schoolId: source.id } })
    await tx.school.delete({ where: { id: source.id } })

    return newCompanies
  }, {
    maxWait: 20_000,
    timeout: 120_000,
  })

  const verified = await prisma.school.findMany({
    where: { id: { in: migrated.map(company => company.id) } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      contactEmail: true,
      _count: { select: { students: true, classes: true, templates: true, teachers: true } },
    },
  })
  const verifiedEmployeeCount = verified.reduce((sum, company) => sum + company._count.students, 0)
  if (verified.length !== plan.length || verifiedEmployeeCount !== plannedEmployeeCount) {
    throw new Error("Post-transaction verification failed. Inspect the new company workspaces.")
  }

  console.log(`Migration complete: ${verified.length} independent companies, ${verifiedEmployeeCount} employees.`)
  for (const company of verified) {
    console.log(
      `- ${company.name}: employees=${company._count.students}, groups=${company._count.classes}, templates=${company._count.templates}, representatives=${company._count.teachers}`,
    )
  }
  console.log(`Default representative password: ${DEFAULT_PASSWORD}`)
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
