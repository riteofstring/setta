import { useStoreActions, useStoreState } from "easy-peasy";
import _ from "lodash";
import {
  DECK,
  isRoot,
  SECTION_TYPE_NAMES,
  uiTypesToPretty,
} from "utils/constants";
import { useParamChildId } from "./useParamInfo";
import { useGetSectionInfo } from "./useSectionInfo";
import { useGetSectionType } from "./useSectionType";

export function usePresetUIType(uiTypeId) {
  const uiType = useStoreState((x) => x.uiTypes.x[uiTypeId]);
  const setConfig = useStoreActions((x) => x.uiTypes.setConfig);
  const _setConfig = (newConfig) => {
    setConfig({ uiTypeId, newStateFn: (x) => ({ ...x, ...newConfig }) });
  };

  return [uiType, _setConfig];
}

function createName(uiType) {
  const x = uiTypesToPretty.get(uiType.type);
  if (uiType.name) {
    return `${uiType.name} - (${x})`;
  }
  return x;
}

function matchesOriginInfoId(v, originInfoIds, parentInfo = {}) {
  const forSelf =
    originInfoIds.includes(v.originInfoId) && !v.isForChildOfOriginInfoId;
  const fromParent =
    parentInfo.id === v.originInfoId &&
    isRoot(parentInfo.type) &&
    v.isForChildOfOriginInfoId;
  return forSelf || fromParent;
}

export function matchesOriginInfoIdAndType(v, originInfoIds, type) {
  return matchesOriginInfoId(v, originInfoIds) && v.type === type;
}

export function isPreset(v) {
  return v.isPreset && v.type !== DECK;
}

function isSectionType(v) {
  return SECTION_TYPE_NAMES.includes(v.type);
}

export function onlySectionTypes(v) {
  return isPreset(v) && isSectionType(v);
}

function filterUITypes(uiTypes, filterFn, originInfoIds, parentInfo) {
  const matchesOrigin = _.filter(uiTypes, (v) =>
    matchesOriginInfoId(v, originInfoIds, parentInfo)
  );
  const typesOfMatchesOrigin = _.map(matchesOrigin, (v) => v.type);
  const presets = _.filter(uiTypes, (v) => filterFn(v));

  // Remove base presets that have a corresponding uiType with a matching originInfoId
  const presetsFiltered = _.filter(
    presets,
    (v) =>
      !v.isBasePreset ||
      (v.isBasePreset && !typesOfMatchesOrigin.includes(v.type))
  );

  return [...presetsFiltered, ...matchesOrigin].map((v) => ({
    id: v.id,
    name: createName(v),
  }));
}

// If paramInfoId is provided, then look for ui types originating from paramInfoId or paramChildId
// Otherwise, look for sectionId and maybe parentId
export function useAvailablePresetUITypes({ sectionId, paramInfoId }) {
  const { parentId } = useGetSectionInfo(sectionId);
  const { type: parentType } = useGetSectionType(parentId);
  const paramChildId = useParamChildId(sectionId)(paramInfoId)[0];
  const originInfoIds = paramInfoId ? [paramInfoId, paramChildId] : [sectionId];
  const parentInfo = paramInfoId ? {} : { id: parentId, type: parentType };
  const filterFn = paramInfoId ? isPreset : onlySectionTypes;

  return useStoreState(
    (x) =>
      filterUITypes(
        x.uiTypes.x,
        filterFn,
        originInfoIds.filter((x) => x),
        parentInfo
      ),
    _.isEqual
  );
}
