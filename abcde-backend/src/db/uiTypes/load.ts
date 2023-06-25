import { PresetType } from 'abcde-utils/src/types/uiType';
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
  return output;
}

function processSpecificUITypeConfig(uiTypeType: string, uiTypeConfig) {
  if (uiTypeConfig) {
    const { idid, ...config } = uiTypeConfig;
    if (uiTypeType === 'sectionUIType') {
      config.collections = config.collections.map((x) => x.id);
    }
    return { config };
  }
  return {};
}
