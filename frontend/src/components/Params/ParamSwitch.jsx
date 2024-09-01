import _ from "lodash";
import React from "react";
import { KwargParam } from "./KwargParam";
import { RegularParam } from "./RegularParam";

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
    p.paramInfo.isSelected === n.paramInfo.isSelected &&
    p.paramInfo.name === n.paramInfo.name &&
    _.isEqual(p.paramInfo.children, n.paramInfo.children),
);
