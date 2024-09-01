import _ from "lodash";
import { useUITypes } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { isPreset } from "utils/sectionTypeHelpers";

export function maybeCloneUIType({
  currUIType,
  settingPreset,
  nonPresetUITypeIds,
  createNonPreset,
  setUITypeId,
}) {
  // If it's a preset but we're not "saving as",
  // then use existing non-preset, or copy into a new non-preset ui type.
  let maybeNewUIType = currUIType;
  if (isPreset(currUIType) && !settingPreset) {
    // Try using existing non-preset (uiType with same type and that belongs to nonPresetUITypeIds)
    const matches = _.filter(useUITypes.getState().x, (v) =>
      isAmongNonPresetsAndMatchesType(v, nonPresetUITypeIds, currUIType.type),
    );

    // If there's no match, create a non-preset
    maybeNewUIType = matches.length > 0 ? matches[0] : createNonPreset();
    // In both cases, make the section or param to use the new or existing id
    setUITypeId(maybeNewUIType.id);
  }

  return maybeNewUIType;
}

export function cloneNewUIType({
  uiType,
  name = "",
  config,
  presetType = null,
}) {
  const newUIType = _.cloneDeep(uiType);
  newUIType.id = createNewId();
  newUIType.name = name;
  newUIType.presetType = presetType;
  if (!_.isNil(config)) {
    newUIType.config = config;
  }
  return newUIType;
}

export function isAmongNonPresets(v, nonPresetUITypeIds) {
  return nonPresetUITypeIds.includes(v.id);
}

function isAmongNonPresetsAndMatchesType(v, nonPresetUITypeIds, type) {
  return isAmongNonPresets(v, nonPresetUITypeIds) && v.type === type;
}
