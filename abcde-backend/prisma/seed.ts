import {
  loadGlobalCodeInfo,
  loadSpecificTestData,
} from 'abcde-test/src/loaders/helpers';
import { loadAllProjects } from 'abcde-test/src/loaders/loaders';
import _ from 'lodash';
import { saveCodeInfo } from 'src/db/codeInfo/save';
import { saveAllUserCodeInfoMaps } from 'src/db/codeInfoMaps/user/save';
import { prisma } from 'src/db/prisma';
import { saveProjectDetails } from 'src/db/projects/save';
import { saveRunsAndOutputs } from 'src/db/runs/save';
import {
  extractSectionUITypes,
  saveSectionUITypes,
  saveUITypes,
} from 'src/db/uiTypes/save';
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
  const allProjects = await loadAllProjects();
  console.log('seedProjects');
  for (const p of allProjects) {
    // set outputGroupId to null because outputs have not yet been created
    p.uiTypes = _.cloneDeep(p.uiTypes); // need to clone to avoid null in seedRun (not sure why)
    _.forEach(p.uiTypes, (u) => {
      if (u.config.outputGroup) {
        u.config.outputGroup = null;
      }
    });
    await saveProjectDetails(p.project.owner, p);
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
  const allProjects = await loadAllProjects();
  console.log('seedRuns');
  for (const project of Object.values(allProjects)) {
    const { projectConfig, runs, outputGroups, outputs } = project;
    await saveRunsAndOutputs(runs, projectConfig.id, outputGroups, outputs);
  }
  for (const project of Object.values(allProjects)) {
    // section types can be saved with output group id now
    await saveSectionUITypes(extractSectionUITypes(project.uiTypes));
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
