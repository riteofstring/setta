import { Injectable } from '@nestjs/common';
import _ = require('lodash');
import { PrismaService } from '../prisma.service';
import {
  getProject,
  getProjectConfig,
  getSectionConfigs,
  getSections,
} from './loadingFunctions';
import { saveAllProjectDetails } from './savingFunctions';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async getAllByOwner(user): Promise<any> {
    const ps = await this.prisma.project.findMany({
      where: { ownerId: user.id },
      include: { configs: true },
    });
    return _.keyBy(ps, 'id');
  }

  async createProject(user, name: string): Promise<any> {
    return await this.prisma.project.create({
      data: { owner: user.id, name },
    });
  }

  async save(projects): Promise<any> {
    await saveAllProjectDetails(this.prisma, projects);
  }

  async loadOne(id: string): Promise<any> {
    const project = await getProject(this.prisma, id);
    const { projectConfig, sectionConfigCol } = await getProjectConfig(
      this.prisma,
      project.defaultConfig,
    );
    const { sections, sectionChildren } = await getSections(
      this.prisma,
      _.keys(sectionConfigCol),
    );
    const { sectionConfigs, ev, evCols, kwargCols } = await getSectionConfigs(
      this.prisma,
      _.values(sectionConfigCol),
    );

    return {
      project,
      projectConfig,
      sectionConfigCol,
      sections,
      sectionChildren,
      sectionConfigs,
      ev,
      evCols,
      kwargCols,
    };

    // const fullObj = await getProject(id, this.projects);
    // const { defaultConfig: projectConfig, ...project } = fullObj;
    // const {
    //   children,
    //   sectionConfigCol: { sectionConfigCols },
    // } = projectConfig;

    // const projectChildren = getOrderedChildren(children.sectionChildren);
    // const sections = getSections(sectionConfigCols);
    // const sectionChildrenIds = getSectionChildrenIds(sectionConfigCols);
    // const sectionChildren = getSectionChildren(sectionConfigCols);
    // const sectionConfigCol = getSectionConfigCol(sectionConfigCols);
    // const tempSectionConfigs = sectionConfigCols
    //   .getItems()
    //   .map((x) => x.config);
    // const { ev, evCols } = await loadEVCols(this.em, tempSectionConfigs);
    // const { kwargCols, kwargInfos } = await loadKwargCols(
    //   this.em,
    //   tempSectionConfigs,
    // );
    // const sectionUITypes = await getUITypes(this.em, tempSectionConfigs);
    // const baseUITypes = await loadBaseUITypes(this.em);
    // const presetUITypes = await loadPresetUITypes(this.em);
    // const uiTypesCols = await loadUITypesCols(this.em, sectionUITypes);
    // const codeInfo = await loadCodeInfo(this.em, sectionUITypes);
    // const sectionConfigs = processSectionConfigs(tempSectionConfigs);

    // return {
    //   project: {
    //     id: project.id,
    //     name: project.name,
    //     owner: project.owner.id,
    //     defaultConfig: projectConfig.id,
    //   },
    //   projectConfig: {
    //     id: projectConfig.id,
    //     name: projectConfig.name,
    //     sectionConfigCol: projectConfig.sectionConfigCol.id,
    //     childrenId: projectConfig.children.id,
    //     children: projectChildren,
    //   },
    //   sections,
    //   sectionChildren,
    //   sectionChildrenIds,
    //   sectionConfigs,
    //   sectionConfigCol,
    //   ev,
    //   evCols,
    //   uiTypes: { ...baseUITypes, ...sectionUITypes, ...presetUITypes },
    //   uiTypesCols,
    //   kwargCols,
    //   codeInfo: { ...codeInfo, ...kwargInfos },
    // };
  }
}
