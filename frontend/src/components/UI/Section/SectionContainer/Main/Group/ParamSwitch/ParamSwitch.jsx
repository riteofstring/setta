import React from "react";
import { KwargParam } from "./ParamSwitchOptions/KwargParam";
import { RegularParam } from "./ParamSwitchOptions/RegularParam";

function _ParamSwitch(props) {
  return props.isKwarg ? (
    <KwargParam {...props} />
  ) : (
    <RegularParam {...props} />
  );
}

export const ParamSwitch = React.memo(
  _ParamSwitch,
  (p, n) =>
    p.paramInfo.id === n.paramInfo.id &&
    p.paramInfo.isFrozen === n.paramInfo.isFrozen &&
    p.paramInfo.isSelected === n.paramInfo.isSelected,
);
