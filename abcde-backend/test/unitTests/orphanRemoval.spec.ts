import { MikroORM } from '@mikro-orm/core';
import { SectionChildrenIds } from '../../src/entities/sections/sectionChildrenIds.entity';
import config from '../../src/mikro-orm.config';
import { v4 as uuidv4 } from 'uuid';
import { SectionChildren } from '../../src/entities/sections/sectionChildren.entity';
import { Sections } from '../../src/entities/sections/sections.entity';
import _ from 'lodash';
import { persistOneSectionChildren } from '../../src/sections/savingFunctions';
import { persistAllProjectDetails } from '../../src/projects/savingFunctions';

describe('Orphan Removal', () => {
  let orm;
  let em;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...config,
      dbName: 'test',
      allowGlobalContext: true,
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

  it('persistOneSectionChildren', async () => {
    const scid1 = em.create(SectionChildrenIds, {});
    const scid2 = em.create(SectionChildrenIds, {});
    const scid3 = em.create(SectionChildrenIds, {});
    const s1 = em.create(Sections, { name: 'test1', children: scid1 });
    const s2 = em.create(Sections, { name: 'test2', children: scid2 });
    const s3 = em.create(Sections, { name: 'test3', children: scid3 });
    [scid1, scid2, scid3, s1, s2, s3].forEach((x) => em.persist(x));
    await em.flush();
    // await persistAllProjectDetails(em, {
    //   project: {}
    //   projectConfig: {
    //     id: uuidv4(),
    //     name: 'test project',
    //     sectionConfigCol: uuidv4(),
    //     childrenId: scid,
    //     children: [s1.id, s2.id, s3.id],
    //   },
    // });
    // let projectChildren = await em.find(SectionChildren, { id: scid });
    // expect(projectChildren.length).toEqual(3);

    await persistOneSectionChildren(em, [s2.id], scid1);
    await em.flush();
    let s1Children = await em.find(SectionChildren, { id: scid1 });
    expect(s1Children.length).toEqual(1);

    await persistOneSectionChildren(em, [s2.id, s3.id], scid1);
    await em.flush();
    s1Children = await em.find(SectionChildren, { id: scid1 });
    expect(s1Children.length).toEqual(2);

    await persistOneSectionChildren(em, [s2.id], scid1);
    await em.flush();
    s1Children = await em.find(SectionChildren, { id: scid1 });
    expect(s1Children.length).toEqual(1);
    let s2Children = await em.find(SectionChildren, { id: scid2 });
    expect(s2Children.length).toEqual(0);

    await persistOneSectionChildren(em, [s3], scid2);
    await persistOneSectionChildren(em, [], scid1);
    await em.flush();
    console.log(await em.find(SectionChildren));
    s1Children = await em.find(SectionChildren, { id: scid1 });
    expect(s1Children.length).toEqual(0);
    s2Children = await em.find(SectionChildren, { id: scid2 });
    expect(s2Children.length).toEqual(1);
  });
});
