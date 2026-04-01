const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const t = await prisma.template.findUnique({
    where: { schoolId: 'cmn8upkjw000013v2lau8xhn1' }
  });
  console.log(JSON.stringify(t, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
