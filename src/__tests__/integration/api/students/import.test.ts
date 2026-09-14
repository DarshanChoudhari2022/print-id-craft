import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/schools/[id]/students/import/route'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/prisma'

describe('POST /api/schools/[id]/students/import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock default session to be a valid manufacturer
    ;(getServerSession as any).mockResolvedValue({
      user: { role: 'MANUFACTURER' }
    })

    // Mock school existence to prevent 404
    ;(prisma.school.findUnique as any).mockResolvedValue({
      id: 's1',
      name: 'Test School',
      classes: [{ id: 'c1', name: 'Class 1' }],
    })
    ;(prisma.template.findFirst as any).mockResolvedValue({ fieldConfig: [] })
    ;(prisma.student.findFirst as any).mockResolvedValue(null)
    ;(prisma.student.findMany as any).mockResolvedValue([])
    ;(prisma.student.count as any).mockResolvedValue(0)
    ;(prisma.student.createMany as any).mockResolvedValue({ count: 0 })
    ;(prisma.template.update as any).mockResolvedValue({})
    ;(prisma.template.create as any).mockResolvedValue({})
  })

  function createMockFormData(csvString?: string, noFile: boolean = false) {
    const formData = new FormData()
    if (!noFile) {
      const blob = new Blob([csvString || 'Name,Roll No.\nJohn Doe,1\nJane Doe,2'], { type: 'text/csv' })
      formData.append('file', blob, 'test.csv')
    }
    return formData
  }

  describe('Authorization & Validation', () => {
    it('returns 401 Unauthorized if no active session is found', async () => {
      ;(getServerSession as any).mockResolvedValueOnce(null)
      const req = new Request('http://localhost:3000/api/schools/s1/students/import', {
        method: 'POST',
        body: createMockFormData()
      })
      const res = await POST(req, { params: Promise.resolve({ id: 's1' }) })
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toBe('Unauthorized')
    })
    
    it('returns 401 Unauthorized if the user role is not MANUFACTURER or SCHOOL', async () => {
      ;(getServerSession as any).mockResolvedValueOnce({ user: { role: 'STUDENT' } })
      const req = new Request('http://localhost:3000/api/schools/s1/students/import', {
        method: 'POST',
        body: createMockFormData()
      })
      const res = await POST(req, { params: Promise.resolve({ id: 's1' }) })
      expect(res.status).toBe(401)
    })
    
    it('returns 400 Bad Request if the payload body lacks the file', async () => {
      const req = new Request('http://localhost:3000/api/schools/s1/students/import', {
        method: 'POST',
        body: createMockFormData(undefined, true) // no file
      })
      const res = await POST(req, { params: Promise.resolve({ id: 's1' }) })
      expect(res.status).toBe(400)
    })
  })

  describe('Bulk Data Processing', () => {
    it('correctly parses CSV data rows into database student objects and calls createMany', async () => {
      const csvStr = 'Full Name,Roll No.,Phone No\nJohn Doe,10,9876543210\nJane Smith,11,8765432109'
      const req = new Request('http://localhost:3000/api/schools/s1/students/import', {
        method: 'POST',
        body: createMockFormData(csvStr)
      })
      
      const res = await POST(req, { params: Promise.resolve({ id: 's1' }) })
      
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(prisma.student.createMany).toHaveBeenCalledTimes(1)
      
      const createManyCall = (prisma.student.createMany as any).mock.calls[0][0]
      expect(createManyCall.data.length).toBe(2)
      expect(createManyCall.data[0].schoolId).toBe('s1')
      expect(createManyCall.data[0].formData.fullName).toBe('John Doe')
    })

    it('normalizes all-capital names and address punctuation during import', async () => {
      const csvStr = 'Full Name,Address\nIQRA BANU RAVEEN,\"flat no. 307,hosing Residency,pune\"'
      const req = new Request('http://localhost:3000/api/schools/s1/students/import', {
        method: 'POST',
        body: createMockFormData(csvStr),
      })

      const res = await POST(req, { params: Promise.resolve({ id: 's1' }) })

      expect(res.status).toBe(200)
      const createManyCall = (prisma.student.createMany as any).mock.calls[0][0]
      expect(createManyCall.data[0].formData.fullName).toBe('Iqra Banu Raveen')
      expect(createManyCall.data[0].formData.address).toBe('Flat No. 307, Hosing Residency, Pune')
    })

    it('rejects 9-digit mobile numbers during import validation', async () => {
      const csvStr = 'Full Name,Mob.\nAsma Mustak Shaikh,+91 930942887'
      const formData = createMockFormData(csvStr)
      formData.set('mode', 'validate')
      const req = new Request('http://localhost:3000/api/schools/s1/students/import', {
        method: 'POST',
        body: formData,
      })

      const res = await POST(req, { params: Promise.resolve({ id: 's1' }) })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.validRows).toBe(0)
      expect(data.data.errorRows).toBe(1)
      expect(data.data.errors).toContainEqual({
        row: 2,
        field: 'Mob.',
        message: 'Please enter a valid 10-digit Indian mobile number.',
      })
    })

    it('does not create duplicate employees when the same ID Code is uploaded again', async () => {
      ;(prisma.student.findMany as any).mockResolvedValue([
        {
          formData: {
            name: 'Ravindra Panchal',
            id_code: 'LPT055',
            contact_number: '8898156694',
          },
        },
      ])
      const csvStr = 'Name,ID Code,Contact Number\nRavindra Panchal,LPT055,8898156694'
      const req = new Request('http://localhost:3000/api/schools/s1/students/import', {
        method: 'POST',
        body: createMockFormData(csvStr),
      })

      const res = await POST(req, { params: Promise.resolve({ id: 's1' }) })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.imported).toBe(0)
      expect(data.data.skippedDuplicates).toBe(1)
      expect(prisma.student.createMany).not.toHaveBeenCalled()
    })
  })

  describe('Database Resilience', () => {
    it('catches and returns a 500 status nicely if the database connection drops during createMany', async () => {
      ;(prisma.student.createMany as any).mockRejectedValueOnce(new Error('Connection terminated unexpectedly'))
      
      const req = new Request('http://localhost:3000/api/schools/s1/students/import', {
        method: 'POST',
        body: createMockFormData('Full Name\nError Student')
      })
      const res = await POST(req, { params: Promise.resolve({ id: 's1' }) })
      
      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.error).toBe('Internal server error')
    })
  })
})
