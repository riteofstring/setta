import {
  Entity,
  PrimaryKey,
  MikroORM,
  ManyToOne,
  Collection,
  OneToMany,
} from '@mikro-orm/core';

@Entity()
class Competition {
  @PrimaryKey()
  id!: number;

  @OneToMany('Registration', 'competition', { orphanRemoval: true })
  registrations = new Collection<Registration>(this);
}

@Entity()
class User {
  @PrimaryKey()
  id!: number;
}

@Entity()
class Registration {
  @ManyToOne({ primary: true })
  competition!: Competition;

  @ManyToOne({ primary: true })
  user!: User;

  constructor(user: User, competition: Competition) {
    this.user = user;
    this.competition = competition;
  }
}

describe('GH issue 3666', () => {
  let orm;
  let em;

  beforeAll(async () => {
    orm = await MikroORM.init({
      type: 'postgresql',
      dbName: 'test',
      allowGlobalContext: true,
      entities: [Competition, User, Registration],
    });
    await orm.schema.ensureDatabase();
    await orm.schema.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await orm.schema.dropSchema();
    await orm.schema.createSchema();
    em = orm.em;
  });

  afterAll(async () => {
    await orm.close(true);
  });

  test(`GH issue 3666`, async () => {
    const competition = new Competition();
    const user1 = new User();
    const user2 = new User();
    const user3 = new User();
    const registration1 = new Registration(user1, competition);
    const registration2 = new Registration(user2, competition);
    const registration3 = new Registration(user3, competition);
    em.persist(registration1);
    em.persist(registration2);
    em.persist(registration3);
    await em.flush();
    let x = await em.find(Registration);
    expect(x.length).toEqual(3);

    competition.registrations.set([registration2, registration3]);
    await em.flush();
    x = await em.find(Registration);
    expect(x.length).toEqual(2);

    competition.registrations.set([registration2]);
    await em.flush();
    x = await em.find(Registration);
    expect(x.length).toEqual(1);

    em.clear();
  });
});
