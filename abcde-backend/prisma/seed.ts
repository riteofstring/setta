import {
  loadAllProjects,
  loadGlobalCodeInfo,
  loadSpecificTestData,
} from 'abcde-test/src/loadTestData';
import { saveCodeInfo } from 'src/db/codeInfo/save';
import { saveAllUserCodeInfoMaps } from 'src/db/codeInfoMaps/user/save';
import { prisma } from 'src/db/prisma';
import { saveMultipleProjectDetails } from 'src/db/projects/save';
import { saveRunsAndOutputs } from 'src/db/runs/save';
import { saveUITypes } from 'src/db/uiTypes/save';
import { seedUsers as seedUsersFn } from 'src/db/user/save';
import { SeedUserType } from 'src/db/user/types';

async function main() {
  await seedUsers();
  await seedCodeInfo();
  await seedBaseUITypes();
  await seedProjects();
  await seedUserCodeInfoMaps();
  await seedRuns();
}

async function seedUsers() {
  const data = await loadSpecificTestData({ name: 'Users' });
  console.log('seedUsers');
  await seedUsersFn(data);
  console.log('done');
}

async function seedCodeInfo() {
  const data = await loadGlobalCodeInfo();
  console.log('seedCodeInfo');
  await saveCodeInfo(data);
  console.log('done');
}

async function seedBaseUITypes() {
  const data = await loadSpecificTestData({ name: 'BaseUITypes' });
  console.log('seedBaseUITypes');
  await saveUITypes(null, data);
  console.log('done');
}

async function seedProjects() {
  const users: SeedUserType = await loadSpecificTestData({ name: 'Users' });
  const allProjects = await loadAllProjects({ forSavingToBackend: true });
  console.log('seedProjects');
  for (const user of Object.values(users)) {
    const usersProjects = allProjects.filter((x) =>
      user.projects.includes(x.project.id),
    );
    await saveMultipleProjectDetails(user.id, usersProjects);
  }
  console.log('done');
}

async function seedUserCodeInfoMaps() {
  const users: SeedUserType = await loadSpecificTestData({ name: 'Users' });
  const data = await loadSpecificTestData({ name: 'UserCodeInfoMaps' });
  console.log('seedUserCodeInfoMaps');
  for (const user of Object.values(users)) {
    const usersMaps = data[user.id];
    await saveAllUserCodeInfoMaps(user.id, usersMaps);
  }
  console.log('done');
}

async function seedRuns() {
  const allProjects = await loadAllProjects({ forSavingToBackend: true });
  console.log('seedRuns');
  for (const project of Object.values(allProjects)) {
    const { projectConfig, runs, outputGroups, outputs } = project;
    await saveRunsAndOutputs(runs, projectConfig.id, outputGroups, outputs);
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
