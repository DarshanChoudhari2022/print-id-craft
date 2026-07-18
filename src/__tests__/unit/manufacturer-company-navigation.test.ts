import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const layoutSource = readFileSync("src/app/(manufacturer)/layout.tsx", "utf8")
const schoolsSource = readFileSync("src/app/(manufacturer)/schools/page.tsx", "utf8")
const companiesSource = readFileSync("src/app/(manufacturer)/companies/page.tsx", "utf8")
const detailSource = readFileSync("src/app/(manufacturer)/schools/[id]/page.tsx", "utf8")
const dashboardSource = readFileSync("src/app/(manufacturer)/dashboard/page.tsx", "utf8")

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

  it("loads and opens company workspaces through the Company route", () => {
    expect(companiesSource).toContain("workspace=company")
    expect(companiesSource).toContain("router.replace(`/companies/${items[0].id}`)")
    expect(companiesSource).toContain("router.push(`/companies/${workspace.id}`)")
  })

  it("returns company details to the Company directory", () => {
    expect(detailSource).toContain('const directoryHref = companyRoute ? "/companies" : "/schools"')
    expect(detailSource).toContain('const directoryLabel = companyRoute ? "Company" : "Schools"')
  })
})
