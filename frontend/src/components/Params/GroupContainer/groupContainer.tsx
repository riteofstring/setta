import { ParamDndContext } from "forks/dnd-kit/ParamDndContext";

import { HandlePosition } from "gpuFlow/flowTypes";

import { Handle } from "gpuFlow/Handle";

import _ from "lodash";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  createEdgeFromConnection,
  isValidDataEdgeConnection,
} from "state/actions/edges";

import {
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrShownParamIds,
  getParamDisplayNameIfPresent,
  toggleParamSelected,
} from "state/actions/sectionInfos";

import { paramNameFromPathArray } from "state/actions/sections/sectionContents";

import {
  useLocalStorage,
  useProjectState,
  useResizeEvent,
  useTemporaryMiscState,
} from "state/definitions";

import { useParametersRequestWaitingForLSPResult } from "state/hooks/lsp";

import { useParamColumnWidth } from "state/hooks/useParamColumnWidth";

import { C } from "utils/c";

import {
  getParamsFixedHeightKey,
  getSectionStylePreviewColorKey,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";

import {
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
  type SectionSizingPolicy,
} from "utils/generatedTypes";

import { deriveSectionStyleTheme } from "utils/sectionStyleColors";

import {
  buildParamAreaMeasureKey,
  measureParamAreaMinHeight,
} from "./paramAreaMeasurements";

import { attachParamAreaObservers } from "./paramAreaObservers";

import {
  EdgesStrip,
  filterEdgeInputs,
  GetPinnedParams,
  GetUnpinnedParams,
} from "./edgesStrip";

export const DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT = 36;

export const LEGACY_UNPINNED_PARAMS_AREA_MIN_HEIGHT = 38;

export const UNPINNED_PARAMS_AREA_MIN_HEIGHT_WITH_PINNED = 36;

export type ProjectStateSnapshot = Parameters<typeof getCurrShownParamIds>[0];

export type VerticalSpacingKey =
  | "paddingTop"
  | "paddingBottom"
  | "marginTop"
  | "marginBottom";

export type FilteredParamList = {
  requiredParamIdsToPaths: Record<string, Array<string>>;
  topLevelParamIds: Array<string>;
};

export type EdgePortView = {
  id: string;
  label: string;
};

export type EdgeStripState = {
  inputPorts: Array<EdgePortView>;
  outputPorts: Array<EdgePortView>;
  shouldRoundBottom: boolean;
  positionAndSizeLocked: boolean;
  selectedParams: Array<string>;
  styleColor: string | null;
};

export type EdgeStripAppearance = {
  handlePreventSectionClassName: string;
  handleSelectableClassName: string;
  rowPreventSectionClassName: string;
  stripBorderColorClassName: string;
  edgeLabelColorClassName: string;
  edgeRowHoverClassName: string;
  edgeRowSelectedClassName: string;
  edgeRowTextColorClassName: string;
  dividerColorClassName: string;
  edgeStripBgColorClassName: string;
  roundedBottomClassName: string;
};

export function getVerticalSpacing(
  style: CSSStyleDeclaration,
  topKey: VerticalSpacingKey,
  bottomKey: VerticalSpacingKey,
) {
  return (
    (Number.parseFloat(style[topKey]) || 0) +
    (Number.parseFloat(style[bottomKey]) || 0)
  );
}

export function measureFixedParamsHeight(
  outer: HTMLElement,
  fixedElements: Array<HTMLElement>,
) {
  const outerStyle = window.getComputedStyle(outer);
  let totalHeight =
    getVerticalSpacing(outerStyle, "paddingTop", "paddingBottom") +
    getVerticalSpacing(outerStyle, "marginTop", "marginBottom");
  for (const element of fixedElements) {
    totalHeight +=
      element.offsetHeight +
      getVerticalSpacing(
        window.getComputedStyle(element),
        "marginTop",
        "marginBottom",
      );
  }
  return Math.round(totalHeight);
}

export function setStoredParamAreaHeight(
  heightKey: string,
  nextHeight: number,
) {
  useTemporaryMiscState.setState({
    [heightKey]: nextHeight,
  });
}

export function commitMeasuredFixedHeight({
  nextFixedHeight,
  heightKey,
  waitingForResult,
  pendingFixedHeightRef,
  lastFixedHeightRef,
}: {
  nextFixedHeight: number;
  heightKey: string;
  waitingForResult: boolean;
  pendingFixedHeightRef: React.MutableRefObject<number | null>;
  lastFixedHeightRef: React.MutableRefObject<number | null>;
}) {
  if (waitingForResult) {
    pendingFixedHeightRef.current = nextFixedHeight;
    return;
  }
  if (lastFixedHeightRef.current === nextFixedHeight) {
    return;
  }
  lastFixedHeightRef.current = nextFixedHeight;
  setStoredParamAreaHeight(heightKey, nextFixedHeight);
}

export function filterShownParamIds(
  state: ProjectStateSnapshot,
  sectionId: string,
  isPinned: boolean,
  edgeInputParams: Array<string>,
): FilteredParamList {
  const shownParamIds = getCurrShownParamIds(state, sectionId, isPinned, true);
  return filterEdgeInputs(
    shownParamIds.requiredParamIdsToPaths,
    shownParamIds.topLevelParamIds,
    edgeInputParams,
  );
}

export function useHasSectionStyleTheme(
  sectionId: string,
  styleColor: string | null,
) {
  const darkMode = useLocalStorage((x) => x.darkMode);
  const styleColorPreviewKey = getSectionStylePreviewColorKey(sectionId);
  const previewStyleColor = useTemporaryMiscState(
    (x) => x[styleColorPreviewKey] as string | null | undefined,
  );
  const resolvedStyleColor =
    previewStyleColor === undefined ? styleColor : previewStyleColor;
  return Boolean(
    resolvedStyleColor && deriveSectionStyleTheme(resolvedStyleColor, darkMode),
  );
}

export function resolveThemeClassName(
  hasSectionStyleTheme: boolean,
  themedClassName: string,
  fallbackClassName: string,
) {
  return hasSectionStyleTheme ? themedClassName : fallbackClassName;
}

export function getRoundedBottomClassName(
  shouldRoundBottom: boolean,
  positionAndSizeLocked: boolean,
) {
  if (!shouldRoundBottom) {
    return "";
  }
  return positionAndSizeLocked ? "rounded-b-sm" : "rounded-b-xl";
}

export function getEdgeInputPortLabel(
  state: ProjectStateSnapshot,
  sectionId: string,
  paramId: string,
  requiredParamIdsToPaths: Record<string, Array<string>>,
) {
  const path = requiredParamIdsToPaths[paramId];
  const rawLabel = path
    ? paramNameFromPathArray(state, sectionId, path)
    : getParamDisplayNameIfPresent(state, sectionId, paramId) ?? paramId;
  return rawLabel.trim().length === 0 ? "(unnamed)" : rawLabel;
}

export function buildEdgeInputPorts(
  state: ProjectStateSnapshot,
  sectionId: string,
  edgeInputParams: Array<string>,
  requiredParamIdsToPaths: Record<string, Array<string>>,
): Array<EdgePortView> {
  return edgeInputParams.map((paramId) => ({
    id: paramId,
    label: getEdgeInputPortLabel(
      state,
      sectionId,
      paramId,
      requiredParamIdsToPaths,
    ),
  }));
}

export function buildEdgeOutputPorts(
  edgeOutputPorts: Array<{ id: string; accessor: string }>,
): Array<EdgePortView> {
  return edgeOutputPorts.map((port) => ({
    id: port.id,
    label:
      port.accessor.trim() === "" ? C.EDGE_OUTPUT_BASE_LABEL : port.accessor,
  }));
}

export function selectEdgeStripState(
  state: ProjectStateSnapshot,
  sectionId: string,
): EdgeStripState {
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const pinned = getCurrShownParamIds(state, sectionId, true, true);
  const unpinned = getCurrShownParamIds(state, sectionId, false, true);
  const filteredPinned = filterEdgeInputs(
    pinned.requiredParamIdsToPaths,
    pinned.topLevelParamIds,
    impl.edgeInputParams,
  );
  const requiredParamIdsToPaths = {
    ...pinned.requiredParamIdsToPaths,
    ...unpinned.requiredParamIdsToPaths,
  };
  return {
    inputPorts: buildEdgeInputPorts(
      state,
      sectionId,
      impl.edgeInputParams,
      requiredParamIdsToPaths,
    ),
    outputPorts: buildEdgeOutputPorts(impl.edgeOutputPorts),
    shouldRoundBottom:
      filteredPinned.topLevelParamIds.length === 0 && impl.hideUnpinnedParams,
    positionAndSizeLocked: impl.positionAndSizeLocked,
    selectedParams: impl.selectedParams ?? [],
    styleColor: impl.styleColor ?? null,
  };
}

export function getEdgeStripAppearance({
  hasSectionStyleTheme,
  bgColor,
  isSelectingParams,
  shouldRoundBottom,
  positionAndSizeLocked,
}: {
  hasSectionStyleTheme: boolean;
  bgColor: string;
  isSelectingParams: boolean;
  shouldRoundBottom: boolean;
  positionAndSizeLocked: boolean;
}): EdgeStripAppearance {
  const handlePreventSectionClassName = `${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS}`;
  return {
    handlePreventSectionClassName,
    handleSelectableClassName: isSelectingParams
      ? "arg-edge-handle--selecting"
      : "",
    rowPreventSectionClassName: isSelectingParams
      ? handlePreventSectionClassName
      : "",
    stripBorderColorClassName: resolveThemeClassName(
      hasSectionStyleTheme,
      "border-[color:var(--setta-section-style-border)]",
      "border-white dark:border-setta-700/30",
    ),
    edgeLabelColorClassName: resolveThemeClassName(
      hasSectionStyleTheme,
      "text-[color:var(--setta-section-style-muted-text)]",
      "text-setta-300 dark:text-setta-500",
    ),
    edgeRowHoverClassName: resolveThemeClassName(
      hasSectionStyleTheme,
      "hover:bg-[color:var(--setta-section-style-border)]",
      "hover:bg-setta-100/50 hover:dark:bg-setta-800/70",
    ),
    edgeRowSelectedClassName: resolveThemeClassName(
      hasSectionStyleTheme,
      "!bg-[color:var(--setta-section-style-outline)] !text-[color:var(--setta-section-style-text)] [&_*]:!text-[color:var(--setta-section-style-text)] active:!bg-[color:var(--setta-section-style-border)]",
      "!bg-blue-700 !text-white active:!bg-cyan-300",
    ),
    edgeRowTextColorClassName: resolveThemeClassName(
      hasSectionStyleTheme,
      "text-[color:var(--setta-section-style-muted-text)]",
      "text-setta-600 dark:text-setta-200",
    ),
    dividerColorClassName: resolveThemeClassName(
      hasSectionStyleTheme,
      "bg-[color:var(--setta-section-style-border)]",
      "bg-setta-200/80 dark:bg-setta-700/60",
    ),
    edgeStripBgColorClassName: resolveThemeClassName(
      hasSectionStyleTheme,
      "bg-[color:var(--setta-section-style-panel-bg)]",
      bgColor,
    ),
    roundedBottomClassName: getRoundedBottomClassName(
      shouldRoundBottom,
      positionAndSizeLocked,
    ),
  };
}

export function preventSelectingEdgeMouseDown(
  event: React.MouseEvent<HTMLElement>,
  isSelectingParams: boolean,
) {
  if (!isSelectingParams) {
    return;
  }
  event.stopPropagation();
  event.preventDefault();
}

export function toggleSelectedEdgeParam(
  event: React.MouseEvent<HTMLElement>,
  isSelectingParams: boolean,
  sectionId: string,
  paramId: string,
) {
  if (!isSelectingParams) {
    return;
  }
  event.stopPropagation();
  toggleParamSelected(sectionId, paramId);
}

export type EdgeInputPortRowProps = {
  port: EdgePortView;
  sectionId: string;
  selected: boolean;
  isSelectingParams: boolean;
  canConnect: boolean;
  appearance: EdgeStripAppearance;
};

export function EdgeInputPortRow({
  port,
  sectionId,
  selected,
  isSelectingParams,
  canConnect,
  appearance,
}: EdgeInputPortRowProps) {
  const rowClassName = `relative flex items-center gap-2 rounded-sm px-2 py-1 text-[0.65rem] transition-colors ${appearance.edgeRowHoverClassName} ${
    selected
      ? appearance.edgeRowSelectedClassName
      : appearance.edgeRowTextColorClassName
  } ${isSelectingParams ? "cursor-pointer" : ""} ${appearance.rowPreventSectionClassName}`;
  const handleClassName = `arg-edge-handle arg-edge-handle--target ${appearance.handlePreventSectionClassName} ${appearance.handleSelectableClassName}`;

  return (
    <div
      className={rowClassName}
      onMouseDown={(event) =>
        preventSelectingEdgeMouseDown(event, isSelectingParams)
      }
      onClick={(event) =>
        toggleSelectedEdgeParam(event, isSelectingParams, sectionId, port.id)
      }
      data-edge-param-id={port.id}
      data-edge-param-side="in"
    >
      <Handle
        id={port.id}
        type="target"
        position={HandlePosition.Left}
        onConnect={createEdgeFromConnection}
        isValidConnection={isValidDataEdgeConnection}
        isConnectable={canConnect}
        isConnectableStart={canConnect}
        isConnectableEnd={canConnect}
        className={handleClassName}
        onClick={(event) =>
          toggleSelectedEdgeParam(event, isSelectingParams, sectionId, port.id)
        }
      />
      <span className="truncate">{port.label}</span>
    </div>
  );
}

export function EdgeOutputPortRow({
  port,
  canConnect,
  appearance,
}: {
  port: EdgePortView;
  canConnect: boolean;
  appearance: EdgeStripAppearance;
}) {
  return (
    <div
      className={`relative flex items-center justify-end gap-2 rounded-sm px-2 py-1 text-[0.65rem] transition-colors ${appearance.edgeRowTextColorClassName} ${appearance.edgeRowHoverClassName}`}
    >
      <span className="truncate">{port.label}</span>
      <Handle
        id={port.id}
        type="source"
        position={HandlePosition.Right}
        onConnect={createEdgeFromConnection}
        isValidConnection={isValidDataEdgeConnection}
        isConnectable={canConnect}
        isConnectableStart={canConnect}
        isConnectableEnd={canConnect}
        className={`arg-edge-handle arg-edge-handle--source ${appearance.handlePreventSectionClassName}`}
      />
    </div>
  );
}

export function resolveUnpinnedParamsAreaMinHeight(
  sizingPolicy: SectionSizingPolicy,
  hasPinnedParams: boolean,
) {
  const baseUnpinnedMinHeight = Number.isFinite(
    sizingPolicy.globals.unpinnedParamsAreaMinHeight,
  )
    ? sizingPolicy.globals.unpinnedParamsAreaMinHeight
    : DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT;
  const normalizedUnpinnedMinHeight =
    baseUnpinnedMinHeight === LEGACY_UNPINNED_PARAMS_AREA_MIN_HEIGHT
      ? DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT
      : baseUnpinnedMinHeight;
  if (
    hasPinnedParams &&
    normalizedUnpinnedMinHeight === DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT
  ) {
    return UNPINNED_PARAMS_AREA_MIN_HEIGHT_WITH_PINNED;
  }
  return normalizedUnpinnedMinHeight;
}

export function shouldApplyUnpinnedAreaMinHeight({
  hideUnpinnedParams,
  canEditLayout,
  positionAndSizeLocked,
}: {
  hideUnpinnedParams: boolean;
  canEditLayout: boolean;
  positionAndSizeLocked: boolean;
}) {
  return !hideUnpinnedParams && canEditLayout && !positionAndSizeLocked;
}

export type UnpinnedParamsState = {
  hideUnpinnedParams: boolean;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  topLevelParamIds: Array<string>;
  hasPinnedParams: boolean;
  positionAndSizeLocked: boolean;
  styleColor: string | null;
};

export function selectUnpinnedParamsState(
  state: ProjectStateSnapshot,
  sectionId: string,
): UnpinnedParamsState {
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const filteredPinned = filterShownParamIds(
    state,
    sectionId,
    true,
    impl.edgeInputParams,
  );
  const filteredUnpinned = filterShownParamIds(
    state,
    sectionId,
    false,
    impl.edgeInputParams,
  );
  return {
    hideUnpinnedParams: impl.hideUnpinnedParams,
    requiredParamIdsToPaths: filteredUnpinned.requiredParamIdsToPaths,
    topLevelParamIds: filteredUnpinned.topLevelParamIds,
    hasPinnedParams: filteredPinned.topLevelParamIds.length > 0,
    positionAndSizeLocked: impl.positionAndSizeLocked,
    styleColor: impl.styleColor ?? null,
  };
}

export function _ParamGroupContainer({
  sectionId,
  bgColor,
  sectionTypeName,
}: {
  sectionId: string;
  bgColor: string;
  sectionTypeName: SectionTypeEnum;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [maxNestedDepth, setMaxNestedDepth] = useState({
    pinned: 1,
    unpinned: 1,
  });
  const paramsFixedHeightKey = getParamsFixedHeightKey(sectionId);
  const lastFixedHeightRef = useRef<number | null>(null);
  const pendingFixedHeightRef = useRef<number | null>(null);
  const waitingForResult = useParametersRequestWaitingForLSPResult(sectionId);
  const waitingForResultRef = useRef(waitingForResult);

  const handleColumnResizeStart = useParamColumnWidth({
    sectionId,
    outerRef,
    maxNestedDepth: Math.max(maxNestedDepth.pinned, maxNestedDepth.unpinned),
  });

  const setOuterRef = useCallback((node: HTMLDivElement | null) => {
    outerRef.current = node;
  }, []);

  useEffect(() => {
    waitingForResultRef.current = waitingForResult;
  }, [waitingForResult]);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    if (!outer) {
      lastFixedHeightRef.current = null;
      pendingFixedHeightRef.current = null;
      useTemporaryMiscState.setState({ [paramsFixedHeightKey]: 0 });
      return;
    }
    let frameId = 0;
    const observed = new Set<HTMLElement>();
    const resizeObserver = new ResizeObserver(() => scheduleMeasure());
    const mutationObserver = new MutationObserver(() => scheduleMeasure());

    const updateObserved = () => {
      const fixedElements = Array.from(
        outer.querySelectorAll<HTMLElement>('[data-params-fixed="true"]'),
      );
      const nextSet = new Set(fixedElements);
      for (const el of observed) {
        if (!nextSet.has(el)) {
          resizeObserver.unobserve(el);
          observed.delete(el);
        }
      }
      for (const el of nextSet) {
        if (!observed.has(el)) {
          resizeObserver.observe(el);
          observed.add(el);
        }
      }
      return fixedElements;
    };

    const updateFixedHeight = () => {
      if (!outer) {
        return;
      }
      const fixedElements = updateObserved();
      commitMeasuredFixedHeight({
        nextFixedHeight: measureFixedParamsHeight(outer, fixedElements),
        heightKey: paramsFixedHeightKey,
        waitingForResult: waitingForResultRef.current,
        pendingFixedHeightRef,
        lastFixedHeightRef,
      });
    };

    const scheduleMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(updateFixedHeight);
    };

    mutationObserver.observe(outer, { childList: true, subtree: true });
    scheduleMeasure();

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      observed.clear();
      lastFixedHeightRef.current = null;
      pendingFixedHeightRef.current = null;
      useTemporaryMiscState.setState({ [paramsFixedHeightKey]: 0 });
    };
  }, [paramsFixedHeightKey]);

  useEffect(() => {
    if (waitingForResult) {
      return;
    }
    const pendingHeight = pendingFixedHeightRef.current;
    if (pendingHeight === null) {
      return;
    }
    pendingFixedHeightRef.current = null;
    if (lastFixedHeightRef.current === pendingHeight) {
      return;
    }
    lastFixedHeightRef.current = pendingHeight;
    setStoredParamAreaHeight(paramsFixedHeightKey, pendingHeight);
  }, [paramsFixedHeightKey, waitingForResult]);

  return (
    <ParamDndContext>
      <div
        className="section-row-pin-main section-w-full relative -mt-3 flex min-h-0 flex-col pt-2"
        ref={setOuterRef}
      >
        {waitingForResult && (
          <div className="pointer-events-auto absolute inset-0 z-10 flex items-start justify-center bg-transparent pt-3">
            <i className="section-args gg-spinner !scale-100 before:!border-t-blue-500 after:!border-blue-500" />
          </div>
        )}
        <>
          <EdgesStrip sectionId={sectionId} bgColor={bgColor} />
          <GetPinnedParams
            sectionId={sectionId}
            handleColumnResizeStart={handleColumnResizeStart}
            setMaxNestedDepth={setMaxNestedDepth}
            sectionTypeName={sectionTypeName}
          />
          <GetUnpinnedParams
            sectionId={sectionId}
            handleColumnResizeStart={handleColumnResizeStart}
            setMaxNestedDepth={setMaxNestedDepth}
          />
        </>
      </div>
    </ParamDndContext>
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);

