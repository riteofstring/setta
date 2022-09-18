import { SET_FROM_SIDEPANE } from "utils/constants";
import { maybeNewId } from "utils/utils";

import { MutableInfo } from "./mutableInfo";

export class UIType extends MutableInfo {
  constructor({
    id,
    type,
    name = "",
    config = {},
    origin = SET_FROM_SIDEPANE,
    isPreset = false,
    isBasePreset = false,
    originInfoId = {},
    isForChildOfOriginInfoId = false,
  }) {
    super();
    this.id = maybeNewId(id);
    this.type = type; // SLIDER, TEXT, etc...
    this.name = name; // The display name, e.g. Kevin's Slider
    this.config = config; // An object containing the configuration
    this.origin = origin; // Where this uiType was created (sidepane, global settings etc.)
    this.isPreset = isPreset; // For when the user explicitly saves a ui type.
    this.isBasePreset = isBasePreset; // For the base types that we provide. They have no config.
    // If not a preset, what uiTypeCollectionId + paramInfoId is this uiType associated with?
    this.originInfoId = originInfoId;
    // If a section produces a uiType meant for its children, set this to true.
    this.isForChildOfOriginInfoId = isForChildOfOriginInfoId;
    this.exportable = ["id", "name", "config"];
  }
}
