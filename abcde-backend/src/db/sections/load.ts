import { ManyEVType } from 'abcde-utils/src/types/ev';
import { ManyEVColType } from 'abcde-utils/src/types/evCol';
import { ManyKwargColType } from 'abcde-utils/src/types/kwargCol';
import { ManySectionCoreType } from 'abcde-utils/src/types/section';
import { ManySectionConfigType } from 'abcde-utils/src/types/sectionConfig';
import { ManySectionDescriptionType } from 'abcde-utils/src/types/sectionDescription';
import { SiblingSectionPositionType } from 'abcde-utils/src/types/sectionPosition';
import { ManyUITypeColType } from 'abcde-utils/src/types/uiTypeCol';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { getUITypesByWhere } from 'src/db/uiTypes/load';
import { getOrderedChildren, getOrderedChildrenFull } from 'src/utils/utils';
import { UITypeNames } from '../uiTypes/types';
import { PrismaSectionChildrenType } from './types';

function convertSize(x) {
  return x === -1 ? 'auto' : x;
}

export async function getSections(ids) {
  const s = await prisma.section.findMany({
    where: { id: { in: ids } },
    include: {
      children: {
        select: {
          children: {
            select: { order: true, sectionId: true, x: true, y: true },
          },
        },
      },
    },
  });
  const idsAsKeys = _.keyBy(s, 'id');

  const sections: ManySectionCoreType = _.mapValues(idsAsKeys, (v) => ({
    id: v.id,
    name: v.name,
    paramInfoId: v.paramInfoId,
    sectionChildrenId: v.childrenId,
    initialPosition: { x: 0, y: 0 },
    size: { width: convertSize(v.width), height: convertSize(v.height) },
    chainedFrom: v.chainedFromId,
  }));

  const sectionChildren = _.mapValues(idsAsKeys, (v) =>
    getOrderedChildren(v.children.children, 'sectionId'),
  );

  _.forEach(idsAsKeys, (v) => {
    const s = getSectionPositions(v.children.children);
    setSectionPositions(sections, s);
  });

  return { sections, sectionChildren };
}

export async function getSectionConfigs(ids) {
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

  const sectionUITypes = await getUITypesByWhere(
    {
      id: { in: s.map((x) => x.uiTypeId) },
    },
    UITypeNames.sectionUIType,
  );

  const sectionConfigs: ManySectionConfigType = {};
  for (const x of s) {
    sectionConfigs[x.id] = {
      id: x.id,
      uiTypeId: x.uiTypeId,
      evColId: x.evColId,
      kwargColId: x.kwargColId,
      uiTypeColId: x.uiTypeColId,
      selectedItem: x.selectedItemId,
      descriptionId: x.descriptionId,
    };
  }

  const ev: ManyEVType = {};
  for (const config of s) {
    const allCurrEvs = config.evCol.children.map((x) => x.ev);
    const keyByEVId = _.keyBy(allCurrEvs, 'id');
    _.forEach(keyByEVId, (v, id) => (ev[id] = v));
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
    sectionConfigs,
    ev,
    evCols,
    kwargCols,
    uiTypeCols,
    sectionUITypes,
    sectionDescriptions,
  };
}

export function getSectionPositions(
  children: Omit<PrismaSectionChildrenType, 'idid'>[],
) {
  const byId = _.keyBy(children, (s) => s.sectionId);
  return _.mapValues(byId, (s) => ({ x: s.x, y: s.y }));
}

export function setSectionPositions(
  sections: ManySectionCoreType,
  sectionPositions: SiblingSectionPositionType,
) {
  _.forEach(
    sectionPositions,
    (pos, id) => (sections[id].initialPosition = pos),
  );
}
