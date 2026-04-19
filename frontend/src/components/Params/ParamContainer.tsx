import { GetParamSwitch } from "components/Params/GetParamSwitch";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { type ParamListKey } from "forks/dnd-kit/paramDndState";
import { useGraphSurfaceImplementation } from "forks/xyflow/core/container/graphSurfaceImplementation";
import {
  isCanvasOwnedSectionLightweightResizeHandle,
  isCanvasOwnedSectionLightweightParamLabel,
  isCanvasOwnedSectionLightweightNestedChildren,
  isCanvasOwnedSectionNestedGuide,
} from "forks/xyflow/core/container/sectionShellCanvasOwnership";
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

type ParamCoreLike = {
  displayName: string;
  name: string;
};

type ParamContainerLayout = "leaf" | "nested-child" | "nested-root";

type ParamContainerProps = {
  sectionId: string;
  paramInfoId: string;
  requiredParamIdsToPaths: Record<string, string[]>;
  children: React.ReactNode;
  onResizeStart: React.MouseEventHandler;
  isKwarg: boolean;
  isNestedParam: boolean;
  hasSectionStyleTheme: boolean;
  isTopLevelWithPad?: boolean;
  paramChildren: string[];
  onMouseDown?: React.MouseEventHandler<HTMLElement>;
  onClick?: React.MouseEventHandler<HTMLElement>;
  maybeErrorMessage?: string;
  border: string;
  bg: string;
  dndAttributes?: Record<string, unknown>;
  dndListeners?: Record<string, unknown>;
  dndRef?: React.Ref<HTMLElement>;
  dndStyle?: React.CSSProperties;
  dndClassName?: string;
  listKey: ParamListKey;
  flattenLightweightNestedLeafRow?: boolean;
  flattenLightweightNestedGroupRow?: boolean;
};

type ParamArticleProps = {
  articleClassName: string;
  articleStyle: React.CSSProperties;
  canvasOwnedNestedGuideLightweight?: boolean;
  children: React.ReactNode;
  flattenToContents?: boolean;
  dndAttributes?: Record<string, unknown>;
  dndListeners?: Record<string, unknown>;
  dndRef?: React.Ref<HTMLElement>;
  floatingBoxHandlers?: Record<string, unknown>;
  onClick?: React.MouseEventHandler<HTMLElement>;
  onMouseDown?: React.MouseEventHandler<HTMLElement>;
  paramInfoId: string;
  sectionId: string;
};

type ParamInputAccessoriesProps = {
  errorMessage: string;
  hasError: boolean;
  lightweightResizeHandle: boolean;
  onResizeStart: React.MouseEventHandler;
  paramInfoId: string;
  sectionId: string;
};

type ParamLeadingContentProps = {
  children: React.ReactNode;
  columnWidth: string;
  isKwarg: boolean;
  lightweightLeadingContent: boolean;
};

type ParamNestedChildrenProps = {
  canvasOwnedNestedGuide: boolean;
  hasSectionStyleTheme: boolean;
  lightweightNestedChildren: boolean;
  listKey: ParamListKey;
  onResizeStart: React.MouseEventHandler;
  renderChildren: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  sectionId: string;
};

type ParamLeafRowProps = ParamLeadingContentProps &
  ParamInputAccessoriesProps & {
    articleProps: ParamArticleProps;
  };

type ParamNestedRootRowProps = ParamLeafRowProps & {
  canvasOwnedNestedGuideLightweight: boolean;
  nestedChildrenProps: ParamNestedChildrenProps;
};

type ParamNestedChildRowProps = ParamNestedChildrenProps & {
  articleProps: ParamArticleProps;
  canvasOwnedNestedGuideLightweight: boolean;
  children: React.ReactNode;
};

type ParamArticleStyleProps = Pick<
  ParamContainerProps,
  "bg" | "border" | "dndClassName" | "dndStyle"
> & {
  columnWidth: string;
  paramHoverClassName: string;
};

