import { ParamDndContext } from "forks/dnd-kit/ParamDndContext";
import { Handle } from "forks/xyflow/core/components/Handle";
import _ from "lodash";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
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
  getParamDisplayName,
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
  type ZustandProjectState,
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
} from "utils/generatedTypes";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { resolveEdgeStripHeight } from "./edgeStripUtils";
import type { DictAreaBlockFrameMountPacket } from "./groupContainerBlockFramePackets";
import { buildLiveDictAreaNodeDrawPacket } from "./groupContainerNodeDrawPacket";
import {
  buildLiveDictAreaNodeCanvasPacket,
  type LiveDictAreaEdgeStripCanvasPacket,
  type LiveDictAreaPinnedParamAreaCanvasPacket,
  type LiveDictAreaUnpinnedParamAreaPainterPacket,
} from "./groupContainerNodeCanvasPacket";
import { buildLiveDictAreaNodeScenePacket } from "./groupContainerNodeScenePacket";
import {
  buildLiveDictAreaNodeSurfacePacket,
} from "./groupContainerNodeSurfacePacket";
import type { LiveDictAreaPinnedParamAreaVisualPacket } from "./groupContainerPinnedParamAreaVisualPacket";
import type { LiveDictAreaUnpinnedParamAreaVisualPacket } from "./groupContainerUnpinnedParamAreaVisualPacket";
import { getPinnedParamsBgClassName } from "./groupContainerView";
import {
  buildParamAreaMeasureKey,
  measureParamAreaMinHeight,
} from "./paramAreaMeasurements";
import { attachParamAreaObservers } from "./paramAreaObservers";
import { ParamDndList } from "./ParamDndList";

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
      const outerStyle = window.getComputedStyle(outer);
      const paddingHeight =
        (Number.parseFloat(outerStyle.paddingTop) || 0) +
        (Number.parseFloat(outerStyle.paddingBottom) || 0);
      const outerMarginHeight =
        (Number.parseFloat(outerStyle.marginTop) || 0) +
        (Number.parseFloat(outerStyle.marginBottom) || 0);
      let totalHeight = paddingHeight + outerMarginHeight;
      for (const element of fixedElements) {
        const style = window.getComputedStyle(element);
        const marginHeight =
          (Number.parseFloat(style.marginTop) || 0) +
          (Number.parseFloat(style.marginBottom) || 0);
        totalHeight += element.offsetHeight + marginHeight;
      }
      const nextFixedHeight = Math.round(totalHeight);
      if (waitingForResultRef.current) {
        pendingFixedHeightRef.current = nextFixedHeight;
        return;
      }
      if (lastFixedHeightRef.current === nextFixedHeight) {
        return;
      }
      lastFixedHeightRef.current = nextFixedHeight;
      useTemporaryMiscState.setState({
        [paramsFixedHeightKey]: nextFixedHeight,
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
    useTemporaryMiscState.setState({
      [paramsFixedHeightKey]: pendingHeight,
    });
  }, [paramsFixedHeightKey, waitingForResult]);

  const {
    edgeInputPorts,
    hideUnpinnedParams,
    paramFilter,
    positionAndSizeLocked,
    edgeInputParams,
    edgeOutputPorts,
    pinnedRequiredParamIdsToPaths,
    pinnedTopLevelParamIds,
    selectedParams,
    unpinnedRequiredParamIdsToPaths,
    unpinnedTopLevelParamIds,
    styleColor,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const pinned = getCurrShownParamIds(state, sectionId, true, true);
    const unpinned = getCurrShownParamIds(state, sectionId, false, true);

    return {
      edgeInputPorts: impl.edgeInputParams.map((paramId) => {
        const path = {
          ...pinned.requiredParamIdsToPaths,
          ...unpinned.requiredParamIdsToPaths,
        }[paramId];
        const rawLabel = path
          ? paramNameFromPathArray(state, sectionId, path)
          : getParamDisplayName(state, sectionId, paramId);
        const label = rawLabel.trim().length === 0 ? "(unnamed)" : rawLabel;
        return { id: paramId, label };
      }),
      hideUnpinnedParams: impl.hideUnpinnedParams,
      paramFilter: impl.paramFilter,
      positionAndSizeLocked: impl.positionAndSizeLocked,
      edgeInputParams: impl.edgeInputParams,
      edgeOutputPorts: impl.edgeOutputPorts.map((port) => ({
        id: port.id,
        label:
          port.accessor.trim() === "" ? C.EDGE_OUTPUT_BASE_LABEL : port.accessor,
      })),
      pinnedRequiredParamIdsToPaths: pinned.requiredParamIdsToPaths,
      pinnedTopLevelParamIds: pinned.topLevelParamIds,
      selectedParams: impl.selectedParams ?? [],
      unpinnedRequiredParamIdsToPaths: unpinned.requiredParamIdsToPaths,
      unpinnedTopLevelParamIds: unpinned.topLevelParamIds,
      styleColor: impl.styleColor ?? null,
    };
  }, _.isEqual);
  const { canEditLayout, canEditStructure } = useShareCapabilities();
  const isSelectingParams = useMisc((x) => x.isSelectingParams);
  const unpinnedParamsAreaMinHeight = useSettings(
    (state) => state.sectionSizingPolicy.globals.unpinnedParamsAreaMinHeight,
  );
  const allRequiredParamIdsToPaths = useMemo(
    () => ({
      ...pinnedRequiredParamIdsToPaths,
      ...unpinnedRequiredParamIdsToPaths,
    }),
    [pinnedRequiredParamIdsToPaths, unpinnedRequiredParamIdsToPaths],
  );
  const allTopLevelParamIds = useMemo(
    () => [...pinnedTopLevelParamIds, ...unpinnedTopLevelParamIds],
    [pinnedTopLevelParamIds, unpinnedTopLevelParamIds],
  );
  const displayNamesById = useProjectState(
    (state) =>
      buildParamDisplayNameMap({
        state,
        sectionId,
        topLevelParamIds: allTopLevelParamIds,
        requiredParamIdsToPaths: allRequiredParamIdsToPaths,
      }),
    _.isEqual,
  );
  const liveDictAreaNodeScenePacket = useMemo(
    () =>
      buildLiveDictAreaNodeScenePacket({
        canConnect: canEditStructure && !isSelectingParams,
        edgeInputParams,
        hideUnpinnedParams,
        paramFilter,
        getParamDisplayName: (paramId: string) =>
          displayNamesById[paramId] ?? paramId,
        inputPorts: edgeInputPorts,
        isSelectingParams,
        outputPorts: edgeOutputPorts,
        pinned: {
          requiredParamIdsToPaths: pinnedRequiredParamIdsToPaths,
          topLevelParamIds: pinnedTopLevelParamIds,
        },
        selectedParamIds: selectedParams,
        unpinned: {
          canEditLayout,
          configuredMinHeight: unpinnedParamsAreaMinHeight,
          pinnedRequiredParamIdsToPaths,
          pinnedTopLevelParamIds,
          positionAndSizeLocked,
          requiredParamIdsToPaths: unpinnedRequiredParamIdsToPaths,
          topLevelParamIds: unpinnedTopLevelParamIds,
        },
      }),
    [
      canEditLayout,
      canEditStructure,
      displayNamesById,
      edgeInputParams,
      edgeInputPorts,
      edgeOutputPorts,
      hideUnpinnedParams,
      isSelectingParams,
      paramFilter,
      pinnedRequiredParamIdsToPaths,
      pinnedTopLevelParamIds,
      positionAndSizeLocked,
      selectedParams,
      unpinnedParamsAreaMinHeight,
      unpinnedRequiredParamIdsToPaths,
      unpinnedTopLevelParamIds,
    ],
  );
  const liveDictAreaNodeSurfacePacket = useMemo(
    () =>
      buildLiveDictAreaNodeSurfacePacket({
        bgColor,
        nodeScenePacket: liveDictAreaNodeScenePacket,
        positionAndSizeLocked,
        sectionTypeName,
        styleColor,
      }),
    [
      bgColor,
      liveDictAreaNodeScenePacket,
      positionAndSizeLocked,
      sectionTypeName,
      styleColor,
    ],
  );
  const liveDictAreaNodeDrawPacket = useMemo(
    () =>
      buildLiveDictAreaNodeDrawPacket({
        nodeSurfacePacket: liveDictAreaNodeSurfacePacket,
      }),
    [liveDictAreaNodeSurfacePacket],
  );
  const liveDictAreaNodeCanvasPacket = useMemo(
    () =>
      buildLiveDictAreaNodeCanvasPacket({
        nodeDrawPacket: liveDictAreaNodeDrawPacket,
      }),
    [liveDictAreaNodeDrawPacket],
  );

  useEffect(() => {
    setMaxNestedDepth(liveDictAreaNodeCanvasPacket.maxNestedDepth);
  }, [liveDictAreaNodeCanvasPacket.maxNestedDepth, setMaxNestedDepth]);

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
        {liveDictAreaNodeCanvasPacket.domBlocks.map((block) => {
          if (block.kind === "edge-strip") {
            return (
              <EdgesStrip
                key={block.mount.frameId}
                sectionId={sectionId}
                canvasPacket={block}
              />
            );
          }

          if (block.kind === "pinned-param-area") {
            return (
              <GetPinnedParams
                key={block.mount.frameId}
                sectionId={sectionId}
                canvasPacket={block}
                handleColumnResizeStart={handleColumnResizeStart}
              />
            );
          }

          return (
            <GetUnpinnedParams
              key={block.mount.frameId}
              sectionId={sectionId}
              painterPacket={block}
              handleColumnResizeStart={handleColumnResizeStart}
            />
          );
        })}
      </div>
    </ParamDndContext>
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);

