import { MikroORM } from '@mikro-orm/core';
import config from '../src/mikro-orm.config';
import { UsersSeeder } from './seeders/users';
import { CodeInfoSeeder } from './seeders/codeInfo';
import { ProjectSeeder } from './seeders/project';
import _ from 'lodash';

(async () => {
  let allSeeders = [CodeInfoSeeder];
  const onlyUseThese = [];
  process.argv.slice(2).forEach(function (val) {
    onlyUseThese.push(val);
  });
  if (onlyUseThese.length > 0) {
    allSeeders = allSeeders.filter((x) => onlyUseThese.includes(x.name));
  }

  const orm = await MikroORM.init(config);
  const seeder = orm.getSeeder();
  await orm.getSchemaGenerator().refreshDatabase();
  for (const x of allSeeders) {
    await seeder.seed(x);
  }
  await orm.close(true);
})();
