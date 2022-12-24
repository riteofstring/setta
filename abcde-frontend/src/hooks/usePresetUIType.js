import { isRoot, SECTION_TYPE_NAMES } from "abcde-utils/src/constants";
import {
  isBasePreset,
  isNotDeck,
  isPreset,
} from "abcde-utils/src/uiTypeConstants";
import _ from "lodash";
import { useUITypes } from "models/info/uiTypes";
import { uiTypesToPretty } from "utils/constants";
import { createOriginInfoId } from "utils/uiTypeUtils";
import { useParamUITypeId } from "./useParamUIType";
import { useGetSectionInfo } from "./useSectionInfo";
import { useGetSectionType } from "./useSectionType";

export function usePresetUIType(uiTypeId) {
  const uiType = useUITypes((x) => x.x[uiTypeId]);
  const setConfig = useUITypes((x) => x.setConfig);
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

function isFromSelf(v, originInfoId) {
  return _.isEqual(v.originInfoId, originInfoId) && !v.isForChildOfOriginInfoId;
}

function isFromParent(v, parentInfo) {
  return (
    _.isEqual(v.originInfoId, parentInfo.originInfoId) &&
    isRoot(parentInfo.type) &&
    v.isForChildOfOriginInfoId
  );
}

function matchesOriginInfoId(v, originInfoId, parentInfo = {}) {
  return isFromSelf(v, originInfoId) || isFromParent(v, parentInfo);
}

export function isFromSelfAndMatchesType(v, originInfoId, type) {
  return isFromSelf(v, originInfoId) && v.type === type;
}

function isSectionType(v) {
  return SECTION_TYPE_NAMES.includes(v.type);
}

function filterUITypes(
  uiTypes,
  filterFn,
  selectedId,
  originInfoId,
  parentInfo
) {
  const matchesOriginOrIsSelected = _.filter(
    uiTypes,
    (v) =>
      (filterFn(v) && matchesOriginInfoId(v, originInfoId, parentInfo)) ||
      v.id === selectedId
  );
  const typesOfMatchesOrigin = _.map(matchesOriginOrIsSelected, (v) => v.type);
  const presets = _.filter(
    uiTypes,
    (v) => filterFn(v) && isPreset(v) && isNotDeck(v)
  );

  // Remove base presets that have a corresponding uiType with a matching originInfoId
  const presetsFiltered = _.filter(
    presets,
    (v) =>
      !isBasePreset(v) ||
      (isBasePreset(v) &&
        isNotDeck(v) &&
        !typesOfMatchesOrigin.includes(v.type))
  );

  return _.uniq([...presetsFiltered, ...matchesOriginOrIsSelected]).map(
    (v) => ({
      id: v.id,
      name: createName(v),
      presetType: v.presetType,
    })
  );
}

// If paramInfoId is provided, then originInfoId is {uiTypeColId, paramInfoId},
// where uiTypeColId comes from the section that contains the parameter
// Otherwise, look for sectionId and maybe parentId
export function useAvailablePresetUITypes({
  sectionId,
  paramInfoId,
  settingSectionConfig,
}) {
  const [parentId, sectionParamInfoId] = useGetSectionInfo(sectionId, [
    "parentId",
    "paramInfoId",
  ]);
  const [sectionTypeId, sectionTypeConfig] = useGetSectionType(sectionId, [
    "id",
    "config",
  ]);
  const [parentType, parentTypeConfig] = useGetSectionType(parentId, [
    "type",
    "config",
  ]);
  const paramUITypeId = useParamUITypeId(sectionId, paramInfoId);
  const originInfoId = createOriginInfoId({
    settingSectionConfig,
    sectionTypeConfig: paramInfoId ? sectionTypeConfig : parentTypeConfig,
    childId: sectionId,
    paramInfoId: paramInfoId ? paramInfoId : sectionParamInfoId,
  });
  const parentInfo = {
    type: parentType,
    originInfoId: createOriginInfoId({ isChildOfRoot: true, rootId: parentId }),
  };
  const selectedId = paramInfoId ? paramUITypeId : sectionTypeId;
  const filterFn = paramInfoId ? () => true : isSectionType;

  return useUITypes(
    (x) => filterUITypes(x.x, filterFn, selectedId, originInfoId, parentInfo),
    _.isEqual
  );
}