type ParamRowRenderProps = {
  articleProps: Omit<ParamArticleProps, "articleClassName" | "articleStyle">;
  children: React.ReactNode;
  columnWidth: string;
  errorMessage: string;
  flattenLightweightNestedLeafRow: boolean;
  flattenLightweightNestedGroupRow: boolean;
  hasError: boolean;
  isKwarg: boolean;
  isTopLevelWithPad: boolean;
  layout: ParamContainerLayout;
  lightweightLeadingContent: boolean;
  lightweightNestedChildren: boolean;
  lightweightResizeHandle: boolean;
  nestedChildrenProps: ParamNestedChildrenProps;
  onResizeStart: React.MouseEventHandler;
  paramStyleProps: ParamArticleStyleProps;
  paramInfoId: string;
  sectionId: string;
};

function resolveParamName({
  codeObjImpl,
  paramCore,
  paramInfoId,
  showParamDisplayNames,
}: {
  codeObjImpl: unknown;
  paramCore?: ParamCoreLike;
  paramInfoId: string;
  showParamDisplayNames: boolean;
}) {
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
  return paramCore.displayName.trim().length > 0
    ? paramCore.displayName
    : paramCore.name;
}

function buildParamTooltipContents({
  errorMessage,
  paramDescription,
  paramName,
}: {
  errorMessage: string;
  paramDescription: string;
  paramName: string;
}) {
  if (errorMessage.length === 0) {
    return [{ title: paramName, content: paramDescription }];
  }
  return [
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
  ];
}

function resolveParamContainerLayout({
  hasChildRows,
  isNestedParam,
}: {
  hasChildRows: boolean;
  isNestedParam: boolean;
}): ParamContainerLayout {
  if (isNestedParam) {
    return "nested-child";
  }
  return hasChildRows ? "nested-root" : "leaf";
}

function getParamHoverClassName(hasSectionStyleTheme: boolean) {
  return hasSectionStyleTheme
    ? "hover:bg-[color:var(--setta-section-style-border)]"
    : "hover:bg-setta-100/50 hover:dark:bg-setta-800/70";
}

function buildLeafArticleProps({
  bg,
  border,
  columnWidth,
  dndClassName,
  dndStyle,
  paramHoverClassName,
}: ParamArticleStyleProps) {
  return {
    articleClassName: `section-key-value group/arg-group section-min-rows relative grid min-w-0 items-center rounded-sm px-[2px] ${paramHoverClassName} ${bg} ${border} ${dndClassName ?? ""}`,
    articleStyle: {
      gridTemplateColumns: `minmax(min-content, ${columnWidth}) 0.75rem minmax(0, 1fr)`,
      gridTemplateAreas: `"key center-gutter value"`,
      ...(dndStyle ?? {}),
    },
  };
}

function buildNestedRootArticleProps({
  bg,
  border,
  columnWidth,
  dndClassName,
  dndStyle,
  lightweightNestedChildren,
  paramHoverClassName,
}: ParamArticleStyleProps & { lightweightNestedChildren: boolean }) {
  return {
    articleClassName: `section-args-nested-key-value section-key-value group/arg-group section-min-rows relative grid grid-cols-subgrid items-center justify-between rounded-sm px-[2px] ${lightweightNestedChildren ? "content-start gap-y-1" : ""} ${paramHoverClassName} ${bg} ${border} ${dndClassName ?? ""}`,
    articleStyle: {
      gridTemplateColumns: `minmax(min-content, ${columnWidth}) [c3] 0.75rem [c4] 1fr [c5]`,
      ...(dndStyle ?? {}),
    },
  };
}

function buildNestedChildArticleProps({
  bg,
  border,
  columnWidth,
  dndClassName,
  dndStyle,
  isTopLevelWithPad,
  paramHoverClassName,
}: ParamArticleStyleProps & { isTopLevelWithPad: boolean }) {
  return {
    articleClassName: `section-args-nested section-lg-value group/arg-group section-min-rows [&>p]:section-key-value relative grid grid-cols-subgrid items-center justify-between gap-y-1 rounded-sm ${paramHoverClassName} ${bg} ${border} ${isTopLevelWithPad ? "[&>p]:!pb-0 [&>p]:!pt-2" : ""} ${dndClassName ?? ""}`,
    articleStyle: {
      gridTemplateColumns: `[c1] 0.75rem [c2] minmax(min-content, ${columnWidth}) [c3] 0.75rem [c4] 1fr [c5]`,
      ...(dndStyle ?? {}),
    },
  };
}

