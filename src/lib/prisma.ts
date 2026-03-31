import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
    // Connection pool settings for production (50+ schools, 5000+ students)
    datasourceUrl: process.env.DATABASE_URL,
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

// Graceful shutdown to prevent connection leaks
if (typeof process !== "undefined") {
  process.on("beforeExit", async () => {
    await prisma.$disconnect()
  })
}
