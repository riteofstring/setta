import { useGetKwargInfos, useGetParamInfos } from "hooks/useSectionContents";
import React from "react";
import { GetParamSwitch } from "./ParamSwitch/GetParamSwitch";

function _ParamGroupContainer({ sectionId, objInfoId, isGroup = false }) {
  // border-b border-solid border-slate-100
  return (
    <div className="mr-6 flex flex-col gap-2 overflow-y-auto">
      {isGroup && (
        <h3 className="ml-7 mr-2 flex justify-center border-b-2 border-solid border-slate-200 px-2 pt-4 font-heading text-xs font-medium uppercase tracking-widest text-slate-400 ">
          Group 1
        </h3>
      )}
      <GetParams sectionId={sectionId} objInfoId={objInfoId} />
      <GetKwargs sectionId={sectionId} objInfoId={objInfoId} />
    </div>
  );
}

function GetParams({ sectionId, objInfoId }) {
  const params = useGetParamInfos(sectionId, objInfoId);
  return (
    <GetParamSwitch
      sectionId={sectionId}
      objInfoId={objInfoId}
      infos={params}
      isKwarg={false}
    />
  );
}

function GetKwargs({ sectionId, objInfoId }) {
  const kwargs = useGetKwargInfos(sectionId, objInfoId);
  return (
    <GetParamSwitch
      sectionId={sectionId}
      objInfoId={objInfoId}
      infos={kwargs}
      isKwarg={true}
    />
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);