function ParamRowArticle({
  articleClassName,
  articleStyle,
  canvasOwnedNestedGuideLightweight = false,
  children,
  dndAttributes,
  dndListeners,
  dndRef,
  flattenToContents = false,
  floatingBoxHandlers,
  onClick,
  onMouseDown,
  paramInfoId,
  sectionId,
}: ParamArticleProps) {
  return (
    <article
      id={`ParamContainer-${sectionId}-${paramInfoId}`} // used for project-level search results
      className={
        flattenToContents ? `${articleClassName} contents` : articleClassName
      }
      style={articleStyle}
      data-canvas-owned-lightweight-row-body={
        flattenToContents ? "true" : undefined
      }
      data-canvas-owned-nested-guide={
        canvasOwnedNestedGuideLightweight ? "true" : undefined
      }
      data-canvas-owned-nested-guide-lightweight={
        canvasOwnedNestedGuideLightweight ? "true" : undefined
      }
      data-param-row="true"
      {...(floatingBoxHandlers as React.HTMLAttributes<HTMLElement>)}
      onMouseDownCapture={onMouseDown}
      onClick={onClick}
      ref={dndRef}
      {...(dndAttributes as React.HTMLAttributes<HTMLElement>)}
      {...(dndListeners as React.HTMLAttributes<HTMLElement>)}
      tabIndex={-1}
      role={undefined}
    >
      {children}
    </article>
  );
}

type CloneableLeadingContentProps = {
  className?: string;
  lightweightCanvasRoot?: boolean;
  style?: React.CSSProperties;
};

function ParamLeadingContent({
  children,
  columnWidth,
  isKwarg,
  lightweightLeadingContent,
}: ParamLeadingContentProps) {
  if (isKwarg) {
    return <>{children}</>;
  }
  if (
    lightweightLeadingContent &&
    React.isValidElement<CloneableLeadingContentProps>(children) &&
    typeof children.type !== "string"
  ) {
    return React.cloneElement(children, {
      className: `section-key overflow-hidden ${children.props.className ?? ""}`.trim(),
      lightweightCanvasRoot: true,
      style: {
        ...(children.props.style ?? {}),
        width: columnWidth,
      },
    });
  }
  return (
    <div className="section-key overflow-hidden" style={{ width: columnWidth }}>
      {children}
    </div>
  );
}

function ParamInputAccessories({
  errorMessage,
  hasError,
  lightweightResizeHandle,
  onResizeStart,
  paramInfoId,
  sectionId,
}: ParamInputAccessoriesProps) {
  return (
    <>
      <ParamInput
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        maybeErrorMessage={errorMessage}
      />
      <ResizeHandle
        showResizeHandle={true}
        onMouseDown={onResizeStart}
        lightweight={lightweightResizeHandle}
      />
      {hasError && (
        <ErrorSection sectionId={sectionId} paramInfoId={paramInfoId} />
      )}
    </>
  );
}

function ParamNestedChildren({
  canvasOwnedNestedGuide,
  hasSectionStyleTheme,
  lightweightNestedChildren,
  listKey,
  onResizeStart,
  renderChildren,
  requiredParamIdsToPaths,
  sectionId,
}: ParamNestedChildrenProps) {
  if (renderChildren.length === 0) {
    return null;
  }
  if (lightweightNestedChildren) {
    return (
      <GetParamSwitch
        sectionId={sectionId}
        paramIds={renderChildren}
        requiredParamIdsToPaths={requiredParamIdsToPaths}
        onResizeStart={onResizeStart}
        listKey={listKey}
        hasSectionStyleTheme={hasSectionStyleTheme}
        lightweightNestedLeafRows={true}
      />
    );
  }
  return (
    <div
      className={`${NESTED_CHILD_ROWS_CLASS_NAME} ${canvasOwnedNestedGuide ? "before:opacity-0" : ""}`}
      data-canvas-owned-nested-guide={
        canvasOwnedNestedGuide ? "true" : undefined
      }
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
  );
}

