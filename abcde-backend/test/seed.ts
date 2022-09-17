import { MikroORM } from '@mikro-orm/core';
import config from '../src/mikro-orm.config';
import { UsersSeeder } from './seeders/users';
import { ProjectsSeeder } from './seeders/projects';
import { UIsSeeder } from './seeders/uis';
import { CodeInfoSeeder } from './seeders/codeInfo';
import { SectionsSeeder } from './seeders/sections';

(async () => {
  const orm = await MikroORM.init(config);
  const seeder = orm.getSeeder();
  await orm.getSchemaGenerator().refreshDatabase();
  const seeders = [
    UsersSeeder,
    ProjectsSeeder,
    SectionsSeeder,
    UIsSeeder,
    CodeInfoSeeder,
  ];
  for (const x of seeders) {
    await seeder.seed(x);
  }
  await orm.close(true);
})();
