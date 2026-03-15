import { GetParamSwitch } from "components/Params/GetParamSwitch";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import React from "react";
import { BiError } from "react-icons/bi";
import { openTypeErrorContextMenu } from "state/actions/contextMenus";
import { getCurrEffectiveCodeObjImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { isBaseParamCodeObjImpl } from "utils/generatedTypes";
import { useParamDndChildrenForParent } from "./ParamDndContext";
import { ParamInput } from "./ParamItems/ParamInput";
import {
  getNestedChildRowClassName,
  getNonNestedParamRowClassName,
} from "./paramRowClassNames";
import { ResizeHandle } from "./ResizeHandle";

function _ParamContainer({
  sectionId,
  paramInfoId,
  requiredParamIdsToPaths,
  children,
  onResizeStart,
  isKwarg,
  isNestedParam,
  hasSectionStyleTheme,
  isTopLevelWithPad,
  isNestedChildInTree,
  paramChildren,
  onMouseDown,
  onClick,
  maybeErrorMessage,
  border,
  bg,
  dndAttributes,
  dndListeners,
  dndRef,
  dndStyle,
  dndClassName,
  listKey,
}) {
  const codeObjImpl = useProjectState((x) =>
    getCurrEffectiveCodeObjImpl(x, sectionId, paramInfoId),
  );
  const paramCore = useProjectState((x) => x.codeObjs[paramInfoId]);
  const showParamDisplayNames = useProjectState(
    (x) => x.projectConfig.showParamDisplayNames,
  );
  const paramDescription = codeObjImpl.description;
  const paramName = React.useMemo(() => {
    if (!showParamDisplayNames) {
      return paramCore.name;
    }
    if (isBaseParamCodeObjImpl(codeObjImpl) && codeObjImpl.coreNameEditable) {
      return paramCore.name;
    }
    const trimmedDisplayName = paramCore.displayName.trim();
    if (trimmedDisplayName.length > 0) {
      return paramCore.displayName;
    }
    return paramCore.name;
  }, [
    codeObjImpl,
    paramCore.displayName,
    paramCore.name,
    showParamDisplayNames,
  ]);

  const errorMessage = maybeErrorMessage ?? "";
  const hasError = errorMessage.length > 0;

  // TODO: fix quick hacky solution below. shouldn't use !important everywhere.
  const tooltipContentArray = hasError
    ? [
        {
          content: errorMessage,
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

  const renderChildren = useParamDndChildrenForParent(
    paramInfoId,
    paramChildren,
  );
  const hasChildRows = renderChildren.length > 0;
  const shouldRenderNestedChildSubtrees = hasChildRows;
  const paramHoverClassName = hasSectionStyleTheme
    ? "hover:bg-[color:var(--setta-section-style-border)]"
    : "hover:bg-setta-100/50 hover:dark:bg-setta-800/70";
  const floatingBoxHandlers = getFloatingBoxHandlers(...tooltipContentArray);
  const nestedChildRowClassName =
    getNestedChildRowClassName(isNestedChildInTree);

  if (!isNestedParam) {
    return (
      <article
        id={`ParamContainer-${sectionId}-${paramInfoId}`} // used for project-level search results
        className={getNonNestedParamRowClassName({
          isNestedChildInTree,
          justifyBetween: shouldRenderNestedChildSubtrees,
          gapY: shouldRenderNestedChildSubtrees,
          extraClassName: `group/arg-group ${paramHoverClassName} ${bg} ${border} ${dndClassName ?? ""}`,
        })}
        style={dndStyle}
        data-param-row="true"
        {...floatingBoxHandlers}
        onMouseDownCapture={onMouseDown}
        onClick={onClick}
        ref={dndRef}
        {...(dndAttributes ?? {})}
        {...(dndListeners ?? {})}
        tabIndex={-1}
        role={undefined}
      >
        {children}
        <ParamInput
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          maybeErrorMessage={errorMessage}
        />
        <ResizeHandle showResizeHandle={true} onMouseDown={onResizeStart} />
        {hasError && (
          <ErrorSection sectionId={sectionId} paramInfoId={paramInfoId} />
        )}
        {shouldRenderNestedChildSubtrees && (
          <GetParamSwitch
            sectionId={sectionId}
            paramIds={renderChildren}
            requiredParamIdsToPaths={requiredParamIdsToPaths}
            onResizeStart={onResizeStart}
            listKey={listKey}
            hasSectionStyleTheme={hasSectionStyleTheme}
            isNestedChildInTree={true}
          />
        )}
      </article>
    );
  }
  return (
    <article
      id={`ParamContainer-${sectionId}-${paramInfoId}`} // used for project-level search results
      className={`section-args-nested ${isNestedChildInTree ? "section-key-value" : "section-lg-value"} group/arg-group section-min-rows [&>p]:section-key-value relative grid items-center justify-between gap-y-1 rounded-sm ${nestedChildRowClassName} ${paramHoverClassName} ${bg} ${border} ${isTopLevelWithPad ? "[&>p]:!pb-0 [&>p]:!pt-2" : ""} ${dndClassName ?? ""}`}
      {...floatingBoxHandlers}
      style={dndStyle}
      data-param-row="true"
      onMouseDownCapture={onMouseDown}
      onClick={onClick}
      ref={dndRef}
      {...(dndAttributes ?? {})}
      {...(dndListeners ?? {})}
      tabIndex={-1}
      role={undefined}
    >
      {children}
      {shouldRenderNestedChildSubtrees && (
        <GetParamSwitch
          sectionId={sectionId}
          paramIds={renderChildren}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={onResizeStart}
          listKey={listKey}
          hasSectionStyleTheme={hasSectionStyleTheme}
          isNestedChildInTree={true}
        />
      )}
    </article>
  );
}

export const ParamContainer = React.memo(_ParamContainer, _.isEqual);

function ErrorSection({
  sectionId,
  paramInfoId,
}: {
  sectionId: string;
  paramInfoId: string;
}) {
  function onContextMenu(e: React.MouseEvent<SVGElement>) {
    openTypeErrorContextMenu(e, sectionId, paramInfoId);
  }

  return (
    <BiError
      className="section-key-value grid-row-start-1 group/ w-45overflow-y-clip ml-auto aspect-square  cursor-help rounded-full bg-red-500/80 px-0.5 pb-0.5 pt-[1px] text-white  peer-focus-within/textinput:text-red-100 peer-focus-within/textinput:!opacity-20 dark:bg-red-700/80 dark:peer-focus-within/textinput:text-red-400"
      onContextMenu={onContextMenu}
    />
  );
}
