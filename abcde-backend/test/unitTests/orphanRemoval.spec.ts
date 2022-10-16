import { MikroORM } from '@mikro-orm/core';
import config from '../../src/mikro-orm.config';

describe('Orphan Removal', () => {
  let orm;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...config,
      dbName: 'test',
    });
    await orm.schema.ensureDatabase();
    await orm.schema.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await orm.schema.dropSchema();
    await orm.schema.createSchema();
  });

  afterAll(async () => {
    await orm.schema.dropSchema({ dropDb: true });
    await orm.close(true);
  });

  it('SectionChildrenIds', async () => {});
});
