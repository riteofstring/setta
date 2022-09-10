import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Projects } from '../../src/entities/projects.entity';
import fakeProjects from '../seedData/projects';

export class ProjectsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    fakeProjects.forEach((x) => em.create(Projects, x));
  }
}
