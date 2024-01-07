import { useGetSectionInfo } from "hooks/useSectionInfo";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useSetCurrInfoView } from "models/info/infoView";
import { useTypeErrors } from "models/typeErrors";
import React from "react";
import { paramSelect } from "thunks/keyActivations";
import { updateParams } from "thunks/sections/sectionContents";
import { ParamInput } from "./ParamItems/ParamInput";
import { PinButton } from "./ParamUIs/PinButton/PinButton";

function _ParamContainer({ sectionId, paramInfo, isKwarg, children }) {
  const sectionIsFrozen = useGetSectionInfo(sectionId, "isFrozen");
  const infoViewHandlers = useSetCurrInfoView(paramInfo.description);
  const maybeErrorMessage = useTypeErrors((x) => x[sectionId]?.[paramInfo.id]);
  const border = maybeErrorMessage ? "border-red-600 border-2" : "";
  const canBeOverriden = sectionIsFrozen && !paramInfo.isFrozen;
  const paramIsSelected = paramInfo.isSelected;

  const bg = paramIsSelected
    ? "bg-runcoder-300/20 dark:bg-runcoder-950/50"
    : "hover:bg-runcoder-200/20 dark:hover:bg-runcoder-700/25";

  return (
    <article
      className={`card-arg-group group/arg-group -mx-2 -my-1 items-center justify-between rounded-lg py-1 px-2 ${bg} ${border}`}
      {...infoViewHandlers}
      onClick={(e) => onClick(e, sectionId, paramInfo.id)}
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

function onClick(e, sectionId, paramInfoId) {
  if (paramSelect(e)) {
    useCodeInfo.getState().toggleSelected(paramInfoId);
    updateParams(sectionId);
  }
}
