import { PrismaClient } from '@prisma/client';
import { saveCodeInfo } from '../src/codeInfo/savingFunctions';
import { loadAllProjects, loadSpecificTestData } from '../test/utils';
const prisma = new PrismaClient();
import _ = require('lodash');
import { saveUsers } from '../src/users/savingFunctions';
import { saveAllProjectDetails } from '../src/projects/savingFunctions';

async function main() {
  await seedUsers();
  await seedCodeInfo();
  await seedProjects();
}

async function seedUsers() {
  const data = await loadSpecificTestData({ name: 'Users' });
  await saveUsers(prisma, data);
}

async function seedCodeInfo() {
  const data = await loadSpecificTestData({ name: 'AllCodeInfo' });
  await saveCodeInfo(prisma, data);
}

async function seedProjects() {
  const allProjects = await loadAllProjects({ forSeeding: true });
  for (const p of allProjects) {
    await saveAllProjectDetails(prisma, p);
  }
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
