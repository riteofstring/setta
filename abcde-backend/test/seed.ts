import { MikroORM } from '@mikro-orm/core';
import config from '../src/mikro-orm.config';
import { UsersSeeder } from './seeders/users';
import { ProjectsSeeder } from './seeders/projects';
import { UIsSeeder } from './seeders/uis';
import { PackagesSeeder } from './seeders/packages';

(async () => {
  const orm = await MikroORM.init(config);
  const seeder = orm.getSeeder();
  await orm.getSchemaGenerator().refreshDatabase();
  const seeders = [UsersSeeder, ProjectsSeeder, UIsSeeder, PackagesSeeder];
  for (const x of seeders) {
    await seeder.seed(x);
  }
  await orm.close(true);
})();
