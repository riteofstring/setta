import { ManySectionCoreType } from 'abcde-utils/src/types/section';
import { SiblingSectionPositionType } from 'abcde-utils/src/types/sectionPosition';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { getUITypeCols, getUITypesByWhere } from 'src/db/uiTypes/load';
import {
  getOrderedChildren,
  getOrderedChildrenFull,
  renameKeys,
} from 'src/utils/utils';
import { PrismaSectionChildrenType } from './types';

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
    },
  });

  const sectionUITypes = await getUITypesByWhere({
    id: { in: s.map((x) => x.uiTypeId) },
    presetType: null,
  });

  const uiTypeCols = await getUITypeCols(sectionUITypes);

  const sectionConfigs = {};
  for (const x of s) {
    const { evCol, kwargCol, ...theRest } = renameKeys(x, {
      selectedItemId: 'selectedItem',
    });
    sectionConfigs[x.id] = theRest;
  }

  let ev = {};
  for (const config of s) {
    const allCurrEvs = config.evCol.children.map((x) => x.ev);
    const keyByEVId = _.keyBy(allCurrEvs, 'id');
    ev = { ...ev, ...keyByEVId };
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
    const ordered = getOrderedChildrenFull(config.kwargCol.children);
    kwargCols[config.kwargColId] = _.mapValues(
      _.groupBy(ordered, (x) => x.codeInfoId),
      (y) => y.map((z) => z.kwargInfoId),
    );
  }

  return { sectionConfigs, ev, evCols, kwargCols, sectionUITypes, uiTypeCols };
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
