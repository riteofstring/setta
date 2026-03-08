import {
  useSettingsAllSettingsBenchmark,
  useSettingsAllSettingsBenchmarkRenderCounter,
} from "components/Pages/Project/settingsAllSettingsBenchmark";
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
  benchmarkParamRowMode,
}) {
  const benchmark = useSettingsAllSettingsBenchmark();
  useSettingsAllSettingsBenchmarkRenderCounter(
    "param-container",
    `${sectionId}:${paramInfoId}`,
  );
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
  const benchmarkRowKind = hasChildRows ? "parent" : "leaf";
  const benchmarkRowDepth = isNestedParam ? "nested" : "top-level";
  const childSubtreePolicy = hasChildRows
    ? benchmark.renderNestedChildSubtrees
      ? "enabled"
      : "suppressed"
    : "none";
  const shouldRenderNestedChildSubtrees =
    hasChildRows && benchmark.renderNestedChildSubtrees;
  const useExplicitLeafGrid = !isNestedParam && !hasChildRows;
  const paramHoverClassName = hasSectionStyleTheme
    ? "hover:bg-[color:var(--setta-section-style-border)]"
    : "hover:bg-setta-100/50 hover:dark:bg-setta-800/70";
  const floatingBoxHandlers = benchmark.renderParamChrome
    ? getFloatingBoxHandlers(...tooltipContentArray)
    : {};

  if (benchmark.renderFlatParamLayout) {
    return (
      <BenchmarkFlatParamContainer
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        requiredParamIdsToPaths={requiredParamIdsToPaths}
        onResizeStart={onResizeStart}
        isKwarg={isKwarg}
        isNestedParam={isNestedParam}
        hasSectionStyleTheme={hasSectionStyleTheme}
        isTopLevelWithPad={isTopLevelWithPad}
        paramChildren={paramChildren}
        onMouseDown={onMouseDown}
        onClick={onClick}
        border={border}
        bg={bg}
        dndAttributes={dndAttributes}
        dndListeners={dndListeners}
        dndRef={dndRef}
        dndStyle={dndStyle}
        dndClassName={dndClassName}
        listKey={listKey}
        columnWidth={columnWidth}
        floatingBoxHandlers={floatingBoxHandlers}
      >
        {children}
      </BenchmarkFlatParamContainer>
    );
  }

  if (benchmark.renderSimpleGridParamLayout) {
    return (
      <BenchmarkSimpleGridParamContainer
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        requiredParamIdsToPaths={requiredParamIdsToPaths}
        onResizeStart={onResizeStart}
        isKwarg={isKwarg}
        isNestedParam={isNestedParam}
        hasSectionStyleTheme={hasSectionStyleTheme}
        isTopLevelWithPad={isTopLevelWithPad}
        paramChildren={paramChildren}
        onMouseDown={onMouseDown}
        onClick={onClick}
        border={border}
        bg={bg}
        dndAttributes={dndAttributes}
        dndListeners={dndListeners}
        dndRef={dndRef}
        dndStyle={dndStyle}
        dndClassName={dndClassName}
        listKey={listKey}
        columnWidth={columnWidth}
        floatingBoxHandlers={floatingBoxHandlers}
      >
        {children}
      </BenchmarkSimpleGridParamContainer>
    );
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
        data-settings-benchmark-param-row-mode={benchmarkParamRowMode}
        data-settings-benchmark-param-row-kind={benchmarkRowKind}
        data-settings-benchmark-param-row-depth={benchmarkRowDepth}
        data-settings-benchmark-child-subtree-policy={childSubtreePolicy}
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
        {benchmark.renderParamInput ? (
          <ParamInput
            sectionId={sectionId}
            paramInfoId={paramInfoId}
            maybeErrorMessage={errorMessage}
          />
        ) : (
          <BenchmarkParamValueShell />
        )}
        {benchmark.renderParamChrome && (
          <ResizeHandle showResizeHandle={true} onMouseDown={onResizeStart} />
        )}
        {benchmark.renderParamChrome && hasError && (
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
      data-settings-benchmark-param-row-mode={benchmarkParamRowMode}
      data-settings-benchmark-param-row-kind={benchmarkRowKind}
      data-settings-benchmark-param-row-depth={benchmarkRowDepth}
      data-settings-benchmark-child-subtree-policy={childSubtreePolicy}
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
      {benchmark.renderParamInput ? (
        <ParamInput
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          maybeErrorMessage={errorMessage}
        />
      ) : (
        <BenchmarkParamValueShell />
      )}
      {benchmark.renderParamChrome && (
        <ResizeHandle showResizeHandle={true} onMouseDown={onResizeStart} />
      )}
      {benchmark.renderParamChrome && hasError && (
        <ErrorSection sectionId={sectionId} paramInfoId={paramInfoId} />
      )}
      {shouldRenderNestedChildSubtrees && (
        <div
          className={NESTED_CHILD_ROWS_CLASS_NAME}
          data-settings-benchmark-nested-child-subtree="true"
        >
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
      data-settings-benchmark-param-row-mode={benchmarkParamRowMode}
      data-settings-benchmark-param-row-kind={benchmarkRowKind}
      data-settings-benchmark-param-row-depth={benchmarkRowDepth}
      data-settings-benchmark-child-subtree-policy={childSubtreePolicy}
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
        <div
          className={NESTED_CHILD_ROWS_CLASS_NAME}
          data-settings-benchmark-nested-child-subtree="true"
        >
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

function BenchmarkFlatParamContainer({
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
  border,
  bg,
  dndAttributes,
  dndListeners,
  dndRef,
  dndStyle,
  dndClassName,
  listKey,
  columnWidth,
  floatingBoxHandlers,
}) {
  const renderChildren = useParamDndChildrenForParent(
    paramInfoId,
    paramChildren,
  );
  const hasChildRows = renderChildren.length > 0;
  const benchmark = useSettingsAllSettingsBenchmark();
  const benchmarkRowKind = hasChildRows ? "parent" : "leaf";
  const benchmarkRowDepth = isNestedParam ? "nested" : "top-level";
  const childSubtreePolicy = hasChildRows
    ? benchmark.renderNestedChildSubtrees
      ? "enabled"
      : "suppressed"
    : "none";
  const shouldRenderNestedChildSubtrees =
    hasChildRows && benchmark.renderNestedChildSubtrees;
  const paramHoverClassName = hasSectionStyleTheme
    ? "hover:bg-[color:var(--setta-section-style-border)]"
    : "hover:bg-setta-100/50 hover:dark:bg-setta-800/70";

  return (
    <article
      id={`ParamContainer-${sectionId}-${paramInfoId}`} // used for project-level search results
      className={`group/arg-group relative col-span-full flex min-w-0 flex-col gap-y-1 rounded-sm ${paramHoverClassName} ${bg} ${border} ${dndClassName ?? ""}`}
      style={dndStyle ?? undefined}
      data-param-row="true"
      data-settings-benchmark-flat-param-row="true"
      data-settings-benchmark-param-row-mode="flat"
      data-settings-benchmark-param-row-kind={benchmarkRowKind}
      data-settings-benchmark-param-row-depth={benchmarkRowDepth}
      data-settings-benchmark-child-subtree-policy={childSubtreePolicy}
      {...floatingBoxHandlers}
      onMouseDownCapture={onMouseDown}
      onClick={onClick}
      ref={dndRef}
      {...(dndAttributes ?? {})}
      {...(dndListeners ?? {})}
      tabIndex={-1}
      role={undefined}
    >
      <div
        className={`flex min-w-0 items-center gap-3 px-[2px] ${isTopLevelWithPad ? "pt-2" : ""}`}
      >
        {!isKwarg ? (
          <div
            className="min-w-0 shrink-0 overflow-hidden"
            style={{ width: columnWidth }}
          >
            {children}
          </div>
        ) : (
          <div className="min-w-0 overflow-hidden">{children}</div>
        )}
        {!isNestedParam && (
          <div className="min-w-0 flex-1">
            <BenchmarkParamValueShell />
          </div>
        )}
      </div>
      {shouldRenderNestedChildSubtrees && (
        <div
          className="ml-3 flex min-w-0 flex-col gap-y-1 border-l border-setta-200/40 pl-3 dark:border-setta-700/40"
          data-settings-benchmark-flat-param-children="true"
          data-settings-benchmark-nested-child-subtree="true"
        >
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

function BenchmarkSimpleGridParamContainer({
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
  border,
  bg,
  dndAttributes,
  dndListeners,
  dndRef,
  dndStyle,
  dndClassName,
  listKey,
  columnWidth,
  floatingBoxHandlers,
}) {
  const renderChildren = useParamDndChildrenForParent(
    paramInfoId,
    paramChildren,
  );
  const hasChildRows = renderChildren.length > 0;
  const benchmark = useSettingsAllSettingsBenchmark();
  const benchmarkRowKind = hasChildRows ? "parent" : "leaf";
  const benchmarkRowDepth = isNestedParam ? "nested" : "top-level";
  const childSubtreePolicy = hasChildRows
    ? benchmark.renderNestedChildSubtrees
      ? "enabled"
      : "suppressed"
    : "none";
  const shouldRenderNestedChildSubtrees =
    hasChildRows && benchmark.renderNestedChildSubtrees;
  const paramHoverClassName = hasSectionStyleTheme
    ? "hover:bg-[color:var(--setta-section-style-border)]"
    : "hover:bg-setta-100/50 hover:dark:bg-setta-800/70";

  return (
    <article
      id={`ParamContainer-${sectionId}-${paramInfoId}`} // used for project-level search results
      className={`group/arg-group relative col-span-full grid min-w-0 gap-x-3 gap-y-1 rounded-sm px-[2px] ${paramHoverClassName} ${bg} ${border} ${dndClassName ?? ""}`}
      style={{
        gridTemplateColumns: `minmax(min-content, ${columnWidth}) minmax(0, 1fr)`,
        ...(dndStyle ?? {}),
      }}
      data-param-row="true"
      data-settings-benchmark-simple-grid-param-row="true"
      data-settings-benchmark-param-row-mode="simple-grid"
      data-settings-benchmark-param-row-kind={benchmarkRowKind}
      data-settings-benchmark-param-row-depth={benchmarkRowDepth}
      data-settings-benchmark-child-subtree-policy={childSubtreePolicy}
      {...floatingBoxHandlers}
      onMouseDownCapture={onMouseDown}
      onClick={onClick}
      ref={dndRef}
      {...(dndAttributes ?? {})}
      {...(dndListeners ?? {})}
      tabIndex={-1}
      role={undefined}
    >
      <div className={`min-w-0 ${isTopLevelWithPad ? "pt-2" : ""}`}>
        {!isKwarg ? (
          <div
            className="min-w-0 overflow-hidden"
            style={{ width: columnWidth }}
          >
            {children}
          </div>
        ) : (
          <div className="min-w-0 overflow-hidden">{children}</div>
        )}
      </div>
      {!isNestedParam && (
        <div className={`min-w-0 ${isTopLevelWithPad ? "pt-2" : ""}`}>
          <BenchmarkParamValueShell />
        </div>
      )}
      {shouldRenderNestedChildSubtrees && (
        <div
          className="col-span-2 grid min-w-0 gap-y-1 border-l border-setta-200/40 pl-3 dark:border-setta-700/40"
          data-settings-benchmark-simple-grid-children="true"
          data-settings-benchmark-nested-child-subtree="true"
        >
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

function BenchmarkParamValueShell() {
  return (
    <div
      className="section-key-value flex min-w-0 items-center rounded-sm border border-dashed border-setta-200/80 px-2 py-[0.2rem] text-[0.58rem] uppercase tracking-[0.14em] text-setta-400 dark:border-setta-700 dark:text-setta-500"
      data-settings-benchmark-param-value-shell="true"
    >
      Value shell
    </div>
  );
}

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
