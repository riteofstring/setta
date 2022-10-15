import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Test, TestingModule } from '@nestjs/testing';
import config from '../../src/mikro-orm.config';
import { AppModule } from '../../src/app.module';
import projectsData from '../../../abcde-frontend/src/__tests__data/Projects';
import sectionsData from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/Sections';
import sectionConfigsData from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/SectionConfigs';
import sectionChildrenData from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/SectionChildren';
import sectionConfigColData from '../../../abcde-frontend/src/__tests__data/SectionConfigCols';
import evData from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/EV';
import evColsData from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/EVCols';
import baseUITypesData from '../../../abcde-frontend/src/__tests__data/BaseUITypes';
import presetUITypesData from '../../../abcde-frontend/src/__tests__data/PresetUITypes';
import uiTypesData from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/UITypes';
import uiTypesColsData from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/UITypesCols';
import kwargColsData from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/KwargCols';
import codeInfoData from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/CodeInfo';
import usersData from '../../../abcde-frontend/src/__tests__data/Users';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

describe('ProjectsService', () => {
  let app: INestApplication;
  let access_token: string;
  const testUser = usersData['25961114-6655-4e2c-b70f-e2e3aaa84131'];

  beforeAll(async () => {
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

    expect(project.sections).toEqual(sectionsData);
    expect(project.sectionChildren).toEqual(sectionChildrenData);
    expect(project.sectionConfigs).toEqual(sectionConfigsData);
    expect(project.sectionConfigCol).toEqual(
      sectionConfigColData[sectionConfigColId],
    );
    expect(project.ev).toEqual(evData);
    expect(project.evCols).toEqual(evColsData);
    expect(project.baseUITypes).toEqual(baseUITypesData);
    expect(project.uiTypes).toEqual(uiTypesData);
    expect(project.presetUITypes).toEqual(presetUITypesData);
    expect(project.uiTypeCols).toEqual(uiTypesColsData);
    expect(project.kwargCols).toEqual(kwargColsData);
    compareCodeInfo(project.codeInfo, codeInfoData);
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
