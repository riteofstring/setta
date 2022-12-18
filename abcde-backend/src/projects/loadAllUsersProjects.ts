// import * as _ from 'lodash';
// import { getCodeInfoForSectionsAndKwargs } from 'src/codeInfo/load';
// import {
//   getProjectConfigCodeInfoMaps,
//   getUserCodeInfoMaps,
// } from 'src/codeInfoMaps/load';
// import { getProjectConfig } from 'src/projectConfigs/load';
// import {
//   saveAsExistingProjectConfig,
//   saveAsNewProjectConfig,
// } from 'src/projectConfigs/saveAs';
// import { getSectionConfigs, getSections } from 'src/sections/load';
// import { getBaseUITypes, getPresetUITypes } from 'src/uiTypes/load';
// import { getProject } from './load';
// import { createProject, saveProjectDetails } from './save';

//   async saveAsNewProjectConfig(
//     user,
//     project,
//     newConfigName: string,
//   ): Promise<any> {
//     return await saveAsNewProjectConfig(
//       this.prisma,
//       user,
//       project,
//       newConfigName,
//     );
//   }

//   async saveAsExistingProjectConfig(
//     user,
//     project,
//     configId: string,
//   ): Promise<any> {
//     return await saveAsExistingProjectConfig(
//       this.prisma,
//       user,
//       project,
//       configId,
//     );
//   }

//   async save(user, project): Promise<any> {
//     await saveProjectDetails(this.prisma, user, project);
//   }
// }

import * as _ from 'lodash';
import { prisma } from 'src/prisma';

async function loadAll(ownerId): Promise<any> {
  const ps = await prisma.project.findMany({
    where: { ownerId },
    include: { configs: true },
  });
  return _.keyBy(ps, 'id');
}

export async function loadAllUsersProjects(req, res) {
  const ownerId = req.user;
  if (!ownerId) {
    res.sendStatus(401);
    return;
  }
  const projects = await loadAll(ownerId);
  res.json(projects).status(200);
}
