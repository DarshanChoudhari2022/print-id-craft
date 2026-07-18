import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const migrationSource = readFileSync("scripts/split-company-portfolio.ts", "utf8")
const companiesSource = readFileSync("src/app/(manufacturer)/companies/page.tsx", "utf8")

describe("legacy company portfolio split", () => {
  it("defaults to a non-mutating dry run and requires an explicit apply flag", () => {
    expect(migrationSource).toContain('process.argv.includes("--apply")')
    expect(migrationSource).toContain("if (!APPLY)")
  })

  it("moves each group atomically and verifies every employee before retiring the legacy workspace", () => {
    expect(migrationSource).toContain("prisma.$transaction")
    expect(migrationSource).toContain("tx.student.updateMany")
    expect(migrationSource).toContain("movedEmployees.count !== item.employeeCount")
    expect(migrationSource).toContain("remainingEmployees !== 0")
    expect(migrationSource).toContain("migratedEmployees !== plannedEmployeeCount")

    const verificationIndex = migrationSource.indexOf("remainingEmployees !== 0")
    const deleteIndex = migrationSource.indexOf("tx.school.delete")
    expect(verificationIndex).toBeGreaterThan(-1)
    expect(deleteIndex).toBeGreaterThan(verificationIndex)
  })

  it("clones templates and creates an independent representative for every company", () => {
    expect(migrationSource).toContain("templateCreateData")
    expect(migrationSource).toContain("tx.template.create")
    expect(migrationSource).toContain("tx.user.create")
    expect(migrationSource).toContain('"Company@123"')
  })

  it("shows company workspaces instead of presenting companies as departments", () => {
    expect(companiesSource).toContain("Independent Workspace")
    expect(companiesSource).not.toContain("Total Departments")
    expect(companiesSource).not.toContain("</strong> departments")
  })
})
