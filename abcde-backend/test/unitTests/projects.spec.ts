import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from 'src/app.module';
import * as request from 'supertest';
import { loadAllProjects, loadSpecificTestData } from '../utils';

describe('ProjectsService', () => {
  let app: INestApplication;
  let access_token: string;
  let testUser;

  beforeAll(async () => {
    const allUsers = await loadSpecificTestData({ name: 'Users' });
    testUser = allUsers['25961114-6655-4e2c-b70f-e2e3aaa84131'];

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // login
    const { body } = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: testUser.name, password: testUser.password })
      .expect(201);
    access_token = body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Get list of user projects', async () => {
    const { body: projects } = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${access_token}`);
    expect(Object.keys(projects).length).toEqual(3);
  });

  it('Get a project with nested sections', async () => {
    const projectId = '61e089c8-62bf-4e8c-915e-111b4587da81';
    const { body: retrieved } = await request(app.getHttpServer())
      .post(`/projects/load/${projectId}`)
      .set('Authorization', `Bearer ${access_token}`);

    const allProjects = await loadAllProjects({});
    const correctOutput = allProjects.filter(
      (x) => x.project.id === projectId,
    )[0];

    // TODO: figure out globalDefaults and projectDefaults
    const { ...theRest } = retrieved;
    const { globalDefaults, projectDefaults, ...correctRest } = correctOutput;

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

    expect(theRest).toEqual(correctRest);
  });
});
