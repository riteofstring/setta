import _ from "lodash";
import { useSetCurrInfoView } from "models/info/infoView";
import { useTypeErrors } from "models/typeErrors";
import React from "react";
import { ParamInput } from "./ParamItems/ParamInput";

function _ParamContainer({ sectionId, paramInfo, uiType, isKwarg, children }) {
  const infoViewHandlers = useSetCurrInfoView(paramInfo.id);
  const maybeErrorMessage = useTypeErrors((x) => x[sectionId]?.[paramInfo.id]);
  const border = maybeErrorMessage ? "border-red-600 border-2" : "";

  return (
    <div
      className={`flex ${
        isKwarg ? "ml-0 mr-6 flex-grow gap-4" : "mx-6 flex-1 gap-4"
      }  min-h-[36px] items-center justify-between rounded-full px-3 py-[0.33rem] hover:bg-[#cbd5e02b] [&>*]:flex-1 ${border}`}
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
