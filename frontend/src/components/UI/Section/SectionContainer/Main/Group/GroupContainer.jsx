import { useGetParamInfos } from "hooks/useSectionContents";
import { useSectionHasDescription } from "hooks/useSectionDescription";
import { useSectionInfos } from "models/info/sectionInfos";
import React, { useEffect, useRef, useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { ScrollingArea } from "utils/atoms/scrollingarea/scrollingarea";
import { GetParamSwitch } from "./ParamSwitch/GetParamSwitch";

function _ParamGroupContainer({ sectionId, objInfoId, isGroup = false }) {
  const { noWheel, ref, setDidUpdate } = useNoWheel(sectionId);

  const hasDescription = useSectionHasDescription(sectionId);

  // border-b border-solid border-slate-100
  return (
    <ScrollingArea
      styles={`card-args-list ${noWheel} ${
        hasDescription ? "last:[&>div]:mb-12" : ""
      }`}
      ref={ref}
    >
      {isGroup && (
        <p className="ml-7 mr-2 flex justify-center border-b-2 border-solid border-slate-200 px-2 pt-4 font-heading text-xs font-medium uppercase tracking-widest text-slate-400 ">
          Group 1
        </p>
      )}
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
