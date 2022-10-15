import { MikroORM } from '@mikro-orm/core';
import config from '../src/mikro-orm.config';
import { UsersSeeder } from './seeders/users';
import { ProjectsSeeder } from './seeders/projects';
import { CodeInfoSeeder } from './seeders/codeInfo';
import { ProjectSeeder } from './seeders/project';

(async () => {
  const orm = await MikroORM.init(config);
  const seeder = orm.getSeeder();
  await orm.getSchemaGenerator().refreshDatabase();
  const seeders = [
    UsersSeeder,
    CodeInfoSeeder,
    ProjectSeeder,
    // KwargColsSeeder,
    // UITypesColsSeeder,
    // SectionsSeeder,
    // ProjectsSeeder,
  ];
  for (const x of seeders) {
    await seeder.seed(x);
  }
  await orm.close(true);
})();
