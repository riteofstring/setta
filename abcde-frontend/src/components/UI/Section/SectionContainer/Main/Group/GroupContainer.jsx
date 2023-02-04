import { useAreAllParamsNested } from "hooks/useParamUIType";
import { useGetKwargInfos, useGetParamInfos } from "hooks/useSectionContents";
import React from "react";
import { KwargsControls } from "../KwargsControls/KwargsControls";
import { GetParamSwitch } from "./ParamSwitch/GetParamSwitch";

function _ParamGroupContainer({ sectionId, objInfoId }) {
  const infos = useGetParamInfos(sectionId, objInfoId);
  return (
    <>
      {!!infos.length && (
        <div className="flex flex-col gap-2 overflow-y-auto">
          <GetParamSwitch
            sectionId={sectionId}
            objInfoId={objInfoId}
            infos={infos}
            isKwarg={false}
          />
        </div>
      )}
    </>
  );
}

function _KwargGroupContainer({ sectionId, objInfoId }) {
  const infos = useGetKwargInfos(sectionId, objInfoId);
  const allAreNested = useAreAllParamsNested(sectionId, infos);
  const kwargsStyleCondition = infos.length > 0 && !allAreNested;

  return (
    <div className="section-full-width flex flex-grow flex-col justify-end">
      <div className="border-t border-white bg-gradient-to-b from-white px-6 pt-4 shadow-inner">
        {/* <span className="mb-4 h-1 rounded-full bg-slate-200" /> */}
        <KwargsControls sectionId={sectionId} objInfoId={objInfoId} />
        <GetParamSwitch
          sectionId={sectionId}
          objInfoId={objInfoId}
          infos={infos}
          isKwarg={true}
        />
      </div>
    </div>
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);
export const KwargGroupContainer = React.memo(_KwargGroupContainer);
