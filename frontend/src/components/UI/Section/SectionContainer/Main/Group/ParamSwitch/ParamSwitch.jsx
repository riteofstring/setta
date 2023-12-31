import { useGetParamUIType } from "hooks/useParamUIType";
import React from "react";
import { requiresNestedSection } from "z_utils/constants";
import { KwargParam } from "./ParamSwitchOptions/KwargParam";
import { RegularParam } from "./ParamSwitchOptions/RegularParam";

function _ParamSwitch(props) {
  const { sectionId, paramInfo } = props;
  const uiType = useGetParamUIType(sectionId, paramInfo.id);
  const isNested = requiresNestedSection(uiType.type);

  return (
    !isNested &&
    (props.isKwarg ? (
      <KwargParam {...props} uiType={uiType} />
    ) : (
      <RegularParam {...props} uiType={uiType} />
    ))
  );
}

export const ParamSwitch = React.memo(
  _ParamSwitch,
  (p, n) => p.paramInfo.id === n.paramInfo.id
);
