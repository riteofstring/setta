import C from "constants/constants.json";
import _ from "lodash";
import { useUITypes } from "state/definitions/uiTypes";
import { isAmongNonPresets } from "state/actions/cloneUITypes";
import { isSectionUIType, uiTypesToPretty } from "z_utils/constants";
import { ManyUITypeType, PresetType, UITypeType } from "z_utils/types/uiType";
import { isBasePreset, isPreset, isUserPreset } from "z_utils/uiTypeConstants";
import { useGetSectionInfo } from "./useGetSectionInfo";
import { useParamNonPresetUITypeIds } from "./useParamUIType";
import { useGetSectionType } from "./useSectionType";

function createName(uiType) {
  const x = uiTypesToPretty.get(uiType.type);
  if (isUserPreset(uiType)) {
    return `${uiType.name} - (${x})`;
  }
  return x;
}

function filterUITypes(
  uiTypes: ManyUITypeType,
  generalFilterFn,
  nonPresetFilterFn: (x: UITypeType) => boolean,
  selectedId,
) {
  const output: UITypeType[] = [];

  const nonPresets = _.filter(uiTypes, nonPresetFilterFn);

  for (const u of Object.values(uiTypes)) {
    // skip if it doesn't pass the general filter or it's not a preset
    if (!generalFilterFn(u) || !isPreset(u)) {
      continue;
    }

    // replace base presets with non-presets of the same type
    if (isBasePreset(u)) {
      // add base no matter what, if it's selected
      if (u.id === selectedId) {
        output.push(u);
      } else {
        // otherwise, maybe replace it with a non-preset
        const match = nonPresets.find((v) => v.type === u.type);
        output.push(match ?? u);
      }
    } else {
      output.push(u);
    }
  }

  return output.map((v) => ({
    id: v.id,
    name: createName(v),
    presetType: v.presetType,
    displayType: v.presetType ?? PresetType.BASE, // display non-preset types as "base" types
  }));
}

export function useAvailableUITypesForSection(
  sectionId: string,
  selectedId: string,
) {
  const nonPresetUITypeIds = useGetSectionInfo(sectionId, "nonPresetUITypeIds");
  const currTypeName = useGetSectionType(sectionId, "type");
  const generalFilterFn = getSectionFilterFn(currTypeName);
  const nonPresetFilterFn = (uiType: UITypeType) =>
    isAmongNonPresets(uiType, nonPresetUITypeIds);

  return useUITypes(
    (x) => filterUITypes(x.x, generalFilterFn, nonPresetFilterFn, selectedId),
    _.isEqual,
  );
}

export function useAvailableUITypesForParam(
  sectionId: string,
  paramInfoId: string,
  selectedId: string,
) {
  const nonPresetUITypeIds = useParamNonPresetUITypeIds(sectionId, paramInfoId);

  const generalFilterFn = (x) => !isSectionUIType(x);
  const nonPresetFilterFn = (uiType: UITypeType) =>
    isAmongNonPresets(uiType, nonPresetUITypeIds);

  return useUITypes(
    (x) => filterUITypes(x.x, generalFilterFn, nonPresetFilterFn, selectedId),
    _.isEqual,
  );
}

function getOtherSectionTypeNamesToShow(currTypeName) {
  switch (currTypeName) {
    case C.SECTION:
      return [C.LIST_ROOT, C.DICT_ROOT];
    case C.LIST_ROOT:
      return [C.SECTION, C.DICT_ROOT];
    case C.DICT_ROOT:
      return [C.SECTION, C.LIST_ROOT];
    default:
      return [];
  }
}

function getSectionFilterFn(currTypeName) {
  return (uiType) =>
    uiType.type === currTypeName ||
    getOtherSectionTypeNamesToShow(currTypeName).includes(uiType.type);
}
