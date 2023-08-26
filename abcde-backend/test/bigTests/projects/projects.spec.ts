import { loadSpecificTestData } from 'abcde-test/src/loaders/helpers';
import { loadTestData } from 'abcde-test/src/loaders/loaders';
import { DEFAULT_BASE_UI_TYPE_ID } from 'abcde-utils/src/constants';
import { newCodeInfo } from 'abcde-utils/src/objs/codeInfo';
import { LOAD_PROJECT, LOGIN, PROJECTS } from 'abcde-utils/src/routes';
import { compareObjs } from 'abcde-utils/src/testUtils';
import _ from 'lodash';
import { app } from 'src/app/app';
import { saveAsNewProjectConfig } from 'src/db/projectConfigs/saveAs';
import { loadOne } from 'src/db/projects/load';
import supertest from 'supertest';

const TEST_USER = '25961114-6655-4e2c-b70f-e2e3aaa84131';
const TEST_USERNAME = 'kevin';
const PROJECT_NAME = 'simpleTrainTest';
const CONFIG_NAME = 'simpleConfig1';

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
    // check original config
    await loadAndCheckProject();
  });

  it('Get a project through middleware', async () => {
    const { body: retrieved } = await request
      .post(
        LOAD_PROJECT({
          username: TEST_USERNAME,
          projectName: PROJECT_NAME,
          configName: CONFIG_NAME,
        }),
      )
      .expect(200);

    await checkProject(retrieved, PROJECT_NAME, CONFIG_NAME);
  });

  it('Saving as a new config should not affect original config', async () => {
    const project = await loadTestData({
      projectName: PROJECT_NAME,
      configName: CONFIG_NAME,
      format: 'saveProjectToBackend',
    });
    // save as new config
    await saveAsNewProjectConfig(TEST_USER, project, 'amazingNewConfig');

    // check original config
    await loadAndCheckProject();
  });

  it('Modifying and saving as new config should not affect original config', async () => {
    const project = await loadTestData({
      projectName: PROJECT_NAME,
      configName: CONFIG_NAME,
      format: 'saveProjectToBackend',
    });

    // add a kwarg to a user specified object
    const kwargInfo = newCodeInfo({});
    project.codeInfo[kwargInfo.id] = kwargInfo;
    const section = _.find(project.sections, (v) => v.selectedItem);
    const { uiTypeColId, evColId, selectedItem } = section;
    project.codeInfo[selectedItem].children.push(kwargInfo.id);
    project.uiTypeCols[uiTypeColId][kwargInfo.id] = {
      uiTypeId: DEFAULT_BASE_UI_TYPE_ID,
      nonPresetUITypeIds: [],
    };
    project.evCols[evColId][kwargInfo.id] = 'quantum';

    // save as new config
    await saveAsNewProjectConfig(TEST_USER, project, 'diffusionConfig');

    // check original config
    await loadAndCheckProject();
  });
});

async function loadAndCheckProject() {
  const retrieved = await loadOne({
    reqUserId: TEST_USER,
    username: TEST_USERNAME,
    projectName: PROJECT_NAME,
    configName: CONFIG_NAME,
  });
  await checkProject(retrieved, PROJECT_NAME, CONFIG_NAME);
}

async function checkProject(retrieved, projectName, configName) {
  const correctOutput = await loadTestData({
    projectName,
    configName,
    format: 'loadProjectToFrontend',
  });

  // TODO: figure out globalDefaults and projectDefaults
  const { projectDefaults, runs, ...theRest } = correctOutput;

  compareObjs(expect, retrieved, theRest);
}
