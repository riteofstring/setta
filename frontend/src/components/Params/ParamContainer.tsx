import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import { GetParamSwitch } from "components/Params/GetParamSwitch";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { isTempParam } from "forks/dnd-kit/paramDndState";
import _ from "lodash";
import React from "react";
import { BiError } from "react-icons/bi";
import { openTypeErrorContextMenu } from "state/actions/contextMenus";
import {
  getCurrEffectiveCodeObjImpl,
  getParamDisplayName,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useParamDndChildrenForParent } from "./ParamDndContext";
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
  const benchmark = useSettingsAllSettingsBenchmark();
  const { description: paramDescription, name: paramName } = useProjectState(
    (x) => {
      const codeObjImpl = getCurrEffectiveCodeObjImpl(
        x,
        sectionId,
        paramInfoId,
      );
      return {
        description: codeObjImpl.description,
        name: getParamDisplayName(x, sectionId, paramInfoId),
      };
    },
    _.isEqual,
  );

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
  const hasTempChild = renderChildren.some((childId) => isTempParam(childId));
  const paramHoverClassName = hasSectionStyleTheme
    ? "hover:bg-[color:var(--setta-section-style-border)]"
    : "hover:bg-setta-100/50 hover:dark:bg-setta-800/70";

  return !isNestedParam ? (
    <>
      <article
        id={`ParamContainer-${sectionId}-${paramInfoId}`} // used for project-level search results
        className={`section-args-nested-key-value section-key-value group/arg-group section-min-rows relative grid grid-cols-subgrid items-center justify-between rounded-sm px-[2px] ${paramHoverClassName} ${bg} ${border} ${dndClassName ?? ""} `}
        style={{
          gridTemplateColumns: `minmax(min-content, ${columnWidth}) [c3] 0.75rem [c4] 1fr [c5]`,
          ...(dndStyle ?? {}),
        }}
        data-param-row="true"
        {...getFloatingBoxHandlers(...tooltipContentArray)}
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
        <ResizeHandle showResizeHandle={true} onMouseDown={onResizeStart} />
        {hasError && (
          <ErrorSection sectionId={sectionId} paramInfoId={paramInfoId} />
        )}
        {hasTempChild && (
          <div className="section-args-nested section-key-value relative grid gap-y-1">
            <div className="absolute bottom-0 h-[calc(100%_-_0.1rem)] w-[0.4rem] rounded-full bg-setta-200/20 dark:bg-setta-400/20" />
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
    </>
  ) : (
    <article
      id={`ParamContainer-${sectionId}-${paramInfoId}`} // used for project-level search results
      className={`section-args-nested section-lg-value group/arg-group section-min-rows [&>p]:section-key-value relative grid grid-cols-subgrid items-center justify-between gap-y-1 rounded-sm ${paramHoverClassName} ${bg} ${border} ${isTopLevelWithPad ? "[&>p]:!pb-0 [&>p]:!pt-2" : ""} ${dndClassName ?? ""}`}
      {...getFloatingBoxHandlers(...tooltipContentArray)}
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
      <div className="section-args-nested section-key-value relative grid gap-y-1">
        <div className="absolute bottom-0 h-[calc(100%_-_0.1rem)] w-[0.4rem] rounded-full bg-setta-200/20 dark:bg-setta-400/20" />
        <GetParamSwitch
          sectionId={sectionId}
          paramIds={renderChildren}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={onResizeStart}
          listKey={listKey}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      </div>
    </article>
  );
}

export const ParamContainer = React.memo(_ParamContainer, _.isEqual);

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
