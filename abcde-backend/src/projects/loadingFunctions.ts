import { renameKeys, nullNotUndefined } from '../utils/utils';
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

  return { sectionConfigs, ev, evCols, kwargCols };
}

function getOrderedChildren(children, toReturn = null) {
  const output = _.orderBy(children, (v) => v.order);
  if (toReturn) {
    return output.map((x) => (toReturn ? x[toReturn] : x));
  }
  return output;
}

// export async function loadUITypesCols(em, sectionUITypes) {
//   const uiTypeColIds = _.map(sectionUITypes, (x) => x.config.uiTypeColId);
//   const uiTypeColsInDBFormat = await em.find(
//     UITypesColsIds,
//     { id: { $in: uiTypeColIds } },
//     { populate: ['uiTypesCols'] },
//   );
//   const uiTypeCols = {};
//   for (const col of uiTypeColsInDBFormat) {
//     uiTypeCols[col.id] = {};
//     for (const colElement of col.uiTypesCols.getItems()) {
//       const codeInfoId = colElement.codeInfo.id;
//       const uiTypeId = colElement.uiType.id;
//       uiTypeCols[col.id][codeInfoId] = uiTypeId;
//     }
//   }
//   return uiTypeCols;
// }

// export async function loadCodeInfo(em, sectionUITypes) {
//   const collectionIdsArray = _.map(sectionUITypes, (x) => x.config.collections);
//   const collectionIds = new Set([].concat(...collectionIdsArray));
//   const connection = em.getConnection();

//   const childMap = {};
//   const allIds = new Set(collectionIds);
//   collectionIds.forEach((x) => (childMap[x] = new Set()));

//   for (const c of collectionIds) {
//     const parentChildPairs = await connection.execute(`
//         with recursive descendants as (
//             select code_info_1_id, code_info_2_id
//             from code_info_children
//             where code_info_1_id = '${c}'
//           union
//             select x.code_info_1_id, x.code_info_2_id
//             from code_info_children x
//             join descendants on x.code_info_1_id = descendants.code_info_2_id
//         )
//         select * from descendants;`);

//     parentChildPairs.forEach((x) => {
//       const child = x.code_info_2_id;
//       childMap[x.code_info_1_id].add(child);
//       if (!(child in childMap)) {
//         childMap[child] = new Set();
//       }
//       allIds.add(child);
//     });
//   }

//   const codeInfo = await em.find(CodeInfo, { id: { $in: Array.from(allIds) } });
//   const output = {};
//   codeInfo.forEach((x) => {
//     output[x.id] = processCodeInfo(x, childMap);
//   });

//   return output;
// }

// export function processCodeInfo(codeInfo, childMap = null) {
//   const { children, parent, ...theRest } = codeInfo;
//   const childrenIds = childMap
//     ? Array.from(childMap[codeInfo.id])
//     : children.getItems().map((c) => c.id);
//   return {
//     ...theRest,
//     parentId: returnNullNotUndefined(parent?.id),
//     children: childrenIds,
//   };
// }

export async function getBaseUITypes(prisma) {
  return await getUITypesByPresetType(prisma, 'base');
}

export async function getPresetUITypes(prisma) {
  return await getUITypesByPresetType(prisma, 'user');
}

export async function getUITypesByPresetType(prisma, presetType) {
  const uiTypes = await prisma.uIType.findMany({ where: { presetType } });
  return await getUITypeSpecifics(prisma, uiTypes);
}

// export async function getUITypes(em, sectionConfigs): Promise<any> {
//   const uiTypes = sectionConfigs
//     .map((x) => x.uiType)
//     .filter((x) => !x.presetType);
//   return await getUITypeSpecifics(em, uiTypes);
// }

export async function getUITypeSpecifics(prisma, uiTypes) {
  const uiTypeIds = uiTypes.map((x) => x.id);

  // get sectionUIType
  const configs = await getSectionUITypeConfig(prisma, uiTypeIds);
  // get the other ui types
  for (const db of [
    prisma.sliderUIType,
    prisma.switchUIType,
    prisma.textUIType,
    prisma.refUIType,
  ]) {
    const result = await db.findMany({ where: { idid: { in: uiTypeIds } } });
    configs.push(...result);
  }

  const uiTypeKeyById = _.keyBy(uiTypes, 'id');
  const output = {};
  for (const x of configs) {
    const { idid, ...config } = x;
    output[idid] = reshapeOriginInfoId({ ...uiTypeKeyById[idid], config });
  }

  return output;
}

export async function getSectionUITypeConfig(prisma, uiTypeIds) {
  const results = await prisma.sectionUIType.findMany({
    where: { idid: { in: uiTypeIds } },
    include: { collections: { select: { id: true } } },
  });

  // reshape collections so that its an array of strings
  return results.map((x) => ({
    ...x,
    collections: x.collections.map((y) => y.id),
  }));
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
