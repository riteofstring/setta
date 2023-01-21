import {
  loadAllProjects,
  loadSpecificTestData,
} from 'abcde-test/src/loadTestData';
import { LOAD_PROJECT, LOGIN, PROJECTS } from 'abcde-utils/src/routes';
import { app } from 'src/app';
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
    expect(Object.keys(projects).length).toEqual(3);
  });

  it('Get a project directly', async () => {
    const projectId = '61e089c8-62bf-4e8c-915e-111b4587da81';
    const configId = '439f5590-fa98-4564-8f63-ec75b6dc89b2';
    const retrieved = await loadOne(TEST_USER, projectId, configId);
    await checkProject(retrieved, projectId);
  });

  it('Get a project through middleware', async () => {
    const projectName = 'simpleTrainTest';
    const configName = 'simpleConfig1';
    const { body: retrieved } = await request
      .post(LOAD_PROJECT({ projectName, configName }))
      .expect(200);

    await checkProject(retrieved, projectName);
  });
});

async function checkProject(retrieved, projectId) {
  const allProjects = await loadAllProjects({});
  const correctOutput = allProjects.find((x) => x.project.id === projectId);

  // TODO: figure out globalDefaults and projectDefaults
  const { projectDefaults, ...correctRest } = correctOutput;
  correctOutput['userCodeInfoMaps'] =
    correctOutput['userCodeInfoMaps'][TEST_USER];

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

  expect(retrieved).toEqual(correctRest);
}
