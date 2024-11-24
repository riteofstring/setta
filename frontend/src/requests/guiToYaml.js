import C from "constants/constants.json";
import { getSectionCodeInfoChildren } from "state/actions/codeInfoCols";
import { getParamIdsToShowInArea } from "state/actions/sections/sectionContents";
import { getSectionVariantIdToShow } from "state/actions/sectionVariants";
import {
  useCodeInfo,
  useSectionInfos,
  useSectionVariants,
} from "state/definitions";
import { getSectionType } from "state/getters/sectionInfo";
import { getForSectionId, getParamSweep } from "state/hooks/paramSweep";
import { post } from "./utils";

export async function dbGuiToYaml(sectionId) {
  const sectionType = getSectionType(sectionId);
  switch (sectionType.type) {
    case C.PARAM_SWEEP:
      return await dbParamSweepSectionToYaml(sectionId);
    case C.SECTION:
      return await dbSectionToYaml(sectionId);
    case C.GLOBAL_PARAM_SWEEP:
      return { yamlValue: "" };
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
    useSectionVariants.getState().x[getSectionVariantIdToShow(sectionId)];
  const codeInfoChildren = getSectionCodeInfoChildren(sectionId);
  return await post({
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
}

export async function dbParamSweepSectionToYaml(sectionId) {
  const forSectionId = getForSectionId(useSectionInfos.getState().x, sectionId);
  const sweep = getParamSweep(forSectionId);
  const codeInfo = useCodeInfo.getState().x;
  const codeInfoChildren = getSectionCodeInfoChildren(forSectionId);

  return await post({
    body: {
      sweep,
      codeInfo,
      codeInfoChildren,
    },
    address: C.ROUTE_PARAM_SWEEP_SECTION_TO_YAML,
  });
}
