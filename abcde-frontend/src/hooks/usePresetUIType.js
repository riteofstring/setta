import { useStoreActions, useStoreState } from "easy-peasy";
import _ from "lodash";
import {
  DECK,
  isRoot,
  SECTION_TYPE_NAMES,
  uiTypesToPretty,
} from "utils/constants";
import { useParamUITypeId } from "./useParamInfo";
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

function isPreset(v) {
  return v.isPreset && v.type !== DECK;
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
  const presets = _.filter(uiTypes, (v) => filterFn(v) && isPreset(v));

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

// If paramInfoId is provided, then originInfoId is {uiTypeCollectionId, paramInfoId},
// where uiTypeCollectionId comes from the section that contains the parameter
// Otherwise, look for sectionId and maybe parentId
export function useAvailablePresetUITypes({
  sectionId,
  paramInfoId,
  settingSectionConfig,
}) {
  const { parentId, paramInfoId: sectionParamInfoId } =
    useGetSectionInfo(sectionId);
  const { id: sectionTypeId, config: sectionTypeConfig } =
    useGetSectionType(sectionId);
  const { type: parentType, config: parentTypeConfig } =
    useGetSectionType(parentId);
  const paramUITypeId = useParamUITypeId(sectionId)(paramInfoId)[0];
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

  return useStoreState(
    (x) =>
      filterUITypes(
        x.uiTypes.x,
        filterFn,
        selectedId,
        originInfoId,
        parentInfo
      ),
    _.isEqual
  );
}

export function createOriginInfoId({
  isPreset,
  settingSectionConfig,
  sectionTypeConfig,
  childId,
  paramInfoId,
  isChildOfRoot,
  rootId,
}) {
  if (isPreset) {
    return {};
  } else if (isChildOfRoot) {
    return { sectionId: rootId };
  } else if (settingSectionConfig && paramInfoId) {
    return {
      uiTypeCollectionId: sectionTypeConfig?.uiTypeCollectionId,
      paramInfoId,
    };
  } else if (settingSectionConfig && !paramInfoId) {
    return { sectionId: childId };
  } else if (paramInfoId) {
    return {
      uiTypeCollectionId: sectionTypeConfig?.uiTypeCollectionId,
      paramInfoId,
    };
  } else {
    return {};
  }
}
