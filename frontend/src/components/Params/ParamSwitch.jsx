import _ from "lodash";
import React from "react";
import { toggleCodeInfoSelected } from "state/actions/codeInfo";
import { paramSelect } from "state/actions/keyActivations";
import { updateParams } from "state/actions/sections/sectionContents";
import { KwargParam } from "./KwargParam";
import { RegularParam } from "./RegularParam";

function _ParamSwitch(props) {
  function onNameClick(e) {
    if (paramSelect(e)) {
      toggleCodeInfoSelected(props.paramInfo.id);
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
