import _ from "lodash";
import { useSetCurrInfoView } from "models/info/infoView";
import { useTypeErrors } from "models/typeErrors";
import React from "react";
import { ParamInput } from "./ParamItems/ParamInput";
import PinButton from "./ParamUIs/PinButton/PinButton";

function _ParamContainer({ sectionId, paramInfo, isKwarg, children }) {
  const infoViewHandlers = useSetCurrInfoView(paramInfo.description);
  const maybeErrorMessage = useTypeErrors((x) => x[sectionId]?.[paramInfo.id]);
  const border = maybeErrorMessage ? "border-red-600 border-2" : "";
  const isFrozenStyle = paramInfo.isFrozen ? "bg-black" : "";

  return (
    <article
      className={`card-arg-group group/arg-group -mx-2 -my-1 items-center justify-between rounded-lg py-1  px-2  hover:bg-runcoder-200/20 dark:hover:bg-runcoder-700/25  ${border} ${isFrozenStyle}`}
      {...infoViewHandlers}
    >
      {children}
      <ParamInput
        sectionId={sectionId}
        paramInfoId={paramInfo.id}
        defaultVal={paramInfo.defaultVal}
        isDisabled={!paramInfo.name}
      />
      <PinButton
        sectionId={sectionId}
        paramInfoId={paramInfo.id}
        variants="justify-self-end self-center"
      />
    </article>
  );
}

export const ParamContainer = React.memo(
  _ParamContainer,
  (p, n) =>
    p.sectionId === n.sectionId &&
    _.isEqual(p.paramInfo, n.paramInfo) &&
    _.isEqual(p.uiType, n.uiType)
);
