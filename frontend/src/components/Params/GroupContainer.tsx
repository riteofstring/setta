import { ResizableWithScale } from "components/Utils/Resizable/ResizableWithScale";
import { Handle } from "forks/xyflow/core/components/Handle";
import { useReactFlow } from "forks/xyflow/core/store";
import { HandlePosition } from "forks/xyflow/core/types";
import _ from "lodash";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createEdgeFromConnection } from "state/actions/edges";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrShownParamIds,
  getParamDisplayName,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { paramNameFromPathArray } from "state/actions/sections/sectionContents";
import {
  useProjectState,
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
  getPinnedParamsMinHeightKey,
  getParamGroupPaddingKey,
  getUnpinnedParamsMinHeightKey,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { route_set_section_pinned_area_height } from "utils/generatedEndpoints";
import { GetParamSwitch } from "./GetParamSwitch";
import { getPinnedResizeHeight, type ResizeDelta } from "./pinnedResize";

type ResizeHandleDirection =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "topRight"
  | "bottomRight"
  | "bottomLeft"
  | "topLeft";
type ResizeStartArgs = [
  event: MouseEvent | TouchEvent,
  direction: ResizeHandleDirection,
  ref: HTMLElement,
];
type ResizeArgs = [
  event: MouseEvent | TouchEvent,
  direction: ResizeHandleDirection,
  ref: HTMLElement,
  delta: ResizeDelta,
];

function _ParamGroupContainer({ sectionId }: { sectionId: string }) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [maxNestedDepth, setMaxNestedDepth] = useState({
    pinned: 1,
    unpinned: 1,
  });
  const [unpinnedMinHeight, setUnpinnedMinHeight] = useState<number | null>(
    null,
  );

  const handleColumnResizeStart = useParamColumnWidth({
    sectionId,
    outerRef,
    maxNestedDepth: Math.max(maxNestedDepth.pinned, maxNestedDepth.unpinned),
  });

  const waitingForResult = useParametersRequestWaitingForLSPResult(sectionId);

  return (
    <div
      className="section-w-full section-row-pin-main -mt-3 flex min-h-0 flex-col overflow-y-hidden pt-2"
      ref={outerRef}
    >
      {waitingForResult ? (
        <i className="section-args gg-spinner mt-3 !scale-100 place-self-center before:!border-t-blue-500 after:!border-blue-500" />
      ) : (
        <>
          <EdgesStrip sectionId={sectionId} />
          <GetPinnedParams
            sectionId={sectionId}
            outerRef={outerRef}
            handleColumnResizeStart={handleColumnResizeStart}
            setMaxNestedDepth={setMaxNestedDepth}
            unpinnedMinHeight={unpinnedMinHeight}
          />
          <GetUnpinnedParams
            sectionId={sectionId}
            handleColumnResizeStart={handleColumnResizeStart}
            setMaxNestedDepth={setMaxNestedDepth}
            setUnpinnedMinHeight={setUnpinnedMinHeight}
            unpinnedMinHeight={unpinnedMinHeight}
          />
        </>
      )}
    </div>
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);

function EdgesStrip({ sectionId }: { sectionId: string }) {
  const { canEditStructure } = useShareCapabilities();
  const edgesStripRef = useRef<HTMLDivElement | null>(null);
  const lastHeightRef = useRef(0);
  const lastPortsKeyRef = useRef<string | null>(null);
  const heightKey = getEdgesStripHeightKey(sectionId);
  const { inputPorts, outputPorts, shouldRoundBottom, positionAndSizeLocked } =
    useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const pinned = getCurrShownParamIds(state, sectionId, true, true);
    const unpinned = getCurrShownParamIds(state, sectionId, false, true);
    const requiredParamIdsToPaths = {
      ...pinned.requiredParamIdsToPaths,
      ...unpinned.requiredParamIdsToPaths,
    };
    const inputPorts = impl.edgeInputParams
      .map((paramId) => {
        const path = requiredParamIdsToPaths[paramId];
        const label = path
          ? paramNameFromPathArray(state, sectionId, path)
          : getParamDisplayName(state, sectionId, paramId);
        return { id: paramId, label };
      })
      .filter((entry) => entry.label.length > 0);
    const outputPorts = impl.edgeOutputPorts.map((port) => ({
      id: port.id,
      label:
        port.accessor.trim() === "" ? C.EDGE_OUTPUT_BASE_LABEL : port.accessor,
    }));
    const filteredPinned = filterEdgeInputs(
      pinned.requiredParamIdsToPaths,
      pinned.topLevelParamIds,
      impl.edgeInputParams,
    );
    const filteredUnpinned = filterEdgeInputs(
      unpinned.requiredParamIdsToPaths,
      unpinned.topLevelParamIds,
      impl.edgeInputParams,
    );
    const hasPinnedParams = filteredPinned.topLevelParamIds.length > 0;
    const hasUnpinnedParams =
      !impl.hideUnpinnedParams && filteredUnpinned.topLevelParamIds.length > 0;
    return {
      inputPorts,
      outputPorts,
      shouldRoundBottom: !hasPinnedParams && !hasUnpinnedParams,
      positionAndSizeLocked: impl.positionAndSizeLocked,
    };
  }, _.isEqual);

  const hasEdges = inputPorts.length > 0 || outputPorts.length > 0;

  const portsKey = `${inputPorts
    .map((port) => port.label)
    .join("|")}::${outputPorts.map((port) => port.label).join("|")}`;

  useEffect(() => {
    if (!hasEdges) {
      const currentHeight = useTemporaryMiscState.getState()[heightKey];
      if (currentHeight !== 0) {
        lastHeightRef.current = 0;
        useTemporaryMiscState.setState({ [heightKey]: 0 });
      }
      return;
    }

    const node = edgesStripRef.current;
    if (!node) {
      return;
    }

    const shouldReset = lastPortsKeyRef.current !== portsKey;
    if (shouldReset) {
      lastPortsKeyRef.current = portsKey;
      lastHeightRef.current = 0;
    }
    let allowDecrease = shouldReset;

    const updateHeight = (height: number) => {
      const nextHeight = Math.ceil(height);
      if (!allowDecrease && nextHeight <= lastHeightRef.current) {
        return;
      }
      if (lastHeightRef.current === nextHeight) {
        return;
      }
      lastHeightRef.current = nextHeight;
      useTemporaryMiscState.setState({ [heightKey]: nextHeight });
      if (allowDecrease) {
        allowDecrease = false;
      }
    };

    const measureHeight = () => {
      const zoom = useReactFlow.getState().transform[2];
      const rectHeight = node.getBoundingClientRect().height / zoom;
      const style = window.getComputedStyle(node);
      const marginHeight =
        (Number.parseFloat(style.marginTop) || 0) +
        (Number.parseFloat(style.marginBottom) || 0);
      const measuredHeight =
        Math.max(node.scrollHeight, rectHeight) + marginHeight;
      updateHeight(Math.max(measuredHeight, 0));
    };

    const observer = new ResizeObserver(() => {
      measureHeight();
    });

    observer.observe(node);
    measureHeight();

    return () => observer.disconnect();
  }, [hasEdges, heightKey, portsKey]);

  if (!hasEdges) {
    return null;
  }

  let roundedBottomClassName = "";
  if (shouldRoundBottom) {
    roundedBottomClassName = positionAndSizeLocked
      ? "rounded-b-sm"
      : "rounded-b-xl";
  }

  return (
    <section
      className={`section-w-full section-row-pin-main relative z-0 -mt-4 flex shrink-0 flex-col overflow-hidden border-b border-white bg-setta-100 pt-5 dark:border-setta-700/30 dark:bg-setta-860 ${roundedBottomClassName}`}
      ref={edgesStripRef}
    >
      <div className="pointer-events-none absolute inset-y-5 left-1/2 w-px bg-transparent shadow-[6px_0_12px_-8px_rgba(15,23,42,0.2)] dark:bg-setta-700/50 dark:shadow-none" />
      <div className="grid grid-cols-2">
        <div className="flex flex-col px-2 pb-3">
          <div className="text-[0.5rem] font-bold uppercase text-setta-300 dark:text-setta-500">
            In
          </div>
          <div className="flex flex-col gap-1 pt-1">
            {inputPorts.map((port) => (
              <div
                key={port.id}
              className="relative flex items-center gap-2 rounded-sm px-2 py-1 text-[0.65rem] text-slate-700 transition-colors hover:bg-setta-100/50 dark:text-slate-200 hover:dark:bg-setta-800/70"
            >
              <Handle
                id={port.id}
                type="target"
                position={HandlePosition.Left}
                onConnect={createEdgeFromConnection}
                isConnectable={canEditStructure}
                isConnectableStart={canEditStructure}
                isConnectableEnd={canEditStructure}
              />
              <span className="truncate">{port.label}</span>
            </div>
          ))}
          </div>
        </div>
        <div className="flex flex-col px-2 pb-3">
          <div className="text-right text-[0.5rem] font-bold uppercase text-setta-300 dark:text-setta-500">
            Out
          </div>
          <div className="flex flex-col gap-1 pt-1">
            {outputPorts.map((port) => (
              <div
                key={port.id}
              className="relative flex items-center justify-end gap-2 rounded-sm px-2 py-1 text-[0.65rem] text-slate-700 transition-colors hover:bg-setta-100/50 dark:text-slate-200 hover:dark:bg-setta-800/70"
            >
              <span className="truncate">{port.label}</span>
              <Handle
                id={port.id}
                type="source"
                position={HandlePosition.Right}
                onConnect={createEdgeFromConnection}
                isConnectable={canEditStructure}
                isConnectableStart={canEditStructure}
                isConnectableEnd={canEditStructure}
              />
            </div>
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
  outerRef: React.RefObject<HTMLDivElement | null>;
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  setMaxNestedDepth: React.Dispatch<React.SetStateAction<MaxNestedDepth>>;
  unpinnedMinHeight: number | null;
};

type ResizablePinnedAreaProps = {
  sectionId: string;
  topLevelParamIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  outerRef: React.RefObject<HTMLDivElement | null>;
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  shouldRoundBottom: boolean;
  positionAndSizeLocked: boolean;
  unpinnedMinHeight: number | null;
};

type GetUnpinnedParamsProps = {
  sectionId: string;
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  setMaxNestedDepth: React.Dispatch<React.SetStateAction<MaxNestedDepth>>;
  setUnpinnedMinHeight: React.Dispatch<React.SetStateAction<number | null>>;
  unpinnedMinHeight: number | null;
};

function GetPinnedParams({
  sectionId,
  outerRef,
  handleColumnResizeStart,
  setMaxNestedDepth,
  unpinnedMinHeight,
}: GetPinnedParamsProps) {
  const {
    requiredParamIdsToPaths,
    topLevelParamIds,
    shouldRoundBottom,
    positionAndSizeLocked,
  } = useProjectState((x) => {
    const { requiredParamIdsToPaths, topLevelParamIds } = getCurrShownParamIds(
      x,
      sectionId,
      true,
      true,
    );
    const unpinned = getCurrShownParamIds(x, sectionId, false, true);
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const filtered = filterEdgeInputs(
      requiredParamIdsToPaths,
      topLevelParamIds,
      impl.edgeInputParams,
    );
    let shouldRoundBottom = false;
    if (impl.hideUnpinnedParams || unpinned.topLevelParamIds.length === 0) {
      shouldRoundBottom = true;
    }
    return {
      ...filtered,
      shouldRoundBottom,
      positionAndSizeLocked: impl.positionAndSizeLocked,
    };
  }, _.isEqual);

  const maxNestedDepth = getLongestListLength(requiredParamIdsToPaths);

  useEffect(() => {
    setMaxNestedDepth((s) => ({ ...s, pinned: maxNestedDepth }));
  }, [maxNestedDepth]);

  return (
    topLevelParamIds.length > 0 && (
      <ResizablePinnedArea
        sectionId={sectionId}
        topLevelParamIds={topLevelParamIds}
        requiredParamIdsToPaths={requiredParamIdsToPaths}
        outerRef={outerRef}
        handleColumnResizeStart={handleColumnResizeStart}
        shouldRoundBottom={shouldRoundBottom}
        positionAndSizeLocked={positionAndSizeLocked}
        unpinnedMinHeight={unpinnedMinHeight}
      />
    )
  );
}

function ResizablePinnedArea({
  sectionId,
  topLevelParamIds,
  requiredParamIdsToPaths,
  outerRef,
  handleColumnResizeStart,
  shouldRoundBottom,
  positionAndSizeLocked,
  unpinnedMinHeight,
}: ResizablePinnedAreaProps) {
  const { height, hasUnpinnedParams } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const unpinned = getCurrShownParamIds(x, sectionId, false, true);
    const filteredUnpinned = filterEdgeInputs(
      unpinned.requiredParamIdsToPaths,
      unpinned.topLevelParamIds,
      impl.edgeInputParams,
    );
    return {
      height: impl.pinnedAreaHeight,
      hasUnpinnedParams:
        !impl.hideUnpinnedParams &&
        filteredUnpinned.topLevelParamIds.length > 0,
    };
  }, _.isEqual);
  const { pinnedParamsAreaMinHeight, infiniteMaxHeight } = useSettings(
    (x) => ({
      pinnedParamsAreaMinHeight:
        x.sectionSizingPolicy.globals.pinnedParamsAreaMinHeight,
      infiniteMaxHeight: x.sectionSizingPolicy.globals.infiniteMaxHeight,
    }),
    _.isEqual,
  );
  const [initialMaxHeight, setInitialMaxHeight] = useState(infiniteMaxHeight);
  const [measuredContainerHeight, setMeasuredContainerHeight] = useState<
    number | null
  >(null);
  const [containerPadding, setContainerPadding] = useState(0);
  const isPinnedManual = typeof height === "number";
  const resizeStartHeightRef = useRef<number | null>(null);
  const didResizeRef = useRef(false);
  const lastMaxHeightRef = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [minContentHeight, setMinContentHeight] = useState<number | null>(null);
  const lastMeasuredMinHeightRef = useRef<number | null>(null);
  const edgesStripHeight = useTemporaryMiscState(
    (x) => x[getEdgesStripHeightKey(sectionId)] ?? 0,
  );
  const pinnedMinHeightKey = getPinnedParamsMinHeightKey(sectionId);
  const unpinnedMinHeightKey = getUnpinnedParamsMinHeightKey(sectionId);
  const paramGroupPaddingKey = getParamGroupPaddingKey(sectionId);
  const cachedUnpinnedMinHeight = useTemporaryMiscState(
    (x) => x[unpinnedMinHeightKey] ?? 0,
  );

  let resolvedUnpinnedMinHeight: number;
  if (unpinnedMinHeight !== null) {
    resolvedUnpinnedMinHeight = unpinnedMinHeight;
  } else if (cachedUnpinnedMinHeight > 0) {
    resolvedUnpinnedMinHeight = cachedUnpinnedMinHeight;
  } else {
    resolvedUnpinnedMinHeight = 0;
  }
  const reservedUnpinnedHeight = hasUnpinnedParams
    ? resolvedUnpinnedMinHeight
    : 0;

  const persistPinnedAreaHeight = useCallback(
    (nextHeight: number) => {
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
            state,
            sectionId,
            {
              pinnedAreaHeight: nextHeight,
            },
          );
        },
        send: (frontendOpId) =>
          route_set_section_pinned_area_height({
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            pinnedAreaHeight: nextHeight,
            frontendOpId,
          }),
      });
    },
    [sectionId],
  );

  function onResizeStart(...props: ResizeStartArgs) {
    const [, , ref] = props;
    didResizeRef.current = false;
    const parsedHeight = Number.parseFloat(ref.style.height);
    resizeStartHeightRef.current = Number.isFinite(parsedHeight)
      ? parsedHeight
      : ref.offsetHeight;
  }

  function onResize(...props: ResizeArgs) {
    const [, , , delta] = props;
    if (delta.height === 0 && delta.width === 0) {
      return;
    }
    didResizeRef.current = true;
  }

  function onResizeStop(...props: ResizeArgs) {
    const [, , ref, delta] = props;
    const didResize = didResizeRef.current;
    didResizeRef.current = false;
    const startHeight = resizeStartHeightRef.current;
    resizeStartHeightRef.current = null;
    if (!didResize) {
      return;
    }
    const parsedHeight = Number.parseFloat(ref.style.height);
    const measuredHeight = Number.isFinite(parsedHeight)
      ? parsedHeight
      : ref.offsetHeight;
    const hasStartHeight =
      typeof startHeight === "number" && Number.isFinite(startHeight);
    const effectiveDeltaHeight =
      delta.height !== 0 || !hasStartHeight
        ? delta.height
        : measuredHeight - startHeight;
    const nextHeight = getPinnedResizeHeight({
      didResize,
      delta: { height: effectiveDeltaHeight, width: delta.width },
      startHeight,
      styleHeight: hasStartHeight ? null : measuredHeight,
      minHeight: resolvedMinHeight,
      maxHeight,
    });
    if (nextHeight === null) {
      return;
    }
    const resolvedMaxHeight =
      typeof maxHeight === "number" && Number.isFinite(maxHeight)
        ? maxHeight
        : null;
    let clampedHeight = Math.round(nextHeight);
    if (resolvedMaxHeight !== null && clampedHeight > resolvedMaxHeight) {
      clampedHeight = resolvedMaxHeight;
    }
    if (clampedHeight < resolvedMinHeight) {
      clampedHeight = resolvedMinHeight;
    }
    const isAtMax =
      resolvedMaxHeight !== null &&
      Math.abs(clampedHeight - resolvedMaxHeight) <= 2;
    lastMaxHeightRef.current = isAtMax ? resolvedMaxHeight : null;
    persistPinnedAreaHeight(clampedHeight);
  }

  useEffect(() => {
    setInitialMaxHeight(outerRef.current.clientHeight);
  }, []);

  useLayoutEffect(() => {
    const node = outerRef.current;
    if (!node) {
      setMeasuredContainerHeight(null);
      setContainerPadding(0);
      useTemporaryMiscState.setState({ [paramGroupPaddingKey]: 0 });
      return;
    }
    const update = () => {
      const zoom = useReactFlow.getState().transform[2] ?? 1;
      const rectHeight = node.getBoundingClientRect().height;
      const nextHeight = zoom > 0 ? rectHeight / zoom : rectHeight;
      const roundedHeight = Math.ceil(nextHeight);
      setMeasuredContainerHeight(roundedHeight > 0 ? roundedHeight : null);
      const style = window.getComputedStyle(node);
      const nextPadding = Math.ceil(
        (Number.parseFloat(style.paddingTop) || 0) +
          (Number.parseFloat(style.paddingBottom) || 0),
      );
      setContainerPadding(nextPadding > 0 ? nextPadding : 0);
      useTemporaryMiscState.setState({
        [paramGroupPaddingKey]: nextPadding > 0 ? nextPadding : 0,
      });
    };
    update();
    const observer = new ResizeObserver(() => {
      update();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [outerRef]);

  const { ref: listRef, isScrollable } = useIsScrollable();

  useLayoutEffect(() => {
    const wrapper = contentRef.current;
    const list = listRef.current;
    if (!wrapper || !list) {
      setContentHeight(null);
      setMinContentHeight(null);
      lastMeasuredMinHeightRef.current = null;
      useTemporaryMiscState.setState({ [pinnedMinHeightKey]: 0 });
      return;
    }
    const update = () => {
      const style = window.getComputedStyle(wrapper);
      const padding =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom);
      const section = wrapper.closest("section");
      const sectionStyle = section ? window.getComputedStyle(section) : null;
      const borderHeight = sectionStyle
        ? Number.parseFloat(sectionStyle.borderTopWidth) +
          Number.parseFloat(sectionStyle.borderBottomWidth)
        : 0;
      const headerHeight = headerRef.current?.offsetHeight ?? 0;
      const listHeight = list.scrollHeight;
      const nextHeight = Math.ceil(
        listHeight + headerHeight + padding + borderHeight,
      );
      setContentHeight(nextHeight > 0 ? nextHeight : null);
      const rowHeight = getMinParamRowHeight(list, true);
      if (rowHeight <= 0) {
        const lastMeasured = lastMeasuredMinHeightRef.current;
        if (typeof lastMeasured === "number" && lastMeasured > 0) {
          setMinContentHeight(lastMeasured);
          useTemporaryMiscState.setState({
            [pinnedMinHeightKey]: lastMeasured,
          });
          return;
        }
      }
      const nextMinHeight = Math.ceil(
        rowHeight + headerHeight + padding + borderHeight,
      );
      const resolvedMinHeight = nextMinHeight > 0 ? nextMinHeight : null;
      lastMeasuredMinHeightRef.current = resolvedMinHeight;
      setMinContentHeight(resolvedMinHeight);
      useTemporaryMiscState.setState({
        [pinnedMinHeightKey]: resolvedMinHeight ?? 0,
      });
    };
    update();
    const observer = new ResizeObserver(() => {
      update();
    });
    observer.observe(list);
    if (headerRef.current) {
      observer.observe(headerRef.current);
    }
    return () => observer.disconnect();
  }, [listRef, pinnedMinHeightKey, topLevelParamIds.length]);

  const containerHeight =
    measuredContainerHeight ??
    outerRef.current?.clientHeight ??
    initialMaxHeight ??
    infiniteMaxHeight;
  const availableHeight = Math.max(
    Math.ceil(
      containerHeight -
        containerPadding -
        edgesStripHeight -
        reservedUnpinnedHeight,
    ),
    0,
  );
  const maxHeight =
    typeof contentHeight === "number"
      ? Math.min(availableHeight, contentHeight)
      : availableHeight;
  const pinnedMinHeight =
    typeof minContentHeight === "number"
      ? minContentHeight
      : pinnedParamsAreaMinHeight;
  const minHeight = maxHeight > 0 ? Math.min(pinnedMinHeight, maxHeight) : 0;
  const resolvedMinHeight = minHeight;
  const resolvedHeight =
    typeof height === "number" && Number.isFinite(maxHeight)
      ? Math.min(Math.max(height, resolvedMinHeight), maxHeight)
      : height;

  useLayoutEffect(() => {
    if (typeof height !== "number") {
      lastMaxHeightRef.current = null;
      return;
    }
    if (typeof maxHeight !== "number" || !Number.isFinite(maxHeight)) {
      return;
    }
    const lastMax = lastMaxHeightRef.current;
    if (typeof lastMax !== "number" || !Number.isFinite(lastMax)) {
      return;
    }
    if (Math.abs(height - lastMax) > 2) {
      lastMaxHeightRef.current = null;
      return;
    }
    if (Math.abs(maxHeight - lastMax) <= 2) {
      return;
    }
    const roundedMaxHeight = Math.round(maxHeight);
    lastMaxHeightRef.current = roundedMaxHeight;
    persistPinnedAreaHeight(roundedMaxHeight);
  }, [height, maxHeight, persistPinnedAreaHeight]);

  let roundedBottomClassName = "";
  if (shouldRoundBottom) {
    roundedBottomClassName = positionAndSizeLocked
      ? "rounded-b-sm"
      : "rounded-b-xl";
  }

  return (
    <ResizableWithScale
      handleWrapperClass="nodrag"
      className={`relative flex min-h-0 w-full flex-col items-start overflow-hidden border-b border-white bg-blue-200/50 shadow-sm dark:border-setta-700/30 dark:bg-blue-950/30 ${isPinnedManual ? "flex-none" : "flex-initial"} ${roundedBottomClassName}`}
      as="section"
      size={{ height: resolvedHeight }}
      onResizeStart={onResizeStart}
      onResize={onResize}
      onResizeStop={onResizeStop}
      minHeight={resolvedMinHeight}
      maxHeight={maxHeight}
      enable={{
        top: false,
        left: false,
        bottom: true,
        right: false,
        topRight: false,
        bottomRight: false,
        topLeft: false,
        bottomLeft: false,
      }}
      handleClasses={{
        // used in ZoomPane to allow resizing of sections that are inside a position-locked section
        bottom: `${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_PAN_CLASS_NAME} pinned-resize-handle cursor-row-resize`,
      }}
      handleStyles={{
        bottom: {
          bottom: "0px",
          height: "18px",
          left: 0,
          right: 0,
          width: "100%",
          zIndex: 5,
        },
      }}
    >
      <div
        className="flex w-full flex-1 min-h-0 flex-col pb-3 pt-4"
        ref={contentRef}
      >
        <header className="flex w-full gap-1 px-2" ref={headerRef}>
          <i className="gg-pin-alt scale-25 ml-1 mr-[0.1rem] mt-[0.3rem] text-setta-300 after:text-setta-300 dark:text-setta-500 dark:after:text-setta-500" />
          <p className=" text-[0.5rem] font-bold uppercase text-setta-300 dark:text-setta-500">
            Pinned Params
          </p>
        </header>

        <div
          className={`${isScrollable ? "nowheel" : ""} section-args-nested section-key-value section-min-rows grid w-full flex-1 min-h-0 grid-cols-subgrid content-start gap-y-1 overflow-y-auto pr-1.5`}
          ref={listRef}
        >
          <GetParamSwitch
            sectionId={sectionId}
            paramIds={topLevelParamIds}
            requiredParamIdsToPaths={requiredParamIdsToPaths}
            onResizeStart={handleColumnResizeStart}
            isTopLevel={true}
          />
        </div>
      </div>
    </ResizableWithScale>
  );
}

function GetUnpinnedParams({
  sectionId,
  handleColumnResizeStart,
  setMaxNestedDepth,
  setUnpinnedMinHeight,
  unpinnedMinHeight,
}: GetUnpinnedParamsProps) {
  const { ref, isScrollable } = useIsScrollable();
  const lastMeasuredMinHeightRef = useRef<number | null>(null);
  const { hideUnpinnedParams, hasUnpinnedParams, unpinnedTopLevelParamIds } =
    useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const unpinned = getCurrShownParamIds(x, sectionId, false, true);
    const filteredUnpinned = filterEdgeInputs(
      unpinned.requiredParamIdsToPaths,
      unpinned.topLevelParamIds,
      impl.edgeInputParams,
    );
    return {
      hideUnpinnedParams: impl.hideUnpinnedParams,
      hasUnpinnedParams:
        !impl.hideUnpinnedParams &&
        filteredUnpinned.topLevelParamIds.length > 0,
      unpinnedTopLevelParamIds: filteredUnpinned.topLevelParamIds,
    };
  }, _.isEqual);
  const unpinnedMinHeightKey = getUnpinnedParamsMinHeightKey(sectionId);
  const cachedUnpinnedMinHeight = useTemporaryMiscState(
    (x) => x[unpinnedMinHeightKey] ?? 0,
  );

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !hasUnpinnedParams) {
      lastMeasuredMinHeightRef.current = null;
      setUnpinnedMinHeight(null);
      useTemporaryMiscState.setState({ [unpinnedMinHeightKey]: 0 });
      return;
    }
    let observedRow: HTMLElement | null = null;
    const observer = new ResizeObserver(() => {
      update();
    });
    const mutationObserver = new MutationObserver(() => {
      update();
    });
    const updateObservedRow = () => {
      const nextRow = (node.querySelector(
        ":scope > article.section-args-nested-key-value",
      ) ??
        node.querySelector(
          ":scope > article.section-lg-value",
        )) as HTMLElement | null;
      if (nextRow === observedRow) {
        return nextRow;
      }
      if (observedRow) {
        observer.unobserve(observedRow);
      }
      observedRow = nextRow;
      if (observedRow) {
        observer.observe(observedRow);
      }
      return observedRow;
    };
    const underlineBuffer = 2;
    const update = () => {
      const observedRow = updateObservedRow();
      let rowHeight =
        observedRow?.offsetHeight ?? getMinParamRowHeight(node, true);
      if (observedRow) {
        const nestedContainer = observedRow.querySelector<HTMLElement>(
          ":scope > div.section-args-nested.section-key-value",
        );
        if (nestedContainer) {
          const rowStyle = window.getComputedStyle(observedRow);
          const rowGapValue = Number.parseFloat(rowStyle.rowGap);
          const rowGap = Number.isFinite(rowGapValue) ? rowGapValue : 0;
          const nestedHeight = nestedContainer.offsetHeight;
          const headerHeight = Math.ceil(
            rowHeight - nestedHeight - rowGap,
          );
          if (headerHeight > 0) {
            rowHeight = headerHeight;
          }
        }
      }
      if (rowHeight <= 0) {
        const lastMeasured = lastMeasuredMinHeightRef.current;
        if (typeof lastMeasured === "number" && lastMeasured > 0) {
          setUnpinnedMinHeight(lastMeasured);
          useTemporaryMiscState.setState({
            [unpinnedMinHeightKey]: lastMeasured,
          });
          return;
        }
        setUnpinnedMinHeight(null);
        useTemporaryMiscState.setState({ [unpinnedMinHeightKey]: 0 });
        return;
      }
      const style = window.getComputedStyle(node);
      const padding =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom);
      const nextHeight = Math.ceil(rowHeight + padding + underlineBuffer);
      const resolvedMinHeight = nextHeight > 0 ? nextHeight : null;
      lastMeasuredMinHeightRef.current = resolvedMinHeight;
      setUnpinnedMinHeight(resolvedMinHeight);
      useTemporaryMiscState.setState({
        [unpinnedMinHeightKey]: resolvedMinHeight ?? 0,
      });
    };
    update();
    observer.observe(node);
    mutationObserver.observe(node, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [
    hasUnpinnedParams,
    ref,
    setUnpinnedMinHeight,
    unpinnedMinHeightKey,
    unpinnedTopLevelParamIds.length,
  ]);

  let resolvedUnpinnedMinHeight: number;
  if (unpinnedMinHeight !== null) {
    resolvedUnpinnedMinHeight = unpinnedMinHeight;
  } else if (cachedUnpinnedMinHeight > 0) {
    resolvedUnpinnedMinHeight = cachedUnpinnedMinHeight;
  } else {
    resolvedUnpinnedMinHeight = 0;
  }

  return (
    <div
      className={`section-args-nested grid auto-rows-min grid-cols-subgrid content-start gap-y-1 overflow-x-clip overflow-y-scroll py-2 pr-1.5 ${
        isScrollable ? "nowheel" : ""
      } min-h-0 min-w-0 !max-w-full ${hasUnpinnedParams ? "flex-auto" : ""}`}
      ref={ref}
      style={
        hasUnpinnedParams
          ? { minHeight: resolvedUnpinnedMinHeight }
          : undefined
      }
    >
      {!hideUnpinnedParams && (
        <GetUnpinnedParamsCore
          sectionId={sectionId}
          onResizeStart={handleColumnResizeStart}
          setMaxNestedDepth={setMaxNestedDepth}
        />
      )}
    </div>
  );
}

