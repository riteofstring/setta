import React, { useEffect } from "react";
import { useParametersRequestWaitingForLSPResult } from "state/hooks/lsp";
import { useGetSectionInfo } from "state/hooks/sections";
import { useOverflow, useParamsDidUpdate } from "state/hooks/sectionSizes";
import { createSwapy } from "swapy";
import { GetParamSwitch } from "./GetParamSwitch";

function _ParamGroupContainer({ sectionId, objInfoId }) {
  const { overflow, ref, setDidUpdate } = useOverflow(sectionId);

  const waitingForResult = useParametersRequestWaitingForLSPResult(sectionId);
  const hideUnpinnedParams = useGetSectionInfo(sectionId, "hideUnpinnedParams");

  useEffect(() => {
    if (ref.current) {
      const swapy = createSwapy(ref.current);
      swapy.onSwap(({ data }) => {
        console.log("swapy", data);
      });
    }
  }, []);

  return (
    <div
      className={`section-args-list section-w-full section-row-main grid auto-rows-min grid-cols-subgrid gap-y-1 overflow-x-clip overflow-y-scroll py-1 ${overflow ? "nowheel" : ""} min-w-0 !max-w-full`}
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
    <section className="section-lg-value section-min-rows my-1 -mr-1 ml-2 grid grid-cols-subgrid items-center justify-between rounded-lg border border-setta-200/50 px-2 py-1 dark:border-setta-700/30 dark:bg-setta-700/20">
      <p className="section-key-value w-full text-[0.5rem] font-bold uppercase text-setta-300 dark:text-setta-500">
        Pinned Params
      </p>
      <GetParamSwitch
        sectionId={sectionId}
        parentId={objInfoId}
        infos={params}
        setDidUpdate={setDidUpdate}
      />
    </section>
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
