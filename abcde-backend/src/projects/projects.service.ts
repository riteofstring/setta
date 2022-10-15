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
import { CodeInfo } from '../entities/codeInfo.entity';
import { KwargColsIds } from '../entities/kwargs/kwargColsIds.entity';

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
    sectionChildren[col.section.id] = children.getItems().map((x) => x.id);
  }
  return sectionChildren;
}

function processSectionConfigs(sectionConfigs) {
  const KEYMAP = {
    uiType: 'uiTypeId',
    evCol: 'evColId',
    kwargCol: 'kwargColId',
  };

  const output = {};
  for (const c of sectionConfigs) {
    const config = _.mapValues(c, (v, k) => (k === 'id' || !v ? v : v.id));
    output[config.id] = renameKeys(config, KEYMAP);
  }
  return output;
}

function getSectionConfigCol(sectionConfigCols) {
  const output = {};
  for (const col of sectionConfigCols) {
    output[col.section.id] = { id: col.section.id, configId: col.config.id };
  }
  return output;
}

async function loadEVCols(em, sectionConfigs) {
  const evColIds = sectionConfigs.map((x) => x.evCol);
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

async function loadKwargCols(em, sectionConfigs) {
  const kwargColIds = [].concat(...sectionConfigs.map((x) => x.kwargCol));
  const kwargColsInDBFormat = await em.find(
    KwargColsIds,
    { id: { $in: kwargColIds } },
    { populate: ['kwargCols.kwargInfos.children'] },
  );
  const kwargInfos = {};
  const kwargCols = {};
  for (const col of kwargColsInDBFormat) {
    kwargCols[col.id] = {};
    for (const colElement of col.kwargCols.getItems()) {
      const currKwargInfos = colElement.kwargInfos.getItems();
      currKwargInfos.forEach((x) => (kwargInfos[x.id] = processCodeInfo(x)));
      kwargCols[col.id][colElement.codeInfo.id] = currKwargInfos.map(
        (x) => x.id,
      );
    }
  }
  return { kwargCols, kwargInfos };
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

async function loadCodeInfo(em, sectionUITypes) {
  const collectionIdsArray = _.map(sectionUITypes, (x) => x.config.collections);
  const collectionIds = new Set([].concat(...collectionIdsArray));
  const connection = em.getConnection();

  const childMap = {};
  const allIds = new Set(collectionIds);
  collectionIds.forEach((x) => (childMap[x] = new Set()));

  for (const c of collectionIds) {
    const parentChildPairs = await connection.execute(`
      with recursive descendants as (
          select code_info_1_id, code_info_2_id
          from code_info_children
          where code_info_1_id = '${c}'
        union
          select x.code_info_1_id, x.code_info_2_id
          from code_info_children x
          join descendants on x.code_info_1_id = descendants.code_info_2_id
      )
      select * from descendants;`);

    parentChildPairs.forEach((x) => {
      const child = x.code_info_2_id;
      childMap[x.code_info_1_id].add(child);
      if (!(child in childMap)) {
        childMap[child] = new Set();
      }
      allIds.add(child);
    });
  }

  const codeInfo = await em.find(CodeInfo, { id: { $in: Array.from(allIds) } });
  const output = {};
  codeInfo.forEach((x) => {
    output[x.id] = processCodeInfo(x, childMap);
  });

  return output;
}

function processCodeInfo(codeInfo, childMap = null) {
  const { children, parent, ...theRest } = codeInfo;
  const childrenIds = childMap
    ? Array.from(childMap[codeInfo.id])
    : children.getItems().map((c) => c.id);
  return {
    ...theRest,
    parentId: returnNullNotUndefined(parent?.id),
    children: childrenIds,
  };
}

async function loadBaseUITypes(em): Promise<any> {
  const uiTypes = await em.find(UITypes, { presetType: 'base' });
  return await getUITypeSpecifics(em, uiTypes);
}

async function getUITypes(em, sectionConfigs): Promise<any> {
  const uiTypes = sectionConfigs
    .map((x) => x.uiType)
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
