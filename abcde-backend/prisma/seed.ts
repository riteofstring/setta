import { PrismaClient } from '@prisma/client';
import { saveCodeInfo } from '../src/codeInfo/savingFunctions';
import { loadSpecificTestData } from '../test/utils';
const prisma = new PrismaClient();
import _ = require('lodash');
import { saveUsers } from '../src/users/savingFunctions';

async function main() {
  await seedUsers();
  await seedCodeInfo();
}

async function seedUsers() {
  const data = await loadSpecificTestData({ name: 'Users' });
  await saveUsers(prisma, data);
}

async function seedCodeInfo() {
  const data = await loadSpecificTestData({ name: 'AllCodeInfo' });
  await saveCodeInfo(prisma, data);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
