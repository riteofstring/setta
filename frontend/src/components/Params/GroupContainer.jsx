import { ResizableWithScale } from "components/Utils/Resizable/ResizableWithScale";
import { getChangedSize, SIZE_MODE } from "components/Utils/Resizable/utils";
import _ from "lodash";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { setActiveResizer } from "state/actions/sectionColumnWidth";
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

function _ParamGroupContainer({ sectionId }) {
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

export const ParamGroupContainer = React.memo(_ParamGroupContainer);

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
  const centerOffset = 18;

  const widthRef = useRef({
    currentWidth: 0,
    containerWidth: 0,
    currentPercentage: 50,
    isDragging: false,
  });

  function setNewWidth(containerWidth, width, setGlobalState) {
    const boundedWidth = clamp(width, marginPx, containerWidth - marginPx);
    widthRef.current.currentWidth = boundedWidth;
    widthRef.current.currentPercentage = (boundedWidth / containerWidth) * 100;
    if (setGlobalState) {
      useSectionColumnWidth.setState({
        [sectionId]: boundedWidth - centerOffset,
      });
    }
  }

  const updatedWidthOnContainerResize = useCallback(() => {
    // Skip updates if we're currently dragging
    if (widthRef.current.isDragging || !ref.current) return;

    const containerWidth = ref.current.clientWidth;
    const currentPercentage = widthRef.current.currentPercentage;
    const newWidth = (containerWidth * currentPercentage) / 100;
    widthRef.current.containerWidth = containerWidth;
    setNewWidth(containerWidth, newWidth, true);
  }, []);

  useEffect(() => {
    if (ref.current) {
      const containerWidth = ref.current.clientWidth;
      const existingWidth = useSectionColumnWidth.getState()[sectionId];
      const initialWidth = existingWidth
        ? existingWidth + centerOffset
        : containerWidth / 2;
      widthRef.current.containerWidth = containerWidth;
      setNewWidth(containerWidth, initialWidth, !existingWidth);
    }
  }, [marginPx]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(updatedWidthOnContainerResize);
    if (ref.current) {
      resizeObserver.observe(ref.current);
    }
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Expose widthRef to DOM element for global handlers
  useEffect(() => {
    if (ref.current) {
      ref.current._widthRef = widthRef;
    }
    return () => {
      if (ref.current) {
        delete ref.current._widthRef;
      }
    };
  }, []);

  const handleResizeStart = useCallback(
    (e) => {
      e.preventDefault();
      if (ref.current) {
        widthRef.current.isDragging = true;
        setActiveResizer({
          sectionId,
          ref,
          startX: e.clientX,
          startWidth: widthRef.current.currentWidth,
          containerWidth: widthRef.current.containerWidth,
          maxNestedDepth,
        });
      }
    },
    [sectionId, maxNestedDepth],
  );

  return handleResizeStart;
}

function getLongestListLength(obj) {
  return Object.values(obj).reduce(
    (max, arr) => (arr.length > max ? arr.length : max),
    0,
  );
}
