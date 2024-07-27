import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import React from "react";
import { paramSelect } from "thunks/keyActivations";
import { updateParams } from "thunks/sections/sectionContents";
import { KwargParam } from "./ParamSwitchOptions/KwargParam";
import { RegularParam } from "./ParamSwitchOptions/RegularParam";

function _ParamSwitch(props) {
  function onNameClick(e) {
    if (paramSelect(e)) {
      useCodeInfo.getState().toggleSelected(props.paramInfo.id);
      updateParams(props.sectionId);
    }
  }

  return props.isKwarg ? (
    <KwargParam {...props} onNameClick={onNameClick} />
  ) : (
    <RegularParam {...props} onNameClick={onNameClick} />
  );
}

export const ParamSwitch = React.memo(
  _ParamSwitch,
  (p, n) =>
    p.paramInfo.id === n.paramInfo.id &&
    p.paramInfo.isFrozen === n.paramInfo.isFrozen &&
    p.paramInfo.isSelected === n.paramInfo.isSelected &&
    _.isEqual(p.paramInfo.children, n.paramInfo.children),
);
