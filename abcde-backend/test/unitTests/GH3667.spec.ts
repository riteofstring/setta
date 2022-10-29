import { Entity, PrimaryKey, MikroORM, Property } from '@mikro-orm/core';

@Entity()
class User {
  @PrimaryKey()
  id!: number;

  @Property({ nullable: true })
  name: string;
}

describe('GH issue 3667', () => {
  let orm;
  let em;

  beforeAll(async () => {
    orm = await MikroORM.init({
      type: 'postgresql',
      dbName: 'test',
      allowGlobalContext: true,
      entities: [User],
    });
    await orm.schema.ensureDatabase();
    await orm.schema.dropSchema();
    await orm.schema.createSchema();
    em = orm.em;
  });

  afterAll(async () => {
    await orm.close(true);
  });

  test(`GH issue 3667`, async () => {
    const user1 = new User();
    em.persist(user1);
    await em.flush();

    await em.upsert(User, { id: 1, name: 'john' });
    await em.flush();
    const x = await em.findOne(User, { id: 1 });
    expect(x.name).toEqual('john'); //x.name is undefined

    em.clear();
  });
});
