import { useGetParamInfos } from "hooks/useSectionContents";
import { useSectionHasMultipleEVCols } from "hooks/useSectionInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import React, { useEffect, useRef, useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { ScrollingArea } from "utils/atoms/scrollingarea/scrollingarea";
import { GetParamSwitch } from "./ParamSwitch/GetParamSwitch";

function _ParamGroupContainer({ sectionId, objInfoId }) {
  const { noWheel, ref, setDidUpdate } = useNoWheel(sectionId);

  const hasVersions = useSectionHasMultipleEVCols(sectionId);

  // border-b border-solid border-runcoder-100
  return (
    <ScrollingArea
      styles={`card-args-list py-1 ${noWheel} ${
        hasVersions ? "last:[&>div]:mb-12" : ""
      }`}
      ref={ref}
    >
      <GetParams
        sectionId={sectionId}
        objInfoId={objInfoId}
        setDidUpdate={setDidUpdate}
      />
    </ScrollingArea>
  );
}

function GetParams({ sectionId, objInfoId, setDidUpdate }) {
  const params = useGetParamInfos(sectionId);

  useDeepCompareEffect(() => {
    setDidUpdate(true);
  }, [params]);

  return (
    <GetParamSwitch
      sectionId={sectionId}
      objInfoId={objInfoId}
      infos={params}
    />
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);

function useNoWheel(sectionId) {
  const ref = useRef();
  const height = useSectionInfos((x) => x.x[sectionId].size.height);
  const [didUpdate, setDidUpdate] = useState(false);
  const [noWheel, setNoWheel] = useState("");

  useEffect(() => {
    setDidUpdate(false);
    setNoWheel(
      ref.current.scrollHeight > ref.current.clientHeight ? "nowheel" : ""
    );
  }, [didUpdate, height]);

  return { noWheel, ref, setDidUpdate };
}
