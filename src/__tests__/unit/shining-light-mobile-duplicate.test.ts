import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { checkDuplicateSubmission } from "@/lib/submit-fields"

const SHINING_LIGHT_CLASS_ID = "cmr0fgn1d00037286escfox15"

const existingStudent = {
  serialNumber: "SHININ-0063",
  submittedAt: new Date("2026-07-14T00:00:00.000Z"),
  formData: {
    name: "Darshan Sunil Choudhari",
    mobile_no: "+91 8605589062",
    class: "I - A",
    division: "A",
    address: "Wanawadi, Kedari Nagar",
    dateOfBirth: "07/07/2021",
  },
}

describe("Shining Light sibling duplicate detection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.student.findMany as any).mockResolvedValue([])
  })

  it("allows a different student name to reuse the parent mobile number", async () => {
    ;(prisma.student.findFirst as any).mockImplementation(
      ({ where }: { where: Record<string, unknown> }) =>
        where.normalizedRollNo ? Promise.resolve(existingStudent) : Promise.resolve(null)
    )

    const result = await checkDuplicateSubmission(SHINING_LIGHT_CLASS_ID, {
      name: "Aarav Sunil Choudhari",
      mobile_no: "+91 8605589062",
      class: "I - A",
      division: "A",
      address: "Wanawadi, Kedari Nagar",
      dateOfBirth: "07/07/2021",
    })

    expect(result).toEqual({ isDuplicate: false })
    expect(prisma.student.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ normalizedRollNo: expect.any(String) }),
      })
    )
  })

  it("still blocks the same full student name in Shining Light", async () => {
    ;(prisma.student.findFirst as any).mockImplementation(
      ({ where }: { where: Record<string, unknown> }) =>
        where.normalizedName ? Promise.resolve(existingStudent) : Promise.resolve(null)
    )

    const result = await checkDuplicateSubmission(SHINING_LIGHT_CLASS_ID, {
      ...existingStudent.formData,
    })

    expect(result).toMatchObject({
      isDuplicate: true,
      kind: "identity",
      error: "DUPLICATE_NAME",
    })
  })

  it("still blocks a genuine Shining Light roll number distinct from mobile", async () => {
    ;(prisma.student.findFirst as any).mockImplementation(
      ({ where }: { where: Record<string, unknown> }) =>
        where.normalizedRollNo === "55" ? Promise.resolve(existingStudent) : Promise.resolve(null)
    )

    const result = await checkDuplicateSubmission(SHINING_LIGHT_CLASS_ID, {
      name: "Aarav Sunil Choudhari",
      mobile_no: "+91 8605589062",
      rollno: "55",
      class: "I - A",
      division: "A",
      dateOfBirth: "07/07/2021",
    })

    expect(result).toMatchObject({
      isDuplicate: true,
      kind: "roll",
      error: "DUPLICATE_ROLL",
    })
  })

  it("allows a different student name to reuse the parent mobile number in any class", async () => {
    ;(prisma.student.findFirst as any).mockImplementation(
      ({ where }: { where: Record<string, unknown> }) =>
        where.normalizedRollNo ? Promise.resolve(existingStudent) : Promise.resolve(null)
    )

    const result = await checkDuplicateSubmission("another-school-class", {
      name: "Aarav Sunil Choudhari",
      mobile_no: "+91 8605589062",
      class: "I - A",
      division: "A",
      dateOfBirth: "07/07/2021",
    })

    expect(result).toEqual({ isDuplicate: false })
    expect(prisma.student.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ normalizedRollNo: expect.any(String) }),
      })
    )
  })

  it("allows the same pre-primary roll number in a different class option", async () => {
    ;(prisma.student.findFirst as any).mockResolvedValue(null)
    ;(prisma.student.findMany as any).mockResolvedValue([
      {
        serialNumber: "VISHAL-0001",
        submittedAt: new Date("2026-07-17T00:00:00.000Z"),
        formData: {
          name: "Nursery Student",
          class: "Nursery",
          classGrade: "Nursery",
          rollno: "1",
        },
      },
    ])

    const result = await checkDuplicateSubmission("vishal-pre-primary-section", {
      name: "LKG Student",
      class: "LKG",
      classGrade: "LKG",
      rollno: "1",
    })

    expect(result).toEqual({ isDuplicate: false })
  })

  it("still blocks the same pre-primary roll number inside the same class option", async () => {
    ;(prisma.student.findFirst as any).mockResolvedValue(null)
    ;(prisma.student.findMany as any).mockResolvedValue([
      {
        serialNumber: "VISHAL-0001",
        submittedAt: new Date("2026-07-17T00:00:00.000Z"),
        formData: {
          name: "Nursery Student",
          class: "Nursery",
          classGrade: "Nursery",
          rollno: "1",
        },
      },
    ])

    const result = await checkDuplicateSubmission("vishal-pre-primary-section", {
      name: "Another Nursery Student",
      class: "Nursery",
      classGrade: "Nursery",
      rollno: "1",
    })

    expect(result).toMatchObject({
      isDuplicate: true,
      kind: "roll",
      error: "DUPLICATE_ROLL",
    })
  })
})