type DictAreaBlockFrameDataProps = {
  "data-dict-area-block-frame-id": string;
  "data-dict-area-block-id": string;
  "data-dict-area-block-mount-kind": "fixed" | "grow";
  "data-dict-area-block-order-index": number;
};

function getDictAreaBlockFrameDataProps({
  blockId,
  frame,
}: {
  blockId: string;
  frame: DictAreaBlockFrameMountPacket;
}): DictAreaBlockFrameDataProps {
  return {
    "data-dict-area-block-frame-id": frame.frameId,
    "data-dict-area-block-id": blockId,
    "data-dict-area-block-mount-kind": frame.mountKind,
    "data-dict-area-block-order-index": frame.orderIndex,
  };
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
  canvasPacket,
}: {
  sectionId: string;
  canvasPacket: LiveDictAreaEdgeStripCanvasPacket;
}) {
  const { bgColor, positionAndSizeLocked, styleColor, visualPacket } =
    canvasPacket;
  const lastHeightRef = useRef(0);
  const stripRef = useRef<HTMLElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const heightKey = getEdgesStripHeightKey(sectionId);
  const darkMode = useLocalStorage((x) => x.darkMode);
  const styleColorPreviewKey = getSectionStylePreviewColorKey(sectionId);
  const previewStyleColor = useTemporaryMiscState(
    (x) => x[styleColorPreviewKey] as string | null | undefined,
  );
  const resolvedStyleColor =
    previewStyleColor === undefined ? styleColor : previewStyleColor;
  const hasSectionStyleTheme = Boolean(
    resolvedStyleColor
      ? deriveSectionStyleTheme(resolvedStyleColor, darkMode)
      : null,
  );
  const hasEdges =
    visualPacket.inputPortCount > 0 || visualPacket.outputPortCount > 0;
  const handlePreventSectionClassName = `${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS}`;
  const rowPreventSectionClassName = visualPacket.inputColumn.ports.some(
    (port) => port.isSelectable,
  )
    ? handlePreventSectionClassName
    : "";
  const handleSelectableClassName = visualPacket.inputColumn.ports.some(
    (port) => port.isSelectable,
  )
    ? "arg-edge-handle--selecting"
    : "";
  const stripBorderColorClassName = hasSectionStyleTheme
    ? "border-[color:var(--setta-section-style-border)]"
    : "border-white dark:border-setta-700/30";
  const edgeLabelColorClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)]"
    : "text-setta-300 dark:text-setta-500";
  const edgeRowHoverClassName = hasSectionStyleTheme
    ? "hover:bg-[color:var(--setta-section-style-border)]"
    : "hover:bg-setta-100/50 hover:dark:bg-setta-800/70";
  const edgeRowSelectedClassName = hasSectionStyleTheme
    ? "!bg-[color:var(--setta-section-style-outline)] !text-[color:var(--setta-section-style-text)] [&_*]:!text-[color:var(--setta-section-style-text)] active:!bg-[color:var(--setta-section-style-border)]"
    : "!bg-blue-700 !text-white active:!bg-cyan-300";
  const edgeRowTextColorClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)]"
    : "text-setta-600 dark:text-setta-200";
  const dividerColorClassName = hasSectionStyleTheme
    ? "bg-[color:var(--setta-section-style-border)]"
    : "bg-setta-200/80 dark:bg-setta-700/60";
  const edgeStripBgColorClassName = hasSectionStyleTheme
    ? "bg-[color:var(--setta-section-style-panel-bg)]"
    : bgColor;

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
  }, [hasEdges, visualPacket.inputPortCount, visualPacket.outputPortCount]);

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
      inputPortCount: visualPacket.inputPortCount,
      outputPortCount: visualPacket.outputPortCount,
    });
    if (nextHeight === lastHeightRef.current) {
      return;
    }
    lastHeightRef.current = nextHeight;
    useTemporaryMiscState.setState({ [heightKey]: nextHeight });
  }, [
    hasEdges,
    heightKey,
    visualPacket.inputPortCount,
    measuredHeight,
    visualPacket.outputPortCount,
  ]);

  useEffect(() => {
    return () => {
      if (lastHeightRef.current !== 0) {
        lastHeightRef.current = 0;
        useTemporaryMiscState.setState({ [heightKey]: 0 });
      }
    };
  }, [heightKey]);

  let roundedBottomClassName = "";
  if (visualPacket.shouldRoundBottom) {
    roundedBottomClassName = positionAndSizeLocked
      ? "rounded-b-sm"
      : "rounded-b-xl";
  }

  return (
    <section
      className={`section-w-full section-row-pin-main relative z-0 -mt-4 flex shrink-0 flex-col overflow-visible border-b pt-5 ${stripBorderColorClassName} ${edgeStripBgColorClassName} ${roundedBottomClassName}`}
      ref={stripRef}
      data-params-fixed="true"
      {...getDictAreaBlockFrameDataProps({
        blockId: visualPacket.blockId,
        frame: visualPacket.mount,
      })}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_0.75rem_minmax(0,1fr)] py-2">
        <div className="flex flex-col pl-2">
          <div
            className={`text-[0.5rem] font-bold uppercase ${edgeLabelColorClassName}`}
          >
            {visualPacket.inputColumn.title}
          </div>
          <div className="-ml-2 flex flex-col gap-1 pt-1">
            {visualPacket.inputColumn.ports.map((port) => (
              <div
                key={port.id}
                className={`relative flex items-center gap-2 rounded-sm px-2 py-1 text-[0.65rem] transition-colors ${edgeRowHoverClassName} ${
                  port.isSelected
                    ? edgeRowSelectedClassName
                    : edgeRowTextColorClassName
                } ${port.isSelectable ? "cursor-pointer" : ""} ${rowPreventSectionClassName}`}
                onMouseDown={(e) => {
                  if (!port.isSelectable) {
                    return;
                  }
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  if (!port.isSelectable) {
                    return;
                  }
                  e.stopPropagation();
                  toggleParamSelected(sectionId, port.id);
                }}
                data-edge-param-id={port.id}
                data-edge-param-side="in"
              >
                <Handle
                  id={port.id}
                  type={port.handleType}
                  position={port.handlePosition}
                  onConnect={createEdgeFromConnection}
                  isValidConnection={isValidDataEdgeConnection}
                  isConnectable={visualPacket.canConnect}
                  isConnectableStart={visualPacket.canConnect}
                  isConnectableEnd={visualPacket.canConnect}
                  className={`arg-edge-handle arg-edge-handle--target ${handlePreventSectionClassName} ${handleSelectableClassName}`}
                  onClick={(e) => {
                    if (!port.isSelectable) {
                      return;
                    }
                    e.stopPropagation();
                    toggleParamSelected(sectionId, port.id);
                  }}
                />
                <span className="truncate">{port.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div
          className="pointer-events-none flex items-stretch justify-center"
          aria-hidden="true"
        >
          <div className={`h-full w-px ${dividerColorClassName}`} />
        </div>
        <div className="flex flex-col pr-2">
          <div
            className={`text-right text-[0.5rem] font-bold uppercase ${edgeLabelColorClassName}`}
          >
            {visualPacket.outputColumn.title}
          </div>
          <div className="-mr-2 flex flex-col gap-1 pt-1">
            {visualPacket.outputColumn.ports.map((port) => (
              <div
                key={port.id}
                className={`relative flex items-center justify-end gap-2 rounded-sm px-2 py-1 text-[0.65rem] transition-colors ${edgeRowTextColorClassName} ${edgeRowHoverClassName}`}
              >
                <span className="truncate">{port.label}</span>
                <Handle
                  id={port.id}
                  type={port.handleType}
                  position={port.handlePosition}
                  onConnect={createEdgeFromConnection}
                  isValidConnection={isValidDataEdgeConnection}
                  isConnectable={visualPacket.canConnect}
                  isConnectableStart={visualPacket.canConnect}
                  isConnectableEnd={visualPacket.canConnect}
                  className={`arg-edge-handle arg-edge-handle--source ${handlePreventSectionClassName}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type GetPinnedParamsProps = {
  sectionId: string;
  canvasPacket: LiveDictAreaPinnedParamAreaCanvasPacket;
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
};

type PinnedParamsAreaProps = {
  sectionId: string;
  visualPacket: LiveDictAreaPinnedParamAreaVisualPacket;
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  hasSectionStyleTheme: boolean;
  positionAndSizeLocked: boolean;
  sectionTypeName: SectionTypeEnum;
  contentRef: React.RefObject<HTMLDivElement>;
  headerRef: React.RefObject<HTMLElement>;
  rowsRef: React.RefObject<HTMLDivElement>;
};

type GetUnpinnedParamsProps = {
  sectionId: string;
  painterPacket: LiveDictAreaUnpinnedParamAreaPainterPacket;
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
};

type UnpinnedParamsAreaProps = {
  sectionId: string;
  visualPacket: LiveDictAreaUnpinnedParamAreaVisualPacket;
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  hasSectionStyleTheme: boolean;
  isScrollable: boolean;
  setContainerRef: React.RefCallback<HTMLDivElement>;
};

function buildParamDisplayNameMap({
  state,
  sectionId,
  topLevelParamIds,
  requiredParamIdsToPaths,
}: {
  state: ZustandProjectState;
  sectionId: string;
  topLevelParamIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
}): Record<string, string> {
  const paramIds = new Set(topLevelParamIds);

  Object.values(requiredParamIdsToPaths).forEach((path) => {
    path.forEach((paramId) => {
      paramIds.add(paramId);
    });
  });

  const displayNamesById: Record<string, string> = {};
  for (const paramId of paramIds) {
    displayNamesById[paramId] = getParamDisplayName(state, sectionId, paramId);
  }

  return displayNamesById;
}

function GetPinnedParams({
  sectionId,
  canvasPacket,
  handleColumnResizeStart,
}: GetPinnedParamsProps) {
  const { positionAndSizeLocked, sectionTypeName, styleColor, visualPacket } =
    canvasPacket;
  const darkMode = useLocalStorage((x) => x.darkMode);
  const styleColorPreviewKey = getSectionStylePreviewColorKey(sectionId);
  const previewStyleColor = useTemporaryMiscState(
    (x) => x[styleColorPreviewKey] as string | null | undefined,
  );
  const resolvedStyleColor =
    previewStyleColor === undefined ? styleColor : previewStyleColor;
  const hasSectionStyleTheme = Boolean(
    resolvedStyleColor
      ? deriveSectionStyleTheme(resolvedStyleColor, darkMode)
      : null,
  );
  const contentRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const heightKey = getPinnedParamsAreaHeightKey(sectionId);

  useMeasuredParamAreaMinHeight({
    sectionId,
    heightKey,
    paramIds: visualPacket.list.topLevelParamIds,
    contentRef,
    headerRef,
    rowsRef,
  });

  return (
    <PinnedParamsArea
      sectionId={sectionId}
      visualPacket={visualPacket}
      handleColumnResizeStart={handleColumnResizeStart}
      hasSectionStyleTheme={hasSectionStyleTheme}
      positionAndSizeLocked={positionAndSizeLocked}
      sectionTypeName={sectionTypeName}
      contentRef={contentRef}
      headerRef={headerRef}
      rowsRef={rowsRef}
    />
  );
}

function PinnedParamsArea({
  sectionId,
  visualPacket,
  handleColumnResizeStart,
  hasSectionStyleTheme,
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
  if (visualPacket.shouldRoundBottom) {
    roundedBottomClassName = positionAndSizeLocked
      ? "rounded-b-sm"
      : "rounded-b-xl";
  }

  return (
    <section
      className={`relative flex min-h-0 w-full shrink-0 flex-col items-start border-b shadow-sm ${pinnedBorderColorClassName} ${pinnedBgClassName} ${roundedBottomClassName}`}
      data-params-fixed="true"
      {...getDictAreaBlockFrameDataProps({
        blockId: visualPacket.blockId,
        frame: visualPacket.mount,
      })}
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
            {visualPacket.header.title}
          </p>
        </header>

        <div
          className="section-args-nested section-key-value section-min-rows grid min-h-0 w-full flex-1 grid-cols-subgrid content-start gap-y-1 pr-1.5"
          ref={rowsRef}
        >
          <ParamDndList
            sectionId={sectionId}
            paramIds={visualPacket.list.topLevelParamIds}
            requiredParamIdsToPaths={visualPacket.list.requiredParamIdsToPaths}
            onResizeStart={handleColumnResizeStart}
            isTopLevel={true}
            listKey={visualPacket.list.listKey}
            hasSectionStyleTheme={hasSectionStyleTheme}
          />
        </div>
      </div>
    </section>
  );
}

function GetUnpinnedParams({
  sectionId,
  painterPacket,
  handleColumnResizeStart,
}: GetUnpinnedParamsProps) {
  const { styleColor, visualPacket } = painterPacket;
  const darkMode = useLocalStorage((x) => x.darkMode);
  const styleColorPreviewKey = getSectionStylePreviewColorKey(sectionId);
  const previewStyleColor = useTemporaryMiscState(
    (x) => x[styleColorPreviewKey] as string | null | undefined,
  );
  const resolvedStyleColor =
    previewStyleColor === undefined ? styleColor : previewStyleColor;
  const hasSectionStyleTheme = Boolean(
    resolvedStyleColor
      ? deriveSectionStyleTheme(resolvedStyleColor, darkMode)
      : null,
  );
  const heightKey = getUnpinnedParamsAreaHeightKey(sectionId);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { ref: scrollRef, isScrollable } = useIsScrollable();

  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      scrollRef.current = node;
    },
    [scrollRef],
  );

  useMeasuredParamAreaMinHeight({
    sectionId,
    heightKey,
    paramIds: visualPacket.list.topLevelParamIds,
    contentRef: containerRef,
    rowsRef: containerRef,
  });

  return (
    <UnpinnedParamsArea
      sectionId={sectionId}
      visualPacket={visualPacket}
      handleColumnResizeStart={handleColumnResizeStart}
      hasSectionStyleTheme={hasSectionStyleTheme}
      isScrollable={isScrollable}
      setContainerRef={setContainerRef}
    />
  );
}

function UnpinnedParamsArea({
  sectionId,
  visualPacket,
  handleColumnResizeStart,
  hasSectionStyleTheme,
  isScrollable,
  setContainerRef,
}: UnpinnedParamsAreaProps) {
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      {...getDictAreaBlockFrameDataProps({
        blockId: visualPacket.blockId,
        frame: visualPacket.mount,
      })}
    >
      <div
        className={`section-args-nested grid min-h-0 min-w-0 !max-w-full flex-1 auto-rows-min grid-cols-subgrid content-start gap-y-1 overflow-x-clip overflow-y-scroll py-2 pr-1.5 ${
          isScrollable ? "nowheel" : ""
        }`}
        ref={setContainerRef}
        style={
          visualPacket.container.shouldApplyMinHeight
            ? { minHeight: visualPacket.container.minHeight }
            : undefined
        }
      >
        <ParamDndList
          sectionId={sectionId}
          paramIds={visualPacket.list.topLevelParamIds}
          requiredParamIdsToPaths={visualPacket.list.requiredParamIdsToPaths}
          onResizeStart={handleColumnResizeStart}
          isTopLevel={true}
          listKey={visualPacket.list.listKey}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      </div>
    </div>
  );
}
