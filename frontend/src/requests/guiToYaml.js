import C from "constants/constants.json";
import {
  getDisplayedCodeInfoCol,
  getDisplayedSectionVariant,
  getDisplayedSectionVariantId,
  getSectionType,
} from "state/actions/sectionInfos";
import { getParamIdsToShowInArea } from "state/actions/sections/sectionContents";
import { useSectionInfos } from "state/definitions";
import { getForSectionId } from "state/hooks/paramSweep";
import { post } from "./utils";

export async function dbGuiToYaml(sectionId) {
  const sectionType = getSectionType(sectionId);
  switch (sectionType) {
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
  const state = useSectionInfos.getState();
  const { configLanguage } = state.x[sectionId];
  const codeInfo = state.codeInfo;
  const sectionVariant = getDisplayedSectionVariant(sectionId, state);
  const codeInfoChildren = getDisplayedCodeInfoCol(sectionId, state).children;
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
  const state = useSectionInfos.getState();
  const forSectionId = getForSectionId(sectionId, state.x);
  const sweep = getDisplayedSectionVariant(sectionId, state).sweep;
  const codeInfo = state.codeInfo;
  const codeInfoChildren = getDisplayedCodeInfoCol(
    forSectionId,
    state,
  ).children;

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
  const shownVariantId = getDisplayedSectionVariantId(sectionId);
  const state = useSectionInfos.getState();
  const sections = state.x;
  const sectionVariants = state.variants;
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
