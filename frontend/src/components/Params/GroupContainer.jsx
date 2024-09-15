import { ResizableWithScale } from "components/Utils/Resizable/ResizableWithScale";
import { getNewSize, SIZE_MODE } from "components/Utils/Resizable/utils";
import React, { useEffect, useRef, useState } from "react";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useParametersRequestWaitingForLSPResult } from "state/hooks/lsp";
import { useParamIdsToShowInArea } from "state/hooks/sectionContents";
import { useGetSectionInfo } from "state/hooks/sections";
import { useOverflow } from "state/hooks/sectionSizes";
import { PINNED_PARAMS_AREA_MIN_HEIGHT } from "utils/constants";
import { GetParamSwitch } from "./GetParamSwitch";

function _ParamGroupContainer({ sectionId }) {
  const { overflow, ref, setDidUpdate } = useOverflow(sectionId);
  const outerRef = useRef();

  const waitingForResult = useParametersRequestWaitingForLSPResult(sectionId);
  const hideUnpinnedParams = useGetSectionInfo(sectionId, "hideUnpinnedParams");

  return (
    <>
      {waitingForResult ? (
        <i className="section-args gg-spinner !scale-100 place-self-center before:!border-t-blue-500 after:!border-blue-500" />
      ) : (
        <div
          className="section-w-full section-row-pin-main -mt-3 flex flex-col overflow-y-hidden pt-2"
          ref={outerRef}
        >
          <GetPinnedParams
            sectionId={sectionId}
            setDidUpdate={setDidUpdate}
            outerRef={outerRef}
          />
          <div
            className={`section-args-nested section-w-full section-row-main grid auto-rows-min grid-cols-subgrid gap-y-1 overflow-x-clip overflow-y-scroll py-2 ${overflow ? "nowheel" : ""} min-w-0 !max-w-full`}
            ref={ref}
          >
            {!hideUnpinnedParams && (
              <GetParams sectionId={sectionId} setDidUpdate={setDidUpdate} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function GetPinnedParams({ sectionId, setDidUpdate, outerRef }) {
  const { requiredParamIds, topLevelParamIds } = useParamIdsToShowInArea(
    sectionId,
    true,
  );

  // const paramIds = useParamsDidUpdate({
  //   sectionId,
  //   setDidUpdate,
  //   isPinned: true,
  // });

  return (
    topLevelParamIds.length > 0 && (
      <ResizablePinnedArea
        sectionId={sectionId}
        topLevelParamIds={topLevelParamIds}
        requiredParamIds={requiredParamIds}
        setDidUpdate={setDidUpdate}
        outerRef={outerRef}
      />
    )
  );
}

function ResizablePinnedArea({
  sectionId,
  topLevelParamIds,
  requiredParamIds,
  setDidUpdate,
  outerRef,
}) {
  const height = useGetSectionInfo(sectionId, "pinnedAreaHeight");
  const [initialMaxHeight, setInitialMaxHeight] = useState(100000);

  function onResizeStop(...props) {
    const { height } = getNewSize({
      props,
      minHeight: "auto",
      sizeMode: { height: SIZE_MODE.any },
    });
    setSectionInfoAttr({ sectionId, attr: "pinnedAreaHeight", value: height });
  }

  useEffect(() => {
    setInitialMaxHeight(outerRef.current.clientHeight);
  }, []);

  const maxHeight = outerRef.current?.clientHeight ?? initialMaxHeight;

  return (
    <ResizableWithScale
      handleWrapperClass="nodrag"
      className="nowheel items-startjustify-between bg- relative -mt-1 flex max-h-[50%] flex-col overflow-hidden border-b border-white bg-sky-100 pb-3 pt-4 shadow-sm dark:border-setta-700/30 dark:bg-blue-900/30"
      as="section"
      size={{ height }}
      onResizeStop={onResizeStop}
      minHeight={`${PINNED_PARAMS_AREA_MIN_HEIGHT}px`}
      maxHeight={`${maxHeight}px`}
      enable={{
        top: false,
        left: false,
        bottom: true,
        right: false,
        topRight: false,
        bottomRight: false,
        topLeft: false,
        bottomLeft: false,
      }}
    >
      <header className="flex w-full gap-2 px-2">
        <i className="gg-pin-alt scale-25 ml-1 mr-[0.1rem] mt-[0.3rem] text-setta-300 after:text-setta-300 dark:text-setta-500 dark:after:text-setta-500" />
        <p className=" text-[0.5rem] font-bold uppercase text-setta-300 dark:text-setta-500">
          Pinned Params
        </p>
      </header>

      <div className="section-args-nested section-key-value section-min-rows grid w-full grid-cols-subgrid gap-y-1 overflow-y-scroll">
        <GetParamSwitch
          sectionId={sectionId}
          paramIds={topLevelParamIds}
          requiredParamIds={requiredParamIds}
          setDidUpdate={setDidUpdate}
        />
      </div>
    </ResizableWithScale>
  );
}

function GetParams({ sectionId, setDidUpdate }) {
  // const paramIds = useParamsDidUpdate({
  //   sectionId,
  //   setDidUpdate,
  //   isPinned: false,
  // });

  const { requiredParamIds, topLevelParamIds } = useParamIdsToShowInArea(
    sectionId,
    false,
  );

  return (
    <GetParamSwitch
      sectionId={sectionId}
      paramIds={topLevelParamIds}
      requiredParamIds={requiredParamIds}
      setDidUpdate={setDidUpdate}
    />
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);
