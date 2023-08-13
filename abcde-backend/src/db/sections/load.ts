import { ManyEVColType } from 'abcde-utils/src/types/evCol';
import { ManyKwargColType } from 'abcde-utils/src/types/kwargCol';
import { ManyOutputType } from 'abcde-utils/src/types/output';
import { ManyOutputGroupType } from 'abcde-utils/src/types/outputGroup';
import { ManySectionType } from 'abcde-utils/src/types/section';
import { ManyUITypeColType } from 'abcde-utils/src/types/uiTypeCol';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { getOrderedChildrenFull } from 'src/utils/utils';
import { getUITypesByWhere } from '../uiTypes/load';
import { getSectionsRecursively } from './getSectionsRecurisvely';

export async function getSections(ids) {
  const allIds = await getSectionsRecursively(ids);

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
          children: { select: { codeInfoId: true, value: true } },
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
      nonPresetUITypes: {
        select: { id: true },
      },
      outputGroup: {
        select: {
          id: true,
          name: true,
          children: { select: { id: true, name: true, values: true } },
        },
      },
    },
  });
  const idsAsKeys = _.keyBy(s, 'id');

  const sections: ManySectionType = _.mapValues(idsAsKeys, (v) => ({
    id: v.id,
    name: v.name,
    children: v.children.map((x) => x.childId),
    paramInfoId: v.paramInfoId,
    size: { width: convertSize(v.width), height: convertSize(v.height) },
    chainedFrom: v.chainedFromId,
    parentId: v.asChild ? v.asChild.parentId : null,
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

  const evCols: ManyEVColType = {};
  for (const config of s) {
    evCols[config.evColId] = _.mapValues(
      _.keyBy(config.evCol.children, 'codeInfoId'),
      (x) => x.value,
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

  const outputGroups: ManyOutputGroupType = {};
  const outputs: ManyOutputType = {};
  for (const config of s) {
    const og = config.outputGroup;
    if (og) {
      outputGroups[og.id] = {
        id: og.id,
        name: og.name,
        children: og.children.map((x) => x.id),
      };
      for (const c of og.children) {
        outputs[c.id] = c;
      }
    }
  }

  return {
    sections,
    evCols,
    kwargCols,
    uiTypeCols,
    nonPresetUITypes,
    outputGroups,
    outputs,
  };
}

function convertSize(x) {
  return x === -1 ? 'auto' : x;
}
