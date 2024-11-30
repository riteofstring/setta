import C from "constants/constants.json";
import { getSectionCodeInfoChildren } from "state/actions/codeInfoCols";
import { getParamIdsToShowInArea } from "state/actions/sections/sectionContents";
import { getSectionVariantIdToShow } from "state/actions/sectionVariants";
import { useCodeInfo, useSectionInfos } from "state/definitions";
import { getSectionType } from "state/getters/sectionInfo";
import { getForSectionId, getParamSweep } from "state/hooks/paramSweep";
import { post } from "./utils";

export async function dbGuiToYaml(sectionId) {
  const sectionType = getSectionType(sectionId);
  switch (sectionType.type) {
    case C.PARAM_SWEEP:
      return await dbParamSweepSectionToYaml(sectionId);
    case C.GLOBAL_PARAM_SWEEP:
      return await dbGlobalParamSweepSectionToYaml(sectionId);
    case C.GLOBAL_VARIABLES:
    case C.SECTION:
      return await dbSectionToYaml(sectionId);
  }
}

export async function dbSectionToYaml(sectionId) {
  const pinnedIds = getParamIdsToShowInArea(sectionId, true);
  const unpinnedIds = getParamIdsToShowInArea(sectionId, false);

  pinnedIds.requiredParamIds = Object.keys(pinnedIds.requiredParamIdsToPaths);
  unpinnedIds.requiredParamIds = Object.keys(
    unpinnedIds.requiredParamIdsToPaths,
  );
  delete pinnedIds.requiredParamIdsToPaths;
  delete unpinnedIds.requiredParamIdsToPaths;
  const { configLanguage } = useSectionInfos.getState().x[sectionId];
  const codeInfo = useCodeInfo.getState().x;
  const sectionVariant =
    useSectionInfos.getState().variants[getSectionVariantIdToShow(sectionId)];
  const codeInfoChildren = getSectionCodeInfoChildren(sectionId);
  const res = await post({
    body: {
      codeInfo,
      codeInfoChildren,
      sectionVariant,
      pinnedIds,
      unpinnedIds,
      configLanguage,
    },
    address: C.ROUTE_SECTION_TO_YAML,
  });
  return { res };
}

export async function dbParamSweepSectionToYaml(sectionId) {
  const forSectionId = getForSectionId(useSectionInfos.getState().x, sectionId);
  const sweep = getParamSweep(sectionId);
  const codeInfo = useCodeInfo.getState().x;
  const codeInfoChildren = getSectionCodeInfoChildren(forSectionId);

  const res = await post({
    body: {
      sweep,
      codeInfo,
      codeInfoChildren,
    },
    address: C.ROUTE_PARAM_SWEEP_SECTION_TO_YAML,
  });
  return { res };
}

export async function dbGlobalParamSweepSectionToYaml(sectionId) {
  const shownVariantId = getSectionVariantIdToShow(sectionId);
  const sections = useSectionInfos.getState().x;
  const sectionVariants = useSectionInfos.getState().variants;
  const runGroup = sectionVariants[shownVariantId].runGroup;

  const res = await post({
    body: {
      runGroup,
      sections,
      sectionVariants,
    },
    address: C.ROUTE_GLOBAL_PARAM_SWEEP_SECTION_TO_YAML,
  });
  return { res, metaData: { runGroupId: shownVariantId } };
}
