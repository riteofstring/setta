import { MikroORM } from '@mikro-orm/core';
import config from '../../src/mikro-orm.config';

describe('Orphan Removal', () => {
  let orm;
  let generator;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...config,
      dbName: 'test',
    });
    generator = await orm.getSchemaGenerator();
    await generator.createSchema();
  });

  afterAll(async () => {
    await generator.dropSchema();
    await orm.close(true);
  });

  it('SectionChildrenIds', async () => {});
});
