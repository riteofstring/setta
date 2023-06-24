import { isRoot, SECTION_TYPE_NAMES } from "abcde-utils/src/constants";
import { UITypeType } from "abcde-utils/src/types/uiType";
import {
  isBasePreset,
  isNotDeck,
  isPreset,
} from "abcde-utils/src/uiTypeConstants";
import _ from "lodash";
import { useUITypes } from "models/info/uiTypes";
import { uiTypesToPretty } from "utils/constants";
import { useGetSectionInfo } from "./useSectionInfo";

function createName(uiType) {
  const x = uiTypesToPretty.get(uiType.type);
  if (uiType.name) {
    return `${uiType.name} - (${x})`;
  }
  return x;
}

function isFromSelf(v: UITypeType, nonPresetUITypeIds: string[]) {
  return nonPresetUITypeIds.includes(v.id);
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

export function isFromSelfAndMatchesType(v, nonPresetUITypeIds, type) {
  return isFromSelf(v, nonPresetUITypeIds) && v.type === type;
}

function isSectionType(v) {
  return SECTION_TYPE_NAMES.includes(v.type);
}

function filterUITypes(
  uiTypes,
  generalFilterFn,
  nonPresetFilterFn: (x: UITypeType) => boolean,
  selectedId
) {
  const nonPresets = _.filter(uiTypes, nonPresetFilterFn);
  console.log("nonPresets", nonPresets);
  const typesOfNonPresets = _.map(nonPresets, (v) => v.type);

  // include presets + base presets of types that aren't already included in typesOfMatchesOrigin
  const presetsFiltered = _.filter(
    uiTypes,
    (v) =>
      generalFilterFn(v) &&
      isPreset(v) &&
      isNotDeck(v) &&
      (!isBasePreset(v) ||
        (isBasePreset(v) && !typesOfNonPresets.includes(v.type)))
  );

  // always include the selected uiType
  const selected = _.filter(uiTypes, (v) => v.id === selectedId);

  return _.uniq([...presetsFiltered, ...nonPresets, ...selected]).map((v) => ({
    id: v.id,
    name: createName(v),
    presetType: v.presetType,
  }));
}

// export function useAvailableUITypesForNestedSection(
//   sectionId: string,
//   selectedId: string
// ) {
//   const parentId = useGetSectionInfo(sectionId, "parentId") as string;
//   const parentUITypeType = useGetSectionType(parentId, "type");
//   const parentUITypeColId = useGetSectionInfo(parentId, "uiTypeColId");
//   const paramInfoId = useGetSectionInfo(sectionId, "paramInfoId");

//   const generalFilterFn = isSectionType;
//   const originFilterFn = (uiType: UITypeType) =>
//     isFromSelf(uiType, originInfoId) ||
//     isFromParam(uiType, parentUITypeColId, paramInfoId) ||
//     isFromRoot(uiType, parentOriginInfoId, parentUITypeType);

//   return useUITypes(
//     (x) => filterUITypes(x.x, generalFilterFn, originFilterFn, selectedId),
//     _.isEqual
//   );
// }

export function useAvailableUITypesForTopLevelSection(
  sectionId: string,
  selectedId: string
) {
  const nonPresetUITypeIds = useGetSectionInfo(sectionId, "nonPresetUITypeIds");
  const generalFilterFn = isSectionType;
  const nonPresetFilterFn = (uiType: UITypeType) =>
    isFromSelf(uiType, nonPresetUITypeIds);

  return useUITypes(
    (x) => filterUITypes(x.x, generalFilterFn, nonPresetFilterFn, selectedId),
    _.isEqual
  );
}

// export function useAvailableUITypesForUIConfig(
//   sectionId: string,
//   paramInfoId: string,
//   selectedId: string
// ) {
//   const uiTypeColId = useGetSectionInfo(sectionId, "uiTypeColId");
//   const childId = useGetParamChildId(sectionId, paramInfoId);

//   const generalFilterFn = () => true;
//   const originFilterFn = (uiType: UITypeType) =>
//     isFromSelf(uiType, originInfoId) || isFromChild(uiType, childId);

//   return useUITypes(
//     (x) => filterUITypes(x.x, generalFilterFn, originFilterFn, selectedId),
//     _.isEqual
//   );
// }
