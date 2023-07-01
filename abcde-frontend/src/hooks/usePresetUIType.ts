import { SECTION_TYPE_NAMES, uiTypesToPretty } from "abcde-utils/src/constants";
import {
  ManyUITypeType,
  PresetType,
  UITypeType,
} from "abcde-utils/src/types/uiType";
import {
  isBasePreset,
  isNotDeck,
  isPreset,
  isUserPreset,
} from "abcde-utils/src/uiTypeConstants";
import _ from "lodash";
import { useUITypes } from "models/info/uiTypes";
import { isAmongNonPresets } from "thunks/uiTypes/cloneUITypes";
import { useGetParamChildNonPresetUITypeIds } from "./useEnteredValue";
import { useParamNonPresetUITypeIds } from "./useParamUIType";
import { useGetSectionInfo } from "./useSectionInfo";

function createName(uiType) {
  const x = uiTypesToPretty.get(uiType.type);
  if (isUserPreset(uiType)) {
    return `${uiType.name} - (${x})`;
  }
  return x;
}

function isSectionType(v) {
  return SECTION_TYPE_NAMES.includes(v.type);
}

function filterUITypes(
  uiTypes: ManyUITypeType,
  generalFilterFn,
  nonPresetFilterFn: (x: UITypeType) => boolean,
  selectedId
) {
  const output: UITypeType[] = [];

  const nonPresets = _.filter(uiTypes, nonPresetFilterFn);

  for (const u of Object.values(uiTypes)) {
    // skip if it doesn't pass the general filter or it's not a preset
    if (!generalFilterFn(u) || !isPreset(u) || !isNotDeck(u)) {
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
  selectedId: string
) {
  const nonPresetUITypeIds = useGetSectionInfo(sectionId, "nonPresetUITypeIds");
  const generalFilterFn = isSectionType;
  const nonPresetFilterFn = (uiType: UITypeType) =>
    isAmongNonPresets(uiType, nonPresetUITypeIds);

  return useUITypes(
    (x) => filterUITypes(x.x, generalFilterFn, nonPresetFilterFn, selectedId),
    _.isEqual
  );
}

export function useAvailableUITypesForParam(
  sectionId: string,
  paramInfoId: string,
  selectedId: string
) {
  const nonPresetUITypeIds = useParamNonPresetUITypeIds(sectionId, paramInfoId);
  const childNonPresetUITypeIds = useGetParamChildNonPresetUITypeIds(
    sectionId,
    paramInfoId
  );

  const generalFilterFn = () => true;
  const nonPresetFilterFn = (uiType: UITypeType) =>
    isAmongNonPresets(uiType, [
      ...nonPresetUITypeIds,
      ...childNonPresetUITypeIds,
    ]);

  return useUITypes(
    (x) => filterUITypes(x.x, generalFilterFn, nonPresetFilterFn, selectedId),
    _.isEqual
  );
}
