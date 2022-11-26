import { PrismaClient } from '@prisma/client';
import { saveCodeInfo } from 'src/codeInfo/savingFunctions';
import { saveAllUserCodeInfoMaps } from 'src/codeInfoMaps/savingFunctions';
import { saveMultipleProjectDetails } from 'src/projects/savingFunctions';
import { saveUITypes } from 'src/uiTypes/savingFunctions';
import { saveUsers } from 'src/users/savingFunctions';
import { loadAllProjects, loadSpecificTestData } from '../test/utils';
const prisma = new PrismaClient();
import _ = require('lodash');

async function main() {
  await seedUsers();
  await seedCodeInfo();
  await seedBaseUITypes();
  await seedProjects();
  await seedUserCodeInfoMaps();
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

async function seedBaseUITypes() {
  const data = await loadSpecificTestData({ name: 'BaseUITypes' });
  console.log('seedBaseUITypes');
  await saveUITypes(prisma, null, data);
  console.log('done');
}

async function seedProjects() {
  const users = await loadSpecificTestData({ name: 'Users' });
  const allProjects = await loadAllProjects({ forSavingToBackend: true });
  console.log('seedProjects');
  for (const user of _.values(users)) {
    const usersProjects = allProjects.filter((x) =>
      user.projects.includes(x.project.id),
    );
    await saveMultipleProjectDetails(prisma, user, usersProjects);
  }
  console.log('done');
}

async function seedUserCodeInfoMaps() {
  const users = await loadSpecificTestData({ name: 'Users' });
  const data = await loadSpecificTestData({ name: 'UserCodeInfoMaps' });
  console.log('seedUserCodeInfoMaps');
  for (const user of _.values(users)) {
    const usersMaps = data[user.id];
    await saveAllUserCodeInfoMaps(prisma, user, usersMaps);
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
