import { PresetType } from 'abcde-utils/src/types/uiType';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { ManyXUITypeType, UITypeNames, UITypeNameToIncludeObj } from './types';

export async function getBaseUITypes() {
  return await getUITypesByWhere(
    { presetType: PresetType.BASE },
    UITypeNames.all,
  );
}

export async function getPresetUITypes(ownerId: string) {
  return await getUITypesByWhere(
    { presetType: PresetType.USER, ownerId },
    UITypeNames.all,
  );
}

export async function getUITypesByWhere<T extends UITypeNames>(
  where,
  include: T,
) {
  const uiTypes = await prisma.uIType.findMany({
    where,
    include: UITypeNameToIncludeObj(include),
  });
  const output: ManyXUITypeType<T> = {};
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
      output = { ...output, ...processSpecificUITypeConfig(key, val) };
    } else if (key !== 'ownerId') {
      output[key] = val;
    }
  }
  return reshapeOriginInfoId(output);
}

function processSpecificUITypeConfig(uiTypeType: string, uiTypeConfig) {
  if (uiTypeConfig) {
    const { idid, ...config } = uiTypeConfig;
    if (uiTypeType === 'sectionUIType') {
      config.collections = config.collections.map((x) => x.id);
      config.outputGroup = config.outputGroupId;
      config.social = null; //TODO actually load this instead of just setting to null
      delete config.outputGroupId;
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
