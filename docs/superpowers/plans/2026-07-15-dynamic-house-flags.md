# Dynamic House Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a required House dropdown from uploaded school flag images and reliably render the selected house image at every saved flag placeholder.

**Architecture:** Introduce pure house-name/catalogue utilities plus a server-only school flag catalogue that combines storage files with legacy student values. Reuse that catalogue in manufacturer and public APIs, inject a House field when a template mapping requires one, and share one alias-aware image resolver across preview and batch generation.

**Tech Stack:** TypeScript, Next.js App Router, Prisma read queries, Supabase/local storage adapter, React, Vitest.

## Global Constraints

- House options must be dynamic and school-scoped, like class and division options.
- A front- or back-side flag placeholder must produce exactly one required House field.
- Existing aliases and uploaded storage paths must remain compatible.
- Existing student records must not be rewritten.
- Do not add Villoo-specific IDs, names, colors, or dimensions.
- Do not change Prisma schema and do not run database commands or migrations.
- Keep the existing bulk upload, individual replacement, placeholder geometry, and non-flag rendering behaviour.

---

### Task 1: Add Pure House Flag Utilities

**Files:**
- Create: `src/lib/house-flags.ts`
- Create: `src/__tests__/unit/house-flags.test.ts`

**Interfaces:**
- Produces: `HouseFlagDefinition { color: string; imageUrl: string | null }`.
- Produces: `normalizeHouseName(value: string): string`.
- Produces: `humanizeHouseFilename(filename: string): string`.
- Produces: `buildHouseFlagDefinitions(studentValues, storedFiles, imageUrlForFile)`.
- Produces: `resolveHouseValue(formData)` and `resolveHouseImageUrl(formData, images)`.

- [ ] **Step 1: Write failing utility tests**

```ts
import { describe, expect, it } from "vitest"
import {
  buildHouseFlagDefinitions,
  humanizeHouseFilename,
  resolveHouseImageUrl,
  resolveHouseValue,
} from "@/lib/house-flags"

describe("house flag utilities", () => {
  it("humanizes existing underscored filenames", () => {
    expect(humanizeHouseFilename("Red_.png")).toBe("Red")
    expect(humanizeHouseFilename("yellow_house.webp")).toBe("Yellow House")
  })

  it("builds uploaded-only definitions with exact storage URLs", () => {
    expect(buildHouseFlagDefinitions([], ["Blue.png", "Red_.png"], f => `/flags/${f}`)).toEqual([
      { color: "Blue", imageUrl: "/flags/Blue.png" },
      { color: "Red", imageUrl: "/flags/Red_.png" },
    ])
  })

  it("keeps legacy student houses without images", () => {
    expect(buildHouseFlagDefinitions(["Green"], [], f => `/flags/${f}`)).toEqual([
      { color: "Green", imageUrl: null },
    ])
  })

  it("resolves current and legacy house aliases", () => {
    expect(resolveHouseValue({ flag: "Blue" })).toBe("Blue")
    expect(resolveHouseValue({ House: "Green" })).toBe("Green")
    expect(resolveHouseValue({ "Flag Color": "Red" })).toBe("Red")
  })

  it("matches house images case-insensitively and ignores punctuation", () => {
    expect(resolveHouseImageUrl({ flagColor: "red" }, { Red_: "/red.png" })).toBe("/red.png")
  })
})
```

- [ ] **Step 2: Run the utility test and verify RED**

Run: `npm test -- src/__tests__/unit/house-flags.test.ts`

Expected: FAIL because `@/lib/house-flags` does not exist.

- [ ] **Step 3: Implement the pure utilities**

