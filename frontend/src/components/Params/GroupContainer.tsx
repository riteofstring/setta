import { ParamDndContext } from "forks/dnd-kit/ParamDndContext";
import { Handle } from "forks/xyflow/core/components/Handle";
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
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrShownParamIds,
  getParamDisplayName,
} from "state/actions/sectionInfos";
import { paramNameFromPathArray } from "state/actions/sections/sectionContents";
import {
  useProjectState,
  useResizeEvent,
  useTemporaryMiscState,
} from "state/definitions";
import { useParametersRequestWaitingForLSPResult } from "state/hooks/lsp";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { useShareCapabilities } from "state/hooks/share";
import { useParamColumnWidth } from "state/hooks/useParamColumnWidth";
import { C } from "utils/c";
import {
  getEdgesStripHeightKey,
  getPinnedParamsAreaHeightKey,
  getUnpinnedParamsAreaHeightKey,
} from "utils/constants";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { resolveEdgeStripHeight } from "./edgeStripUtils";
import {
  buildParamAreaMeasureKey,
  measureParamAreaMinHeight,
} from "./paramAreaMeasurements";
import { attachParamAreaObservers } from "./paramAreaObservers";
import { ParamDndList } from "./ParamDndList";

function _ParamGroupContainer({ sectionId }: { sectionId: string }) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [maxNestedDepth, setMaxNestedDepth] = useState({
    pinned: 1,
    unpinned: 1,
  });
  const { ref: scrollRef, isScrollable } = useIsScrollable();

  const handleColumnResizeStart = useParamColumnWidth({
    sectionId,
    outerRef,
    maxNestedDepth: Math.max(maxNestedDepth.pinned, maxNestedDepth.unpinned),
  });

  const waitingForResult = useParametersRequestWaitingForLSPResult(sectionId);

  const setOuterRef = useCallback((node: HTMLDivElement | null) => {
    outerRef.current = node;
  }, []);

  return (
    <ParamDndContext>
      <div
        className="section-row-pin-main section-w-full -mt-3 flex min-h-0 flex-col overflow-hidden pt-2"
        ref={setOuterRef}
      >
        <div
          className={`section-row-pin-main section-w-full flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden ${
            isScrollable ? "nowheel" : ""
          }`}
          ref={scrollRef}
        >
          {waitingForResult ? (
            <i className="section-args gg-spinner mt-3 !scale-100 place-self-center before:!border-t-blue-500 after:!border-blue-500" />
          ) : (
            <>
              <EdgesStrip sectionId={sectionId} />
              <GetPinnedParams
                sectionId={sectionId}
                handleColumnResizeStart={handleColumnResizeStart}
                setMaxNestedDepth={setMaxNestedDepth}
              />
              <GetUnpinnedParams
                sectionId={sectionId}
                handleColumnResizeStart={handleColumnResizeStart}
                setMaxNestedDepth={setMaxNestedDepth}
              />
            </>
          )}
        </div>
      </div>
    </ParamDndContext>
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);

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

function EdgesStrip({ sectionId }: { sectionId: string }) {
  const { canEditStructure } = useShareCapabilities();
  const lastHeightRef = useRef(0);
  const stripRef = useRef<HTMLElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
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

  let roundedBottomClassName = "";
  if (shouldRoundBottom) {
    roundedBottomClassName = positionAndSizeLocked
      ? "rounded-b-sm"
      : "rounded-b-xl";
  }

  return (
    <section
      className={`section-w-full section-row-pin-main relative z-0 -mt-4 flex shrink-0 flex-col overflow-hidden border-b border-white bg-setta-50 pt-5 dark:border-setta-700/30 dark:bg-setta-860 ${roundedBottomClassName}`}
      ref={stripRef}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_0.75rem_minmax(0,1fr)] py-2">
        <div className="flex flex-col pl-3">
          <div className="text-[0.5rem] font-bold uppercase text-setta-300 dark:text-setta-500">
            In
          </div>
          <div className="-ml-2 flex flex-col gap-1 pt-1">
            {inputPorts.map((port) => (
              <div
                key={port.id}
                className="relative flex items-center gap-2 rounded-sm px-2 py-1 text-[0.65rem] text-setta-600 transition-colors hover:bg-setta-100/50 dark:text-setta-200 hover:dark:bg-setta-800/70"
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
        <div
          className="pointer-events-none flex items-stretch justify-center"
          aria-hidden="true"
        >
          <div className="h-full w-px bg-setta-200/80 dark:bg-setta-700/60" />
        </div>
        <div className="flex flex-col pr-3">
          <div className="text-right text-[0.5rem] font-bold uppercase text-setta-300 dark:text-setta-500">
            Out
          </div>
          <div className="-mr-2 flex flex-col gap-1 pt-1">
            {outputPorts.map((port) => (
              <div
                key={port.id}
                className="relative flex items-center justify-end gap-2 rounded-sm px-2 py-1 text-[0.65rem] text-setta-600 transition-colors hover:bg-setta-100/50 dark:text-setta-200 hover:dark:bg-setta-800/70"
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
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  setMaxNestedDepth: React.Dispatch<React.SetStateAction<MaxNestedDepth>>;
};

type PinnedParamsAreaProps = {
  sectionId: string;
  topLevelParamIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  shouldRoundBottom: boolean;
  positionAndSizeLocked: boolean;
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
        shouldRoundBottom={shouldRoundBottom}
        positionAndSizeLocked={positionAndSizeLocked}
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
  shouldRoundBottom,
  positionAndSizeLocked,
  contentRef,
  headerRef,
  rowsRef,
}: PinnedParamsAreaProps) {
  let roundedBottomClassName = "";
  if (shouldRoundBottom) {
    roundedBottomClassName = positionAndSizeLocked
      ? "rounded-b-sm"
      : "rounded-b-xl";
  }

  return (
    <section
      className={`relative flex min-h-0 w-full shrink-0 flex-col items-start border-b border-white bg-blue-200/50 shadow-sm dark:border-setta-700/30 dark:bg-blue-950/30 ${roundedBottomClassName}`}
    >
      <div
        className="flex min-h-0 w-full flex-1 flex-col pb-3 pt-2"
        ref={contentRef}
      >
        <header className="flex w-full gap-1 px-2" ref={headerRef}>
          <i className="gg-pin-alt scale-25 ml-1 mr-[0.1rem] mt-[0.3rem] text-setta-300 after:text-setta-300 dark:text-setta-500 dark:after:text-setta-500" />
          <p className=" text-[0.5rem] font-bold uppercase text-setta-300 dark:text-setta-500">
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
  const { hideUnpinnedParams } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    return {
      hideUnpinnedParams: impl.hideUnpinnedParams,
    };
  }, _.isEqual);

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const heightKey = getUnpinnedParamsAreaHeightKey(sectionId);

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
    <div
      className="section-args-nested grid min-h-0 min-w-0 !max-w-full shrink-0 auto-rows-min grid-cols-subgrid content-start gap-y-1 overflow-x-clip py-2 pr-1.5"
      ref={containerRef}
    >
      {!hideUnpinnedParams && (
        <ParamDndList
          sectionId={sectionId}
          paramIds={topLevelParamIds}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={handleColumnResizeStart}
          isTopLevel={true}
          listKey="unpinned"
        />
      )}
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
