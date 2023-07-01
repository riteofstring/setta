import { ManyEVType } from 'abcde-utils/src/types/ev';
import { ManyEVColType } from 'abcde-utils/src/types/evCol';
import { ManyKwargColType } from 'abcde-utils/src/types/kwargCol';
import { ManySectionType } from 'abcde-utils/src/types/section';
import { ManyUITypeColType } from 'abcde-utils/src/types/uiTypeCol';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import {
  getChildrenRecursively,
  getOrderedChildrenFull,
} from 'src/utils/utils';
import { getUITypesByWhere } from '../uiTypes/load';

export async function getSections(projectConfig: {
  id: string;
  children: string[];
}) {
  const allIds = await getChildrenRecursively(
    projectConfig.children,
    async (c) =>
      await prisma.$queryRaw`
          with recursive descendants as (
              select "parentId", "childId"
              from "SectionChildren"
              where "parentId" = ${c}::uuid
            union
              select other."parentId", other."childId"
              from "SectionChildren" other
              join descendants on other."parentId" = descendants."childId"
          )
          select * from descendants;`,
  );

  const s = await prisma.section.findMany({
    where: { id: { in: allIds } },
    include: {
      children: {
        select: { childId: true },
        orderBy: { order: 'asc' },
      },
      asChild: { select: { parentId: true } },
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
      uiTypeCol: {
        select: {
          children: {
            select: {
              codeInfoId: true,
              uiTypeId: true,
              nonPresetUITypes: { select: { id: true } },
            },
          },
        },
      },
      projectConfigs: {
        where: { parentId: projectConfig.id },
        select: { x: true, y: true },
      },
      nonPresetUITypes: {
        select: { id: true },
      },
    },
  });
  const idsAsKeys = _.keyBy(s, 'id');

  const sections: ManySectionType = _.mapValues(idsAsKeys, (v) => ({
    id: v.id,
    name: v.name,
    children: v.children.map((x) => x.childId),
    paramInfoId: v.paramInfoId,
    initialPosition: getPosition(v.projectConfigs),
    size: { width: convertSize(v.width), height: convertSize(v.height) },
    chainedFrom: v.chainedFromId,
    parentId: v.asChild ? v.asChild.parentId : null,
    zIndex: v.zIndex,
    evColId: v.evColId,
    uiTypeId: v.uiTypeId,
    kwargColId: v.kwargColId,
    uiTypeColId: v.uiTypeColId,
    selectedItem: v.selectedItemId,
    social: v.social,
    outputGroup: v.outputGroupId,
    userSpecifiedObjectId: v.userSpecifiedObjectId,
    nonPresetUITypeIds: v.nonPresetUITypes.map((x) => x.id),
    description: v.description,
    descriptionHeight: v.descriptionHeight,
    descriptionVisible: v.descriptionVisible,
  }));

  const ev: ManyEVType = {};
  for (const config of s) {
    const allCurrEvs = config.evCol.children.map((x) => x.ev);
    const keyByEVId = _.keyBy(allCurrEvs, 'id');
    _.forEach(keyByEVId, (v, id) => (ev[id] = v.value));
  }

  const evCols: ManyEVColType = {};
  for (const config of s) {
    evCols[config.evColId] = _.mapValues(
      _.keyBy(config.evCol.children, 'codeInfoId'),
      (x) => x.evId,
    );
  }

  const kwargCols: ManyKwargColType = {};
  for (const config of s) {
    const ordered = getOrderedChildrenFull(config.kwargCol.children);
    kwargCols[config.kwargColId] = _.mapValues(
      _.groupBy(ordered, (x) => x.codeInfoId),
      (y) => y.map((z) => z.kwargInfoId),
    );
  }

  const uiTypeCols: ManyUITypeColType = {};
  for (const config of s) {
    uiTypeCols[config.uiTypeColId] = _.mapValues(
      _.keyBy(config.uiTypeCol.children, 'codeInfoId'),
      (x) => ({
        uiTypeId: x.uiTypeId,
        nonPresetUITypeIds: x.nonPresetUITypes.map((x) => x.id),
      }),
    );
  }

  const nonPresetUITypeIds: string[] = [];
  for (const s of Object.values(sections)) {
    nonPresetUITypeIds.push(...s.nonPresetUITypeIds);
  }
  for (const u of Object.values(uiTypeCols)) {
    for (const c of Object.values(u)) {
      nonPresetUITypeIds.push(...c.nonPresetUITypeIds);
    }
  }

  const nonPresetUITypes = await getUITypesByWhere({
    id: { in: nonPresetUITypeIds },
  });

  return {
    sections,
    ev,
    evCols,
    kwargCols,
    uiTypeCols,
    nonPresetUITypes,
  };
}

function convertSize(x) {
  return x === -1 ? 'auto' : x;
}

function getPosition(projectConfigs) {
  if (projectConfigs.length === 0) {
    return { x: 0, y: 0 };
  } else {
    return projectConfigs[0];
  }
}
