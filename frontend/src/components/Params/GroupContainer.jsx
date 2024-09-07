import React from "react";
import { useParametersRequestWaitingForLSPResult } from "state/hooks/lsp";
import { useGetSectionInfo } from "state/hooks/sections";
import { useOverflow, useParamsDidUpdate } from "state/hooks/sectionSizes";
import { GetParamSwitch } from "./GetParamSwitch";

function _ParamGroupContainer({ sectionId, objInfoId }) {
  const { overflow, ref, setDidUpdate } = useOverflow(sectionId);

  const waitingForResult = useParametersRequestWaitingForLSPResult(sectionId);
  const hideUnpinnedParams = useGetSectionInfo(sectionId, "hideUnpinnedParams");

  return (
    <>
      {waitingForResult ? (
        <i className="section-args gg-spinner !scale-100 place-self-center before:!border-t-blue-500 after:!border-blue-500" />
      ) : (
        <div className="section-w-full section-row-pin-main -mt-3 flex flex-col overflow-y-hidden pt-2">
          <GetPinnedParams
            sectionId={sectionId}
            objInfoId={objInfoId}
            setDidUpdate={setDidUpdate}
          />
          <div
            className={`section-args-nested section-w-full section-row-main grid auto-rows-min grid-cols-subgrid gap-y-1 overflow-x-clip overflow-y-scroll py-1 ${overflow ? "nowheel" : ""} min-w-0 !max-w-full`}
            ref={ref}
          >
            {!hideUnpinnedParams && (
              <GetParams
                sectionId={sectionId}
                objInfoId={objInfoId}
                setDidUpdate={setDidUpdate}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function GetPinnedParams({ sectionId, objInfoId, setDidUpdate }) {
  const params = useParamsDidUpdate({
    sectionId,
    setDidUpdate,
    isPinned: true,
  });

  return (
    <section className="nowheel relative -mt-1 flex h-min max-h-[50%] flex-col items-center justify-between overflow-hidden border-b border-setta-200/50 pb-3 pt-4 dark:border-setta-700/30 dark:bg-setta-700/40">
      <header className="flex w-full gap-2 px-2">
        <i className="gg-pin-alt scale-25 ml-1 mr-[0.1rem] mt-[0.3rem] text-setta-300 after:text-setta-300 dark:text-setta-500 dark:after:text-setta-500" />
        <p className=" text-[0.5rem] font-bold uppercase text-setta-300 dark:text-setta-500">
          Pinned Params
        </p>
      </header>

      <div className="section-args-nested section-key-value grid w-full grid-cols-subgrid overflow-y-scroll">
        <GetParamSwitch
          sectionId={sectionId}
          parentId={objInfoId}
          infos={params}
          setDidUpdate={setDidUpdate}
        />
      </div>
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
