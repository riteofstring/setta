import { MikroORM } from '@mikro-orm/core';
import config from '../src/mikro-orm.config';
import { UsersSeeder } from './seeders/users';
import { CodeInfoSeeder } from './seeders/codeInfo';
import { ProjectSeeder } from './seeders/project';
import _ from 'lodash';

(async () => {
  let allSeeders = [UsersSeeder, CodeInfoSeeder, ProjectSeeder];
  const onlyUseThese = [];
  let doRefreshDatabase = true;
  process.argv.slice(2).forEach(function (val) {
    if (val === 'NO_REFRESH') {
      doRefreshDatabase = false;
    } else {
      onlyUseThese.push(val);
    }
  });
  if (onlyUseThese.length > 0) {
    allSeeders = allSeeders.filter((x) => onlyUseThese.includes(x.name));
  }

  const orm = await MikroORM.init(config);
  const seeder = orm.getSeeder();
  if (doRefreshDatabase) {
    await orm.getSchemaGenerator().refreshDatabase();
  }
  for (const x of allSeeders) {
    await seeder.seed(x);
  }
  await orm.close(true);
})();
