import { UITypeType } from "../types/uiType";
import { maybeNewId } from "../utils";

export function newUIType({
  id,
  type,
  name = "",
  config = {},
  presetType = null,
  originInfoId = {},
  isForChildOfOriginInfoId = false,
}: UITypeType): UITypeType {
  return {
    id: maybeNewId(id),
    type, // SLIDER, TEXT, etc...
    name, // The display name, e.g. Kevin's Slider
    config, // An object containing the configuration
    presetType, // null, "user", or "base"
    // If not a preset, what uiTypeColId + paramInfoId is this uiType associated with?
    originInfoId,
    // If a section produces a uiType meant for its children, set this to true.
    isForChildOfOriginInfoId,
  };
}
