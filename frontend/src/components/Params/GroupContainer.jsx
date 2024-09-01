import React from "react";
import { useParametersRequestWaitingForLSPResult } from "state/hooks/lsp";
import { useTopLevelParamInfos } from "state/hooks/sectionContents";
import {
  useGetSectionInfo,
  useSectionHasMultipleVariants,
} from "state/hooks/sections";
import { useOverflow } from "state/hooks/sectionSizes";
import { GetParamSwitch } from "./GetParamSwitch";

function _ParamGroupContainer({ sectionId, objInfoId }) {
  const { nowheel, ref } = useOverflow(sectionId);

  const hasVersions = useSectionHasMultipleVariants(sectionId);
  const waitingForResult = useParametersRequestWaitingForLSPResult(sectionId);
  const hideUnpinnedParams = useGetSectionInfo(sectionId, "hideUnpinnedParams");

  return (
    <div
      className={`section-args-list section-w-full section-row-main grid auto-rows-min grid-cols-subgrid gap-y-1 overflow-x-clip overflow-y-scroll py-1 ${nowheel ? "nowheel" : ""} ${hasVersions ? "last:[&>div]:mb-12" : ""} min-w-0 !max-w-full`}
      ref={ref}
    >
      {waitingForResult ? (
        <i className="section-args gg-spinner !scale-100 place-self-center before:!border-t-blue-500 after:!border-blue-500" />
      ) : (
        <>
          <GetPinnedParams sectionId={sectionId} objInfoId={objInfoId} />
          {!hideUnpinnedParams && (
            <GetParams sectionId={sectionId} objInfoId={objInfoId} />
          )}
        </>
      )}
    </div>
    // </ScrollingArea>
  );
}

function GetPinnedParams({ sectionId, objInfoId }) {
  const params = useTopLevelParamInfos(sectionId, true);

  return (
    <GetParamSwitch sectionId={sectionId} parentId={objInfoId} infos={params} />
  );
}

function GetParams({ sectionId, objInfoId }) {
  const params = useTopLevelParamInfos(sectionId, false);

  return (
    <GetParamSwitch sectionId={sectionId} parentId={objInfoId} infos={params} />
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);
