import { ResizableWithScale } from "components/Utils/Resizable/ResizableWithScale";
import { ParamDndContext } from "forks/dnd-kit/ParamDndContext";
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
  getCurrProjectConfigId,
  getCurrShownParamIds,
  getParamDisplayName,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { paramNameFromPathArray } from "state/actions/sections/sectionContents";
import { setSectionSize } from "state/actions/sections/sectionSizes";
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
  getKwargsControlsHeightKey,
  getParamGroupPaddingKey,
  getPinnedParamsMinHeightKey,
  getUnpinnedParamsMinHeightKey,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import {
  route_set_section_pinned_area_height,
  route_set_section_sizes,
} from "utils/generatedEndpoints";
import {
  isBaseSectionWithParamsImpl,
  SectionSize,
  SectionSizeModeEnum,
} from "utils/generatedTypes";
import { ParamDndList } from "./ParamDndList";
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
  const paramGroupPaddingKey = getParamGroupPaddingKey(sectionId);
  const pinnedMinHeightKey = getPinnedParamsMinHeightKey(sectionId);
  const unpinnedMinHeightKey = getUnpinnedParamsMinHeightKey(sectionId);

  // Clear stale cached heights on mount to prevent using outdated values from previous sessions
  useLayoutEffect(() => {
    useTemporaryMiscState.setState({
      [pinnedMinHeightKey]: 0,
      [unpinnedMinHeightKey]: 0,
    });
  }, [pinnedMinHeightKey, unpinnedMinHeightKey]);

  const handleColumnResizeStart = useParamColumnWidth({
    sectionId,
    outerRef,
    maxNestedDepth: Math.max(maxNestedDepth.pinned, maxNestedDepth.unpinned),
  });

  const waitingForResult = useParametersRequestWaitingForLSPResult(sectionId);

  useLayoutEffect(() => {
    const node = outerRef.current;
    if (!node) {
      useTemporaryMiscState.setState({ [paramGroupPaddingKey]: 0 });
      return;
    }
    const update = () => {
      const style = window.getComputedStyle(node);
      const nextPadding = Math.ceil(
        (Number.parseFloat(style.paddingTop) || 0) +
          (Number.parseFloat(style.paddingBottom) || 0),
      );
      useTemporaryMiscState.setState({
        [paramGroupPaddingKey]: nextPadding > 0 ? nextPadding : 0,
      });
    };
    update();
    const observer = new ResizeObserver(() => {
      update();
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      useTemporaryMiscState.setState({ [paramGroupPaddingKey]: 0 });
    };
  }, [paramGroupPaddingKey]);

  return (
    <ParamDndContext>
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
    </ParamDndContext>
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
          port.accessor.trim() === ""
            ? C.EDGE_OUTPUT_BASE_LABEL
            : port.accessor,
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
        !impl.hideUnpinnedParams &&
        filteredUnpinned.topLevelParamIds.length > 0;
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

  useLayoutEffect(() => {
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

    const updateHeight = (height: number) => {
      const nextHeight = Math.ceil(height);
      if (lastHeightRef.current === nextHeight) {
        return;
      }
      lastHeightRef.current = nextHeight;
      useTemporaryMiscState.setState({ [heightKey]: nextHeight });
    };

    const measureHeight = () => {
      const zoom = useReactFlow.getState().transform[2] ?? 1;
      const safeZoom = zoom > 0 ? zoom : 1;
      const rectHeight = node.getBoundingClientRect().height / safeZoom;
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

    const unsubscribe = useReactFlow.subscribe(
      (state) => state.transform[2],
      () => {
        measureHeight();
      },
    );

    return () => {
      observer.disconnect();
      unsubscribe();
    };
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
    const filteredPinned = filterEdgeInputs(
      requiredParamIdsToPaths,
      topLevelParamIds,
      impl.edgeInputParams,
    );
    const filteredUnpinned = filterEdgeInputs(
      unpinned.requiredParamIdsToPaths,
      unpinned.topLevelParamIds,
      impl.edgeInputParams,
    );
    const hasUnpinnedParams =
      !impl.hideUnpinnedParams && filteredUnpinned.topLevelParamIds.length > 0;
    const shouldRoundBottom = !hasUnpinnedParams;
    return {
      ...filteredPinned,
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
  const { height, hasUnpinnedParams, sectionHeight } = useProjectState((x) => {
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
      sectionHeight: x.sections[sectionId]?.size?.height ?? null,
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
  const { canEditLayout } = useShareCapabilities();
  const canResize = canEditLayout && !positionAndSizeLocked;
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
  const [measurementsReady, setMeasurementsReady] = useState(false);
  const [constraintsReady, setConstraintsReady] = useState(false);
  const lastMeasuredMinHeightRef = useRef<number | null>(null);
  const edgesStripHeight = useTemporaryMiscState(
    (x) => x[getEdgesStripHeightKey(sectionId)] ?? 0,
  );
  const kwargsControlsHeight = useTemporaryMiscState(
    (x) => x[getKwargsControlsHeightKey(sectionId)] ?? 0,
  );
  const pinnedMinHeightKey = getPinnedParamsMinHeightKey(sectionId);
  const unpinnedMinHeightKey = getUnpinnedParamsMinHeightKey(sectionId);
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
    (nextHeight: number | "auto") => {
      if (!canResize) {
        return;
      }
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
    [canResize, sectionId],
  );

  const onResizeHandleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!canResize) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".pinned-resize-handle")) {
        return;
      }
      if (height === SectionSizeModeEnum.auto) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      lastMaxHeightRef.current = null;
      persistPinnedAreaHeight(SectionSizeModeEnum.auto);
    },
    [canResize, height, persistPinnedAreaHeight],
  );

  function onResizeStart(...props: ResizeStartArgs) {
    if (!canResize) {
      return;
    }
    const [, , ref] = props;
    didResizeRef.current = false;
    const parsedHeight = Number.parseFloat(ref.style.height);
    resizeStartHeightRef.current = Number.isFinite(parsedHeight)
      ? parsedHeight
      : ref.offsetHeight;
  }

  function onResize(...props: ResizeArgs) {
    if (!canResize) {
      return;
    }
    const [, , , delta] = props;
    if (delta.height === 0 && delta.width === 0) {
      return;
    }
    didResizeRef.current = true;
  }

  function onResizeStop(...props: ResizeArgs) {
    if (!canResize) {
      return;
    }
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
    if (!outerRef.current) {
      return;
    }
    setInitialMaxHeight(outerRef.current.clientHeight);
  }, []);

  useLayoutEffect(() => {
    const node = outerRef.current;
    if (!node) {
      setMeasuredContainerHeight(null);
      setContainerPadding(0);
      return;
    }
    const update = () => {
      const zoom = useReactFlow.getState().transform[2] ?? 1;
      const rectHeight = node.getBoundingClientRect().height;
      const unscaledHeight = zoom > 0 ? rectHeight / zoom : rectHeight;
      const clientHeight = node.clientHeight;
      const nextHeight =
        clientHeight > 0
          ? Math.max(clientHeight, unscaledHeight)
          : unscaledHeight;
      const roundedHeight = Math.ceil(nextHeight);
      setMeasuredContainerHeight(roundedHeight > 0 ? roundedHeight : null);
      const style = window.getComputedStyle(node);
      const nextPadding = Math.ceil(
        (Number.parseFloat(style.paddingTop) || 0) +
          (Number.parseFloat(style.paddingBottom) || 0),
      );
      setContainerPadding(nextPadding > 0 ? nextPadding : 0);
    };
    update();
    const observer = new ResizeObserver(() => {
      update();
    });
    observer.observe(node);
    const unsubscribe = useReactFlow.subscribe(
      (state) => state.transform[2],
      () => {
        update();
      },
    );
    return () => {
      observer.disconnect();
      unsubscribe();
    };
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
    let didCleanup = false;
    const update = () => {
      if (didCleanup) {
        return;
      }
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
      const rowCandidates = Array.from(
        list.querySelectorAll<HTMLElement>(
          "article.section-args-nested-key-value",
        ),
      );
      let listRows = rowCandidates;
      if (listRows.length === 0) {
        listRows = Array.from(
          list.querySelectorAll<HTMLElement>("article.section-lg-value"),
        );
      }
      const zoom = useReactFlow.getState().transform[2] ?? 1;
      const safeZoom = zoom > 0 ? zoom : 1;
      let listHeight = list.scrollHeight;
      let maxBottom = 0;
      if (listRows.length > 0) {
        const listRect = list.getBoundingClientRect();
        const listScrollTop = list.scrollTop;
        for (const row of listRows) {
          const rowRect = row.getBoundingClientRect();
          const top =
            (rowRect.top - listRect.top) / safeZoom + listScrollTop;
          const bottom = top + rowRect.height / safeZoom;
          if (bottom > maxBottom) {
            maxBottom = bottom;
          }
        }
      }
      if (maxBottom > 0) {
        const clientHeight = list.clientHeight;
        if (listHeight <= clientHeight + 1) {
          listHeight = maxBottom;
        } else if (maxBottom > listHeight) {
          listHeight = maxBottom;
        }
      }
      const nextHeight = Math.ceil(
        listHeight + headerHeight + padding + borderHeight,
      );
      setContentHeight(nextHeight > 0 ? nextHeight : null);
      // Prefer the first non-zero row height to guarantee one pinned row fits.
      let rowHeight = 0;
      for (const row of listRows) {
        const rectHeight = row.getBoundingClientRect().height / safeZoom;
        const measuredHeight = Math.max(
          row.offsetHeight,
          row.scrollHeight,
          rectHeight,
        );
        if (measuredHeight > 0) {
          rowHeight = measuredHeight;
          break;
        }
      }
      if (listRows.length > 0) {
        const listStyle = window.getComputedStyle(list);
        const rowGapValue = Number.parseFloat(listStyle.rowGap);
        const rowGap = Number.isFinite(rowGapValue) ? rowGapValue : 0;
        const inferredRowHeight =
          (listHeight - rowGap * (listRows.length - 1)) / listRows.length;
        if (inferredRowHeight > rowHeight) {
          rowHeight = inferredRowHeight;
        }
      }
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
    const rafId = window.requestAnimationFrame(() => {
      update();
    });
    const timeoutIds = [
      window.setTimeout(update, 120),
      window.setTimeout(update, 360),
    ];
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        update();
      });
    }
    const resizeObserver = new ResizeObserver(() => {
      update();
    });
    resizeObserver.observe(list);
    if (headerRef.current) {
      resizeObserver.observe(headerRef.current);
    }
    const rowObserver = new ResizeObserver(() => {
      update();
    });
    const observeRows = () => {
      rowObserver.disconnect();
      const rows = list.querySelectorAll(
        "article.section-args-nested-key-value, article.section-lg-value",
      );
      rows.forEach((row) => rowObserver.observe(row));
    };
    observeRows();
    const unsubscribe = useReactFlow.subscribe(
      (state) => state.transform[2],
      () => {
        update();
      },
    );
    const mutationObserver = new MutationObserver(() => {
      update();
      observeRows();
    });
    mutationObserver.observe(list, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
    if (headerRef.current) {
      mutationObserver.observe(headerRef.current, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });
    }
    return () => {
      didCleanup = true;
      window.cancelAnimationFrame(rafId);
      timeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      resizeObserver.disconnect();
      rowObserver.disconnect();
      unsubscribe();
      mutationObserver.disconnect();
    };
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
        kwargsControlsHeight -
        edgesStripHeight -
        reservedUnpinnedHeight,
    ),
    0,
  );
  const maxHeight =
    typeof contentHeight === "number" ? contentHeight : availableHeight;
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
  const numericSectionHeight =
    typeof sectionHeight === "number" && Number.isFinite(sectionHeight)
      ? sectionHeight
      : null;

  // Track when measurements are complete to avoid acting on stale/zero values
  useLayoutEffect(() => {
    const ready =
      measuredContainerHeight !== null &&
      contentHeight !== null &&
      (resolvedUnpinnedMinHeight > 0 || !hasUnpinnedParams);
    setMeasurementsReady(ready);
  }, [
    measuredContainerHeight,
    contentHeight,
    resolvedUnpinnedMinHeight,
    hasUnpinnedParams,
  ]);

  useLayoutEffect(() => {
    if (!measurementsReady) {
      setConstraintsReady(false);
      return;
    }
    setConstraintsReady(false);
    let rafId = 0;
    let rafId2 = 0;
    rafId = window.requestAnimationFrame(() => {
      rafId2 = window.requestAnimationFrame(() => {
        setConstraintsReady(true);
      });
    });
    return () => {
      window.cancelAnimationFrame(rafId);
      window.cancelAnimationFrame(rafId2);
    };
  }, [measurementsReady, availableHeight, maxHeight, contentHeight]);

  // Consolidated height constraint effect - guards with measurementsReady to avoid race conditions
  useLayoutEffect(() => {
    // Skip all height adjustments until measurements are complete and stable
    if (!measurementsReady || !constraintsReady) {
      return;
    }

    const manualPinnedHeight =
      typeof height === "number" && Number.isFinite(height) ? height : null;
    const desiredPinnedHeight =
      manualPinnedHeight !== null
        ? Math.max(
            pinnedMinHeight,
            contentHeight !== null
              ? Math.min(manualPinnedHeight, contentHeight)
              : manualPinnedHeight,
          )
        : pinnedMinHeight;

    // 1. Expand section height if pinned area needs more space
    if (
      canResize &&
      desiredPinnedHeight > 0 &&
      desiredPinnedHeight - availableHeight > 1
    ) {
      const heightShortfall = desiredPinnedHeight - availableHeight;
      let baseSectionHeight = numericSectionHeight;
      if (baseSectionHeight === null && outerRef.current) {
        const sectionRoot = outerRef.current.closest("section");
        if (sectionRoot) {
          const zoom = useReactFlow.getState().transform[2] ?? 1;
          const safeZoom = zoom > 0 ? zoom : 1;
          baseSectionHeight =
            sectionRoot.getBoundingClientRect().height / safeZoom;
        }
      }
      if (baseSectionHeight === null) {
        return;
      }
      const nextHeight = Math.round(baseSectionHeight + heightShortfall);
      let updatedSectionSizes: Record<string, SectionSize> = {};
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          updatedSectionSizes = {
            [sectionId]: setSectionSize(
              sectionId,
              { height: nextHeight },
              state,
            ),
          };
        },
        send: (frontendOpId) =>
          route_set_section_sizes({
            projectConfigId: getCurrProjectConfigId(),
            sectionSizes: updatedSectionSizes,
            frontendOpId,
          }),
      });
      return;
    }

    // Reset max-follow tracking when height becomes non-numeric
    if (typeof height !== "number") {
      lastMaxHeightRef.current = null;
      return;
    }

    // 2. Clamp height to min constraint
    if (canResize && resolvedMinHeight > 0 && height < resolvedMinHeight - 2) {
      persistPinnedAreaHeight(Math.round(resolvedMinHeight));
      return;
    }

    // 3. Clamp height to max constraint
    if (
      canResize &&
      typeof maxHeight === "number" &&
      Number.isFinite(maxHeight) &&
      height > maxHeight + 2
    ) {
      persistPinnedAreaHeight(Math.round(maxHeight));
      return;
    }

    // 4. Track max-follow behavior (pinned area stays at max when max changes)
    if (typeof maxHeight === "number" && Number.isFinite(maxHeight)) {
      const lastMax = lastMaxHeightRef.current;
      if (typeof lastMax === "number" && Number.isFinite(lastMax)) {
        if (Math.abs(height - lastMax) > 2) {
          // User moved away from max, stop following
          lastMaxHeightRef.current = null;
        } else if (Math.abs(maxHeight - lastMax) > 2) {
          // Max changed while we're following it
          const roundedMaxHeight = Math.round(maxHeight);
          lastMaxHeightRef.current = roundedMaxHeight;
          persistPinnedAreaHeight(roundedMaxHeight);
        }
      }
    }
  }, [
    constraintsReady,
    measurementsReady,
    availableHeight,
    canResize,
    contentHeight,
    height,
    maxHeight,
    numericSectionHeight,
    pinnedMinHeight,
    resolvedMinHeight,
    sectionId,
    persistPinnedAreaHeight,
    outerRef,
  ]);

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
      onDoubleClick={onResizeHandleDoubleClick}
      minHeight={resolvedMinHeight}
      maxHeight={maxHeight}
      enable={{
        top: false,
        left: false,
        bottom: canResize,
        right: false,
        topRight: false,
        bottomRight: false,
        topLeft: false,
        bottomLeft: false,
      }}
      handleClasses={{
        // used in ZoomPane to allow resizing of sections that are inside a position-locked section
        bottom: `${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_PAN_CLASS_NAME} pinned-resize-handle ${
          canResize
            ? "cursor-row-resize"
            : "cursor-not-allowed pointer-events-none opacity-40"
        }`,
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
        className="flex min-h-0 w-full flex-1 flex-col pb-3 pt-4"
        ref={contentRef}
      >
        <header className="flex w-full gap-1 px-2" ref={headerRef}>
          <i className="gg-pin-alt scale-25 ml-1 mr-[0.1rem] mt-[0.3rem] text-setta-300 after:text-setta-300 dark:text-setta-500 dark:after:text-setta-500" />
          <p className=" text-[0.5rem] font-bold uppercase text-setta-300 dark:text-setta-500">
            Pinned Params
          </p>
        </header>

        <div
          className={`${isScrollable ? "nowheel" : ""} section-args-nested section-key-value section-min-rows grid min-h-0 w-full flex-1 grid-cols-subgrid content-start gap-y-1 overflow-y-auto pr-1.5`}
          ref={listRef}
        >
          <ParamDndList
            sectionId={sectionId}
            paramIds={topLevelParamIds}
            requiredParamIdsToPaths={requiredParamIdsToPaths}
            onResizeStart={handleColumnResizeStart}
            isTopLevel={true}
            listKey="pinned"
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
  const lastMeasuredMinHeightRef = useRef<number | null>(null);
  const rafIdRef = useRef<number>(0);
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

  const updateMinHeight = useCallback(
    (node: HTMLDivElement) => {
      if (!hasUnpinnedParams) {
        if (lastMeasuredMinHeightRef.current !== null) {
          lastMeasuredMinHeightRef.current = null;
        }
        setUnpinnedMinHeight(null);
        useTemporaryMiscState.setState({ [unpinnedMinHeightKey]: 0 });
        return;
      }
      const observedRow =
        node.querySelector(":scope > article.section-args-nested-key-value") ??
        node.querySelector(":scope > article.section-lg-value") ??
        null;
      const underlineBuffer = 2;
      const getHeaderHeight = (row: Element) => {
        const element = row as HTMLElement;
        let height = element.offsetHeight;
        const nestedContainer = element.querySelector<HTMLElement>(
          ":scope > div.section-args-nested.section-key-value",
        );
        if (!nestedContainer) {
          return height;
        }
        const rowStyle = window.getComputedStyle(element);
        const rowGapValue = Number.parseFloat(rowStyle.rowGap);
        const rowGap = Number.isFinite(rowGapValue) ? rowGapValue : 0;
        const nestedHeight = nestedContainer.offsetHeight;
        const headerHeight = Math.ceil(height - nestedHeight - rowGap);
        return headerHeight > 0 ? headerHeight : height;
      };
      const rowHeight = observedRow ? getHeaderHeight(observedRow) : 0;
      if (rowHeight <= 0) {
        const lastMeasured = lastMeasuredMinHeightRef.current;
        if (typeof lastMeasured === "number" && lastMeasured > 0) {
          return;
        }
        if (lastMeasuredMinHeightRef.current === null) {
          return;
        }
        lastMeasuredMinHeightRef.current = null;
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
      if (lastMeasuredMinHeightRef.current === resolvedMinHeight) {
        return;
      }
      lastMeasuredMinHeightRef.current = resolvedMinHeight;
      setUnpinnedMinHeight(resolvedMinHeight);
      useTemporaryMiscState.setState({
        [unpinnedMinHeightKey]: resolvedMinHeight ?? 0,
      });
    },
    [hasUnpinnedParams, setUnpinnedMinHeight, unpinnedMinHeightKey],
  );

  const scheduleUpdate = useCallback(
    (node: HTMLDivElement) => {
      // Immediate synchronous measurement to avoid race conditions on initial render
      updateMinHeight(node);
      // RAF fallback for layout-dependent updates after paint
      if (rafIdRef.current !== 0) {
        return;
      }
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = 0;
        updateMinHeight(node);
      });
    },
    [updateMinHeight],
  );

  const { ref, isScrollable } = useIsScrollable({
    onMeasure: scheduleUpdate,
  });

  useLayoutEffect(() => {
    const node = ref.current;
    if (node) {
      scheduleUpdate(node);
    } else if (!hasUnpinnedParams) {
      lastMeasuredMinHeightRef.current = null;
      setUnpinnedMinHeight(null);
      useTemporaryMiscState.setState({ [unpinnedMinHeightKey]: 0 });
    }
    return () => {
      if (rafIdRef.current !== 0) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
    };
  }, [
    hasUnpinnedParams,
    ref,
    scheduleUpdate,
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
        hasUnpinnedParams ? { minHeight: resolvedUnpinnedMinHeight } : undefined
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
    <ParamDndList
      sectionId={sectionId}
      paramIds={topLevelParamIds}
      requiredParamIdsToPaths={requiredParamIdsToPaths}
      onResizeStart={onResizeStart}
      isTopLevel={true}
      listKey="unpinned"
    />
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