function GetUnpinnedParamsCore({
  sectionId,
  onResizeStart,
  setMaxNestedDepth,
}) {
  const { requiredParamIdsToPaths, topLevelParamIds } = useProjectState((x) => {
    const { requiredParamIdsToPaths, topLevelParamIds } = getCurrShownParamIds(
      x,
      sectionId,
      false,
      true,
    );
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    return filterEdgeInputs(
      requiredParamIdsToPaths,
      topLevelParamIds,
      impl.edgeInputParams,
    );
  }, _.isEqual);

  const maxNestedDepth = getLongestListLength(requiredParamIdsToPaths);

  useEffect(() => {
    setMaxNestedDepth((s) => ({ ...s, unpinned: maxNestedDepth }));
  }, [maxNestedDepth]);

  return (
    <GetParamSwitch
      sectionId={sectionId}
      paramIds={topLevelParamIds}
      requiredParamIdsToPaths={requiredParamIdsToPaths}
      onResizeStart={onResizeStart}
      isTopLevel={true}
    />
  );
}

function getLongestListLength(obj: Record<string, Array<string>>) {
  return Object.values(obj).reduce(
    (max, arr) => (arr.length > max ? arr.length : max),
    0,
  );
}

function getMinParamRowHeight(
  container: HTMLElement,
  directChildrenOnly: boolean,
): number {
  const prefix = directChildrenOnly ? ":scope > " : "";
  const rows = Array.from(
    container.querySelectorAll<HTMLElement>(
      `${prefix}article.section-args-nested-key-value`,
    ),
  );
  const candidates =
    rows.length > 0
      ? rows
      : Array.from(
          container.querySelectorAll<HTMLElement>(
            `${prefix}article.section-lg-value`,
          ),
        );
  let minHeight = Number.POSITIVE_INFINITY;
  for (const row of candidates) {
    const height = row.offsetHeight;
    if (height > 0 && height < minHeight) {
      minHeight = height;
    }
  }
  return Number.isFinite(minHeight) ? minHeight : 0;
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
