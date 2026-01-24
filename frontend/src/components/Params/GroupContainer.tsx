import { ResizableWithScale } from "components/Utils/Resizable/ResizableWithScale";
import { getChangedSize, SIZE_MODE } from "components/Utils/Resizable/utils";
import { ParamDndContext } from "forks/dnd-kit/ParamDndContext";
import { Handle } from "forks/xyflow/core/components/Handle";
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
import { useProjectState, useSettings } from "state/definitions";
import { useParametersRequestWaitingForLSPResult } from "state/hooks/lsp";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { useShareCapabilities } from "state/hooks/share";
import { useParamColumnWidth } from "state/hooks/useParamColumnWidth";
import { C } from "utils/c";
import {
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { ParamDndList } from "./ParamDndList";

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
    <ParamDndContext>
      <div
        className="section-w-full section-row-pin-main -mt-3 flex flex-col overflow-y-hidden pt-2"
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
    </ParamDndContext>
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);

function EdgesStrip({ sectionId }: { sectionId: string }) {
  const { canEditStructure } = useShareCapabilities();
  const { inputPorts, outputPorts } = useProjectState((state) => {
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
    return { inputPorts, outputPorts };
  }, _.isEqual);

  if (inputPorts.length === 0 && outputPorts.length === 0) {
    return null;
  }

  return (
    <section className="section-w-full section-row-pin-main -mt-1 flex flex-col gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-2 py-2 shadow-sm dark:border-setta-700/40 dark:bg-blue-950/30">
      <header className="flex items-center gap-1 text-[0.6rem] font-semibold uppercase text-blue-600/70 dark:text-blue-300/60">
        <span className="tracking-[0.2em]">Edges</span>
      </header>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          {inputPorts.map((port) => (
            <div
              key={port.id}
              className="relative flex items-center gap-2 rounded-sm bg-white/80 px-2 py-1 text-[0.65rem] text-slate-700 shadow-sm dark:bg-setta-800/70 dark:text-slate-200"
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
        <div className="flex flex-col gap-1">
          {outputPorts.map((port) => (
            <div
              key={port.id}
              className="relative flex items-center justify-end gap-2 rounded-sm bg-white/80 px-2 py-1 text-[0.65rem] text-slate-700 shadow-sm dark:bg-setta-800/70 dark:text-slate-200"
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
    </section>
  );
}

function GetPinnedParams({
  sectionId,
  outerRef,
  handleColumnResizeStart,
  setMaxNestedDepth,
}) {
  const { requiredParamIdsToPaths, topLevelParamIds } = useProjectState((x) => {
    const { requiredParamIdsToPaths, topLevelParamIds } = getCurrShownParamIds(
      x,
      sectionId,
      true,
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
}) {
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

  function onResizeStop(...props) {
    const { height } = getChangedSize({
      props,
      sizeMode: { height: SIZE_MODE.any },
    });
    useProjectState.setState((state) => {
      setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
        state,
        sectionId,
        {
          pinnedAreaHeight: height,
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

  return (
    <ResizableWithScale
      handleWrapperClass="nodrag"
      className="relative -mt-1 flex max-h-[50%] w-full flex-col items-start border-b border-white bg-blue-200/50 pb-3 pt-4 shadow-sm dark:border-setta-700/30 dark:bg-blue-950/30"
      as="section"
      size={{ height }}
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
        <ParamDndList
          sectionId={sectionId}
          paramIds={topLevelParamIds}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={handleColumnResizeStart}
          isTopLevel={true}
          listKey="pinned"
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
  const hideUnpinnedParams = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    return impl.hideUnpinnedParams;
  });

  return (
    <div
      className={`section-args-nested grid auto-rows-min grid-cols-subgrid gap-y-1 overflow-x-clip overflow-y-scroll py-2 pr-1.5 ${
        isScrollable ? "nowheel" : ""
      } min-w-0 !max-w-full`}
      ref={ref}
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
