import { ResizableWithScale } from "components/Utils/Resizable/ResizableWithScale";
import { getChangedSize, SIZE_MODE } from "components/Utils/Resizable/utils";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSectionInfos } from "state/definitions";
import { useParametersRequestWaitingForLSPResult } from "state/hooks/lsp";
import { useParamIdsToShowInArea } from "state/hooks/sectionContents";
import {
  INFINITE_MAX_HEIGHT,
  PINNED_PARAMS_AREA_MIN_HEIGHT,
  useIsScrollable,
} from "state/hooks/sectionSizes";
import { GetParamSwitch } from "./GetParamSwitch";

function _ParamGroupContainer({ sectionId }) {
  const outerRef = useRef();

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
          <GetPinnedParams sectionId={sectionId} outerRef={outerRef} />
          <GetUnpinnedParams sectionId={sectionId} />
        </>
      )}
    </div>
  );
}

function GetPinnedParams({ sectionId, outerRef }) {
  const { requiredParamIdsToPaths, topLevelParamIds } = useParamIdsToShowInArea(
    sectionId,
    true,
  );

  return (
    topLevelParamIds.length > 0 && (
      <ResizablePinnedArea
        sectionId={sectionId}
        topLevelParamIds={topLevelParamIds}
        requiredParamIdsToPaths={requiredParamIdsToPaths}
        outerRef={outerRef}
      />
    )
  );
}

function ResizablePinnedArea({
  sectionId,
  topLevelParamIds,
  requiredParamIdsToPaths,
  outerRef,
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
        />
      </div>
    </ResizableWithScale>
  );
}

function GetUnpinnedParams({ sectionId }) {
  const { ref, isScrollable } = useIsScrollable();
  const hideUnpinnedParams = useSectionInfos(
    (x) => x.x[sectionId].hideUnpinnedParams,
  );

  const resizeRef = useRef({
    isResizing: false,
    startX: 0,
    startWidth: 0,
    containerWidth: 0,
    widthPercentage: 50,
  });

  const [columnWidth, setColumnWidth] = useState({
    pixels: 0,
    percentage: 50,
  });

  // Set initial width on mount
  useEffect(() => {
    if (ref.current) {
      const containerWidth = ref.current.clientWidth;
      const initialPixels = (containerWidth - 12) / 2; // 12px is 0.75rem gutter
      setColumnWidth({
        pixels: initialPixels,
        percentage: 50,
      });
    }
  }, []);

  // Handle container resize
  useEffect(() => {
    const handleResize = () => {
      if (ref.current) {
        const containerWidth = ref.current.clientWidth;
        setColumnWidth((prev) => ({
          pixels: (containerWidth - 12) * (prev.percentage / 100),
          percentage: prev.percentage,
        }));
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (ref.current) {
      resizeObserver.observe(ref.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  const handleResizeStart = useCallback(
    (e) => {
      console.log("Resize start triggered");
      e.preventDefault();
      if (ref.current) {
        resizeRef.current = {
          isResizing: true,
          startX: e.clientX,
          startPercentage: columnWidth.percentage,
        };
      }
    },
    [columnWidth.percentage],
  );

  const handleMouseMove = useCallback((e) => {
    if (!resizeRef.current.isResizing || !ref.current) return;

    requestAnimationFrame(() => {
      const containerWidth = ref.current.clientWidth;
      const diff =
        (e.clientX - resizeRef.current.startX) /
        useReactFlow.getState().transform[2];

      const diffAsPercentage = (diff / containerWidth) * 100;

      const newPercentage = Math.max(
        20,
        Math.min(80, resizeRef.current.startPercentage + diffAsPercentage),
      );

      setColumnWidth((prev) => ({
        pixels: (containerWidth - 12) * (newPercentage / 100),
        percentage: newPercentage,
      }));
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    resizeRef.current.isResizing = false;
  }, []);

  // Modified useEffect to always attach listeners
  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

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
          onResizeStart={handleResizeStart}
          baseColumnWidth={columnWidth.pixels}
          widthPercentage={columnWidth.percentage}
        />
      )}
    </div>
  );
}

function GetUnpinnedParamsCore({ sectionId, onResizeStart, baseColumnWidth }) {
  const { requiredParamIdsToPaths, topLevelParamIds } = useParamIdsToShowInArea(
    sectionId,
    false,
  );

  return (
    <GetParamSwitch
      sectionId={sectionId}
      paramIds={topLevelParamIds}
      requiredParamIdsToPaths={requiredParamIdsToPaths}
      onResizeStart={onResizeStart}
      baseColumnWidth={baseColumnWidth}
    />
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);
