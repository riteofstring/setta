import { isSectionUIType, SLIDER } from 'abcde-utils/src/constants';
import { PresetType } from 'abcde-utils/src/types/uiType';
import { prisma } from 'src/db/prisma';

export async function getBaseUITypes() {
  return await getUITypesByWhere({ presetType: PresetType.BASE });
}

export async function getPresetUITypes(ownerId: string) {
  return await getUITypesByWhere({ presetType: PresetType.USER, ownerId });
}

export async function getUITypesByWhere(where) {
  const uiTypes = await prisma.uIType.findMany({
    where,
    include: { sectionConfigCollections: { select: { id: true } } },
  });
  const output = {};
  for (const u of uiTypes) {
    output[u.id] = processUIType(u);
  }
  return output;
}

function processUIType(uiType) {
  const {
    sectionConfigSubType,
    sectionConfigCollections,
    sectionConfigChildUITypeId,
    sliderConfigMin,
    sliderConfigMax,
    sliderConfigStep,
    ownerId,
    asNonPresetForSectionId,
    asNonPresetForUITypeColId,
    asNonPresetForCodeInfoId,
    ...theRest
  } = uiType;

  let config = {};
  if (isSectionUIType(uiType)) {
    config = {
      subType: sectionConfigSubType,
      collections: sectionConfigCollections.map((x) => x.id),
      childUITypeId: sectionConfigChildUITypeId,
    };
  } else if (uiType.type === SLIDER) {
    config = {
      min: sliderConfigMin,
      max: sliderConfigMax,
      step: sliderConfigStep,
    };
  }
  return { ...theRest, config };
}
