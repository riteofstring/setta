import { useGetParamInfos } from "hooks/useSectionContents";
import { useSectionHasMultipleEVCols } from "hooks/useSectionInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import React, { useEffect, useRef, useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { GetParamSwitch } from "./ParamSwitch/GetParamSwitch";

function _ParamGroupContainer({ sectionId, objInfoId }) {
  const { overflow, ref, setDidUpdate } = useOverflow(sectionId);

  const hasVersions = useSectionHasMultipleEVCols(sectionId);

  // border-b border-solid border-setta-100
  return (
    // <ScrollingArea
    //   styles={`card-args-list py-1 ${noWheel} ${
    //     hasVersions ? "last:[&>div]:mb-12" : ""
    //   }`}
    //   ref={ref}
    // >
    <div
      className={`card-args-list py-1 ${overflow ? "nowheel overflow-y-scroll" : ""} ${hasVersions ? "last:[&>div]:mb-12" : ""}`}
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

function useOverflow(sectionId) {
  const ref = useRef();
  const resizeEvent = useSectionInfos((x) => x.x[sectionId].resizeEvent);
  const [didUpdate, setDidUpdate] = useState(false);
  const [overflow, setOverflow] = useState(false);

  // Add overflow whenever resizing.
  // Add the end of resizing, compare scrollHeight to clientHeight and remove overflow if scrollHeight <= clientHeight
  useEffect(() => {
    if (resizeEvent === "start") {
      setOverflow(true);
    } else if (resizeEvent === "end") {
      setOverflow(ref.current.scrollHeight > ref.current.clientHeight);
    }
  }, [resizeEvent]);

  // If params update (didUpdate goes from false->true), overflow may be needed. So set overflow to true
  // Then set didUpdate to false.
  // Then detect didUpdate going from true->false and check if overflow is actually needed
  // TODO: find better way to do this?
  useEffect(() => {
    if (didUpdate) {
      setOverflow(true);
      setDidUpdate(false);
    } else {
      setOverflow(ref.current.scrollHeight > ref.current.clientHeight);
    }
  }, [didUpdate]);

  return { overflow, ref, setDidUpdate };
}
