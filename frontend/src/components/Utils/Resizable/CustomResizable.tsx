import _ from "lodash";
import { useReactFlow } from "forks/xyflow/core/store";
import { useEffect, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import {
  setSectionSize,
  setSelfParentSiblingChildrenWidths,
} from "state/actions/sections/sectionSizes";
import {
  useLocalStorage,
  useMisc,
  useProjectState,
  useResizeEvent,
  useSectionRefs,
  useSettings,
  type ZustandProjectState,
} from "state/definitions";
import { useShouldDisablePointerEvents } from "state/hooks/keyActivations";
import { useSectionMinMaxDims } from "state/hooks/sectionSizes";
import {
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";
import { route_set_section_sizes } from "utils/generatedEndpoints";
import { SectionSize } from "utils/generatedTypes";
import { ResizableWithScale } from "./ResizableWithScale";
import {
  applyOverflowParentSizeUpdates,
  type CrossAxis,
  getClosestOverflowGroupIdForAxis,
  setOverflowGroupCrossAxisSize,
} from "./overflowResizeUtils";
import { getChangedSize, SIZE_MODE } from "./utils";

function getNumericResizeSize(
  changedSize: Partial<SectionSize>,
): Partial<SectionSize> {
  const numericSize: Partial<SectionSize> = {};
  if (
    typeof changedSize.width === "number" &&
    Number.isFinite(changedSize.width)
  ) {
    numericSize.width = changedSize.width;
  }
  if (
    typeof changedSize.height === "number" &&
    Number.isFinite(changedSize.height)
  ) {
    numericSize.height = changedSize.height;
  }
  return numericSize;
}

function mergeSizeUpdates(
  target: Record<string, SectionSize>,
  updates: Record<string, SectionSize>,
) {
  for (const [sectionId, size] of Object.entries(updates)) {
    target[sectionId] = size;
  }
}

function getScaledSizeFromElement(
  element: HTMLElement | null,
): SectionSize | null {
  if (!element) {
    return null;
  }
  const zoom = useReactFlow.getState().transform[2] ?? 1;
  const safeZoom = zoom > 0 ? zoom : 1;
  const rect = element.getBoundingClientRect();
  return {
    width: Math.round(rect.width / safeZoom),
    height: Math.round(rect.height / safeZoom),
  };
}

function getElementContentSize(
  element: HTMLElement | null,
): SectionSize | null {
  const size = getScaledSizeFromElement(element);
  if (!size || !element) {
    return null;
  }
  const style = window.getComputedStyle(element);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const width = Math.max(0, size.width - paddingLeft - paddingRight);
  const height = Math.max(0, size.height - paddingTop - paddingBottom);
  return { width, height };
}

function getOverflowGroupAxisOffset({
  groupId,
  axis,
}: {
  groupId: string;
  axis: CrossAxis;
}): number {
  const { withNested, overflowElement } = useSectionRefs.getState();
  const outer = withNested[groupId] as HTMLElement | undefined;
  const inner = overflowElement?.[groupId] as HTMLElement | undefined;
  if (!outer || !inner) {
    return 0;
  }
  const outerSize = getScaledSizeFromElement(outer);
  const innerContentSize = getElementContentSize(inner);
  if (!outerSize || !innerContentSize) {
    return 0;
  }
  const outerAxisSize =
    axis === "width" ? outerSize.width : outerSize.height;
  const innerAxisSize =
    axis === "width" ? innerContentSize.width : innerContentSize.height;
  const offset = Math.round(outerAxisSize - innerAxisSize);
  if (!Number.isFinite(offset) || offset < 0) {
    return 0;
  }
  return offset;
}

function applyOverflowSectionResizeUpdates({
  sectionId,
  width,
  height,
  state,
}: {
  sectionId: string;
  width: number | undefined;
  height: number | undefined;
  state: ZustandProjectState;
}): Record<string, SectionSize> {
  const updates: Record<string, SectionSize> = {};

  if (typeof width === "number") {
    const widthGroupId = getClosestOverflowGroupIdForAxis({
      sectionId,
      axis: "width",
      state,
    });
    if (widthGroupId) {
      const widthOffset = getOverflowGroupAxisOffset({
        groupId: widthGroupId,
        axis: "width",
      });
      const groupWidth = width + widthOffset;
      mergeSizeUpdates(
        updates,
        setOverflowGroupCrossAxisSize({
          groupId: widthGroupId,
          axis: "width",
          axisSize: width,
          state,
          includeChildren: true,
          includeGroup: false,
        }),
      );
      mergeSizeUpdates(
        updates,
        setOverflowGroupCrossAxisSize({
          groupId: widthGroupId,
          axis: "width",
          axisSize: groupWidth,
          state,
          includeChildren: false,
          includeGroup: true,
        }),
      );
      mergeSizeUpdates(
        updates,
        applyOverflowParentSizeUpdates({
          sectionId: widthGroupId,
          newWidth: groupWidth,
          newHeight: undefined,
          state,
        }),
      );
    }
  }

  if (typeof height === "number") {
    const heightGroupId = getClosestOverflowGroupIdForAxis({
      sectionId,
      axis: "height",
      state,
    });
    if (heightGroupId) {
      const heightOffset = getOverflowGroupAxisOffset({
        groupId: heightGroupId,
        axis: "height",
      });
      const groupHeight = height + heightOffset;
      mergeSizeUpdates(
        updates,
        setOverflowGroupCrossAxisSize({
          groupId: heightGroupId,
          axis: "height",
          axisSize: height,
          state,
          includeChildren: true,
          includeGroup: false,
        }),
      );
      mergeSizeUpdates(
        updates,
        setOverflowGroupCrossAxisSize({
          groupId: heightGroupId,
          axis: "height",
          axisSize: groupHeight,
          state,
          includeChildren: false,
          includeGroup: true,
        }),
      );
      mergeSizeUpdates(
        updates,
        applyOverflowParentSizeUpdates({
          sectionId: heightGroupId,
          newWidth: undefined,
          newHeight: groupHeight,
          state,
        }),
      );
    }
  }

  return updates;
}

export function CustomResizable({
  sectionId,
  bgColor,
  isYouTube,
  isActiveSection,
  isMetaControl,
  positionAndSizeLocked,
  frameClassName = "before:border-white dark:before:border-setta-700",
  layoutClassName,
  children,
  as,
}) {
  const { minHeight, maxHeight, minWidth, maxWidth, sizeMode } =
    useSectionMinMaxDims(sectionId);
  return (
    <CustomResizableCore
      sectionId={sectionId}
      bgColor={bgColor}
      isYouTube={isYouTube}
      isActiveSection={isActiveSection}
      isMetaControl={isMetaControl}
      positionAndSizeLocked={positionAndSizeLocked}
      frameClassName={frameClassName}
      layoutClassName={layoutClassName}
      minHeight={minHeight}
      maxHeight={maxHeight}
      minWidth={minWidth}
      maxWidth={maxWidth}
      sizeMode={sizeMode}
      as={as}
    >
      {children}
    </CustomResizableCore>
  );
}

function CustomResizableCore({
  sectionId,
  bgColor,
  isYouTube,
  isActiveSection,
  isMetaControl,
  positionAndSizeLocked,
  frameClassName = "before:border-white dark:before:border-setta-700",
  layoutClassName,
  minHeight,
  maxHeight,
  minWidth,
  maxWidth,
  sizeMode,
  children,
  as,
}) {
  useEffect(() => {
    const changedSize: Partial<SectionSize> = {};
    if (sizeMode.height === SIZE_MODE.auto_only) {
      changedSize.height = "auto";
    }
    if (sizeMode.width === SIZE_MODE.auto_only) {
      changedSize.width = "auto";
    }
    if (_.size(changedSize) > 0) {
      useProjectState.setState((state) => {
        setSelfParentSiblingChildrenWidths(sectionId, changedSize, state);
      });
    }
  }, [sizeMode.height, sizeMode.width]);

  const { size, aspectRatio, aspectRatioExtraHeight, aspectRatioExtraWidth } =
    useAspectRatio(sectionId);

  function onResizeStart() {
    useResizeEvent.setState((state) => {
      setSectionResizeEvent(sectionId, "start", state);
    });
    useMisc.setState({ mouseDownDraggingSection: true });
  }

  function onResize(...props: unknown[]) {
    const changedSize = getChangedSize({
      props,
      sizeMode,
      aspectRatio,
    });
    const numericSize = getNumericResizeSize(changedSize);

    if (_.size(numericSize) === 0) {
      return;
    }

    useProjectState.setState((state) => {
      const overflowUpdates = applyOverflowSectionResizeUpdates({
        sectionId,
        width: numericSize.width,
        height: numericSize.height,
        state,
      });
      if (_.size(overflowUpdates) === 0) {
        return;
      }
      setSectionSize(sectionId, numericSize, state);
    });
  }

  function onResizeStop(...props: unknown[]) {
    const changedSize = getChangedSize({
      props,
      sizeMode,
      aspectRatio,
    });
    const numericSize = getNumericResizeSize(changedSize);
    let updatedSectionSizes: Record<string, SectionSize> = {};
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        updatedSectionSizes = setSelfParentSiblingChildrenWidths(
          sectionId,
          changedSize,
          state,
        );
        const overflowUpdates = applyOverflowSectionResizeUpdates({
          sectionId,
          width: numericSize.width,
          height: numericSize.height,
          state,
        });
        mergeSizeUpdates(updatedSectionSizes, overflowUpdates);
      },
      send: (frontendOpId) =>
        route_set_section_sizes({
          projectConfigId: getCurrProjectConfigId(),
          sectionSizes: updatedSectionSizes,
          frontendOpId,
        }),
    });
    useResizeEvent.setState((state) => {
      setSectionResizeEvent(sectionId, "end", state);
    });
    useMisc.setState({ mouseDownDraggingSection: false });
  }

  const heightResizable =
    minHeight !== maxHeight && sizeMode.height !== SIZE_MODE.auto_only;
  const widthResizable = sizeMode.width !== SIZE_MODE.auto_only;

  const snapGrid = useSettings((x) => x.gui.snapGrid);
  const snapToGrid = useLocalStorage((x) => x.snapToGrid);

  return (
    <CustomResizableSuperCore
      sectionId={sectionId}
      as={as}
      bgColor={bgColor}
      isYouTube={isYouTube}
      isActiveSection={isActiveSection}
      isMetaControl={isMetaControl}
      size={size}
      minHeight={minHeight}
      maxHeight={maxHeight}
      minWidth={minWidth}
      maxWidth={maxWidth}
      heightResizable={heightResizable}
      widthResizable={widthResizable}
      positionAndSizeLocked={positionAndSizeLocked}
      frameClassName={frameClassName}
      layoutClassName={layoutClassName}
      onResizeStart={onResizeStart}
      onResize={onResize}
      onResizeStop={onResizeStop}
      aspectRatio={aspectRatio}
      aspectRatioExtraHeight={aspectRatioExtraHeight}
      aspectRatioExtraWidth={aspectRatioExtraWidth}
      snapGrid={snapGrid}
      snapToGrid={snapToGrid}
    >
      {children}
    </CustomResizableSuperCore>
  );
}

