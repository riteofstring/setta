import { useAreAllParamsNested } from "hooks/useParamUIType";
import { useGetKwargInfos, useGetParamInfos } from "hooks/useSectionContents";
import React from "react";
import { KwargsControls } from "../KwargsControls/KwargsControls";
import { GetParamSwitch } from "./ParamSwitch/GetParamSwitch";

function _ParamGroupContainer({ sectionId, objInfoId }) {
  const infos = useGetParamInfos(sectionId, objInfoId);
  return (
    <>
      <div className="flex flex-col gap-2 overflow-y-auto min-h-[36px]">
        <GetParamSwitch
          sectionId={sectionId}
          objInfoId={objInfoId}
          infos={infos}
          isKwarg={false}
        />
      </div>
      <KwargsControls sectionId={sectionId} objInfoId={objInfoId} />
    </>
  );
}

function _KwargGroupContainer({ sectionId, objInfoId }) {
  const infos = useGetKwargInfos(sectionId, objInfoId);
  const allAreNested = useAreAllParamsNested(sectionId, infos);
  const kwargsStyleCondition = infos.length > 0 && !allAreNested;

  return (
    <div className={kwargsStyleCondition ? "py-4 mx-3" : ""}>
      <GetParamSwitch
        sectionId={sectionId}
        objInfoId={objInfoId}
        infos={infos}
        isKwarg={true}
        allAreNested={allAreNested}
      />
    </div>
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);
export const KwargGroupContainer = React.memo(_KwargGroupContainer);
