import { SET_FROM_SIDEPANE } from "utils/constants";
import { maybeNewId } from "utils/utils";
import { MutableInfo } from "./mutableInfo";

export class UIType extends MutableInfo {
  constructor({
    id,
    type,
    name = "",
    ownerId = null,
    config = {},
    origin = SET_FROM_SIDEPANE,
    presetType = null,
    originInfoId = {},
    isForChildOfOriginInfoId = false,
  }) {
    super();
    this.id = maybeNewId(id);
    this.type = type; // SLIDER, TEXT, etc...
    this.name = name; // The display name, e.g. Kevin's Slider
    this.ownerId = ownerId;
    this.config = config; // An object containing the configuration
    this.origin = origin; // Where this uiType was created (sidepane, global settings etc.)
    this.presetType = presetType; // null, "user", or "base"
    // If not a preset, what uiTypeColId + paramInfoId is this uiType associated with?
    this.originInfoId = originInfoId;
    // If a section produces a uiType meant for its children, set this to true.
    this.isForChildOfOriginInfoId = isForChildOfOriginInfoId;
  }
}
