import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService } from '../../src/projects/projects.service';
import config from '../../src/mikro-orm.config';
import { Users } from '../../src/entities/users.entity';
import { AppModule } from '../../src/app.module';

describe('ProjectsService', () => {
  let app: TestingModule;
  let service: ProjectsService;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        MikroOrmModule.forRoot({
          ...config,
          allowGlobalContext: true,
          debug: false,
        }),
        AppModule,
      ],
    }).compile();
    service = app.get(ProjectsService);
  });

  describe('Get list of user projects', () => {
    const user = new Users();
    it('for a user with projects', async () => {
      user.id = '25961114-6655-4e2c-b70f-e2e3aaa84131';
      const projects = await service.getAllByOwner(user);
      expect(projects.length).toEqual(3);
    });
    it('for a user with no projects', async () => {
      user.id = 'cb61fad7-0d48-40bf-b75b-c24f60600f69';
      const projects = await service.getAllByOwner(user);
      expect(projects.length).toEqual(0);
    });
  });
});
