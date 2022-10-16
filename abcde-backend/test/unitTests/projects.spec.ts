import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Test, TestingModule } from '@nestjs/testing';
import config from '../../src/mikro-orm.config';
import { AppModule } from '../../src/app.module';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { loadSpecificTestData, loadAllProjects } from '../utils';

describe('ProjectsService', () => {
  let app: INestApplication;
  let access_token: string;
  let testUser;

  beforeAll(async () => {
    const allUsers = await loadSpecificTestData({ name: 'Users' });
    testUser = allUsers['25961114-6655-4e2c-b70f-e2e3aaa84131'];

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MikroOrmModule.forRoot({
          ...config,
          allowGlobalContext: true,
          debug: false,
        }),
        AppModule,
      ],
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
    const sectionConfigColId = 'f5cd8865-a15b-4fa3-9410-1ea3aa6933a5';
    const { body: project } = await request(app.getHttpServer())
      .post(`/projects/load/${projectId}`)
      .set('Authorization', `Bearer ${access_token}`);

    const allProjects = await loadAllProjects({});
    const {
      codeInfo,
      ev,
      evCols,
      kwargCols,
      projectDefaults,
      sectionChildren,
      sectionChildrenIds,
      sectionConfigCol,
      sectionConfigs,
      sections,
      uiTypes,
      uiTypesCols,
    } = allProjects.filter((x) => x.project.id === projectId)[0];

    console.log(project);

    // expect(project.sections).toEqual(sections);
    // expect(project.sectionChildren).toEqual(sectionChildren);
    // expect(project.sectionConfigs).toEqual(sectionConfigs);
    // expect(project.sectionConfigCol).toEqual(
    //   sectionConfigCol[sectionConfigColId],
    // );
    // expect(project.ev).toEqual(ev);
    // expect(project.evCols).toEqual(evCols);
    // expect(project.uiTypes).toEqual(uiTypes);
    // expect(project.uiTypesCols).toEqual(uiTypesCols);
    // expect(project.kwargCols).toEqual(kwargCols);
    // expect(project.sectionChildrenIds).toEqual(sectionChildrenIds);
    // compareCodeInfo(project.codeInfo, codeInfo);
  });
});

function compareCodeInfo(x, y) {
  expect(Object.keys(x).sort()).toEqual(Object.keys(y).sort());
  for (const k of Object.keys(x)) {
    for (const nestedK of Object.keys(x[k])) {
      if (nestedK === 'children') {
        expect(x[k][nestedK].sort()).toEqual(y[k][nestedK].sort());
      } else {
        expect(x[k][nestedK]).toEqual(y[k][nestedK]);
      }
    }
  }
}
