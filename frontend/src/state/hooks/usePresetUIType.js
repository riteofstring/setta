import C from "constants/constants.json";
import _ from "lodash";
import { isAmongNonPresets } from "state/actions/uiTypes/cloneUITypes";
import { useUITypes } from "state/definitions";
import {
  isBasePreset,
  isPreset,
  isSectionUIType,
  isUserPreset,
  PresetType,
  uiTypesToPretty,
} from "utils/sectionTypeHelpers";
import { useGetSectionInfo } from "./sections";
import { useGetSectionType, useParamNonPresetUITypeIds } from "./uiTypes";

function createName(uiType) {
  const x = uiTypesToPretty.get(uiType.type);
  if (isUserPreset(uiType)) {
    return `${uiType.name} - (${x})`;
  }
  return x;
}

function filterUITypes(
  uiTypes,
  generalFilterFn,
  nonPresetFilterFn,
  selectedId,
) {
  const output = [];

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

export function useAvailableUITypesForSection(sectionId, selectedId) {
  const nonPresetUITypeIds = useGetSectionInfo(sectionId, "nonPresetUITypeIds");
  const currTypeName = useGetSectionType(sectionId, "type");
  const generalFilterFn = getSectionFilterFn(currTypeName);
  const nonPresetFilterFn = (uiType) =>
    isAmongNonPresets(uiType, nonPresetUITypeIds);

  return useUITypes(
    (x) => filterUITypes(x.x, generalFilterFn, nonPresetFilterFn, selectedId),
    _.isEqual,
  );
}

export function useAvailableUITypesForParam(
  sectionId,
  paramInfoId,
  selectedId,
) {
  const nonPresetUITypeIds = useParamNonPresetUITypeIds(sectionId, paramInfoId);

  const generalFilterFn = (x) => !isSectionUIType(x);
  const nonPresetFilterFn = (uiType) =>
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
