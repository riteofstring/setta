import { Injectable } from '@nestjs/common';
import { Users } from '../entities/users.entity';
import { ProjectsRepository } from './projects.repository';
import { EntityManager } from '@mikro-orm/postgresql';
import { SectionsRepository } from '../sections/sections.repository';
import { SectionConfigColsRepository } from '../sections/sectionConfigCols.repository';
import { Projects } from '../entities/projects/projects.entity';

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
    const fullObj = await this.projects.findOne(
      { id },
      {
        populate: [
          'defaultProjectConfig.sectionConfigCol.sectionConfigCols.section.children',
          'defaultProjectConfig.sectionConfigCol.sectionConfigCols.config',
        ],
      },
    );
    const {
      defaultProjectConfig: {
        sectionConfigCol: { sectionConfigCols },
      },
      ...project
    } = fullObj;

    const sectionChildren = {};
    for (const col of sectionConfigCols) {
      const children = col.section.children;
      if (children.length > 0) {
        sectionChildren[col.section.id] = children.getItems().map((x) => x.id);
      }
    }

    return { project, sectionChildren };
  }
}
