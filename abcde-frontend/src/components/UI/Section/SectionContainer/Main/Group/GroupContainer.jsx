import { useGetKwargInfos, useGetParamInfos } from "hooks/useSectionContents";
import React from "react";
import { GetParamSwitch } from "./ParamSwitch/GetParamSwitch";

function _ParamGroupContainer({ sectionId, objInfoId }) {
  const params = useGetParamInfos(sectionId, objInfoId);
  const kwargs = useGetKwargInfos(sectionId, objInfoId);
  return (
    (!!params.length || !!kwargs.length) && (
      <div className="flex flex-col gap-2 overflow-y-auto">
        <GetParamSwitch
          sectionId={sectionId}
          objInfoId={objInfoId}
          params={params}
          kwargs={kwargs}
        />
      </div>
    )
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);