```ts
export type HouseFlagDefinition = { color: string; imageUrl: string | null }

const HOUSE_KEYS = new Set([
  "flag", "flagcolor", "house", "houseflag", "housecolor", "colour", "color", "team", "group",
])

export const normalizeHouseName = (value: string) =>
  String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "")

export function humanizeHouseFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim()
  return base.replace(/\b\w/g, c => c.toUpperCase())
}

export function buildHouseFlagDefinitions(
  studentValues: string[],
  storedFiles: string[],
  imageUrlForFile: (filename: string) => string,
): HouseFlagDefinition[] {
  const byName = new Map<string, HouseFlagDefinition>()
  for (const filename of storedFiles) {
    const color = humanizeHouseFilename(filename)
    const key = normalizeHouseName(color)
    if (key && !byName.has(key)) byName.set(key, { color, imageUrl: imageUrlForFile(filename) })
  }
  for (const value of studentValues) {
    const color = String(value || "").trim()
    const key = normalizeHouseName(color)
    if (key && !byName.has(key)) byName.set(key, { color, imageUrl: null })
  }
  return Array.from(byName.values()).sort((a, b) => a.color.localeCompare(b.color))
}

export function resolveHouseValue(formData: Record<string, string> | null | undefined): string {
  if (!formData) return ""
  for (const [key, value] of Object.entries(formData)) {
    if (HOUSE_KEYS.has(normalizeHouseName(key)) && String(value || "").trim()) return String(value).trim()
  }
  return ""
}

export function resolveHouseImageUrl(
  formData: Record<string, string> | null | undefined,
  images: Record<string, string>,
): string | undefined {
  const wanted = normalizeHouseName(resolveHouseValue(formData))
  if (!wanted) return undefined
  const match = Object.entries(images).find(([name]) => normalizeHouseName(name) === wanted)
  return match?.[1]
}
```

- [ ] **Step 4: Run the utility test and verify GREEN**

Run: `npm test -- src/__tests__/unit/house-flags.test.ts`

Expected: 5 tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/lib/house-flags.ts src/__tests__/unit/house-flags.test.ts
git commit -m "Add shared house flag utilities"
```

### Task 2: Inject the Missing House Field

**Files:**
- Modify: `src/lib/submit-fields.ts:100-145`
- Create: `src/__tests__/unit/house-flag-form-field.test.ts`

**Interfaces:**
- Consumes: existing `getFieldRole(key, label, role)`.
- Changes: `buildTemplateFallbackFields(template)` to merge one required flag-role field from front or back mappings.

- [ ] **Step 1: Write failing form-field tests**

```ts
import { describe, expect, it } from "vitest"
import { buildTemplateFallbackFields } from "@/lib/submit-fields"

describe("house flag form field generation", () => {
  it("adds House when fieldConfig exists and the front template has a flag placeholder", () => {
    const fields = buildTemplateFallbackFields({
      fieldConfig: [{ key: "name", label: "Student Name", type: "text", required: true }],
      fieldMappings: [{ fieldKey: "flag", label: "House Flag", type: "flag" }],
    })
    expect(fields).toContainEqual({ key: "flagColor", label: "House", type: "select", required: true, role: "flag" })
  })

  it("adds House for a back-side flag placeholder", () => {
    const fields = buildTemplateFallbackFields({
      fieldConfig: [{ key: "name", label: "Student Name" }],
      fieldMappings: [],
      backFieldMappings: [{ fieldKey: "flag", label: "House Flag", type: "flag" }],
    })
    expect(fields.filter(f => f.role === "flag")).toHaveLength(1)
  })

  it("preserves an existing House field without adding a duplicate", () => {
    const fields = buildTemplateFallbackFields({
      fieldConfig: [{ key: "House", label: "House", type: "text", required: true }],
      fieldMappings: [{ fieldKey: "flag", label: "House Flag", type: "flag" }],
    })
    expect(fields).toEqual([{ key: "House", label: "House", type: "text", required: true }])
  })
})
```

- [ ] **Step 2: Run the form-field test and verify RED**

Run: `npm test -- src/__tests__/unit/house-flag-form-field.test.ts`

Expected: the first two tests fail because flag mappings are not merged when `fieldConfig` exists.

- [ ] **Step 3: Merge one House field after existing fallback derivation**

At the end of `buildTemplateFallbackFields`, before returning `fallback`, add:

```ts
const hasFlagMapping = [...rawMappings, ...((template?.backFieldMappings || []) as any[])]
  .some(m => m.type === "flag")
const hasFlagField = fallback.some(f => getFieldRole(f.key, f.label, f.role) === "flag")
if (hasFlagMapping && !hasFlagField) {
  fallback.push({
    key: "flagColor",
    label: "House",
    type: "select",
    required: true,
    role: "flag",
  })
}
```

- [ ] **Step 4: Run the focused form tests and verify GREEN**

Run: `npm test -- src/__tests__/unit/house-flag-form-field.test.ts`

Expected: 3 tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/lib/submit-fields.ts src/__tests__/unit/house-flag-form-field.test.ts
git commit -m "Generate House field from flag placeholders"
```

