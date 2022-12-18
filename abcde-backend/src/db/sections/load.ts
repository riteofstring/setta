import * as _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { getUITypeCols, getUITypesByWhere } from 'src/db/uiTypes/load';
import { getOrderedChildren, renameKeys } from 'src/utils/utils';

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

  const sections = _.mapValues(idsAsKeys, (v) => {
    const { children, ...theRest } = renameKeys(v, {
      childrenId: 'sectionChildrenId',
    });
    return theRest;
  });

  const sectionChildren = _.mapValues(idsAsKeys, (v) =>
    getOrderedChildren(v.children.children, 'sectionId'),
  );
  const sectionPositions = {};

  _.forEach(idsAsKeys, (v) => {
    const s = getSectionPositions(v.children.children);
    Object.assign(sectionPositions, s);
  });
  _.merge(sections, sectionPositions);

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
    const allCurrEvs = config.evCol.children.map((x) => x.ev);
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

export function getSectionPositions(children) {
  const byId = _.keyBy(children, (s) => s.sectionId);
  return _.mapValues(byId, (s) => ({
    initialPosition: { x: s.x, y: s.y },
  }));
}
