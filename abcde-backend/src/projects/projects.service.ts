import { Injectable } from '@nestjs/common';
import * as _ from 'lodash';
import { getCodeInfoForSectionsAndKwargs } from 'src/codeInfo/loadingFunctions';
import {
  getProjectConfigCodeInfoMaps,
  getUserCodeInfoMaps,
} from 'src/codeInfoMaps/loadingFunctions';
import { PrismaService } from 'src/prisma.service';
import { getSectionConfigs, getSections } from 'src/sections/loadingFunctions';
import { getBaseUITypes, getPresetUITypes } from 'src/uiTypes/loadingFunctions';
import { getProject, getProjectConfig } from './loadingFunctions';
import {
  createProject,
  saveAsExistingProjectConfig,
  saveAsNewProjectConfig,
  saveProjectDetails,
} from './savingFunctions';

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

  async saveAsNewProjectConfig(
    user,
    project,
    newConfigName: string,
  ): Promise<any> {
    return await saveAsNewProjectConfig(
      this.prisma,
      user,
      project,
      newConfigName,
    );
  }

  async saveAsExistingProjectConfig(
    user,
    project,
    configId: string,
  ): Promise<any> {
    return await saveAsExistingProjectConfig(
      this.prisma,
      user,
      project,
      configId,
    );
  }

  async save(user, project): Promise<any> {
    await saveProjectDetails(this.prisma, user, project);
  }

  async loadOne(user, id: string, configId: string): Promise<any> {
    const project = await getProject(this.prisma, id);
    const { projectConfig, sectionConfigCol, sectionPositions } =
      await getProjectConfig(this.prisma, configId);
    const { sections, sectionChildren } = await getSections(
      this.prisma,
      Object.keys(sectionConfigCol),
    );
    const {
      sectionConfigs,
      ev,
      evCols,
      kwargCols,
      sectionUITypes,
      uiTypeCols,
    } = await getSectionConfigs(this.prisma, Object.values(sectionConfigCol));

    const baseUITypes = await getBaseUITypes(this.prisma);
    const presetUITypes = await getPresetUITypes(this.prisma, user.id);
    const codeInfo = await getCodeInfoForSectionsAndKwargs(
      this.prisma,
      sectionUITypes,
      kwargCols,
    );
    const userCodeInfoMaps = await getUserCodeInfoMaps(this.prisma, user.id);
    const projectConfigCodeInfoMaps = await getProjectConfigCodeInfoMaps(
      this.prisma,
      projectConfig.id,
    );

    // put top-level initialPosition into sections
    _.merge(sections, sectionPositions);

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
      userCodeInfoMaps,
      projectConfigCodeInfoMaps,
    };
  }
}
