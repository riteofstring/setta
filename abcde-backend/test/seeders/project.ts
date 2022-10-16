import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { loadAllProjects } from '../utils';
import { persistAllProjectDetails } from '../../src/projects/savingFunctions';

export class ProjectSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const allProjects = await loadAllProjects();
    for (const p of allProjects) {
      await persistAllProjectDetails(em, p);
    }
  }
}
