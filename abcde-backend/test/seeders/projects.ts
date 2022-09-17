import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Users } from '../../src/entities/users.entity';
import { Projects } from '../../src/entities/projects.entity';
import data from '../../../abcde-frontend/src/__tests__data/Projects';

export class ProjectsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const x of data) {
      const user = await em.findOne(Users, { ...x.owner });
      em.create(Projects, { ...x, owner: user });
    }
  }
}
