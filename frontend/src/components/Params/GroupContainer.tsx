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
  useMisc,
  useProjectState,
  useResizeEvent,
  useSettings,
  useTemporaryMiscState,
} from "state/definitions";
import { useParametersRequestWaitingForLSPResult } from "state/hooks/lsp";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { useShareCapabilities } from "state/hooks/share";
import { useParamColumnWidth } from "state/hooks/useParamColumnWidth";
import { C } from "utils/c";
import {
  getEdgesStripHeightKey,
  getParamsFixedHeightKey,
  getPinnedParamsAreaHeightKey,
  getSectionStylePreviewColorKey,
  getUnpinnedParamsAreaHeightKey,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";
import {
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
  type SectionSizingPolicy,
} from "utils/generatedTypes";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { resolveEdgeStripHeight } from "./edgeStripUtils";
import {
  buildParamAreaMeasureKey,
  measureParamAreaMinHeight,
} from "./paramAreaMeasurements";
import { attachParamAreaObservers } from "./paramAreaObservers";
import { ParamDndList } from "./ParamDndList";

const DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT = 36;
const LEGACY_UNPINNED_PARAMS_AREA_MIN_HEIGHT = 38;
const UNPINNED_PARAMS_AREA_MIN_HEIGHT_WITH_PINNED = 36;

type ProjectStateSnapshot = Parameters<typeof getCurrShownParamIds>[0];

type VerticalSpacingKey =
  | "paddingTop"
  | "paddingBottom"
  | "marginTop"
  | "marginBottom";

type FilteredParamList = {
  requiredParamIdsToPaths: Record<string, Array<string>>;
  topLevelParamIds: Array<string>;
};

type EdgePortView = {
  id: string;
  label: string;
};

type EdgeStripState = {
  inputPorts: Array<EdgePortView>;
  outputPorts: Array<EdgePortView>;
  shouldRoundBottom: boolean;
  positionAndSizeLocked: boolean;
  selectedParams: Array<string>;
  styleColor: string | null;
};

type EdgeStripAppearance = {
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

function getVerticalSpacing(
  style: CSSStyleDeclaration,
  topKey: VerticalSpacingKey,
  bottomKey: VerticalSpacingKey,
) {
  return (
    (Number.parseFloat(style[topKey]) || 0) +
    (Number.parseFloat(style[bottomKey]) || 0)
  );
}

function measureFixedParamsHeight(
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

function setStoredParamAreaHeight(heightKey: string, nextHeight: number) {
  useTemporaryMiscState.setState({
    [heightKey]: nextHeight,
  });
}

function commitMeasuredFixedHeight({
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

function filterShownParamIds(
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

function useHasSectionStyleTheme(sectionId: string, styleColor: string | null) {
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

function resolveThemeClassName(
  hasSectionStyleTheme: boolean,
  themedClassName: string,
  fallbackClassName: string,
) {
  return hasSectionStyleTheme ? themedClassName : fallbackClassName;
}

function getRoundedBottomClassName(
  shouldRoundBottom: boolean,
  positionAndSizeLocked: boolean,
) {
  if (!shouldRoundBottom) {
    return "";
  }
  return positionAndSizeLocked ? "rounded-b-sm" : "rounded-b-xl";
}

function getEdgeInputPortLabel(
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

function buildEdgeInputPorts(
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

function buildEdgeOutputPorts(
  edgeOutputPorts: Array<{ id: string; accessor: string }>,
): Array<EdgePortView> {
  return edgeOutputPorts.map((port) => ({
    id: port.id,
    label:
      port.accessor.trim() === "" ? C.EDGE_OUTPUT_BASE_LABEL : port.accessor,
  }));
}

function selectEdgeStripState(
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

function getEdgeStripAppearance({
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

function preventSelectingEdgeMouseDown(
  event: React.MouseEvent<HTMLElement>,
  isSelectingParams: boolean,
) {
  if (!isSelectingParams) {
    return;
  }
  event.stopPropagation();
  event.preventDefault();
}

function toggleSelectedEdgeParam(
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

type EdgeInputPortRowProps = {
  port: EdgePortView;
  sectionId: string;
  selected: boolean;
  isSelectingParams: boolean;
  canConnect: boolean;
  appearance: EdgeStripAppearance;
};

function EdgeInputPortRow({
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

function EdgeOutputPortRow({
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

function resolveUnpinnedParamsAreaMinHeight(
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

function shouldApplyUnpinnedAreaMinHeight({
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

type UnpinnedParamsState = {
  hideUnpinnedParams: boolean;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  topLevelParamIds: Array<string>;
  hasPinnedParams: boolean;
  positionAndSizeLocked: boolean;
  styleColor: string | null;
};

function selectUnpinnedParamsState(
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

function _ParamGroupContainer({
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

function getPinnedParamsBgClassName(sectionTypeName: SectionTypeEnum) {
  if (sectionTypeName === SectionTypeEnum.Callable) {
    return "bg-white dark:bg-blue-950/30";
  }
  if (sectionTypeName === SectionTypeEnum.GlobalVariables) {
    return "bg-setta-50 dark:bg-blue-950/30";
  }
  return "bg-setta-100/50 dark:bg-blue-950/30";
}

function useMeasuredParamAreaMinHeight({
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

function EdgesStrip({
  sectionId,
  bgColor,
}: {
  sectionId: string;
  bgColor: string;
}) {
  const { canEditStructure } = useShareCapabilities();
  const isSelectingParams = useMisc((x) => x.isSelectingParams);
  const lastHeightRef = useRef(0);
  const stripRef = useRef<HTMLElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const heightKey = getEdgesStripHeightKey(sectionId);
  const {
    inputPorts,
    outputPorts,
    shouldRoundBottom,
    positionAndSizeLocked,
    selectedParams,
    styleColor,
  } = useProjectState(
    (state) => selectEdgeStripState(state, sectionId),
    _.isEqual,
  );
  const hasSectionStyleTheme = useHasSectionStyleTheme(sectionId, styleColor);

  const hasEdges = inputPorts.length > 0 || outputPorts.length > 0;
  const selectedParamIdSet = new Set(selectedParams);
  const canConnect = canEditStructure && !isSelectingParams;
  const appearance = getEdgeStripAppearance({
    hasSectionStyleTheme,
    bgColor,
    isSelectingParams,
    shouldRoundBottom,
    positionAndSizeLocked,
  });

  useLayoutEffect(() => {
    if (!hasEdges) {
      setMeasuredHeight(null);
      return;
    }
    const element = stripRef.current;
    if (!element) {
      setMeasuredHeight(null);
      return;
    }
    let frameId = 0;

    const updateMeasuredHeight = () => {
      const nextHeight = Math.ceil(element.scrollHeight);
      setMeasuredHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    const scheduleMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(updateMeasuredHeight);
    };

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(element);
    scheduleMeasure();

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
    };
  }, [hasEdges, inputPorts.length, outputPorts.length]);

  useEffect(() => {
    if (!hasEdges) {
      if (lastHeightRef.current !== 0) {
        lastHeightRef.current = 0;
        useTemporaryMiscState.setState({ [heightKey]: 0 });
      }
      return;
    }
    const nextHeight = resolveEdgeStripHeight({
      measuredHeight,
      inputPortCount: inputPorts.length,
      outputPortCount: outputPorts.length,
    });
    if (nextHeight === lastHeightRef.current) {
      return;
    }
    lastHeightRef.current = nextHeight;
    useTemporaryMiscState.setState({ [heightKey]: nextHeight });
  }, [
    hasEdges,
    heightKey,
    inputPorts.length,
    measuredHeight,
    outputPorts.length,
  ]);

  useEffect(() => {
    return () => {
      if (lastHeightRef.current !== 0) {
        lastHeightRef.current = 0;
        useTemporaryMiscState.setState({ [heightKey]: 0 });
      }
    };
  }, [heightKey]);

  if (!hasEdges) {
    return null;
  }

  return (
    <section
      className={`section-w-full section-row-pin-main relative z-0 -mt-4 flex shrink-0 flex-col overflow-visible border-b pt-5 ${appearance.stripBorderColorClassName} ${appearance.edgeStripBgColorClassName} ${appearance.roundedBottomClassName}`}
      ref={stripRef}
      data-params-fixed="true"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_0.75rem_minmax(0,1fr)] py-2">
        <div className="flex flex-col pl-2">
          <div
            className={`text-[0.5rem] font-bold uppercase ${appearance.edgeLabelColorClassName}`}
          >
            In
          </div>
          <div className="-ml-2 flex flex-col gap-1 pt-1">
            {inputPorts.map((port) => (
              <EdgeInputPortRow
                key={port.id}
                port={port}
                sectionId={sectionId}
                selected={selectedParamIdSet.has(port.id)}
                isSelectingParams={isSelectingParams}
                canConnect={canConnect}
                appearance={appearance}
              />
            ))}
          </div>
        </div>
        <div
          className="pointer-events-none flex items-stretch justify-center"
          aria-hidden="true"
        >
          <div className={`h-full w-px ${appearance.dividerColorClassName}`} />
        </div>
        <div className="flex flex-col pr-2">
          <div
            className={`text-right text-[0.5rem] font-bold uppercase ${appearance.edgeLabelColorClassName}`}
          >
            Out
          </div>
          <div className="-mr-2 flex flex-col gap-1 pt-1">
            {outputPorts.map((port) => (
              <EdgeOutputPortRow
                key={port.id}
                port={port}
                canConnect={canConnect}
                appearance={appearance}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type MaxNestedDepth = {
  pinned: number;
  unpinned: number;
};

type GetPinnedParamsProps = {
  sectionId: string;
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  setMaxNestedDepth: React.Dispatch<React.SetStateAction<MaxNestedDepth>>;
  sectionTypeName: SectionTypeEnum;
};

type PinnedParamsAreaProps = {
  sectionId: string;
  topLevelParamIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  hasSectionStyleTheme: boolean;
  shouldRoundBottom: boolean;
  positionAndSizeLocked: boolean;
  sectionTypeName: SectionTypeEnum;
  contentRef: React.RefObject<HTMLDivElement>;
  headerRef: React.RefObject<HTMLElement>;
  rowsRef: React.RefObject<HTMLDivElement>;
};

type GetUnpinnedParamsProps = {
  sectionId: string;
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  setMaxNestedDepth: React.Dispatch<React.SetStateAction<MaxNestedDepth>>;
};

function GetPinnedParams({
  sectionId,
  handleColumnResizeStart,
  setMaxNestedDepth,
  sectionTypeName,
}: GetPinnedParamsProps) {
  const {
    requiredParamIdsToPaths,
    topLevelParamIds,
    shouldRoundBottom,
    positionAndSizeLocked,
    styleColor,
  } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const filteredPinned = filterShownParamIds(
      x,
      sectionId,
      true,
      impl.edgeInputParams,
    );
    return {
      ...filteredPinned,
      shouldRoundBottom: !impl.hideUnpinnedParams,
      positionAndSizeLocked: impl.positionAndSizeLocked,
      styleColor: impl.styleColor ?? null,
    };
  }, _.isEqual);
  const hasSectionStyleTheme = useHasSectionStyleTheme(sectionId, styleColor);

  const maxNestedDepth = getLongestListLength(requiredParamIdsToPaths);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const heightKey = getPinnedParamsAreaHeightKey(sectionId);

  useEffect(() => {
    setMaxNestedDepth((s) => ({ ...s, pinned: maxNestedDepth }));
  }, [maxNestedDepth]);

  useMeasuredParamAreaMinHeight({
    sectionId,
    heightKey,
    paramIds: topLevelParamIds,
    contentRef,
    headerRef,
    rowsRef,
  });

  return (
    topLevelParamIds.length > 0 && (
      <PinnedParamsArea
        sectionId={sectionId}
        topLevelParamIds={topLevelParamIds}
        requiredParamIdsToPaths={requiredParamIdsToPaths}
        handleColumnResizeStart={handleColumnResizeStart}
        hasSectionStyleTheme={hasSectionStyleTheme}
        shouldRoundBottom={shouldRoundBottom}
        positionAndSizeLocked={positionAndSizeLocked}
        sectionTypeName={sectionTypeName}
        contentRef={contentRef}
        headerRef={headerRef}
        rowsRef={rowsRef}
      />
    )
  );
}

function PinnedParamsArea({
  sectionId,
  topLevelParamIds,
  requiredParamIdsToPaths,
  handleColumnResizeStart,
  hasSectionStyleTheme,
  shouldRoundBottom,
  positionAndSizeLocked,
  sectionTypeName,
  contentRef,
  headerRef,
  rowsRef,
}: PinnedParamsAreaProps) {
  const pinnedBgClassName = hasSectionStyleTheme
    ? "bg-[color:var(--setta-section-style-panel-bg)]"
    : getPinnedParamsBgClassName(sectionTypeName);
  const pinnedBorderColorClassName = hasSectionStyleTheme
    ? "border-[color:var(--setta-section-style-border)]"
    : "border-white dark:border-setta-700/30";
  const pinnedLabelColorClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)]"
    : "text-setta-300 dark:text-setta-500";
  const pinnedIconColorClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)] after:text-[color:var(--setta-section-style-muted-text)]"
    : "text-setta-300 after:text-setta-300 dark:text-setta-500 dark:after:text-setta-500";
  let roundedBottomClassName = "";
  if (shouldRoundBottom) {
    roundedBottomClassName = positionAndSizeLocked
      ? "rounded-b-sm"
      : "rounded-b-xl";
  }

  return (
    <section
      className={`relative flex min-h-0 w-full shrink-0 flex-col items-start border-b shadow-sm ${pinnedBorderColorClassName} ${pinnedBgClassName} ${roundedBottomClassName}`}
      data-params-fixed="true"
    >
      <div
        className="flex min-h-0 w-full flex-1 flex-col pb-3 pt-2"
        ref={contentRef}
      >
        <header className="flex w-full gap-1 px-2" ref={headerRef}>
          <i
            className={`gg-pin-alt scale-25 ml-1 mr-[0.1rem] mt-[0.3rem] ${pinnedIconColorClassName}`}
          />
          <p
            className={`text-[0.5rem] font-bold uppercase ${pinnedLabelColorClassName}`}
          >
            Pinned Params
          </p>
        </header>

        <div
          className="section-args-nested section-key-value section-min-rows grid min-h-0 w-full flex-1 grid-cols-subgrid content-start gap-y-1 pr-1.5"
          ref={rowsRef}
        >
          <ParamDndList
            sectionId={sectionId}
            paramIds={topLevelParamIds}
            requiredParamIdsToPaths={requiredParamIdsToPaths}
            onResizeStart={handleColumnResizeStart}
            isTopLevel={true}
            listKey="pinned"
            hasSectionStyleTheme={hasSectionStyleTheme}
          />
        </div>
      </div>
    </section>
  );
}

function GetUnpinnedParams({
  sectionId,
  handleColumnResizeStart,
  setMaxNestedDepth,
}: GetUnpinnedParamsProps) {
  const {
    hideUnpinnedParams,
    requiredParamIdsToPaths,
    topLevelParamIds,
    hasPinnedParams,
    positionAndSizeLocked,
    styleColor,
  } = useProjectState(
    (x) => selectUnpinnedParamsState(x, sectionId),
    _.isEqual,
  );
  const hasSectionStyleTheme = useHasSectionStyleTheme(sectionId, styleColor);

  const { canEditLayout } = useShareCapabilities();
  const sizingPolicy = useSettings((x) => x.sectionSizingPolicy, _.isEqual);
  const heightKey = getUnpinnedParamsAreaHeightKey(sectionId);
  const resolvedMinHeight = resolveUnpinnedParamsAreaMinHeight(
    sizingPolicy,
    hasPinnedParams,
  );
  const shouldApplyMinHeight = shouldApplyUnpinnedAreaMinHeight({
    hideUnpinnedParams,
    canEditLayout,
    positionAndSizeLocked,
  });

  const maxNestedDepth = getLongestListLength(requiredParamIdsToPaths);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { ref: scrollRef, isScrollable } = useIsScrollable();

  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      scrollRef.current = node;
    },
    [scrollRef],
  );

  useEffect(() => {
    setMaxNestedDepth((s) => ({ ...s, unpinned: maxNestedDepth }));
  }, [maxNestedDepth]);

  useMeasuredParamAreaMinHeight({
    sectionId,
    heightKey,
    paramIds: hideUnpinnedParams ? [] : topLevelParamIds,
    contentRef: containerRef,
    rowsRef: containerRef,
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className={`section-args-nested grid min-h-0 min-w-0 !max-w-full flex-1 auto-rows-min grid-cols-subgrid content-start gap-y-1 overflow-x-clip overflow-y-scroll py-2 pr-1.5 ${
          isScrollable ? "nowheel" : ""
        }`}
        ref={setContainerRef}
        style={
          shouldApplyMinHeight ? { minHeight: resolvedMinHeight } : undefined
        }
      >
        {!hideUnpinnedParams && (
          <ParamDndList
            sectionId={sectionId}
            paramIds={topLevelParamIds}
            requiredParamIdsToPaths={requiredParamIdsToPaths}
            onResizeStart={handleColumnResizeStart}
            isTopLevel={true}
            listKey="unpinned"
            hasSectionStyleTheme={hasSectionStyleTheme}
          />
        )}
      </div>
    </div>
  );
}

function getLongestListLength(obj: Record<string, Array<string>>) {
  return Object.values(obj).reduce(
    (max, arr) => (arr.length > max ? arr.length : max),
    0,
  );
}

function filterEdgeInputs(
  requiredParamIdsToPaths: Record<string, Array<string>>,
  topLevelParamIds: Array<string>,
  edgeInputParams: Array<string>,
) {
  if (edgeInputParams.length === 0) {
    return { requiredParamIdsToPaths, topLevelParamIds };
  }
  const edgeInputSet = new Set(edgeInputParams);
  const filteredParamIdsToPaths: Record<string, Array<string>> = {};
  for (const [paramId, path] of Object.entries(requiredParamIdsToPaths)) {
    if (!edgeInputSet.has(paramId)) {
      filteredParamIdsToPaths[paramId] = path;
    }
  }
  const filteredTopLevel = topLevelParamIds.filter(
    (paramId) => !edgeInputSet.has(paramId),
  );
  return {
    requiredParamIdsToPaths: filteredParamIdsToPaths,
    topLevelParamIds: filteredTopLevel,
  };
}