function ParamLeafRow({
  articleProps,
  children,
  columnWidth,
  errorMessage,
  hasError,
  isKwarg,
  lightweightLeadingContent,
  lightweightResizeHandle,
  onResizeStart,
  paramInfoId,
  sectionId,
}: ParamLeafRowProps) {
  return (
    <ParamRowArticle {...articleProps}>
      <ParamLeadingContent
        children={children}
        columnWidth={columnWidth}
        isKwarg={isKwarg}
        lightweightLeadingContent={lightweightLeadingContent}
      />
      <ParamInputAccessories
        errorMessage={errorMessage}
        hasError={hasError}
        lightweightResizeHandle={lightweightResizeHandle}
        onResizeStart={onResizeStart}
        paramInfoId={paramInfoId}
        sectionId={sectionId}
      />
    </ParamRowArticle>
  );
}

function ParamNestedRootRow({
  articleProps,
  canvasOwnedNestedGuideLightweight,
  children,
  columnWidth,
  errorMessage,
  hasError,
  isKwarg,
  lightweightLeadingContent,
  lightweightResizeHandle,
  nestedChildrenProps,
  onResizeStart,
  paramInfoId,
  sectionId,
}: ParamNestedRootRowProps) {
  return (
    <ParamRowArticle
      {...articleProps}
      canvasOwnedNestedGuideLightweight={canvasOwnedNestedGuideLightweight}
    >
      <ParamLeadingContent
        children={children}
        columnWidth={columnWidth}
        isKwarg={isKwarg}
        lightweightLeadingContent={lightweightLeadingContent}
      />
      <ParamInputAccessories
        errorMessage={errorMessage}
        hasError={hasError}
        lightweightResizeHandle={lightweightResizeHandle}
        onResizeStart={onResizeStart}
        paramInfoId={paramInfoId}
        sectionId={sectionId}
      />
      <ParamNestedChildren {...nestedChildrenProps} />
    </ParamRowArticle>
  );
}

function ParamNestedChildRow({
  articleProps,
  canvasOwnedNestedGuideLightweight,
  children,
  nestedChildrenProps,
}: ParamNestedChildRowProps) {
  return (
    <ParamRowArticle
      {...articleProps}
      canvasOwnedNestedGuideLightweight={canvasOwnedNestedGuideLightweight}
    >
      {children}
      <ParamNestedChildren {...nestedChildrenProps} />
    </ParamRowArticle>
  );
}

function renderParamContainerRow({
  articleProps,
  children,
  columnWidth,
  errorMessage,
  flattenLightweightNestedLeafRow,
  flattenLightweightNestedGroupRow,
  hasError,
  isKwarg,
  isTopLevelWithPad,
  layout,
  lightweightLeadingContent,
  lightweightNestedChildren,
  lightweightResizeHandle,
  nestedChildrenProps,
  onResizeStart,
  paramStyleProps,
  paramInfoId,
  sectionId,
}: ParamRowRenderProps) {
  if (layout === "leaf") {
    return (
      <ParamLeafRow
        articleProps={{
          ...articleProps,
          ...buildLeafArticleProps(paramStyleProps),
          flattenToContents: flattenLightweightNestedLeafRow,
        }}
        children={children}
        columnWidth={columnWidth}
        errorMessage={errorMessage}
        hasError={hasError}
        isKwarg={isKwarg}
        lightweightLeadingContent={lightweightLeadingContent}
        lightweightResizeHandle={lightweightResizeHandle}
        onResizeStart={onResizeStart}
        paramInfoId={paramInfoId}
        sectionId={sectionId}
      />
    );
  }
  if (layout === "nested-root") {
    return (
      <ParamNestedRootRow
        articleProps={{
          ...articleProps,
          ...buildNestedRootArticleProps({
            ...paramStyleProps,
            lightweightNestedChildren,
          }),
          flattenToContents:
            flattenLightweightNestedGroupRow && lightweightNestedChildren,
        }}
        canvasOwnedNestedGuideLightweight={
          nestedChildrenProps.canvasOwnedNestedGuide && lightweightNestedChildren
        }
        children={children}
        columnWidth={columnWidth}
        errorMessage={errorMessage}
        hasError={hasError}
        isKwarg={isKwarg}
        lightweightLeadingContent={lightweightLeadingContent}
        lightweightResizeHandle={lightweightResizeHandle}
        nestedChildrenProps={nestedChildrenProps}
        onResizeStart={onResizeStart}
        paramInfoId={paramInfoId}
        sectionId={sectionId}
      />
    );
  }
  return (
    <ParamNestedChildRow
      articleProps={{
        ...articleProps,
        ...buildNestedChildArticleProps({
          ...paramStyleProps,
          isTopLevelWithPad,
        }),
        flattenToContents:
          flattenLightweightNestedGroupRow && lightweightNestedChildren,
      }}
      canvasOwnedNestedGuideLightweight={
        nestedChildrenProps.canvasOwnedNestedGuide && lightweightNestedChildren
      }
      children={children}
      nestedChildrenProps={nestedChildrenProps}
    />
  );
}

