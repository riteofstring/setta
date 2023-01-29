import _ from "lodash";
import React from "react";
import { ParamInput } from "./ParamItems/ParamInput";

function _ParamContainer({ sectionId, paramInfo, uiType, isKwarg, children }) {
  return (
    <div
      className={`flex ${
        isKwarg ? "flex-grow" : ""
      } min-h-[36px] items-center justify-between rounded-full px-3 py-[0.33rem] hover:bg-[#cbd5e02b]`}
    >
      {children}
      <ParamInput
        sectionId={sectionId}
        paramInfoId={paramInfo.id}
        defaultVal={paramInfo.defaultVal}
        uiType={uiType}
        isDisabled={!paramInfo.name}
      />
    </div>
  );
}

export const ParamContainer = React.memo(
  _ParamContainer,
  (p, n) =>
    p.sectionId === n.sectionId &&
    _.isEqual(p.paramInfo, n.paramInfo) &&
    _.isEqual(p.uiType, n.uiType)
);
