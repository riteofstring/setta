import React from "react";
import { useSectionInfos } from "state/definitions";
import { KwargParam } from "./KwargParam";
import { RegularParam } from "./RegularParam";

function _ParamSwitch(props) {
  const isKwarg = useSectionInfos(
    (x) => x.codeInfo[props.paramInfoId].editable,
  );
  return isKwarg ? <KwargParam {...props} /> : <RegularParam {...props} />;
}

export const ParamSwitch = React.memo(_ParamSwitch);
