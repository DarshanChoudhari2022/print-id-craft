import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Seeding database...")

  // Clear existing data
  await prisma.student.deleteMany()
  await prisma.printBatch.deleteMany()
  await prisma.template.deleteMany()
  await prisma.class.deleteMany()
  await prisma.school.deleteMany()
  await prisma.user.deleteMany()

  console.log("  ✓ Cleared existing data")

  // Create manufacturer user
  const hashedPassword = await bcrypt.hash("Admin@123", 12)
  const manufacturer = await prisma.user.create({
    data: {
      email: "admin@printidcraft.com",
      password: hashedPassword,
      name: "Admin User",
      role: "MANUFACTURER",
    },
  })
  console.log("  ✓ Created manufacturer:", manufacturer.email)

  // Create schools
  const schools = [
    { name: "St. Xavier's High School", address: "MG Road, Mumbai", contactEmail: "admin@xaviers.edu.in" },
    { name: "Delhi Public School", address: "Sector 45, Noida", contactEmail: "principal@dps.edu.in" },
    { name: "Holy Cross Convent", address: "Station Road, Pune", contactEmail: "info@holycross.edu.in" },
  ]

  const createdSchools = []
  for (const s of schools) {
    const school = await prisma.school.create({ data: s })
    // Create template
    await prisma.template.create({
      data: {
        schoolId: school.id,
        frontLayout: [
          { id: "school-name", type: "text", x: 120, y: 20, width: 200, height: 24, content: s.name, fontSize: 16, fill: "#1e3a5f", bold: true, align: "center" },
          { id: "photo", type: "photo", x: 20, y: 60, width: 90, height: 120, content: "[Photo]" },
          { id: "name-label", type: "text", x: 120, y: 60, width: 100, height: 18, content: "Name:", fontSize: 11, fill: "#64748b", align: "left" },
          { id: "name-value", type: "text", x: 120, y: 78, width: 200, height: 18, content: "{{fullName}}", fontSize: 14, fill: "#0f172a", bold: true, align: "left" },
          { id: "class-label", type: "text", x: 120, y: 100, width: 100, height: 18, content: "Class:", fontSize: 11, fill: "#64748b", align: "left" },
          { id: "class-value", type: "text", x: 120, y: 118, width: 100, height: 18, content: "{{class}}", fontSize: 14, fill: "#0f172a", align: "left" },
          { id: "roll-label", type: "text", x: 230, y: 100, width: 100, height: 18, content: "Roll No:", fontSize: 11, fill: "#64748b", align: "left" },
          { id: "roll-value", type: "text", x: 230, y: 118, width: 80, height: 18, content: "{{rollNo}}", fontSize: 14, fill: "#0f172a", align: "left" },
          { id: "serial", type: "text", x: 120, y: 148, width: 200, height: 16, content: "{{serialNumber}}", fontSize: 10, fill: "#94a3b8", align: "left" },
          { id: "qr", type: "qr", x: 260, y: 130, width: 50, height: 50, content: "[QR Code]" },
        ],
        backLayout: [
          { id: "back-title", type: "text", x: 80, y: 20, width: 200, height: 24, content: "STUDENT IDENTITY CARD", fontSize: 14, fill: "#0f172a", bold: true, align: "center" },
          { id: "father-label", type: "text", x: 20, y: 60, width: 120, height: 16, content: "Father's Name:", fontSize: 11, fill: "#64748b", align: "left" },
          { id: "father-value", type: "text", x: 20, y: 76, width: 200, height: 18, content: "{{fatherName}}", fontSize: 13, fill: "#0f172a", align: "left" },
          { id: "mother-label", type: "text", x: 20, y: 96, width: 120, height: 16, content: "Mother's Name:", fontSize: 11, fill: "#64748b", align: "left" },
          { id: "mother-value", type: "text", x: 20, y: 112, width: 200, height: 18, content: "{{motherName}}", fontSize: 13, fill: "#0f172a", align: "left" },
          { id: "phone-label", type: "text", x: 20, y: 132, width: 120, height: 16, content: "Phone:", fontSize: 11, fill: "#64748b", align: "left" },
          { id: "phone-value", type: "text", x: 20, y: 148, width: 200, height: 18, content: "{{phone}}", fontSize: 13, fill: "#0f172a", align: "left" },
          { id: "blood-label", type: "text", x: 240, y: 60, width: 80, height: 16, content: "Blood Group:", fontSize: 10, fill: "#64748b", align: "left" },
          { id: "blood-value", type: "text", x: 260, y: 76, width: 60, height: 24, content: "{{bloodGroup}}", fontSize: 18, fill: "#dc2626", bold: true, align: "center" },
          { id: "address-label", type: "text", x: 20, y: 170, width: 120, height: 16, content: "Address:", fontSize: 11, fill: "#64748b", align: "left" },
          { id: "address-value", type: "text", x: 20, y: 186, width: 300, height: 18, content: "{{address}}", fontSize: 12, fill: "#0f172a", align: "left" },
        ],
        fieldConfig: [
          { key: "fullName", label: "Full Name", type: "text", required: true },
          { key: "class", label: "Class", type: "text", required: true },
          { key: "rollNo", label: "Roll No.", type: "text", required: true },
          { key: "dob", label: "Date of Birth", type: "date", required: true },
          { key: "bloodGroup", label: "Blood Group", type: "select", required: false },
          { key: "fatherName", label: "Father Name", type: "text", required: true },
          { key: "motherName", label: "Mother Name", type: "text", required: false },
          { key: "phone", label: "Phone", type: "tel", required: true },
          { key: "address", label: "Address", type: "textarea", required: false },
        ],
        cardWidthMm: 85.6,
        cardHeightMm: 54.0,
        printDpi: 300,
        orientation: "LANDSCAPE",
      },
    })
    createdSchools.push(school)
    console.log("  ✓ Created school:", school.name)
  }

  // Create teachers
  const teacherPw = await bcrypt.hash("Teacher@123", 12)
  const teacherData = [
    { email: "teacher1@xaviers.edu.in", name: "Priya Sharma", schoolId: createdSchools[0].id },
    { email: "teacher@dps.edu.in", name: "Amit Kumar", schoolId: createdSchools[1].id },
    { email: "teacher@holycross.edu.in", name: "Mary Thomas", schoolId: createdSchools[2].id },
  ]

  for (const td of teacherData) {
    await prisma.user.create({
      data: { ...td, password: teacherPw, role: "TEACHER" },
    })
    console.log("  ✓ Created teacher:", td.email)
  }

  // Create classes for each school
  const classNames = [
    ["Grade 1-A", "Grade 1-B", "Grade 2-A", "Grade 3-A", "Grade 5-B"],
    ["Class VI-A", "Class VI-B", "Class VII-A", "Class VIII-A", "Class X-A"],
    ["Std 1st", "Std 2nd", "Std 3rd", "Std 5th", "Std 7th"],
  ]

  const allClasses: any[] = []
  for (let i = 0; i < createdSchools.length; i++) {
    for (const cn of classNames[i]) {
      const cls = await prisma.class.create({
        data: {
          name: cn,
          schoolId: createdSchools[i].id,
          isActive: true,
        },
      })
      allClasses.push(cls)
    }
    console.log(`  ✓ Created ${classNames[i].length} classes for ${createdSchools[i].name}`)
  }

  // Create sample students
  const firstNames = ["Aarav", "Vivaan", "Aditya", "Diya", "Ananya", "Priya", "Rohan", "Kavya", "Ishaan", "Saanvi", "Arjun", "Meera", "Rahul", "Nisha", "Karan", "Sanya", "Dev", "Ankita", "Mohammed", "Fatima"]
  const lastNames = ["Sharma", "Patel", "Singh", "Kumar", "Verma", "Joshi", "Gupta", "Reddy", "Banerjee", "Iyer", "Nair", "Mishra"]
  const bloodGroups = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]

  let serialCount: Record<string, number> = {}

  for (const cls of allClasses) {
    const school = createdSchools.find(s => s.id === cls.schoolId)!
    const schoolCode = school.name.replace(/[^A-Za-z]/g, "").substring(0, 6).toUpperCase()
    if (!serialCount[schoolCode]) serialCount[schoolCode] = 0

    const numStudents = 5 + Math.floor(Math.random() * 10) // 5-14 students
    for (let j = 0; j < numStudents; j++) {
      serialCount[schoolCode]++
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)]
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)]
      const rollNo = String(j + 1).padStart(2, "0")
      const statuses = ["SUBMITTED", "APPROVED", "APPROVED", "APPROVED", "FLAGGED", "PRINTED"]
      const status = statuses[Math.floor(Math.random() * statuses.length)]

      await prisma.student.create({
        data: {
          schoolId: cls.schoolId,
          classId: cls.id,
          serialNumber: `${schoolCode}-${String(serialCount[schoolCode]).padStart(4, "0")}`,
          photoUrl: "",
          status: status as any,
          flagNote: status === "FLAGGED" ? "Photo not clear, please re-upload" : null,
          formData: {
            fullName: `${firstName} ${lastName}`,
            class: cls.name,
            rollNo,
            dob: `200${Math.floor(Math.random() * 9)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, "0")}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`,
            bloodGroup: bloodGroups[Math.floor(Math.random() * bloodGroups.length)],
            fatherName: `Mr. ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
            motherName: `Mrs. ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
            phone: `98${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`,
            address: `${Math.floor(Math.random() * 500) + 1}, Sector ${Math.floor(Math.random() * 50) + 1}, ${["Mumbai", "Delhi", "Pune", "Chennai"][Math.floor(Math.random() * 4)]}`,
          },
        },
      })
    }
  }

  const totalStudents = await prisma.student.count()
  console.log(`  ✓ Created ${totalStudents} students across all classes`)

  // Create a sample print batch
  await prisma.printBatch.create({
    data: {
      schoolId: createdSchools[0].id,
      studentCount: 15,
      status: "READY",
    },
  })
  console.log("  ✓ Created sample print batch")

  console.log("\n✅ Seeding complete!\n")
  console.log("📋 Login Credentials:")
  console.log("  ─────────────────────────────────")
  console.log("  Manufacturer Admin:")
  console.log("    Email:    admin@printidcraft.com")
  console.log("    Password: Admin@123")
  console.log("  ─────────────────────────────────")
  console.log("  Teacher (St. Xavier's):")
  console.log("    Email:    teacher1@xaviers.edu.in")
  console.log("    Password: Teacher@123")
  console.log("  ─────────────────────────────────")
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
