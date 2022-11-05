import { getCodeInfoForSectionsAndKwargs } from '#codeInfo/loadingFunctions';
import { PrismaService } from '#src/prisma.service';
import { Injectable } from '@nestjs/common';
import {
  getBaseUITypes,
  getPresetUITypes,
  getProject,
  getProjectConfig,
  getSectionConfigs,
  getSections,
} from './loadingFunctions';
import { createProject, saveAllProjectDetails } from './savingFunctions';
import _ = require('lodash');

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
    return await createProject(this.prisma, user, name);
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
    const {
      sectionConfigs,
      ev,
      evCols,
      kwargCols,
      sectionUITypes,
      uiTypeCols,
    } = await getSectionConfigs(this.prisma, _.values(sectionConfigCol));

    const baseUITypes = await getBaseUITypes(this.prisma);
    const presetUITypes = await getPresetUITypes(this.prisma);
    const codeInfo = await getCodeInfoForSectionsAndKwargs(
      this.prisma,
      sectionUITypes,
      kwargCols,
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
      uiTypes: { ...baseUITypes, ...presetUITypes, ...sectionUITypes },
      uiTypeCols,
      codeInfo,
    };
  }
}