export function getPinnedParamsBgClassName(sectionTypeName: SectionTypeEnum) {
  if (sectionTypeName === SectionTypeEnum.Callable) {
    return "bg-white dark:bg-blue-950/30";
  }
  if (sectionTypeName === SectionTypeEnum.GlobalVariables) {
    return "bg-setta-50 dark:bg-blue-950/30";
  }
  return "bg-setta-100/50 dark:bg-blue-950/30";
}

export function useMeasuredParamAreaMinHeight({
  sectionId,
  heightKey,
  paramIds,
  contentRef,
  headerRef,
  rowsRef,
}: {
  sectionId: string;
  heightKey: string;
  paramIds: Array<string>;
  contentRef: React.RefObject<HTMLElement>;
  headerRef?: React.RefObject<HTMLElement>;
  rowsRef: React.RefObject<HTMLElement>;
}) {
  const resizeEvent = useResizeEvent((x) => x.resizeEvent[sectionId]);
  const lastMeasuredHeightRef = useRef<number | null>(null);
  const { sectionWidth, columnWidth } = useProjectState((state) => {
    if (!state.sections[sectionId]) {
      return { sectionWidth: null, columnWidth: null };
    }
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    return {
      sectionWidth: impl.size?.width ?? null,
      columnWidth: impl.columnWidth,
    };
  }, _.isEqual);
  const measureKey = buildParamAreaMeasureKey({
    paramIds,
    sectionWidth,
    columnWidth,
  });

  useLayoutEffect(() => {
    let frameId = 0;
    let cleanupObservers: (() => void) | null = null;

    const updateHeight = (nextHeight: number) => {
      if (lastMeasuredHeightRef.current === nextHeight) {
        return;
      }
      lastMeasuredHeightRef.current = nextHeight;
      useTemporaryMiscState.setState({
        [heightKey]: nextHeight,
      });
    };

    if (paramIds.length === 0) {
      updateHeight(0);
      return;
    }

    const content = contentRef.current;
    const rows = rowsRef.current;
    if (!content || !rows) {
      updateHeight(0);
      return;
    }

    const measure = () => {
      const rowElements =
        rows.querySelectorAll<HTMLElement>("[data-param-row]");
      if (rowElements.length === 0) {
        updateHeight(0);
        return;
      }
      const rowHeights = Array.from(rowElements, (row) => row.offsetHeight);
      const headerHeight = headerRef?.current?.offsetHeight ?? 0;
      const style = window.getComputedStyle(content);
      const paddingTop = Number.parseFloat(style.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
      const nextHeight = measureParamAreaMinHeight({
        rowHeights,
        headerHeight,
        paddingTop,
        paddingBottom,
      });
      updateHeight(nextHeight);
    };

    const scheduleMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(measure);
    };

    scheduleMeasure();

    cleanupObservers = attachParamAreaObservers({
      rowsElement: rows,
      headerElement: headerRef?.current ?? null,
      onMeasure: scheduleMeasure,
    });

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      cleanupObservers?.();
    };
  }, [heightKey, measureKey, resizeEvent]);

  useEffect(() => {
    return () => {
      useTemporaryMiscState.setState({
        [heightKey]: 0,
      });
    };
  }, [heightKey]);
}
