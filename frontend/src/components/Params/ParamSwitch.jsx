import React from "react";
import { useCodeInfo } from "state/definitions";
import { KwargParam } from "./KwargParam";
import { RegularParam } from "./RegularParam";

function _ParamSwitch(props) {
  const isKwarg = useCodeInfo((x) => x.x[props.paramInfoId].editable);
  return isKwarg ? <KwargParam {...props} /> : <RegularParam {...props} />;
}

export const ParamSwitch = React.memo(_ParamSwitch);
