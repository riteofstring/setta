import { isRoot, SECTION_TYPE_NAMES } from "abcde-utils/src/constants";
import { OriginInfoIdType, UITypeType } from "abcde-utils/src/types/uiType";
import {
  isBasePreset,
  isNotDeck,
  isPreset,
} from "abcde-utils/src/uiTypeConstants";
import _ from "lodash";
import { useUITypes } from "models/info/uiTypes";
import { uiTypesToPretty } from "utils/constants";
import {
  createParamOriginInfoId,
  createSectionOriginInfoId,
} from "utils/uiTypeUtils";
import { useGetParamChildId } from "./useEnteredValue";
import { useGetSectionConfig } from "./useSectionConfig";
import { useGetSectionInfo } from "./useSectionInfo";
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

function isFromChild(v: UITypeType, childId: string | null) {
  return (
    childId &&
    _.isEqual(v.originInfoId, createSectionOriginInfoId(childId)) &&
    !v.isForChildOfOriginInfoId
  );
}

function isFromParam(
  v: UITypeType,
  parentUITypeColId: string,
  paramInfoId: string | null
) {
  return (
    paramInfoId &&
    _.isEqual(
      v.originInfoId,
      createParamOriginInfoId(parentUITypeColId, paramInfoId)
    )
  );
}

function isFromRoot(
  v: UITypeType,
  parentOriginInfoId: OriginInfoIdType,
  parentUITypeType: string
) {
  return (
    _.isEqual(v.originInfoId, parentOriginInfoId) &&
    isRoot(parentUITypeType) &&
    v.isForChildOfOriginInfoId
  );
}

export function isFromSelfAndMatchesType(v, originInfoId, type) {
  return isFromSelf(v, originInfoId) && v.type === type;
}

function isSectionType(v) {
  return SECTION_TYPE_NAMES.includes(v.type);
}

function filterUITypes(uiTypes, generalFilterFn, originFilterFn, selectedId) {
  const matchesOriginOrIsSelected = _.pickBy(uiTypes, (v) => originFilterFn(v));
  const typesOfMatchesOrigin = _.map(matchesOriginOrIsSelected, (v) => v.type);

  // include presets + base presets of types that aren't already included in typesOfMatchesOrigin
  const presetsFiltered = _.pickBy(
    uiTypes,
    (v) =>
      generalFilterFn(v) &&
      isPreset(v) &&
      isNotDeck(v) &&
      (!isBasePreset(v) ||
        (isBasePreset(v) && !typesOfMatchesOrigin.includes(v.type)))
  );

  // always include the selected uiType
  const selected = _.pickBy(uiTypes, (v, id) => id === selectedId);

  const output = {
    ...presetsFiltered,
    ...matchesOriginOrIsSelected,
    ...selected,
  };

  return _.map(output, (v, id) => ({
    id,
    name: createName(v),
    presetType: v.presetType,
  }));
}

export function useAvailableUITypesForNestedSection(
  sectionId: string,
  selectedId: string
) {
  const parentId = useGetSectionInfo(sectionId, "parentId") as string;
  const parentOriginInfoId = useGetSectionType(parentId, "originInfoId");
  const parentUITypeType = useGetSectionType(parentId, "type");
  const parentUITypeColId = useGetSectionConfig(parentId, "uiTypeColId");
  const paramInfoId = useGetSectionInfo(sectionId, "paramInfoId");
  const originInfoId = createSectionOriginInfoId(sectionId);

  const generalFilterFn = isSectionType;
  const originFilterFn = (uiType: UITypeType) =>
    isFromSelf(uiType, originInfoId) ||
    isFromParam(uiType, parentUITypeColId, paramInfoId) ||
    isFromRoot(uiType, parentOriginInfoId, parentUITypeType);

  return useUITypes(
    (x) => filterUITypes(x.x, generalFilterFn, originFilterFn, selectedId),
    _.isEqual
  );
}

export function useAvailableUITypesForTopLevelSection(
  sectionId: string,
  selectedId: string
) {
  const originInfoId = createSectionOriginInfoId(sectionId);

  const generalFilterFn = isSectionType;
  const originFilterFn = (uiType: UITypeType) =>
    isFromSelf(uiType, originInfoId);

  return useUITypes(
    (x) => filterUITypes(x.x, generalFilterFn, originFilterFn, selectedId),
    _.isEqual
  );
}

export function useAvailableUITypesForUIConfig(
  sectionId: string,
  paramInfoId: string,
  selectedId: string
) {
  const uiTypeColId = useGetSectionConfig(sectionId, "uiTypeColId");
  const childId = useGetParamChildId(sectionId, paramInfoId);
  const originInfoId = createParamOriginInfoId(uiTypeColId, paramInfoId);

  const generalFilterFn = () => true;
  const originFilterFn = (uiType: UITypeType) =>
    isFromSelf(uiType, originInfoId) || isFromChild(uiType, childId);

  return useUITypes(
    (x) => filterUITypes(x.x, generalFilterFn, originFilterFn, selectedId),
    _.isEqual
  );
}
