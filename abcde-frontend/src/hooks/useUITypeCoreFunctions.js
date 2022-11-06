import _ from "lodash";
import { SECTION_TYPE_NAMES, SET_FROM_SIDEPANE } from "utils/constants";
import { createNewId } from "utils/utils";

export function cloneNewUIType({
  uiType,
  name = "",
  config,
  origin = SET_FROM_SIDEPANE,
  presetType = null,
  originInfoId,
  isForChildOfOriginInfoId = false,
}) {
  const newUIType = _.cloneDeep(uiType);
  newUIType.id = createNewId();
  newUIType.name = name;
  newUIType.origin = origin;
  newUIType.presetType = presetType;
  newUIType.originInfoId = originInfoId;
  if (!_.isNil(config)) {
    newUIType.config = config;
    if (SECTION_TYPE_NAMES.includes(newUIType.type)) {
      newUIType.config.uiTypeColId = createNewId();
    }
  }
  newUIType.isForChildOfOriginInfoId = isForChildOfOriginInfoId;
  return newUIType;
}
