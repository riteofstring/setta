import { renameKeys } from '../utils/utils';
import _ = require('lodash');

export async function getProject(prisma, id) {
  const p = await prisma.project.findUnique({
    where: { id },
    select: { id: true, ownerId: true, name: true, defaultConfigId: true },
  });
  return renameKeys(p, { ownerId: 'owner', defaultConfigId: 'defaultConfig' });
}

export async function getProjectConfig(prisma, id) {
  const p = await prisma.projectConfig.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      sectionConfigColId: true,
      sectionConfigCol: {
        select: { children: { select: { sectionId: true, configId: true } } },
      },
      sectionChildrenId: true,
      sectionChildren: {
        select: { children: { select: { sectionId: true, order: true } } },
      },
    },
  });
  const sectionConfigCol = _.mapValues(
    _.keyBy(p.sectionConfigCol.children, 'sectionId'),
    (v) => v.configId,
  );
  delete p.sectionConfigCol;

  p.children = getOrderedChildren(p.sectionChildren.children, 'sectionId');
  delete p.sectionChildren;
  const projectConfig = renameKeys(p, {
    sectionConfigColId: 'sectionConfigCol',
    sectionChildrenId: 'childrenId',
  });

  return { projectConfig, sectionConfigCol };
}

export async function getSections(prisma, ids) {
  const s = await prisma.section.findMany({
    where: { id: { in: ids } },
    include: {
      children: {
        select: { children: { select: { order: true, sectionId: true } } },
      },
    },
  });
  const idsAsKeys = _.keyBy(s, 'id');

  const sections = _.mapValues(idsAsKeys, (v) => {
    const { children, ...theRest } = renameKeys(v, {
      childrenId: 'sectionChildrenId',
    });
    return theRest;
  });

  const sectionChildren = _.mapValues(idsAsKeys, (v) =>
    getOrderedChildren(v.children.children, 'sectionId'),
  );
  return { sections, sectionChildren };
}

export async function getSectionConfigs(prisma, ids) {
  const s = await prisma.sectionConfig.findMany({
    where: { id: { in: ids } },
    include: {
      evCol: {
        select: {
          children: { select: { codeInfoId: true, evId: true, ev: true } },
        },
      },
      kwargCol: {
        select: {
          children: {
            select: { codeInfoId: true, kwargInfoId: true, order: true },
          },
        },
      },
    },
  });

  const sectionUITypes = await getUITypesByWhere(prisma, {
    id: { in: s.map((x) => x.uiTypeId) },
    presetType: null,
  });

  const uiTypeCols = await getUITypeCols(prisma, sectionUITypes);

  const sectionConfigs = _.keyBy(
    _.map(s, (x) => {
      const { evCol, kwargCol, ...theRest } = renameKeys(x, {
        selectedItemId: 'selectedItem',
      });
      return theRest;
    }),
    'id',
  );

  let ev = {};
  for (const config of s) {
    const allCurrEvs = [].concat(...config.evCol.children.map((x) => x.ev));
    const keyByEVId = _.keyBy(allCurrEvs, 'id');
    const correctFormat = _.mapValues(keyByEVId, (x) =>
      _.pick(x, ['value', 'childId']),
    );
    ev = { ...ev, ...correctFormat };
  }

  const evCols = {};
  for (const config of s) {
    evCols[config.evColId] = _.mapValues(
      _.keyBy(config.evCol.children, 'codeInfoId'),
      (x) => x.evId,
    );
  }

  const kwargCols = {};
  for (const config of s) {
    const ordered = getOrderedChildren(config.kwargCol.children);
    kwargCols[config.kwargColId] = _.mapValues(
      _.groupBy(ordered, (x) => x.codeInfoId),
      (y) => y.map((z) => z.kwargInfoId),
    );
  }

  return { sectionConfigs, ev, evCols, kwargCols, sectionUITypes, uiTypeCols };
}

function getOrderedChildren(children, toReturn = null) {
  const output = _.orderBy(children, (v) => v.order);
  if (toReturn) {
    return output.map((x) => (toReturn ? x[toReturn] : x));
  }
  return output;
}

export async function getUITypeCols(prisma, sectionUITypes) {
  const ids = _.values(sectionUITypes)
    .map((x) => x.config.uiTypeColId)
    .filter((x) => x);

  const uiTypeCols = await prisma.uITypeColId.findMany({
    where: { id: { in: ids } },
    include: { children: true },
  });

  return _.mapValues(_.keyBy(uiTypeCols, 'id'), (x) =>
    _.mapValues(_.keyBy(x.children, 'codeInfoId'), (y) => y.uiTypeId),
  );
}

export async function getBaseUITypes(prisma) {
  return await getUITypesByWhere(prisma, { presetType: 'base' });
}

export async function getPresetUITypes(prisma) {
  return await getUITypesByWhere(prisma, { presetType: 'user' });
}

export async function getUITypesByWhere(prisma, where) {
  const uiTypes = await prisma.uIType.findMany({
    where,
    include: {
      sectionUIType: { include: { collections: { select: { id: true } } } },
      sliderUIType: true,
      switchUIType: true,
      textUIType: true,
      refUIType: true,
    },
  });
  const output = {};
  for (const u of uiTypes) {
    output[u.id] = processUIType(u);
  }
  return output;
}

function processUIType(uiType) {
  let output = {};
  for (const key of _.keys(uiType)) {
    const val = uiType[key];
    if (
      [
        'sectionUIType',
        'sliderUIType',
        'switchUIType',
        'textUIType',
        'refUIType',
      ].includes(key)
    ) {
      output = { ...output, ...processSpecificUITypeConfig(val) };
    } else {
      output[key] = val;
    }
  }
  return reshapeOriginInfoId(output);
}

function processSpecificUITypeConfig(uiTypeConfig) {
  if (uiTypeConfig) {
    const { idid, ...config } = uiTypeConfig;
    if ('collections' in config) {
      config.collections = config.collections.map((x) => x.id);
    }
    return { config };
  }
  return {};
}

export function reshapeOriginInfoId(uiType) {
  const originInfoId = {
    sectionId: uiType.originSectionId,
    uiTypeColId: uiType.originUITypeColId,
    paramInfoId: uiType.originCodeInfoId,
  };
  // filter out nulls
  uiType.originInfoId = _.pickBy(originInfoId, (x) => x);
  ['originSectionId', 'originUITypeColId', 'originCodeInfoId'].forEach(
    (x) => delete uiType[x],
  );
  return uiType;
}
