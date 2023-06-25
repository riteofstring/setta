import { ManyEVType } from 'abcde-utils/src/types/ev';
import { ManyEVColType } from 'abcde-utils/src/types/evCol';
import { ManyKwargColType } from 'abcde-utils/src/types/kwargCol';
import { ManySectionType } from 'abcde-utils/src/types/section';
import { ManyUITypeColType } from 'abcde-utils/src/types/uiTypeCol';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { getUITypesByWhere } from 'src/db/uiTypes/load';
import {
  getChildrenRecursively,
  getOrderedChildren,
  getOrderedChildrenFull,
} from 'src/utils/utils';
import { UITypeNames } from '../uiTypes/types';

export async function getSections(projectConfig: {
  id: string;
  children: string[];
}) {
  const { allIds } = await getChildrenRecursively(
    projectConfig.children,
    async (c) =>
      await prisma.$queryRaw`
          with recursive descendants as (
              select "parentId", "childId", "order", "x", "y"
              from "SectionChildren"
              where "parentId" = ${c}::uuid
            union
              select other."parentId", other."childId", other."order", other."x", other."y"
              from "SectionChildren" other
              join descendants on other."parentId" = descendants."childId"
          )
          select * from descendants;`,
  );

  const s = await prisma.section.findMany({
    where: { id: { in: allIds } },
    include: {
      children: {
        select: { order: true, childId: true },
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
            select: { codeInfoId: true, uiTypeId: true },
          },
        },
      },
      projectConfigs: {
        where: { parentId: projectConfig.id },
        select: { x: true, y: true },
      },
    },
  });
  const idsAsKeys = _.keyBy(s, 'id');

  const sections: ManySectionType = _.mapValues(idsAsKeys, (v) => ({
    id: v.id,
    name: v.name,
    children: getOrderedChildren(v.children, 'childId'),
    paramInfoId: v.paramInfoId,
    initialPosition: getPosition(v.projectConfigs),
    size: { width: convertSize(v.width), height: convertSize(v.height) },
    chainedFrom: v.chainedFromId,
    parentId: v.asChild?.parentId,
    zIndex: v.zIndex,
    evColId: v.evColId,
    uiTypeId: v.uiTypeId,
    kwargColId: v.kwargColId,
    uiTypeColId: v.uiTypeColId,
    selectedItem: v.selectedItemId,
    social: v.social,
    outputGroup: v.outputGroupId,
    userSpecifiedObjectId: v.userSpecifiedObjectId,
    description: v.description,
    descriptionHeight: v.descriptionHeight,
    descriptionVisible: v.descriptionVisible,
  }));

  const sectionUITypes = await getUITypesByWhere(
    {
      id: { in: s.map((x) => x.uiTypeId) },
    },
    UITypeNames.sectionUIType,
  );

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
      (x) => x.uiTypeId,
    );
  }

  return {
    sections,
    ev,
    evCols,
    kwargCols,
    uiTypeCols,
    sectionUITypes,
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
