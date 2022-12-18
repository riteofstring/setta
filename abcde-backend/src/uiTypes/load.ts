import * as _ from 'lodash';
import { prisma } from 'src/prisma';
import { SectionUITypeType } from './types';

export async function getUITypeCols(sectionUITypes: SectionUITypeType) {
  const ids = Object.values(sectionUITypes)
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

export async function getBaseUITypes() {
  return await getUITypesByWhere({ presetType: 'base' });
}

export async function getPresetUITypes(ownerId) {
  return await getUITypesByWhere({ presetType: 'user', ownerId });
}

export async function getUITypesByWhere(where) {
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
  for (const [key, val] of Object.entries(uiType)) {
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
    } else if (key !== 'ownerId') {
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
