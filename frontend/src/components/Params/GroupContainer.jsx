import React from "react";
import { useGetParamInfos } from "state/hooks/sectionContents";
import { useSectionHasMultipleEVCols } from "state/hooks/sections";
import { useOverflow } from "state/hooks/sectionSizes";
import useDeepCompareEffect from "use-deep-compare-effect";
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
  const params = useGetParamInfos(sectionId);

  useDeepCompareEffect(() => {
    setDidUpdate(true);
  }, [params]);

  return (
    <GetParamSwitch sectionId={sectionId} parentId={objInfoId} infos={params} />
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);
