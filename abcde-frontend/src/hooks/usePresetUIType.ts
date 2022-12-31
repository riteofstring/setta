import { isRoot, SECTION_TYPE_NAMES } from "abcde-utils/src/constants";
import {
  OriginInfoIdType,
  SectionUITypeConfigType,
  UITypeType,
} from "abcde-utils/src/types/uiType";
import {
  isBasePreset,
  isNotDeck,
  isPreset,
} from "abcde-utils/src/uiTypeConstants";
import _ from "lodash";
import { useUITypes } from "models/info/uiTypes";
import { uiTypesToPretty } from "utils/constants";
import { createParamOriginInfoId } from "utils/uiTypeUtils";
import { useGetParamChildId } from "./useEnteredValue";
import { useParamUITypeId } from "./useParamUIType";
import { useGetSectionType } from "./useSectionType";

function createName(uiType) {
  const x = uiTypesToPretty.get(uiType.type);
  if (uiType.name) {
    return `${uiType.name} - (${x})`;
  }
  return x;
}

function isFromSelf(v: UITypeType, originInfoId: OriginInfoIdType) {
  return _.isEqual(v.originInfoId, originInfoId) && !v.isForChildOfOriginInfoId;
}

function isFromChild(v: UITypeType, childId) {
  return (
    _.isEqual(v.originInfoId, {
      sectionId: childId,
      uiTypeColId: null,
      paramInfoId: null,
    }) && !v.isForChildOfOriginInfoId
  );
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

function filterUITypes(uiTypes, generalFilterFn, originFilterFn, selectedId) {
  const matchesOriginOrIsSelected = _.filter(
    uiTypes,
    (v) => originFilterFn(v) || v.id === selectedId
  );
  const typesOfMatchesOrigin = _.map(matchesOriginOrIsSelected, (v) => v.type);

  // include presets + base presets of types that aren't already included in typesOfMatchesOrigin
  const presetsFiltered = _.filter(
    uiTypes,
    (v) =>
      generalFilterFn(v) &&
      isPreset(v) &&
      isNotDeck(v) &&
      (!isBasePreset(v) ||
        (isBasePreset(v) && !typesOfMatchesOrigin.includes(v.type)))
  );

  return _.uniq([...presetsFiltered, ...matchesOriginOrIsSelected]).map(
    (v) => ({
      id: v.id,
      name: createName(v),
      presetType: v.presetType,
    })
  );
}

export function useAvailableUITypesForSectionConfig(sectionId: string) {
  // const parentId = useGetSectionInfo(sectionId, "parentId");
  // const selectedId = useGetSectionConfig(sectionId, "uiTypeId");
  // const parentType = useGetSectionType(parentId, "type");
  // const originInfoId = createSectionOriginInfoId(sectionId);
  // const parentInfo = {
  //   type: parentType,
  //   originInfoId: createSectionOriginInfoId(parentId as any), //TODO remove typecast
  // };
  // const filterFn = isSectionType;
  // return useUITypes(
  //   (x) => filterUITypes(x.x, filterFn, selectedId, originInfoId, parentInfo),
  //   _.isEqual
  // );
}

export function useAvailableUITypesForUIConfig(
  sectionId: string,
  paramInfoId: string
) {
  const sectionTypeConfig = useGetSectionType(
    sectionId,
    "config"
  ) as SectionUITypeConfigType;
  const childId = useGetParamChildId(sectionId, paramInfoId);
  const selectedId = useParamUITypeId(sectionId, paramInfoId);
  const originInfoId = createParamOriginInfoId(sectionTypeConfig, paramInfoId);

  const generalFilterFn = () => true;
  const originFilterFn = (uiType: UITypeType) =>
    isFromSelf(uiType, originInfoId) || isFromChild(uiType, childId);

  return useUITypes(
    (x) => filterUITypes(x.x, generalFilterFn, originFilterFn, selectedId),
    _.isEqual
  );
}