function _ParamContainer({
  sectionId,
  paramInfoId,
  requiredParamIdsToPaths,
  children,
  onResizeStart,
  isKwarg,
  isNestedParam,
  hasSectionStyleTheme,
  isTopLevelWithPad = false,
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
  flattenLightweightNestedLeafRow = false,
  flattenLightweightNestedGroupRow = false,
}: ParamContainerProps) {
  const codeObjImpl = useProjectState((x) =>
    getCurrEffectiveCodeObjImplIfPresent(x, sectionId, paramInfoId),
  );
  const graphSurfaceImplementation = useGraphSurfaceImplementation();
  const paramCore = useProjectState((x) => x.codeObjs[paramInfoId]);
  const showParamDisplayNames = useProjectState(
    (x) => x.projectConfig.showParamDisplayNames,
  );
  const renderChildren = useParamDndChildrenForParent(
    paramInfoId,
    paramChildren,
  );

  if (codeObjImpl === null || paramCore === undefined) {
    return null;
  }

  const columnWidth = "var(--param-column-width, 200px)";
  const errorMessage = maybeErrorMessage ?? "";
  const hasError = errorMessage.length > 0;
  const paramDescription = codeObjImpl.description ?? "";
  const paramName = resolveParamName({
    codeObjImpl,
    paramCore,
    paramInfoId,
    showParamDisplayNames,
  });
  const floatingBoxHandlers = getFloatingBoxHandlers(
    ...buildParamTooltipContents({
      errorMessage,
      paramDescription,
      paramName,
    }),
  );
  const paramHoverClassName = getParamHoverClassName(hasSectionStyleTheme);
  const articleProps = {
    dndAttributes,
    dndListeners,
    dndRef,
    floatingBoxHandlers,
    onClick,
    onMouseDown,
    paramInfoId,
    sectionId,
  };
  const canvasOwnedNestedGuide =
    graphSurfaceImplementation === "canvas-shell-underlay" &&
    isCanvasOwnedSectionNestedGuide(sectionId);
  const lightweightLeadingContent =
    graphSurfaceImplementation === "canvas-shell-underlay" &&
    !isKwarg &&
    isCanvasOwnedSectionLightweightParamLabel(sectionId);
  const lightweightNestedChildren =
    graphSurfaceImplementation === "canvas-shell-underlay" &&
    isCanvasOwnedSectionLightweightNestedChildren(sectionId);
  const lightweightResizeHandle =
    graphSurfaceImplementation === "canvas-shell-underlay" &&
    isCanvasOwnedSectionLightweightResizeHandle(sectionId);
  const nestedChildrenProps = {
    canvasOwnedNestedGuide,
    hasSectionStyleTheme,
    lightweightNestedChildren,
    listKey,
    onResizeStart,
    renderChildren,
    requiredParamIdsToPaths,
    sectionId,
  };
  const layout = resolveParamContainerLayout({
    hasChildRows: renderChildren.length > 0,
    isNestedParam,
  });
  const paramStyleProps = {
    bg,
    border,
    columnWidth,
    dndClassName,
    dndStyle,
    paramHoverClassName,
  };

  return renderParamContainerRow({
    articleProps,
    children,
    columnWidth,
    errorMessage,
    flattenLightweightNestedLeafRow,
    flattenLightweightNestedGroupRow,
    hasError,
    isKwarg,
    isTopLevelWithPad,
    layout,
    lightweightLeadingContent,
    lightweightNestedChildren,
    lightweightResizeHandle,
    nestedChildrenProps,
    onResizeStart,
    paramStyleProps,
    paramInfoId,
    sectionId,
  });
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
