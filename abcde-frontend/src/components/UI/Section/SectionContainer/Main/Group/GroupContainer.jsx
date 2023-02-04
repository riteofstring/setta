import { useGetKwargInfos, useGetParamInfos } from "hooks/useSectionContents";
import React from "react";
import { GetParamSwitch } from "./ParamSwitch/GetParamSwitch";

function _ParamGroupContainer({ sectionId, objInfoId }) {
  return (
    <div className="flex flex-col gap-2 overflow-y-auto">
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
