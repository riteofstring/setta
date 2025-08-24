import { GetParamSwitch } from "components/Params/GetParamSwitch";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import React, { useEffect, useRef } from "react";
import { BiError } from "react-icons/bi";
import { openTypeErrorContextMenu } from "state/actions/contextMenus";
import {
  getCodeObjCore,
  getCurrEffectiveCodeObjImpl,
} from "state/actions/sectionInfos";
import { useProjectState, useSectionColumnWidth } from "state/definitions";
import { ParamInput } from "./ParamItems/ParamInput";
import { ResizeHandle } from "./ResizeHandle";

function _ParamContainer({
  sectionId,
  paramInfoId,
  requiredParamIdsToPaths,
  children,
  onResizeStart,
  isKwarg,
  isNestedParam,
  isTopLevelWithPad,
  paramChildren,
  onMouseDown,
  maybeErrorMessage,
  border,
  bg,
}) {
  const { description: paramDescription, name: paramName } = useProjectState(
    (x) => {
      const codeObjImpl = getCurrEffectiveCodeObjImpl(
        x,
        sectionId,
        paramInfoId,
      );
      return {
        description: codeObjImpl.description,
        name: getCodeObjCore(x, paramInfoId).name,
      };
    },
    _.isEqual,
  );

  const { childlessRef, childlessNameRef, parentRef } = useColumnWidth(
    sectionId,
    isNestedParam,
  );

  // TODO: fix quick hacky solution below. shouldn't use !important everywhere.
  const tooltipContentArray = maybeErrorMessage
    ? [
        {
          content: maybeErrorMessage,
          wrapperClassName:
            "!border-red-300 dark:!border-red-900 [&_.tooltip-footer]:!text-red-500 dark:[&_.tooltip-footer]:!text-red-800 dark:[&_.tooltip-footer]:!border-red-950 !bg-red-50/90 dark:!bg-[#120000]/90 [&_.tooltip-copy]:!text-red-400 dark:[&_.tooltip-copy]:!text-red-300 [&>.tooltip-copy]:hover:!bg-transparent",
          contentClassName: "!text-red-700 dark:!text-red-300 font-mono",
        },
        {
          title: paramName,
          content: paramDescription,
        },
      ]
    : [{ title: paramName, content: paramDescription }];

  return !isNestedParam ? (
    <>
      <article
        id={`ParamContainer-${sectionId}-${paramInfoId}`} // used for project-level search results
        className={`section-args-nested-key-value section-key-value group/arg-group section-min-rows grid grid-cols-subgrid items-center justify-between rounded-sm px-[2px] hover:bg-setta-100/50 hover:dark:bg-setta-800/70 ${bg} ${border} `}
        {...getFloatingBoxHandlers(...tooltipContentArray)}
        onMouseDownCapture={onMouseDown} // has to be on capture, otherwise it doesn't get triggered when clicking above DummyCodeMirror when ParamNameInput is taller than DummyCodeMirror
        ref={childlessRef}
      >
        {!isKwarg ? (
          <div className="section-key overflow-hidden" ref={childlessNameRef}>
            {children}
          </div>
        ) : (
          <>{children}</>
        )}
        <ParamInput
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          maybeErrorMessage={maybeErrorMessage}
        />
        <ResizeHandle showResizeHandle={true} onMouseDown={onResizeStart} />
        {!!maybeErrorMessage && <ErrorSection paramInfoId={paramInfoId} />}
      </article>
    </>
  ) : (
    <article
      id={`ParamContainer-${sectionId}-${paramInfoId}`} // used for project-level search results
      className={`section-args-nested section-lg-value group/arg-group section-min-rows [&>p]:section-key-value grid grid-cols-subgrid items-center justify-between gap-y-1 rounded-sm ${isTopLevelWithPad ? "[&>p]:!pb-0 [&>p]:!pt-2" : ""}`}
      {...getFloatingBoxHandlers(...tooltipContentArray)}
      ref={parentRef}
    >
      {children}
      <div className="section-args-nested section-key-value relative grid gap-y-1">
        <div className="absolute bottom-0 h-[calc(100%_-_0.1rem)] w-[0.4rem] rounded-full bg-setta-200/20 dark:bg-setta-400/20" />
        <GetParamSwitch
          sectionId={sectionId}
          paramIds={paramChildren}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={onResizeStart}
        />
      </div>
    </article>
  );
}

export const ParamContainer = React.memo(_ParamContainer);

function useColumnWidth(sectionId, isNestedParam) {
  const childlessRef = useRef();
  const childlessNameRef = useRef();
  const parentRef = useRef();
  useEffect(() => {
    return useSectionColumnWidth.subscribe(
      (state) => state[sectionId],
      (columnWidth) => {
        if (childlessRef.current) {
          // Use a CSS calc() function to provide a fallback
          childlessRef.current.style.gridTemplateColumns = `minmax(min-content, ${columnWidth}px) [c3] 0.75rem [c4] 1fr [c5]`;
        }
        if (parentRef.current) {
          parentRef.current.style.gridTemplateColumns = `[c1] 0.75rem [c2] minmax(min-content, ${columnWidth}px) [c3] 0.75rem [c4] 1fr [c5]`;
        }
        if (childlessNameRef.current) {
          childlessNameRef.current.style.width = `${columnWidth}px`;
        }
      },
      { fireImmediately: true },
    );
  }, [isNestedParam]); // have to update the subscriber when parameter becomes a parent or child

  return { childlessRef, childlessNameRef, parentRef };
}

function ErrorSection({ paramInfoId }) {
  function onContextMenu(e) {
    openTypeErrorContextMenu(e, paramInfoId);
  }

  return (
    <BiError
      className="section-key-value grid-row-start-1 group/ w-45overflow-y-clip ml-auto aspect-square  cursor-help rounded-full bg-red-500/80 px-0.5 pb-0.5 pt-[1px] text-white  peer-focus-within/textinput:text-red-100 peer-focus-within/textinput:!opacity-20 dark:bg-red-700/80 dark:peer-focus-within/textinput:text-red-400"
      onContextMenu={onContextMenu}
    />
  );
}
