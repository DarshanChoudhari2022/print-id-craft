import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const layoutSource = readFileSync("src/app/(manufacturer)/layout.tsx", "utf8")
const schoolsSource = readFileSync("src/app/(manufacturer)/schools/page.tsx", "utf8")
const companiesSource = readFileSync("src/app/(manufacturer)/companies/page.tsx", "utf8")
const detailSource = readFileSync("src/app/(manufacturer)/schools/[id]/page.tsx", "utf8")
const dashboardSource = readFileSync("src/app/(manufacturer)/dashboard/page.tsx", "utf8")
const representativeDashboardSource = readFileSync("src/app/teacher/dashboard/page.tsx", "utf8")
const schoolsApiSource = readFileSync("src/app/api/schools/route.ts", "utf8")
const representativeApiSource = readFileSync("src/app/api/schools/[id]/main-teacher/route.ts", "utf8")
const templateMapperSource = readFileSync("src/components/JpgTemplateMapper.tsx", "utf8")

describe("manufacturer company navigation", () => {
  it("places Company directly after Schools in the left navigation", () => {
    const schoolsIndex = layoutSource.indexOf('label: "Schools"')
    const companyIndex = layoutSource.indexOf('label: "Company"')
    expect(schoolsIndex).toBeGreaterThan(-1)
    expect(companyIndex).toBeGreaterThan(schoolsIndex)
    expect(layoutSource.slice(schoolsIndex, companyIndex)).not.toContain('label: "Dashboard"')
    expect(layoutSource).toContain('href: "/companies"')
  })

  it("keeps company workspaces out of the Schools directory", () => {
    expect(schoolsSource).toContain('workspace: "school"')
    expect(dashboardSource).toContain("/api/schools?limit=5&workspace=school")
  })

  it("loads, creates, and independently opens company workspaces", () => {
    expect(companiesSource).toContain("workspace=company")
    expect(companiesSource).toContain('workspaceKind: "company"')
    expect(companiesSource).toContain("Add Company")
    expect(companiesSource).toContain("Create Company")
    expect(companiesSource).not.toContain("router.replace(")
    expect(companiesSource).toContain("router.push(`/companies/${workspace.id}`)")
  })

  it("returns company details to the Company directory", () => {
    expect(detailSource).toContain('const directoryHref = companyRoute ? "/companies" : "/schools"')
    expect(detailSource).toContain('const directoryLabel = companyRoute ? "Company" : "Schools"')
  })

  it("uses the company route before delayed template data to prevent school terminology flicker", () => {
    const routeIndex = detailSource.indexOf('const isCompanyRoute = pathname.startsWith("/companies/")')
    const modeIndex = detailSource.indexOf("const companyMode = companyRoute")
    expect(routeIndex).toBeGreaterThan(-1)
    expect(modeIndex).toBeGreaterThan(routeIndex)
    expect(detailSource).toContain("companyMode={companyMode}")
  })

  it("creates company defaults and a company representative account", () => {
    expect(schoolsApiSource).toContain("COMPANY_DEFAULT_FIELDS")
    expect(schoolsApiSource).toContain('"Company Representative"')
    expect(schoolsApiSource).toContain('"Company@123"')
    expect(representativeApiSource).toContain('"Company@123"')
    expect(detailSource).toContain('"Company Representative Login"')
    expect(detailSource).toContain('"Total Departments"')
    expect(representativeDashboardSource).toContain('"Company Representative"')
    expect(representativeDashboardSource).toContain('"Department Managers"')
    expect(representativeDashboardSource).toContain('"Department Registration Links — Share with Employees"')
  })

  it("uses employee-specific template controls in company mode", () => {
    expect(templateMapperSource).toContain("companyMode?: boolean")
    expect(templateMapperSource).toContain('"Employee Photo"')
    expect(templateMapperSource).toContain('"Emergency Contact Number"')
    expect(templateMapperSource).toContain('"Office Address"')
  })
})
