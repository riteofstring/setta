import { ResizableWithScale } from "components/Utils/Resizable/ResizableWithScale";
import { Handle } from "forks/xyflow/core/components/Handle";
import { useReactFlow } from "forks/xyflow/core/store";
import { HandlePosition } from "forks/xyflow/core/types";
import _ from "lodash";
import React, { useEffect, useRef, useState } from "react";
import { createEdgeFromConnection } from "state/actions/edges";
import {
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrShownParamIds,
  getParamDisplayName,
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
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { GetParamSwitch } from "./GetParamSwitch";

type ResizeHandleDirection =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "topRight"
  | "bottomRight"
  | "bottomLeft"
  | "topLeft";
type ResizeDelta = { height: number; width: number };
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
          />
          <GetUnpinnedParams
            sectionId={sectionId}
            handleColumnResizeStart={handleColumnResizeStart}
            setMaxNestedDepth={setMaxNestedDepth}
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
      const measuredHeight = Math.max(node.scrollHeight, rectHeight);
      updateHeight(measuredHeight);
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
};

type ResizablePinnedAreaProps = {
  sectionId: string;
  topLevelParamIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  outerRef: React.RefObject<HTMLDivElement | null>;
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  shouldRoundBottom: boolean;
  positionAndSizeLocked: boolean;
};

function GetPinnedParams({
  sectionId,
  outerRef,
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
}: ResizablePinnedAreaProps) {
  const { sectionHeight, height } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    return {
      sectionHeight: impl.size.height,
      height: impl.pinnedAreaHeight,
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
  const isPinnedManual = typeof height === "number";
  const resizeStartHeightRef = useRef<number | null>(null);
  const didResizeRef = useRef(false);

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
    if (!didResize || (delta.height === 0 && delta.width === 0)) {
      return;
    }
    let nextHeight = Number.parseFloat(ref.style.height);
    if (!Number.isFinite(nextHeight)) {
      if (typeof startHeight !== "number") {
        return;
      }
      nextHeight = startHeight + delta.height;
    }
    if (!Number.isFinite(nextHeight)) {
      return;
    }
    useProjectState.setState((state) => {
      setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
        state,
        sectionId,
        {
          pinnedAreaHeight: Math.max(nextHeight, pinnedParamsAreaMinHeight),
        },
      );
    });
  }

  useEffect(() => {
    setInitialMaxHeight(outerRef.current.clientHeight);
  }, []);

  const maxHeight =
    sectionHeight === "auto"
      ? infiniteMaxHeight
      : outerRef.current?.clientHeight ?? initialMaxHeight;

  const { ref, isScrollable } = useIsScrollable();
  let roundedBottomClassName = "";
  if (shouldRoundBottom) {
    roundedBottomClassName = positionAndSizeLocked
      ? "rounded-b-sm"
      : "rounded-b-xl";
  }

  return (
    <ResizableWithScale
      handleWrapperClass="nodrag"
      className={`relative flex min-h-0 max-h-[50%] w-full flex-col items-start border-b border-white bg-blue-200/50 pb-3 pt-4 shadow-sm dark:border-setta-700/30 dark:bg-blue-950/30 ${isPinnedManual ? "flex-none" : "flex-initial"} ${roundedBottomClassName}`}
      as="section"
      size={{ height }}
      onResizeStart={onResizeStart}
      onResize={onResize}
      onResizeStop={onResizeStop}
      minHeight={pinnedParamsAreaMinHeight}
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
        bottom: `${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_PAN_CLASS_NAME}`,
      }}
    >
      <header className="flex w-full gap-1 px-2">
        <i className="gg-pin-alt scale-25 ml-1 mr-[0.1rem] mt-[0.3rem] text-setta-300 after:text-setta-300 dark:text-setta-500 dark:after:text-setta-500" />
        <p className=" text-[0.5rem] font-bold uppercase text-setta-300 dark:text-setta-500">
          Pinned Params
        </p>
      </header>

      <div
        className={`${isScrollable ? "nowheel" : ""} section-args-nested section-key-value section-min-rows grid w-full grid-cols-subgrid gap-y-1 overflow-y-scroll pr-1.5`}
        ref={ref}
      >
        <GetParamSwitch
          sectionId={sectionId}
          paramIds={topLevelParamIds}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={handleColumnResizeStart}
          isTopLevel={true}
        />
      </div>
    </ResizableWithScale>
  );
}

function GetUnpinnedParams({
  sectionId,
  handleColumnResizeStart,
  setMaxNestedDepth,
}) {
  const { ref, isScrollable } = useIsScrollable();
  const { hideUnpinnedParams, hasUnpinnedParams } = useProjectState((x) => {
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
    };
  }, _.isEqual);
  const { pinnedParamsAreaMinHeight } = useSettings((x) => ({
    pinnedParamsAreaMinHeight:
      x.sectionSizingPolicy.globals.pinnedParamsAreaMinHeight,
  }));

  return (
    <div
      className={`section-args-nested grid auto-rows-min grid-cols-subgrid gap-y-1 overflow-x-clip overflow-y-scroll py-2 pr-1.5 ${
        isScrollable ? "nowheel" : ""
      } min-h-0 min-w-0 !max-w-full ${hasUnpinnedParams ? "flex-auto" : ""}`}
      ref={ref}
      style={
        hasUnpinnedParams
          ? { minHeight: pinnedParamsAreaMinHeight }
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
