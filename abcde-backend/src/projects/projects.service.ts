import { Injectable } from '@nestjs/common';
import { Users } from '../entities/users.entity';
import { ProjectsRepository } from './projects.repository';
import { EntityManager } from '@mikro-orm/postgresql';
import { SectionsRepository } from '../sections/sections.repository';
import { SectionConfigColsRepository } from '../sections/sectionConfigCols.repository';
import _ = require('lodash');
import {
  getProject,
  getSectionChildren,
  getSectionConfigCol,
  getSections,
  getUITypes,
  loadBaseUITypes,
  loadCodeInfo,
  loadEVCols,
  loadKwargCols,
  loadPresetUITypes,
  loadUITypeCols,
  processSectionConfigs,
} from './loadingFunctions';
import { persistEV, persistEVCols, persistSections } from './savingFunctions';

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
      { populate: ['projectConfigs'] },
    );
    return _.keyBy(ps, (x) => x.id);
  }

  async createProject(user, name: string): Promise<any> {
    const p = this.projects.create({ owner: user.id, name });
    await this.projects.persistAndFlush(p);
    return p;
  }

  async save(user, project): Promise<any> {
    const { ev, evCols, sections } = project;
    persistEV(this.em, ev);
    persistEVCols(this.em, evCols);
    persistSections(this.em, sections);
    await this.em.flush();
  }

  async loadOne(id: string): Promise<any> {
    const fullObj = await getProject(id, this.projects);
    const {
      defaultProjectConfig: {
        sectionConfigCol: { sectionConfigCols },
      },
      ...project
    } = fullObj;

    const sections = getSections(sectionConfigCols);
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
    const uiTypeCols = await loadUITypeCols(this.em, sectionUITypes);
    const codeInfo = await loadCodeInfo(this.em, sectionUITypes);
    const sectionConfigs = processSectionConfigs(tempSectionConfigs);

    return {
      project,
      sections,
      sectionChildren,
      sectionConfigs,
      sectionConfigCol,
      ev,
      evCols,
      baseUITypes,
      uiTypes: sectionUITypes,
      presetUITypes,
      uiTypeCols,
      kwargCols,
      codeInfo: { ...codeInfo, ...kwargInfos },
    };
  }
}
