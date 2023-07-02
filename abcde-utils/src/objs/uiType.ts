import { UITypeType } from "../types/uiType";
import { maybeNewId } from "../utils";

export function newUIType({
  id,
  type,
  name = "",
  config = {},
  presetType = null,
}: UITypeType): UITypeType {
  return {
    id: maybeNewId(id),
    type, // SLIDER, TEXT, etc...
    name, // The display name, e.g. Kevin's Slider
    config, // An object containing the configuration
    presetType, // null, "user", or "base"
  };
}
