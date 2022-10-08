import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Projects } from '../../src/entities/projects/projects.entity';
import projectsData from '../../../abcde-frontend/src/__tests__data/Projects';
import projectConfigsData from '../../../abcde-frontend/src/__tests__data/ProjectConfigs';
import { ProjectConfigs } from '../../src/entities/projects/projectConfigs.entity';

export class ProjectsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const x of projectsData) {
      const currProject = em.create(Projects, {
        id: x.id,
        name: x.name,
        owner: x.owner,
      });
      for (const config of x.configs) {
        const configDetails = projectConfigsData[config.id];
        const currProjectConfig = em.create(ProjectConfigs, {
          ...configDetails,
          project: x.id,
        });
        if (config.curr) {
          currProject.defaultProjectConfig = currProjectConfig;
        }
      }
    }
  }
}
