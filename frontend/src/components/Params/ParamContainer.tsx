import { GetParamSwitch } from "components/Params/GetParamSwitch";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import React from "react";
import { BiError } from "react-icons/bi";
import { openTypeErrorContextMenu } from "state/actions/contextMenus";
import { getCurrEffectiveCodeObjImplIfPresent } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { isBaseParamCodeObjImpl } from "utils/generatedTypes";
import { useParamDndChildrenForParent } from "./ParamDndContext";
import { ParamInput } from "./ParamItems/ParamInput";
import { ResizeHandle } from "./ResizeHandle";

const NESTED_CHILD_ROWS_CLASS_NAME =
  "section-args-nested section-key-value relative grid min-w-0 gap-y-1 before:absolute before:bottom-0 before:left-0 before:h-[calc(100%_-_0.1rem)] before:w-[0.4rem] before:rounded-full before:bg-setta-200/20 before:content-[''] dark:before:bg-setta-400/20";

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
    getCurrEffectiveCodeObjImplIfPresent(x, sectionId, paramInfoId),
  );
  const paramCore = useProjectState((x) => x.codeObjs[paramInfoId]);
  const hasParamState = codeObjImpl !== null && paramCore !== undefined;
  const showParamDisplayNames = useProjectState(
    (x) => x.projectConfig.showParamDisplayNames,
  );
  const paramDescription = codeObjImpl?.description ?? "";
  const paramName = React.useMemo(() => {
    if (!paramCore) {
      return paramInfoId;
    }
    if (!showParamDisplayNames) {
      return paramCore.name;
    }
    if (
      codeObjImpl &&
      isBaseParamCodeObjImpl(codeObjImpl) &&
      codeObjImpl.coreNameEditable
    ) {
      return paramCore.name;
    }
    const trimmedDisplayName = paramCore.displayName.trim();
    if (trimmedDisplayName.length > 0) {
      return paramCore.displayName;
    }
    return paramCore.name;
  }, [
    codeObjImpl,
    paramCore?.displayName,
    paramCore?.name,
    paramInfoId,
    showParamDisplayNames,
  ]);

  const columnWidth = "var(--param-column-width, 200px)";

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
  const useExplicitLeafGrid = !isNestedParam && !hasChildRows;
  const paramHoverClassName = hasSectionStyleTheme
    ? "hover:bg-[color:var(--setta-section-style-border)]"
    : "hover:bg-setta-100/50 hover:dark:bg-setta-800/70";
  const floatingBoxHandlers = getFloatingBoxHandlers(...tooltipContentArray);

  if (!hasParamState) {
    return null;
  }

  if (useExplicitLeafGrid) {
    return (
      <article
        id={`ParamContainer-${sectionId}-${paramInfoId}`} // used for project-level search results
        className={`section-key-value group/arg-group section-min-rows relative grid min-w-0 items-center rounded-sm px-[2px] ${paramHoverClassName} ${bg} ${border} ${dndClassName ?? ""}`}
        style={{
          gridTemplateColumns: `minmax(min-content, ${columnWidth}) 0.75rem minmax(0, 1fr)`,
          gridTemplateAreas: `"key center-gutter value"`,
          ...(dndStyle ?? {}),
        }}
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
        {!isKwarg ? (
          <div
            className="section-key overflow-hidden"
            style={{ width: columnWidth }}
          >
            {children}
          </div>
        ) : (
          children
        )}
        <ParamInput
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          maybeErrorMessage={errorMessage}
        />
        <ResizeHandle showResizeHandle={true} onMouseDown={onResizeStart} />
        {hasError && (
          <ErrorSection sectionId={sectionId} paramInfoId={paramInfoId} />
        )}
      </article>
    );
  }

  return !isNestedParam ? (
    <article
      id={`ParamContainer-${sectionId}-${paramInfoId}`} // used for project-level search results
      className={`section-args-nested-key-value section-key-value group/arg-group section-min-rows relative grid grid-cols-subgrid items-center justify-between rounded-sm px-[2px] ${paramHoverClassName} ${bg} ${border} ${dndClassName ?? ""} `}
      style={{
        gridTemplateColumns: `minmax(min-content, ${columnWidth}) [c3] 0.75rem [c4] 1fr [c5]`,
        ...(dndStyle ?? {}),
      }}
      data-param-row="true"
      {...floatingBoxHandlers}
      onMouseDownCapture={onMouseDown} // has to be on capture, otherwise it doesn't get triggered when clicking above DummyCodeMirror when ParamNameInput is taller than DummyCodeMirror
      onClick={onClick}
      ref={dndRef}
      {...(dndAttributes ?? {})}
      {...(dndListeners ?? {})}
      tabIndex={-1}
      role={undefined}
    >
      {!isKwarg ? (
        <div
          className="section-key overflow-hidden"
          style={{ width: columnWidth }}
        >
          {children}
        </div>
      ) : (
        <>{children}</>
      )}
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
        <div className={NESTED_CHILD_ROWS_CLASS_NAME}>
          <GetParamSwitch
            sectionId={sectionId}
            paramIds={renderChildren}
            requiredParamIdsToPaths={requiredParamIdsToPaths}
            onResizeStart={onResizeStart}
            listKey={listKey}
            hasSectionStyleTheme={hasSectionStyleTheme}
          />
        </div>
      )}
    </article>
  ) : (
    <article
      id={`ParamContainer-${sectionId}-${paramInfoId}`} // used for project-level search results
      className={`section-args-nested section-lg-value group/arg-group section-min-rows [&>p]:section-key-value relative grid grid-cols-subgrid items-center justify-between gap-y-1 rounded-sm ${paramHoverClassName} ${bg} ${border} ${isTopLevelWithPad ? "[&>p]:!pb-0 [&>p]:!pt-2" : ""} ${dndClassName ?? ""}`}
      {...floatingBoxHandlers}
      style={{
        gridTemplateColumns: `[c1] 0.75rem [c2] minmax(min-content, ${columnWidth}) [c3] 0.75rem [c4] 1fr [c5]`,
        ...(dndStyle ?? {}),
      }}
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
        <div className={NESTED_CHILD_ROWS_CLASS_NAME}>
          <GetParamSwitch
            sectionId={sectionId}
            paramIds={renderChildren}
            requiredParamIdsToPaths={requiredParamIdsToPaths}
            onResizeStart={onResizeStart}
            listKey={listKey}
            hasSectionStyleTheme={hasSectionStyleTheme}
          />
        </div>
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
