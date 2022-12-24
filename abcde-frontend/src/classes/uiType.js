import { SET_FROM_SIDEPANE } from "utils/constants";
import { maybeNewId } from "utils/utils";

export function newUIType({
  id,
  type,
  name = "",
  config = {},
  origin = SET_FROM_SIDEPANE,
  presetType = null,
  originInfoId = {},
  isForChildOfOriginInfoId = false,
}) {
  return {
    id: maybeNewId(id),
    type, // SLIDER, TEXT, etc...
    name, // The display name, e.g. Kevin's Slider
    config, // An object containing the configuration
    origin, // Where this uiType was created (sidepane, global settings etc.)
    presetType, // null, "user", or "base"
    // If not a preset, what uiTypeColId + paramInfoId is this uiType associated with?
    originInfoId,
    // If a section produces a uiType meant for its children, set this to true.
    isForChildOfOriginInfoId,
  };
}
