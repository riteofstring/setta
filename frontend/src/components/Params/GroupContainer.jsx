import React from "react";
import { useParametersRequestWaitingForLSPResult } from "state/hooks/lsp";
import {
  useGetSectionInfo,
  useSectionHasMultipleVariants,
} from "state/hooks/sections";
import { useOverflow, useParamsDidUpdate } from "state/hooks/sectionSizes";
import { GetParamSwitch } from "./GetParamSwitch";

function _ParamGroupContainer({ sectionId, objInfoId }) {
  const { overflow, ref, setDidUpdate } = useOverflow(sectionId);

  const hasVersions = useSectionHasMultipleVariants(sectionId);
  const waitingForResult = useParametersRequestWaitingForLSPResult(sectionId);
  const hideUnpinnedParams = useGetSectionInfo(sectionId, "hideUnpinnedParams");

  return (
    <div
      className={`section-args-list section-w-full section-row-main grid auto-rows-min grid-cols-subgrid gap-y-1 py-1 ${overflow ? "nowheel overflow-x-clip overflow-y-scroll" : ""} ${hasVersions ? "last:[&>div]:mb-12" : ""} min-w-0 !max-w-full`}
      ref={ref}
    >
      {waitingForResult ? (
        <i className="section-args gg-spinner !scale-100 place-self-center before:!border-t-blue-500 after:!border-blue-500" />
      ) : (
        <>
          <GetPinnedParams
            sectionId={sectionId}
            objInfoId={objInfoId}
            setDidUpdate={setDidUpdate}
          />
          {!hideUnpinnedParams && (
            <GetParams
              sectionId={sectionId}
              objInfoId={objInfoId}
              setDidUpdate={setDidUpdate}
            />
          )}
        </>
      )}
    </div>
    // </ScrollingArea>
  );
}

function GetPinnedParams({ sectionId, objInfoId, setDidUpdate }) {
  const params = useParamsDidUpdate({
    sectionId,
    setDidUpdate,
    isPinned: true,
  });

  return (
    <GetParamSwitch
      sectionId={sectionId}
      parentId={objInfoId}
      infos={params}
      setDidUpdate={setDidUpdate}
    />
  );
}

function GetParams({ sectionId, objInfoId, setDidUpdate }) {
  const params = useParamsDidUpdate({
    sectionId,
    setDidUpdate,
    isPinned: false,
  });

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