### Task 3: Build and Reuse the School Flag Catalogue

**Files:**
- Create: `src/lib/school-flag-catalog.ts`
- Modify: `src/app/api/schools/[id]/flags/route.ts:1-105`
- Modify: `src/app/api/submit/[token]/route.ts:130-225`
- Modify: `src/app/api/submit/school/[token]/route.ts:80-165`
- Create: `src/__tests__/unit/house-flag-catalog-wiring.test.ts`

**Interfaces:**
- Consumes: `buildHouseFlagDefinitions`, `resolveHouseValue`, storage adapter, and Prisma.
- Produces: `getSchoolFlagCatalog(schoolId): Promise<HouseFlagDefinition[]>`.

- [ ] **Step 1: Write failing catalogue wiring tests**

```ts
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8")

describe("house flag catalogue wiring", () => {
  it.each([
    "src/app/api/schools/[id]/flags/route.ts",
    "src/app/api/submit/[token]/route.ts",
    "src/app/api/submit/school/[token]/route.ts",
  ])("uses the shared school catalogue in %s", file => {
    expect(read(file)).toContain("getSchoolFlagCatalog")
  })

  it("detects back-side placeholders in the per-class public endpoint", () => {
    expect(read("src/app/api/submit/[token]/route.ts")).toContain("backFieldMappings")
  })
})
```

- [ ] **Step 2: Run the catalogue wiring test and verify RED**

Run: `npm test -- src/__tests__/unit/house-flag-catalog-wiring.test.ts`

Expected: assertions fail because the shared server catalogue does not exist or is not called.

- [ ] **Step 3: Implement the server-only catalogue**

```ts
import { prisma } from "@/lib/prisma"
import { storageList, storagePublicUrl } from "@/lib/storage"
import { buildHouseFlagDefinitions, resolveHouseValue } from "@/lib/house-flags"

const BUCKET = "student-photos"

export async function getSchoolFlagCatalog(schoolId: string) {
  const students = await prisma.student.findMany({
    where: { schoolId },
    select: { formData: true },
  })
  const studentValues = students
    .map(s => resolveHouseValue((s.formData as Record<string, string> | null) || {}))
    .filter(Boolean)

  let storedFiles: string[] = []
  try {
    const { data, error } = await storageList(BUCKET, `flags/${schoolId}`)
    if (!error) storedFiles = (data || []).map(file => file.name)
  } catch {
    storedFiles = []
  }

  return buildHouseFlagDefinitions(
    studentValues,
    storedFiles,
    filename => storagePublicUrl(BUCKET, `flags/${schoolId}/${filename}`),
  )
}
```

- [ ] **Step 4: Replace duplicated manufacturer flag discovery**

After the existing authorization and school-existence checks in the flags GET route, use:

```ts
const flags = await getSchoolFlagCatalog(schoolId)
return NextResponse.json({
  success: true,
  data: { flags, colors: flags.map(flag => flag.color) },
})
```

Keep the existing POST upload validation and storage behaviour unchanged.

- [ ] **Step 5: Use uploaded definitions in both public form endpoints**

Detect flag mappings across front and back mappings. When present, replace student-only color discovery with:

```ts
let flagColors: string[] = []
if (hasFlagMapping) {
  try {
    const flags = await getSchoolFlagCatalog(schoolId)
    flagColors = flags.map(flag => flag.color)
  } catch {
    flagColors = []
  }
}
```

Use `cls.school.id` in the per-class endpoint and `school.id` in the school-wide endpoint. Continue returning `flagColors` in the existing response shape.

- [ ] **Step 6: Run catalogue, field, and utility tests**

Run: `npm test -- src/__tests__/unit/house-flags.test.ts src/__tests__/unit/house-flag-form-field.test.ts src/__tests__/unit/house-flag-catalog-wiring.test.ts`

Expected: all focused tests pass.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/lib/school-flag-catalog.ts src/app/api/schools/[id]/flags/route.ts src/app/api/submit/[token]/route.ts src/app/api/submit/school/[token]/route.ts src/__tests__/unit/house-flag-catalog-wiring.test.ts
git commit -m "Use uploaded flags for House dropdown options"
```

### Task 4: Share Rendering Resolution and Add Explicit House Upload

**Files:**
- Modify: `src/components/BatchGenerator.tsx:1-25,1330-1360`
- Modify: `src/app/(manufacturer)/schools/[id]/page.tsx:100-160,425-450,1930-2005,4360-4410,4880-4920`
- Create: `src/__tests__/unit/house-flag-ui-wiring.test.ts`

**Interfaces:**
- Consumes: `resolveHouseImageUrl(formData, images)`.
- Adds manufacturer state: `newHouseName`, `newHouseFile`, and `addingHouse`.
- Adds handler: `handleAddHouse()` using the existing `handleFlagUpload` endpoint flow.

- [ ] **Step 1: Write failing renderer/UI wiring tests**

```ts
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8")

