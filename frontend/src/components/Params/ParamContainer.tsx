import { GetParamSwitch } from "components/Params/GetParamSwitch";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import type { ParamListKey } from "forks/dnd-kit/paramDndState";
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
import {
  PARAM_CONTAINER_COLUMN_WIDTH,
  buildParamContainerLayout,
  buildParamContainerViewModel,
  resolveParamContainerDisplayName,
} from "./paramContainerView";

const NESTED_CHILD_ROWS_CLASS_NAME =
  "section-args-nested section-key-value relative grid min-w-0 gap-y-1 before:absolute before:bottom-0 before:left-0 before:h-[calc(100%_-_0.1rem)] before:w-[0.4rem] before:rounded-full before:bg-setta-200/20 before:content-[''] dark:before:bg-setta-400/20";

type ParamContainerProps = {
  sectionId: string;
  paramInfoId: string;
  requiredParamIdsToPaths: Record<string, string[]>;
  children: React.ReactNode;
  onResizeStart: React.MouseEventHandler<HTMLDivElement>;
  isKwarg: boolean;
  isNestedParam: boolean;
  hasSectionStyleTheme: boolean;
  isTopLevelWithPad: boolean;
  paramChildren: string[];
  onMouseDown: React.MouseEventHandler<HTMLElement>;
  onClick: React.MouseEventHandler<HTMLElement>;
  maybeErrorMessage?: string | null;
  border: string;
  bg: string;
  dndAttributes?: React.HTMLAttributes<HTMLElement>;
  dndListeners?: React.HTMLAttributes<HTMLElement>;
  dndRef?: React.Ref<HTMLElement>;
  dndStyle?: React.CSSProperties;
  dndClassName?: string;
  listKey: ParamListKey;
};

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
}: ParamContainerProps) {
  const codeObjImpl = useProjectState((x) =>
    getCurrEffectiveCodeObjImpl(x, sectionId, paramInfoId),
  );
  const paramCore = useProjectState((x) => x.codeObjs[paramInfoId]);
  const showParamDisplayNames = useProjectState(
    (x) => x.projectConfig.showParamDisplayNames,
  );
  const paramName = React.useMemo(() => {
    return resolveParamContainerDisplayName({
      showParamDisplayNames,
      paramName: paramCore.name,
      paramDisplayName: paramCore.displayName,
      preferCoreName:
        isBaseParamCodeObjImpl(codeObjImpl) && codeObjImpl.coreNameEditable,
    });
  }, [
    codeObjImpl,
    paramCore.displayName,
    paramCore.name,
    showParamDisplayNames,
  ]);

  const renderChildren = useParamDndChildrenForParent(
    paramInfoId,
    paramChildren,
  );
  const viewModel = buildParamContainerViewModel({
    maybeErrorMessage,
    paramName,
    paramDescription: codeObjImpl.description,
    isNestedParam,
    hasChildRows: renderChildren.length > 0,
    hasSectionStyleTheme,
  });
  const floatingBoxHandlers = getFloatingBoxHandlers(
    ...viewModel.tooltipContentArray,
  );
  const { className, style } = buildParamContainerLayout({
    variant: viewModel.variant,
    paramHoverClassName: viewModel.paramHoverClassName,
    bg,
    border,
    isTopLevelWithPad,
    dndClassName,
    dndStyle,
  });

  const nestedChildRows =
    renderChildren.length > 0 ? (
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
    ) : null;
  const paramLabel = isKwarg ? (
    children
  ) : (
    <div
      className="section-key overflow-hidden"
      style={{ width: PARAM_CONTAINER_COLUMN_WIDTH }}
    >
      {children}
    </div>
  );
  const sharedParamFields = (
    <>
      {paramLabel}
      <ParamInput
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        maybeErrorMessage={viewModel.errorMessage}
      />
      <ResizeHandle showResizeHandle={true} onMouseDown={onResizeStart} />
      {viewModel.hasError ? (
        <ErrorSection sectionId={sectionId} paramInfoId={paramInfoId} />
      ) : null}
    </>
  );

  return (
    <ParamContainerArticle
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      className={className}
      style={style}
      floatingBoxHandlers={floatingBoxHandlers}
      onMouseDown={onMouseDown}
      onClick={onClick}
      dndAttributes={dndAttributes}
      dndListeners={dndListeners}
      dndRef={dndRef}
    >
      {viewModel.variant === "nested" ? children : sharedParamFields}
      {nestedChildRows}
    </ParamContainerArticle>
  );
}

export const ParamContainer = React.memo(_ParamContainer, _.isEqual);

type ParamContainerArticleProps = {
  sectionId: string;
  paramInfoId: string;
  className: string;
  style: React.CSSProperties;
  floatingBoxHandlers: ReturnType<typeof getFloatingBoxHandlers>;
  onMouseDown: React.MouseEventHandler<HTMLElement>;
  onClick: React.MouseEventHandler<HTMLElement>;
  dndAttributes?: React.HTMLAttributes<HTMLElement>;
  dndListeners?: React.HTMLAttributes<HTMLElement>;
  dndRef?: React.Ref<HTMLElement>;
  children: React.ReactNode;
};

function ParamContainerArticle({
  sectionId,
  paramInfoId,
  className,
  style,
  floatingBoxHandlers,
  onMouseDown,
  onClick,
  dndAttributes,
  dndListeners,
  dndRef,
  children,
}: ParamContainerArticleProps) {
  return (
    <article
      id={`ParamContainer-${sectionId}-${paramInfoId}`} // used for project-level search results
      className={className}
      style={style}
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
      {children}
    </article>
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
