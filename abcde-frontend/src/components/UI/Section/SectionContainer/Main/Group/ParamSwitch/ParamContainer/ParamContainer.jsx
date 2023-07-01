import _ from "lodash";
import { useSetCurrInfoView } from "models/info/infoView";
import React from "react";
import { ParamInput } from "./ParamItems/ParamInput";

function _ParamContainer({ sectionId, paramInfo, uiType, isKwarg, children }) {
  const infoViewHandlers = useSetCurrInfoView(paramInfo.id);
  return (
    <div
      className={`flex ${
        isKwarg ? "ml-0 mr-1 flex-grow gap-4" : "ml-6 mr-1 flex-1 gap-4"
      }  min-h-[36px] items-center justify-between rounded-full px-3 py-[0.33rem] hover:bg-[#cbd5e02b] [&>*]:flex-1`}
      {...infoViewHandlers}
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