describe("house flag UI and rendering wiring", () => {
  it("uses the shared resolver in batch generation", () => {
    expect(read("src/components/BatchGenerator.tsx")).toContain("resolveHouseImageUrl")
  })

  it("uses the shared resolver in manufacturer preview", () => {
    expect(read("src/app/(manufacturer)/schools/[id]/page.tsx")).toContain("resolveHouseImageUrl")
  })

  it("provides an explicit Add House control", () => {
    const source = read("src/app/(manufacturer)/schools/[id]/page.tsx")
    expect(source).toContain("Add House")
    expect(source).toContain("newHouseName")
    expect(source).toContain("newHouseFile")
  })
})
```

- [ ] **Step 2: Run the renderer/UI wiring test and verify RED**

Run: `npm test -- src/__tests__/unit/house-flag-ui-wiring.test.ts`

Expected: assertions fail because the two files use local/manual alias matching and no Add House control exists.

- [ ] **Step 3: Replace local renderer matching with the shared resolver**

Import `resolveHouseImageUrl` in both files. In `BatchGenerator`, replace `getFlagUrl`'s manual key lookup with:

```ts
const getFlagUrl = (student: any): string | undefined => {
  if (!hasFlagField) return undefined
  return resolveHouseImageUrl(student.formData as Record<string, string>, flagImagesMap)
}
```

In the manufacturer page, remove the local `resolveFlagImageUrl` function and replace both preview calls with:

```tsx
flagImageUrl={resolveHouseImageUrl(
  selectedStudent.formData as Record<string, string>,
  flagImages,
)}
```

- [ ] **Step 4: Add explicit house-name and image state/handler**

```ts
const [newHouseName, setNewHouseName] = useState("")
const [newHouseFile, setNewHouseFile] = useState<File | null>(null)
const [addingHouse, setAddingHouse] = useState(false)

const handleAddHouse = async () => {
  const name = newHouseName.trim()
  if (!name) return toast.error("Enter a house name")
  if (!newHouseFile) return toast.error("Select a house flag image")
  setAddingHouse(true)
  const result = await handleFlagUpload(name, newHouseFile, { silent: true })
  if (result.ok) {
    toast.success(`House "${name}" added`)
    setNewHouseName("")
    setNewHouseFile(null)
    await fetchFlags()
  } else {
    toast.error(result.error || "Could not add house")
  }
  setAddingHouse(false)
}
```

- [ ] **Step 5: Add the Manage Houses & Flags controls**

Rename the modal heading and helper text. Above bulk upload, add a house-name input, an image file input accepting the existing image MIME types, and a button:

```tsx
<button
  className="btn btn-primary"
  onClick={handleAddHouse}
  disabled={addingHouse || !newHouseName.trim() || !newHouseFile}
>
  {addingHouse ? "Adding..." : "Add House"}
</button>
```

Keep bulk upload and individual replacement sections unchanged.

- [ ] **Step 6: Run all focused tests**

Run: `npm test -- src/__tests__/unit/house-flags.test.ts src/__tests__/unit/house-flag-form-field.test.ts src/__tests__/unit/house-flag-catalog-wiring.test.ts src/__tests__/unit/house-flag-ui-wiring.test.ts`

Expected: all focused tests pass.

- [ ] **Step 7: Run complete verification**

Run each command and require exit code 0:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all Vitest tests pass, lint reports no errors, the Next.js production build succeeds, and `git diff --check` reports no whitespace errors.

- [ ] **Step 8: Review scope and commit Task 4**

Confirm no Prisma schema, migration, student mutation, class/division, or non-flag rendering files changed. Then:

```bash
git add src/components/BatchGenerator.tsx src/app/(manufacturer)/schools/[id]/page.tsx src/__tests__/unit/house-flag-ui-wiring.test.ts
git commit -m "Add dynamic House flag management and rendering"
```
