import { saveCodeInfo } from '#codeInfo/savingFunctions';
import { saveAllProjectDetails } from '#projects/savingFunctions';
import { saveUsers } from '#users/savingFunctions';
import { PrismaClient } from '@prisma/client';
import { loadAllProjects, loadSpecificTestData } from '../test/utils';
const prisma = new PrismaClient();
import _ = require('lodash');

async function main() {
  await seedUsers();
  await seedCodeInfo();
  await seedProjects();
}

async function seedUsers() {
  const data = await loadSpecificTestData({ name: 'Users' });
  console.log('seedUsers');
  await saveUsers(prisma, data);
  console.log('done');
}

async function seedCodeInfo() {
  const data = await loadSpecificTestData({ name: 'AllCodeInfo' });
  console.log('seedCodeInfo');
  await saveCodeInfo(prisma, data);
  console.log('done');
}

async function seedProjects() {
  const allProjects = await loadAllProjects({ forSeeding: true });
  console.log('seedProjects');
  for (const p of allProjects) {
    await saveAllProjectDetails(prisma, p);
  }
  console.log('done');
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
