import * as _ from 'lodash';
import { getCodeInfoForSectionsAndKwargs } from 'src/codeInfo/load';
import {
  getProjectConfigCodeInfoMaps,
  getUserCodeInfoMaps,
} from 'src/codeInfoMaps/load';
import { getProjectConfig } from 'src/projectConfigs/load';
import { getSectionConfigs, getSections } from 'src/sections/load';
import { getBaseUITypes, getPresetUITypes } from 'src/uiTypes/load';
import { getProject } from './load';

async function loadOne(userId, id: string, configId: string): Promise<any> {
  const project = await getProject(id);
  const { projectConfig, sectionConfigCol, sectionPositions } =
    await getProjectConfig(configId);
  const { sections, sectionChildren } = await getSections(
    Object.keys(sectionConfigCol),
  );
  const { sectionConfigs, ev, evCols, kwargCols, sectionUITypes, uiTypeCols } =
    await getSectionConfigs(Object.values(sectionConfigCol));

  const baseUITypes = await getBaseUITypes();
  const presetUITypes = await getPresetUITypes(userId);
  const codeInfo = await getCodeInfoForSectionsAndKwargs(
    sectionUITypes,
    kwargCols,
  );
  const userCodeInfoMaps = await getUserCodeInfoMaps(userId);
  const projectConfigCodeInfoMaps = await getProjectConfigCodeInfoMaps(
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

export async function loadOneProject(req, res) {
  const userId = req.user;
  const { id, configId } = req.params;
  const project = await loadOne(userId, id, configId);
  res.json(project).status(200);
}
