import "dotenv/config"
import fs from "node:fs/promises"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const outputDir = path.resolve("outputs/company-contact-fields")

function relevantEntries(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => /contact|emergency|office.*no|phone|mobile/i.test(key))
  )
}

async function main() {
  const school = await prisma.school.findFirst({
    where: { name: "Company ID Cards" },
    select: {
      id: true,
      templates: {
        select: {
          id: true,
          name: true,
          fieldConfig: true,
          fieldMappings: true,
          backFieldMappings: true,
        },
      },
      students: {
        take: 8,
        orderBy: { submittedAt: "desc" },
        select: { serialNumber: true, fullName: true, formData: true },
      },
    },
  })
  if (!school) throw new Error("Company ID Cards workspace not found")

  const report = {
    mode: APPLY ? "apply" : "audit",
    templates: school.templates.map(template => ({
      id: template.id,
      name: template.name,
      config: Array.isArray(template.fieldConfig)
        ? template.fieldConfig.filter((field: any) => /contact|emergency|office.*no|phone|mobile/i.test(`${field?.key} ${field?.label}`))
        : [],
      front: Array.isArray(template.fieldMappings)
        ? template.fieldMappings.filter((field: any) => /contact|emergency|office.*no|phone|mobile/i.test(`${field?.fieldKey} ${field?.label}`))
        : [],
      back: Array.isArray(template.backFieldMappings)
        ? template.backFieldMappings.filter((field: any) => /contact|emergency|office.*no|phone|mobile/i.test(`${field?.fieldKey} ${field?.label}`))
        : [],
    })),
    students: school.students.map(student => ({
      serialNumber: student.serialNumber,
      fullName: student.fullName,
      contacts: relevantEntries(student.formData),
    })),
  }
  console.log(JSON.stringify(report, null, 2))

  if (!APPLY) return
  await fs.mkdir(outputDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  await fs.writeFile(
    path.join(outputDir, `rollback-before-${timestamp}.json`),
    JSON.stringify(school.templates, null, 2)
  )

  for (const template of school.templates) {
    const config = Array.isArray(template.fieldConfig) ? template.fieldConfig as any[] : []
    const exactLabelToKey = new Map(
      config
        .filter(field => field?.label && field?.key)
        .map(field => [String(field.label).trim().toLowerCase(), String(field.key)])
    )
    const updateMappings = (raw: unknown) => Array.isArray(raw)
      ? raw.map((mapping: any) => {
          const configuredKey = exactLabelToKey.get(String(mapping?.label || "").trim().toLowerCase())
          return configuredKey ? { ...mapping, fieldKey: configuredKey } : mapping
        })
      : raw

    await prisma.template.update({
      where: { id: template.id },
      data: {
        fieldMappings: updateMappings(template.fieldMappings) as any,
        backFieldMappings: updateMappings(template.backFieldMappings) as any,
      },
    })
  }
  console.log(`Updated ${school.templates.length} company template using exact field labels.`)
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
