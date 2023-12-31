import _ from "lodash";
import { useSetCurrInfoView } from "models/info/infoView";
import { useTypeErrors } from "models/typeErrors";
import React from "react";
import { ParamInput } from "./ParamItems/ParamInput";

function _ParamContainer({ sectionId, paramInfo, isKwarg, children }) {
  const infoViewHandlers = useSetCurrInfoView(paramInfo.description);
  const maybeErrorMessage = useTypeErrors((x) => x[sectionId]?.[paramInfo.id]);
  const border = maybeErrorMessage ? "border-red-600 border-2" : "";

  return (
    <div
      className={`flex ${
        isKwarg
          ? "ml-0 mr-[0.875rem] flex-grow gap-4"
          : " mr-[0.875rem] ml-6 flex-1 gap-4"
      }  min-h-[36px] items-center justify-between rounded-lg px-1 py-[0.1rem] hover:bg-[#cbd5e02b] dark:hover:bg-runcoder-900/25 [&>*]:flex-1 ${border}`}
      {...infoViewHandlers}
    >
      {children}
      <ParamInput
        sectionId={sectionId}
        paramInfoId={paramInfo.id}
        defaultVal={paramInfo.defaultVal}
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
