import React from "react";
import { useSectionHasMultipleEVCols } from "state/hooks/sections";
import { useOverflow, useParamsDidUpdate } from "state/hooks/sectionSizes";
import { GetParamSwitch } from "./GetParamSwitch";

function _ParamGroupContainer({ sectionId, objInfoId }) {
  const { overflow, ref, setDidUpdate } = useOverflow(sectionId);

  const hasVersions = useSectionHasMultipleEVCols(sectionId);

  return (
    <div
      className={`section-args-list section-w-full section-row-main grid auto-rows-min grid-cols-subgrid gap-y-1 py-1 ${overflow ? "nowheel overflow-x-clip overflow-y-scroll" : ""} ${hasVersions ? "last:[&>div]:mb-12" : ""} min-w-0 !max-w-full`}
      ref={ref}
    >
      <GetParams
        sectionId={sectionId}
        objInfoId={objInfoId}
        setDidUpdate={setDidUpdate}
      />
    </div>
    // </ScrollingArea>
  );
}

function GetParams({ sectionId, objInfoId, setDidUpdate }) {
  const params = useParamsDidUpdate({ sectionId, setDidUpdate });

  return (
    <GetParamSwitch
      sectionId={sectionId}
      parentId={objInfoId}
      infos={params}
      setDidUpdate={setDidUpdate}
    />
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);
