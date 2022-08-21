import { useStoreActions, useStoreState } from "easy-peasy";
import _ from "lodash";
import {
  DECK,
  isRoot,
  SECTION_TYPE_NAMES,
  uiTypesToPretty,
} from "utils/constants";
import { useParamChildId, useParamUITypeId } from "./useParamInfo";
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

function isFromSelf(v, originInfoIds) {
  return originInfoIds.includes(v.originInfoId) && !v.isForChildOfOriginInfoId;
}

function isFromParent(v, parentInfo) {
  return (
    parentInfo.id === v.originInfoId &&
    isRoot(parentInfo.type) &&
    v.isForChildOfOriginInfoId
  );
}

function matchesOriginInfoId(v, originInfoIds, parentInfo = {}) {
  return isFromSelf(v, originInfoIds) || isFromParent(v, parentInfo);
}

export function isFromSelfAndMatchesType(v, originInfoIds, type) {
  return isFromSelf(v, originInfoIds) && v.type === type;
}

function isPreset(v) {
  return v.isPreset && v.type !== DECK;
}

function isSectionType(v) {
  return SECTION_TYPE_NAMES.includes(v.type);
}

export function onlySectionTypes(v) {
  return isPreset(v) && isSectionType(v);
}

function filterUITypes(
  uiTypes,
  filterFn,
  selectedId,
  originInfoIds,
  parentInfo
) {
  const matchesOriginOrIsSelected = _.filter(
    uiTypes,
    (v) =>
      matchesOriginInfoId(v, originInfoIds, parentInfo) || v.id === selectedId
  );
  const typesOfMatchesOrigin = _.map(matchesOriginOrIsSelected, (v) => v.type);
  const presets = _.filter(uiTypes, (v) => filterFn(v));

  // Remove base presets that have a corresponding uiType with a matching originInfoId
  const presetsFiltered = _.filter(
    presets,
    (v) =>
      !v.isBasePreset ||
      (v.isBasePreset && !typesOfMatchesOrigin.includes(v.type))
  );

  return _.uniq([...presetsFiltered, ...matchesOriginOrIsSelected]).map(
    (v) => ({
      id: v.id,
      name: createName(v),
    })
  );
}

// If paramInfoId is provided, then look for ui types originating from paramInfoId or paramChildId
// Otherwise, look for sectionId and maybe parentId.
// selectedId is the currently selected uiTypeId
export function useAvailablePresetUITypes({ sectionId, paramInfoId }) {
  const { parentId } = useGetSectionInfo(sectionId);
  const { id: sectionTypeId } = useGetSectionType(sectionId);
  const { type: parentType } = useGetSectionType(parentId);
  const paramUITypeId = useParamUITypeId(sectionId)(paramInfoId)[0];
  const paramChildId = useParamChildId(sectionId)(paramInfoId)[0];
  const originInfoIds = paramInfoId ? [paramInfoId, paramChildId] : [sectionId];
  const parentInfo = paramInfoId ? {} : { id: parentId, type: parentType };
  const selectedId = paramInfoId ? paramUITypeId : sectionTypeId;
  const filterFn = paramInfoId ? isPreset : onlySectionTypes;

  return useStoreState(
    (x) =>
      filterUITypes(
        x.uiTypes.x,
        filterFn,
        selectedId,
        originInfoIds.filter((x) => x),
        parentInfo
      ),
    _.isEqual
  );
}
