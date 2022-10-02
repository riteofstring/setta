import { Injectable } from '@nestjs/common';
import { Users } from '../entities/users.entity';
import { ProjectsRepository } from './projects.repository';
import { EntityManager } from '@mikro-orm/postgresql';
import { SectionsRepository } from '../sections/sections.repository';
import { SectionConfigColsRepository } from '../sections/sectionConfigCols.repository';
import { Projects } from '../entities/projects/projects.entity';
import { UITypes } from '../entities/uitypes/uiTypes.entity';
// import { getSpecificUITypeTable } from '../utils/constants';
import { SectionUITypes } from '../entities/uiTypes/sectionUITypes.entity';
import { SliderUITypes } from '../entities/uiTypes/sliderUITypes.entity';
import { SwitchUITypes } from '../entities/uiTypes/switchUITypes.entity';
import { TextUITypes } from '../entities/uiTypes/textUITypes.entity';
import { RefUITypes } from '../entities/uiTypes/refUITypes.entity';

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

    const { baseUITypes } = await this.loadBaseUITypes();

    return { project, sectionChildren, baseUITypes };
  }

  async loadBaseUITypes(): Promise<any> {
    const uiTypes = await this.em.find(UITypes, { presetType: 'base' });

    const configs = [];
    for (const table of [
      SectionUITypes,
      SliderUITypes,
      SwitchUITypes,
      TextUITypes,
      RefUITypes,
    ]) {
      // @ts-ignore
      const result = await this.em.find(table, { id: { $in: uiTypes } });
      configs.push(...result);
    }

    const baseUITypes = {};
    for (const x of configs) {
      const { id, ...config } = x;
      baseUITypes[id.id] = { ...id, config };
    }

    return { baseUITypes };
  }
}
