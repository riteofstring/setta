import { Injectable } from '@nestjs/common';
import { Users } from '../entities/users.entity';
import { ProjectsRepository } from './projects.repository';
import { EntityManager } from '@mikro-orm/postgresql';
import { SectionsRepository } from '../sections/sections.repository';
import { SectionConfigColsRepository } from '../sections/sectionConfigCols.repository';
import { Projects } from '../entities/projects.entity';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly sections: SectionsRepository,
    private readonly sectionConfigCols: SectionConfigColsRepository,
    private readonly em: EntityManager,
  ) {}

  async getAllByOwner(user: Users): Promise<any> {
    return this.projects.find({ owner: user });
  }

  async loadOne(id: string): Promise<any> {
    const project = await this.projects.findOne({ id });
    const { sections, sectionChildren } = await this.getAllSectionsOfProject(
      project,
    );

    const sectionConfigs = await this.sectionConfigCols.find(
      {
        id: project.sectionConfigCol,
        section: { $in: sections },
      },
      { populate: ['config'] },
    );

    return { project, sections, sectionConfigs, sectionChildren };
  }

  async getAllSectionsOfProject(project: Projects): Promise<any> {
    const sectionGroupId = project.sectionGroup.id;
    const connection = this.em.getConnection();

    // TODO: change to prepared statement
    const parentChildPairs = await connection.execute(`
      with recursive descendants as (
          select sections_1_id, sections_2_id
          from sections_children
          where sections_1_id = '${sectionGroupId}'
        union
          select x.sections_1_id, x.sections_2_id
          from sections_children x
          join descendants on x.sections_1_id = descendants.sections_2_id
      )
      select sections_1_id, sections_2_id from descendants;`);

    const sectionIds = parentChildPairs.map((x) => x.sections_2_id);
    sectionIds.push(sectionGroupId);

    const sections = await this.sections.find({ id: { $in: sectionIds } });
    const sectionChildren = {};
    for (const id of sectionIds) {
      sectionChildren[id] = parentChildPairs
        .filter((x) => x.sections_1_id === id)
        .map((x) => x.sections_2_id);
    }

    return { sections, sectionChildren };
  }
}
