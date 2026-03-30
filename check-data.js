const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient();

async function main() {
  var lines = [];
  
  var users = await p.user.findMany({
    select: { id: true, email: true, name: true, role: true, schoolId: true }
  });
  lines.push('=== USERS ===');
  for (var i = 0; i < users.length; i++) {
    lines.push(JSON.stringify(users[i]));
  }
  
  var schools = await p.school.findMany({
    select: { id: true, name: true }
  });
  lines.push('');
  lines.push('=== SCHOOLS ===');
  for (var i = 0; i < schools.length; i++) {
    lines.push(JSON.stringify(schools[i]));
  }

  fs.writeFileSync('db-output.txt', lines.join('\n'));
  console.log('Done');
  await p.$disconnect();
}

main().catch(function(e) { console.error(e); process.exit(1); });
