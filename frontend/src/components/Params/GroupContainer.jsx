import { ResizableWithScale } from "components/Utils/Resizable/ResizableWithScale";
import { getChangedSize, SIZE_MODE } from "components/Utils/Resizable/utils";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSectionColumnWidth, useSectionInfos } from "state/definitions";
import { useParametersRequestWaitingForLSPResult } from "state/hooks/lsp";
import { useParamIdsToShowInArea } from "state/hooks/sectionContents";
import {
  INFINITE_MAX_HEIGHT,
  PINNED_PARAMS_AREA_MIN_HEIGHT,
  useIsScrollable,
} from "state/hooks/sectionSizes";
import { clamp } from "utils/utils";
import { GetParamSwitch } from "./GetParamSwitch";

export function ParamGroupContainer({ sectionId }) {
  const outerRef = useRef();
  const [maxNestedDepth, setMaxNestedDepth] = useState({
    pinned: 1,
    unpinned: 1,
  });

  const handleColumnResizeStart = useColumnResizer(
    sectionId,
    outerRef,
    Math.max(maxNestedDepth.pinned, maxNestedDepth.unpinned),
  );

  const waitingForResult = useParametersRequestWaitingForLSPResult(sectionId);
  // const waitingForResult = true;

  return (
    <div
      className="section-w-full section-row-pin-main -mt-3 flex flex-col overflow-y-hidden pt-2"
      ref={outerRef}
    >
      {waitingForResult ? (
        <i className="section-args gg-spinner mt-3 !scale-100 place-self-center before:!border-t-blue-500 after:!border-blue-500" />
      ) : (
        <>
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

function GetPinnedParams({
  sectionId,
  outerRef,
  handleColumnResizeStart,
  setMaxNestedDepth,
}) {
  const { requiredParamIdsToPaths, topLevelParamIds } = useParamIdsToShowInArea(
    sectionId,
    true,
  );

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
  const { sectionHeight, height } = useSectionInfos((x) => {
    return {
      sectionHeight: x.x[sectionId].size.height,
      height: x.x[sectionId].pinnedAreaHeight,
    };
  }, _.isEqual);
  const [initialMaxHeight, setInitialMaxHeight] = useState(INFINITE_MAX_HEIGHT);

  function onResizeStop(...props) {
    const { height } = getChangedSize({
      props,
      minHeight: "auto",
      sizeMode: { height: SIZE_MODE.any },
    });
    useSectionInfos.setState((state) => {
      state.x[sectionId].pinnedAreaHeight = height;
    });
  }

  useEffect(() => {
    setInitialMaxHeight(outerRef.current.clientHeight);
  }, []);

  const maxHeight =
    sectionHeight === "auto"
      ? INFINITE_MAX_HEIGHT
      : outerRef.current?.clientHeight ?? initialMaxHeight;

  const { ref, isScrollable } = useIsScrollable();

  return (
    <ResizableWithScale
      handleWrapperClass="nodrag"
      className="relative -mt-1 flex max-h-[50%] flex-col items-start justify-between overflow-hidden border-b border-white bg-blue-200/50 pb-3 pt-4 shadow-sm dark:border-setta-700/30 dark:bg-blue-950/30"
      as="section"
      size={{ height }}
      onResizeStop={onResizeStop}
      minHeight={PINNED_PARAMS_AREA_MIN_HEIGHT}
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
    >
      <header className="flex w-full gap-2 px-2">
        <i className="gg-pin-alt scale-25 ml-1 mr-[0.1rem] mt-[0.3rem] text-setta-300 after:text-setta-300 dark:text-setta-500 dark:after:text-setta-500" />
        <p className=" text-[0.5rem] font-bold uppercase text-setta-300 dark:text-setta-500">
          Pinned Params
        </p>
      </header>

      <div
        className={`${isScrollable ? "nowheel" : ""} section-args-nested section-key-value section-min-rows grid w-full grid-cols-subgrid gap-y-1 overflow-y-scroll`}
        ref={ref}
      >
        <GetParamSwitch
          sectionId={sectionId}
          paramIds={topLevelParamIds}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={handleColumnResizeStart}
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
  const hideUnpinnedParams = useSectionInfos(
    (x) => x.x[sectionId].hideUnpinnedParams,
  );

  return (
    <div
      className={`section-args-nested section-w-full section-row-main grid auto-rows-min grid-cols-subgrid gap-y-1 overflow-x-clip overflow-y-scroll py-2 ${
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
  const { requiredParamIdsToPaths, topLevelParamIds } = useParamIdsToShowInArea(
    sectionId,
    false,
  );

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
    />
  );
}

function useColumnResizer(sectionId, ref, maxNestedDepth) {
  const marginPx = 72 + Math.max(0, 12 * (maxNestedDepth - 1));

  // Use ref for both resize state and current width to avoid race conditions
  const resizeRef = useRef({
    isResizing: false,
    startX: 0,
    startWidth: 0,
    currentWidth: 0,
    containerWidth: 0,
    currentPercentage: 50, // Track percentage for container resizes
  });

  // In the first useEffect where dimensions are initialized
  useEffect(() => {
    if (ref.current) {
      const containerWidth = ref.current.clientWidth;
      // Check global state first
      const existingWidth = useSectionColumnWidth.getState()[sectionId];
      console.log("existingWidth", existingWidth);
      const initialWidth = existingWidth ?? containerWidth / 2;

      resizeRef.current.containerWidth = containerWidth;
      resizeRef.current.currentWidth = initialWidth;
      resizeRef.current.currentPercentage =
        (initialWidth / containerWidth) * 100;

      if (!existingWidth) {
        console.log(
          "in initial useEffect, setting column width to initialWidth",
          initialWidth,
        );
        setColumnWidth(sectionId, initialWidth);
      }
    }
  }, []);

  // Handle container resize and margin changes with debounced updates
  useEffect(() => {
    const handleResize = () => {
      if (ref.current) {
        const containerWidth = ref.current.clientWidth;
        const currentPercentage = resizeRef.current.currentPercentage;
        resizeRef.current.containerWidth = containerWidth;

        // First calculate width based on percentage
        const newWidth = (containerWidth * currentPercentage) / 100;

        // Then ensure it respects margin constraints
        const boundedWidth = clamp(
          newWidth,
          marginPx,
          containerWidth - marginPx,
        );

        // Update both width and percentage if bounds were hit
        resizeRef.current.currentWidth = boundedWidth;
        resizeRef.current.currentPercentage =
          (boundedWidth / containerWidth) * 100;
        
        console.log("handleResize")

        setColumnWidth(sectionId, boundedWidth);
      }
    };

    // Call immediately to handle margin changes
    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    if (ref.current) {
      resizeObserver.observe(ref.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [marginPx]); // Add marginPx as dependency

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    if (ref.current) {
      resizeRef.current = {
        ...resizeRef.current,
        isResizing: true,
        startX: e.clientX,
        startWidth: resizeRef.current.currentWidth,
      };
    }
  }, []);

  const handleMouseMove = useCallback(
    (e) => {
      if (!resizeRef.current.isResizing || !ref.current) return;

      requestAnimationFrame(() => {
        const { containerWidth, startX, startWidth } = resizeRef.current;
        const diff =
          (e.clientX - startX) / useReactFlow.getState().transform[2];

        const newWidth = clamp(
          startWidth + diff,
          marginPx,
          containerWidth - marginPx,
        );

        // Update ref first
        resizeRef.current.currentWidth = newWidth;
        resizeRef.current.currentPercentage = (newWidth / containerWidth) * 100;

        // Then update global state
        setColumnWidth(sectionId, newWidth);
      });
    },
    [marginPx],
  ); // Add marginPx as dependency

  const handleMouseUp = useCallback(() => {
    resizeRef.current.isResizing = false;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return handleResizeStart;
}

function setColumnWidth(sectionId, width) {
  useSectionColumnWidth.setState({
    [sectionId]: width, // Maintain the existing 24px adjustment
  });
}
function getLongestListLength(obj) {
  return Object.values(obj).reduce(
    (max, arr) => (arr.length > max ? arr.length : max),
    0,
  );
}
