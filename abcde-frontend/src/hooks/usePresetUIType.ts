import { SECTION_TYPE_NAMES } from "abcde-utils/src/constants";
import { UITypeType } from "abcde-utils/src/types/uiType";
import {
  isBasePreset,
  isNotDeck,
  isPreset,
} from "abcde-utils/src/uiTypeConstants";
import _ from "lodash";
import { useUITypes } from "models/info/uiTypes";
import { uiTypesToPretty } from "utils/constants";
import { useGetParamChildNonPresetUITypeIds } from "./useEnteredValue";
import { useParamNonPresetUITypeIds } from "./useParamUIType";
import { useGetSectionInfo } from "./useSectionInfo";

function createName(uiType) {
  const x = uiTypesToPretty.get(uiType.type);
  if (uiType.name) {
    return `${uiType.name} - (${x})`;
  }
  return x;
}

function isAmongNonPresets(v: UITypeType, nonPresetUITypeIds: string[]) {
  return nonPresetUITypeIds.includes(v.id);
}

export function isFromSelfAndMatchesType(v, nonPresetUITypeIds, type) {
  return isAmongNonPresets(v, nonPresetUITypeIds) && v.type === type;
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
