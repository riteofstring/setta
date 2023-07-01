import { isSeriesElement } from "abcde-utils/src/constants";
import { UITypeType } from "abcde-utils/src/types/uiType";
import { isPreset } from "abcde-utils/src/uiTypeConstants";
import { createNewId } from "abcde-utils/src/utils";
import _ from "lodash";
import { useUITypes } from "models/info/uiTypes";

export function maybeCloneUIType({
  currUIType,
  currUISubtype,
  settingPreset,
  nonPresetUITypeIds,
  createNonPreset,
}) {
  // If it's a preset but we're not "saving as",
  // then use existing non-preset, or copy into a new non-preset ui type.
  let maybeNewUIType = currUIType;
  if (shouldCloneUIType(currUIType, currUISubtype, settingPreset)) {
    // Try using existing non-preset (uiType with same type and that belongs to section's nonPresetUITypeIds)
    const matches = _.filter(useUITypes.getState().x, (v) =>
      isAmongNonPresetsAndMatchesType(
        v,
        nonPresetUITypeIds,
        currUIType.type,
        currUISubtype
      )
    );

    // If there's no match, create a non-preset
    maybeNewUIType = matches.length > 0 ? matches[0] : createNonPreset();
  }

  return maybeNewUIType;
}

function shouldCloneUIType(uiType, currUISubtype, settingPreset) {
  // uiType is a preset, and we're not in "settingPreset" mode
  const isPresetNotSettingPreset = isPreset(uiType) && !settingPreset;
  // The uiType is a list element (a child of a list root).
  // Changing its config shouldn't affect its siblings.
  // Plus it should become indepedent from the root config.
  const _isSeriesElement = isSeriesElement(currUISubtype);
  return isPresetNotSettingPreset || _isSeriesElement;
}

export function cloneNewUIType({
  uiType,
  name = "",
  config,
  presetType = null,
}: Partial<UITypeType> & { uiType: UITypeType }) {
  const newUIType = _.cloneDeep(uiType);
  newUIType.id = createNewId();
  newUIType.name = name;
  newUIType.presetType = presetType;
  if (!_.isNil(config)) {
    newUIType.config = config;
  }
  return newUIType;
}

export function isAmongNonPresets(v: UITypeType, nonPresetUITypeIds: string[]) {
  return nonPresetUITypeIds.includes(v.id);
}

function isAmongNonPresetsAndMatchesType(v, nonPresetUITypeIds, type, subType) {
  if (isSeriesElement(subType)) {
    return false;
  }
  return isAmongNonPresets(v, nonPresetUITypeIds) && v.type === type;
}
