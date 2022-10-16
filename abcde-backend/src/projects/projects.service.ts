import { Injectable } from '@nestjs/common';
import { Users } from '../entities/users.entity';
import { ProjectsRepository } from './projects.repository';
import { EntityManager } from '@mikro-orm/postgresql';
import { SectionsRepository } from '../sections/sections.repository';
import { SectionConfigColsRepository } from '../sections/sectionConfigCols.repository';
import _ = require('lodash');
import {
  getOrderedChildren,
  getProject,
  getSectionChildren,
  getSectionChildrenIds,
  getSectionConfigCol,
  getSections,
  getUITypes,
  loadBaseUITypes,
  loadCodeInfo,
  loadEVCols,
  loadKwargCols,
  loadPresetUITypes,
  loadUITypesCols,
  processSectionConfigs,
} from './loadingFunctions';
import { persistAllProjectDetails } from './savingFunctions';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly sections: SectionsRepository,
    private readonly sectionConfigCols: SectionConfigColsRepository,
    private readonly em: EntityManager,
  ) {}

  async getAllByOwner(user: Users): Promise<any> {
    const ps = await this.projects.find(
      { owner: user },
      { populate: ['configs'] },
    );
    return _.keyBy(ps, (x) => x.id);
  }

  async createProject(user, name: string): Promise<any> {
    const p = this.projects.create({ owner: user.id, name });
    await this.projects.persistAndFlush(p);
    return p;
  }

  async save(projects): Promise<any> {
    await persistAllProjectDetails(this.em, projects);
    await this.em.flush();
  }

  async loadOne(id: string): Promise<any> {
    const fullObj = await getProject(id, this.projects);
    const { defaultConfig: projectConfig, ...project } = fullObj;
    const {
      children,
      sectionConfigCol: { sectionConfigCols },
    } = projectConfig;

    const projectChildren = getOrderedChildren(children.sectionChildren);
    const sections = getSections(sectionConfigCols);
    const sectionChildrenIds = getSectionChildrenIds(sectionConfigCols);
    const sectionChildren = getSectionChildren(sectionConfigCols);
    const sectionConfigCol = getSectionConfigCol(sectionConfigCols);
    const tempSectionConfigs = sectionConfigCols
      .getItems()
      .map((x) => x.config);
    const { ev, evCols } = await loadEVCols(this.em, tempSectionConfigs);
    const { kwargCols, kwargInfos } = await loadKwargCols(
      this.em,
      tempSectionConfigs,
    );
    const sectionUITypes = await getUITypes(this.em, tempSectionConfigs);
    const baseUITypes = await loadBaseUITypes(this.em);
    const presetUITypes = await loadPresetUITypes(this.em);
    const uiTypesCols = await loadUITypesCols(this.em, sectionUITypes);
    const codeInfo = await loadCodeInfo(this.em, sectionUITypes);
    const sectionConfigs = processSectionConfigs(tempSectionConfigs);

    return {
      project: {
        id: project.id,
        name: project.name,
        owner: project.owner.id,
        defaultConfig: projectConfig.id,
      },
      projectConfig: {
        id: projectConfig.id,
        name: projectConfig.name,
        sectionConfigCol: projectConfig.sectionConfigCol.id,
        childrenId: projectConfig.children.id,
        children: projectChildren,
      },
      sections,
      sectionChildren,
      sectionChildrenIds,
      sectionConfigs,
      sectionConfigCol,
      ev,
      evCols,
      uiTypes: { ...baseUITypes, ...sectionUITypes, ...presetUITypes },
      uiTypesCols,
      kwargCols,
      codeInfo: { ...codeInfo, ...kwargInfos },
    };
  }
}