function CustomResizableSuperCore({
  sectionId,
  as,
  bgColor,
  isYouTube,
  isActiveSection,
  isMetaControl,
  frameClassName = "before:border-white dark:before:border-setta-700",
  layoutClassName,
  size,
  minHeight,
  maxHeight,
  minWidth,
  maxWidth,
  heightResizable,
  widthResizable,
  positionAndSizeLocked,
  onResizeStart,
  onResize,
  onResizeStop,
  aspectRatio,
  aspectRatioExtraHeight,
  aspectRatioExtraWidth,
  snapGrid,
  snapToGrid,
  children,
}) {
  const disablePointerEvents = useShouldDisablePointerEvents();
  const [activeResizeHandle, setActiveResizeHandle] = useState<string | null>(
    null,
  );

  const enable =
    disablePointerEvents || positionAndSizeLocked
      ? false
      : {
          top: false,
          left: false,
          bottom: heightResizable,
          right: widthResizable,
          topRight: false,
          bottomRight: heightResizable && widthResizable,
          topLeft: false,
          bottomLeft: false,
        };

  const layoutClassNameToUse =
    layoutClassName ?? "section-grid-cols section-grid-rows section-grid-areas";
  const inputClasses = `${
    disablePointerEvents ? "pointer-events-none select-none" : ""
  } ${bgColor} ${layoutClassNameToUse} relative grid h-full transition-radius ${!positionAndSizeLocked ? "rounded-xl" : "rounded-sm"}   before:content-none before:block before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0 before:border ${isYouTube ? "overflow-clip" : ""} ${
    isActiveSection ? "z-[150]" : "z-10"
  } ${frameClassName}`;

  const handleBaseClassName = `${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_PAN_CLASS_NAME}`;
  const handleBaseClasses = {
    right: handleBaseClassName,
    bottom: handleBaseClassName,
    bottomRight: handleBaseClassName,
  };
  const metaControlHandleBaseClassName =
    "relative flex items-center justify-center opacity-0 transition-opacity hover:opacity-100 after:absolute after:rounded after:bg-transparent hover:after:bg-blue-500/80 dark:hover:after:bg-blue-400/80";

  function getMetaControlHandleActiveClassName(direction: string) {
    if (!isMetaControl) {
      return "";
    }
    if (activeResizeHandle !== direction) {
      return "";
    }
    return "opacity-100 after:bg-blue-500/80 dark:after:bg-blue-400/80";
  }

  const metaControlHandleRightClassName = `${metaControlHandleBaseClassName} ${getMetaControlHandleActiveClassName("right")} cursor-col-resize after:inset-y-1 after:left-1/2 after:w-[3px] after:-translate-x-1/2`;
  const metaControlHandleBottomClassName = `${metaControlHandleBaseClassName} ${getMetaControlHandleActiveClassName("bottom")} cursor-row-resize after:inset-x-1 after:top-1/2 after:h-[3px] after:-translate-y-1/2`;
  const metaControlHandleCornerClassName = `${metaControlHandleBaseClassName} ${getMetaControlHandleActiveClassName("bottomRight")} cursor-nwse-resize after:inset-1`;

  let handleStyles = { right: { right: "-8px" }, bottom: { bottom: "-8px" } };
  let handleClasses = handleBaseClasses;

  function handleResizeStart(event, direction, ref) {
    setActiveResizeHandle(direction);
    if (onResizeStart) {
      onResizeStart(event, direction, ref);
    }
  }

  function handleResizeStop(event, direction, ref, delta) {
    setActiveResizeHandle(null);
    if (onResizeStop) {
      onResizeStop(event, direction, ref, delta);
    }
  }

  if (isMetaControl) {
    handleStyles = {
      right: { right: "-8px", width: 16, top: 0, bottom: 0, height: "100%" },
      bottom: {
        bottom: "-8px",
        height: 16,
        left: 0,
        right: 0,
        width: "100%",
      },
      bottomRight: { right: "-8px", bottom: "-8px", width: 16, height: 16 },
    };
    handleClasses = {
      right: `${handleBaseClassName} ${metaControlHandleRightClassName}`,
      bottom: `${handleBaseClassName} ${metaControlHandleBottomClassName}`,
      bottomRight: `${handleBaseClassName} ${metaControlHandleCornerClassName}`,
    };
  }

  return (
    <ResizableWithScale
      id={`${sectionId}-CustomResizable`} // IMPORTANT, used as parent for codemirror autocomplete
      as={as}
      size={size}
      minHeight={minHeight}
      maxHeight={maxHeight}
      minWidth={minWidth}
      maxWidth={maxWidth}
      onResizeStart={handleResizeStart}
      onResize={onResize}
      onResizeStop={handleResizeStop}
      lockAspectRatio={aspectRatio}
      lockAspectRatioExtraHeight={aspectRatioExtraHeight}
      lockAspectRatioExtraWidth={aspectRatioExtraWidth}
      handleWrapperClass="absolute pointer-events-none [&>*]:pointer-events-auto h-full bottom-0 w-full nodrag [&>div]:z-20"
      enable={enable}
      className={inputClasses}
      handleStyles={handleStyles}
      handleClasses={handleClasses}
      grid={snapToGrid ? snapGrid : null}
    >
      {children}
    </ResizableWithScale>
  );
}

function useAspectRatio(sectionId: string) {
  return useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    if (impl.isMinimized) {
      return {
        size: impl.size,
        aspectRatio: false,
        aspectRatioExtraHeight: 0,
        aspectRatioExtraWidth: 0,
      };
    }
    return {
      size: impl.size,
      aspectRatio: impl.aspectRatio ?? false,
      aspectRatioExtraHeight: impl.aspectRatioExtraHeight ?? 0,
      aspectRatioExtraWidth: impl.aspectRatioExtraWidth ?? 0,
    };
  }, _.isEqual);
}

function setSectionResizeEvent(sectionId, resizeEvent, state) {
  state.resizeEvent[sectionId] = resizeEvent;
}
