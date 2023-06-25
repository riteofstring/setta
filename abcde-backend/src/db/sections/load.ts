import { ManyEVType } from 'abcde-utils/src/types/ev';
import { ManyEVColType } from 'abcde-utils/src/types/evCol';
import { ManyKwargColType } from 'abcde-utils/src/types/kwargCol';
import { ManySectionType } from 'abcde-utils/src/types/section';
import { ManySectionChildrenType } from 'abcde-utils/src/types/sectionChildren';
import { ManySectionDescriptionType } from 'abcde-utils/src/types/sectionDescription';
import { SiblingSectionPositionType } from 'abcde-utils/src/types/sectionPosition';
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
import { PrismaSectionChildrenType } from './types';

function convertSize(x) {
  return x === -1 ? 'auto' : x;
}

export async function getSections(ids: string[]) {
  const { allIds } = await getChildrenRecursively(
    ids,
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
        select: { order: true, childId: true, x: true, y: true },
      },
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
      description: {
        select: {
          value: true,
          height: true,
          visible: true,
        },
      },
    },
  });
  const idsAsKeys = _.keyBy(s, 'id');

  const sectionChildren = _.mapValues(idsAsKeys, (v) =>
    getOrderedChildren(v.children, 'childId'),
  );

  const sections: ManySectionType = _.mapValues(idsAsKeys, (v) => ({
    id: v.id,
    name: v.name,
    paramInfoId: v.paramInfoId,
    initialPosition: { x: 0, y: 0 },
    size: { width: convertSize(v.width), height: convertSize(v.height) },
    chainedFrom: v.chainedFromId,
    parentId: getParentId(v.id, sectionChildren),
    zIndex: v.zIndex,
    evColId: v.evColId,
    uiTypeId: v.uiTypeId,
    kwargColId: v.kwargColId,
    uiTypeColId: v.uiTypeColId,
    selectedItem: v.selectedItemId,
    descriptionId: v.descriptionId,
  }));

  _.forEach(idsAsKeys, (v) => {
    const sPos = getSectionPositions(v.children);
    setSectionPositions(sections, sPos);
  });

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

  const sectionDescriptions: ManySectionDescriptionType = {};
  for (const config of s) {
    sectionDescriptions[config.descriptionId] = config.description;
  }

  return {
    sections,
    sectionChildren,
    ev,
    evCols,
    kwargCols,
    uiTypeCols,
    sectionUITypes,
    sectionDescriptions,
  };
}

export function getSectionPositions(
  children: Omit<PrismaSectionChildrenType, 'parentId'>[],
) {
  const byId = _.keyBy(children, (s) => s.childId);
  return _.mapValues(byId, (s) => ({ x: s.x, y: s.y }));
}

export function setSectionPositions(
  sections: ManySectionType,
  sectionPositions: SiblingSectionPositionType,
) {
  _.forEach(
    sectionPositions,
    (pos, id) => (sections[id].initialPosition = pos),
  );
}

function getParentId(
  sectionId: string,
  sectionChildren: ManySectionChildrenType,
) {
  for (const [k, v] of Object.entries(sectionChildren)) {
    if (v.includes(sectionId)) {
      return k;
    }
  }
  return null;
}
