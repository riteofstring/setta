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
import { renameKeys, returnNullNotUndefined } from '../utils/utils';
import _ = require('lodash');
import { EVCols } from '../entities/enteredValues/evCols.entity';
import { EVColsIds } from '../entities/enteredValues/evColsIds.entity';
import { UITypesColsIds } from '../entities/uitypes/uiTypesColsIds.entity';

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
    const fullObj = await getProject(id, this.projects);
    const {
      defaultProjectConfig: {
        sectionConfigCol: { sectionConfigCols },
      },
      ...project
    } = fullObj;

    const sections = getSections(sectionConfigCols);
    const sectionChildren = getSectionChildren(sectionConfigCols);
    const sectionConfigs = getSectionConfigs(sectionConfigCols);
    const { ev, evCols } = await loadEVCols(this.em, sectionConfigs);
    const baseUITypes = await loadBaseUITypes(this.em);
    const sectionUITypes = await getUITypes(this.em, sectionConfigCols);
    const presetUITypes = await loadPresetUITypes(this.em);
    const uiTypeCols = await loadUITypeCols(this.em, sectionUITypes);

    return {
      project,
      sections,
      sectionChildren,
      sectionConfigs,
      ev,
      evCols,
      baseUITypes,
      uiTypes: sectionUITypes,
      presetUITypes,
      uiTypeCols,
    };
  }
}

async function getProject(id, projects: ProjectsRepository) {
  return await projects.findOne(
    { id },
    {
      populate: [
        'defaultProjectConfig.sectionConfigCol.sectionConfigCols.section.children',
        'defaultProjectConfig.sectionConfigCol.sectionConfigCols.config.uiType',
      ],
    },
  );
}

function getSections(sectionConfigCols) {
  const sections = {};
  for (const col of sectionConfigCols) {
    const { id, name, paramInfo } = col.section;
    sections[id] = {
      id,
      name,
      paramInfoId: returnNullNotUndefined(paramInfo?.id),
    };
  }
  return sections;
}

function getSectionChildren(sectionConfigCols) {
  const sectionChildren = {};
  for (const col of sectionConfigCols) {
    const children = col.section.children;
    if (children.length > 0) {
      sectionChildren[col.section.id] = children.getItems().map((x) => x.id);
    }
  }
  return sectionChildren;
}

function getSectionConfigs(sectionConfigCols) {
  const KEYMAP = {
    uiType: 'uiTypeId',
  };

  const sectionConfigs = {};
  for (const col of sectionConfigCols) {
    const config = _.mapValues(col.config, (v, k) =>
      k === 'id' || !v ? v : v.id,
    );
    sectionConfigs[config.id] = renameKeys(config, KEYMAP);
  }
  return sectionConfigs;
}

async function loadEVCols(em, sectionConfigs) {
  const evColIds = _.map(sectionConfigs, (x) => x.evCol);
  const evColsInDBFormat = await em.find(
    EVColsIds,
    { id: { $in: evColIds } },
    { populate: ['evCols.enteredValue'] },
  );
  const ev = {};
  const evCols = {};
  for (const col of evColsInDBFormat) {
    evCols[col.id] = {};
    for (const colElement of col.evCols.getItems()) {
      const codeInfoId = colElement.codeInfo.id;
      const currEv = colElement.enteredValue;
      const evId = currEv.id;
      ev[evId] = {
        value: currEv.value,
        childId: returnNullNotUndefined(currEv.child?.id),
      };
      evCols[col.id][codeInfoId] = {
        id: codeInfoId,
        enteredValueId: evId,
      };
    }
  }
  return { ev, evCols };
}

async function loadUITypeCols(em, sectionUITypes) {
  const uiTypeColIds = _.map(sectionUITypes, (x) => x.config.uiTypeColId);
  const uiTypeColsInDBFormat = await em.find(
    UITypesColsIds,
    { id: { $in: uiTypeColIds } },
    { populate: ['uiTypesCols'] },
  );
  const uiTypeCols = {};
  for (const col of uiTypeColsInDBFormat) {
    uiTypeCols[col.id] = {};
    for (const colElement of col.uiTypesCols.getItems()) {
      const codeInfoId = colElement.codeInfo.id;
      const uiTypeId = colElement.uiType.id;
      uiTypeCols[col.id][codeInfoId] = {
        id: codeInfoId,
        uiTypeId: uiTypeId,
      };
    }
  }
  return uiTypeCols;
}

async function loadBaseUITypes(em): Promise<any> {
  const uiTypes = await em.find(UITypes, { presetType: 'base' });
  return await getUITypeSpecifics(em, uiTypes);
}

async function getUITypes(em, sectionConfigCols): Promise<any> {
  const uiTypes = sectionConfigCols
    .getItems()
    .map((x) => x.config.uiType)
    .filter((x) => !x.presetType);
  return await getUITypeSpecifics(em, uiTypes);
}

async function loadPresetUITypes(em): Promise<any> {
  const uiTypes = await em.find(UITypes, { presetType: 'user' });
  return await getUITypeSpecifics(em, uiTypes);
}

async function getUITypeSpecifics(em: EntityManager, uiTypes: UITypes[]) {
  const configs = [];
  for (const table of [
    SectionUITypes,
    SliderUITypes,
    SwitchUITypes,
    TextUITypes,
    RefUITypes,
  ]) {
    const result =
      table === SectionUITypes
        ? await getSectionUITypeConfig(em, uiTypes)
        : await em.find(table, { id: { $in: uiTypes } });
    configs.push(...result);
  }

  const KEYMAP = {
    uiTypeCol: 'uiTypeColId',
    childUIType: 'childUITypeId',
  };

  const output = {};
  for (const x of configs) {
    const { id, ...config } = x;
    const newConfig = renameKeys(config, KEYMAP);
    output[id.id] = { ...id, config: newConfig };
  }

  _.forEach(output, (v, k) => {
    output[k] = reshapeOriginInfoId(v);
  });

  return output;
}

async function getSectionUITypeConfig(em, uiTypes) {
  const result = await em.find(
    SectionUITypes,
    { id: { $in: uiTypes } },
    { populate: ['collections'] },
  );
  const output = [];
  result.forEach((x) => {
    const curr = {};
    curr['id'] = x.id;
    curr['collections'] = x.collections.getItems().map((c) => c.id);
    curr['uiTypeCol'] = returnNullNotUndefined(x.uiTypeCol?.id);
    curr['childUIType'] = returnNullNotUndefined(x.childUIType?.id);
    curr['subType'] = x.subType;
    output.push(curr);
  });

  return output;
}

function reshapeOriginInfoId(uiType) {
  const originInfoId = {
    sectionId: returnNullNotUndefined(uiType.originSection?.id),
    uiTypeColId: returnNullNotUndefined(uiType.originUITypeCol?.id),
    paramInfoId: returnNullNotUndefined(uiType.originCodeInfo?.id),
  };
  uiType.originInfoId = _.pickBy(originInfoId, (x) => x);
  return _.omitBy(uiType, (v, k) =>
    ['originSection', 'originUITypeCol', 'originCodeInfo'].includes(k),
  );
}
