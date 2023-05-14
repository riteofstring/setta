import { loadSpecificTestData } from 'abcde-test/src/loaders/helpers';
import { loadTestData } from 'abcde-test/src/loaders/loaders';
import { LOGIN, PROJECTS } from 'abcde-utils/src/routes';
import { app } from 'src/app/app';
import { loadOne } from 'src/db/projects/load';
import supertest from 'supertest';

const TEST_USER = '25961114-6655-4e2c-b70f-e2e3aaa84131';

describe('ProjectsService', () => {
  let request;
  let server;

  beforeAll(async () => {
    const allUsers = await loadSpecificTestData({ name: 'Users' });
    const testUser = allUsers[TEST_USER];

    server = app.listen();
    request = supertest.agent(server);

    // login
    return await request
      .post(LOGIN)
      .send({ username: testUser.name, password: testUser.password })
      .expect(200);
  });

  afterAll(async () => {
    await server.close();
  });

  it('Get list of user projects', async () => {
    const { body: projects } = await request.post(PROJECTS).expect(200);
    expect(Object.keys(projects).length).toEqual(5);
  });

  it('Get a project directly', async () => {
    const projectName = 'simpleTrainTest';
    const configName = 'simpleConfig1';
    const retrieved = await loadOne({
      reqUserId: TEST_USER,
      username: 'Kevin',
      projectName,
      configName,
    });
    await checkProject(retrieved, projectName, configName);
  });

  // it('Get a project through middleware', async () => {
  //   const projectName = 'simpleTrainTest';
  //   const configName = 'simpleConfig1';
  //   const { body: retrieved } = await request
  //     .post(LOAD_PROJECT({ projectName, configName }))
  //     .expect(200);

  //   await checkProject(retrieved, projectName);
  // });
});

async function checkProject(retrieved, projectName, configName) {
  const correctOutput = await loadTestData({
    projectName,
    configName,
    format: 'loadProjectToFrontend',
  });

  // TODO: figure out globalDefaults and projectDefaults
  const { projectDefaults, runs, ...theRest } = correctOutput;

  expect(Object.keys(retrieved).sort()).toEqual(Object.keys(theRest).sort());
  for (const k of Object.keys(retrieved)) {
    if (k === 'codeInfo') {
      continue;
    }
    expect(retrieved[k], `${k} doesn't match`).toEqual(correctOutput[k]);
  }

  // expect(theRest.project).toEqual(correctRest.project);
  // expect(theRest.projectConfig).toEqual(correctRest.projectConfig);
  // expect(theRest.sectionConfigCol).toEqual(correctRest.sectionConfigCol);
  // expect(theRest.sections).toEqual(correctRest.sections);
  // expect(theRest.sectionChildren).toEqual(correctRest.sectionChildren);
  // expect(theRest.sectionConfigs).toEqual(correctRest.sectionConfigs);
  // expect(theRest.ev).toEqual(correctRest.ev);
  // expect(theRest.evCols).toEqual(correctRest.evCols);
  // expect(theRest.kwargCols).toEqual(correctRest.kwargCols);
  // expect(theRest.uiTypes).toEqual(correctRest.uiTypes);
  // expect(theRest.uiTypeCols).toEqual(correctRest.uiTypeCols);

  // expect(retrieved).toEqual(correctRest);
}
