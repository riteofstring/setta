import { useGetParamInfos } from "hooks/useSectionContents";
import { useSectionHasMultipleEVCols } from "hooks/useSectionInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import React, { useEffect, useRef, useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { GetParamSwitch } from "./ParamSwitch/GetParamSwitch";

function _ParamGroupContainer({ sectionId, objInfoId }) {
  // const { overflow, ref, setDidUpdate } = useOverflow(sectionId);

  const hasVersions = useSectionHasMultipleEVCols(sectionId);

  // border-b border-solid border-runcoder-100
  return (
    // <ScrollingArea
    //   styles={`card-args-list py-1 ${noWheel} ${
    //     hasVersions ? "last:[&>div]:mb-12" : ""
    //   }`}
    //   ref={ref}
    // >
    <div
      className={`card-args-list py-1 overflow-y-scroll`}
      // ref={ref}
    >
      <GetParams
        sectionId={sectionId}
        objInfoId={objInfoId}
        // setDidUpdate={setDidUpdate}
      />
    </div>
    // </ScrollingArea>
  );
}

function GetParams({ sectionId, objInfoId, setDidUpdate }) {
  const params = useGetParamInfos(sectionId);

  useDeepCompareEffect(() => {
    // setDidUpdate(true);
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

function useOverflow(sectionId) {
  const ref = useRef();
  const height = useSectionInfos((x) => x.x[sectionId].size.height);
  const [didUpdate, setDidUpdate] = useState(false);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    setDidUpdate(false);
    setOverflow(ref.current.scrollHeight > ref.current.clientHeight);
  }, [didUpdate, height]);

  return { overflow, ref, setDidUpdate };
}
