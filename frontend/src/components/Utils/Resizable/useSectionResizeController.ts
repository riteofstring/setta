import _ from "lodash";
import { useEffect, useRef } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import {
  adjustSizeToBeAtLeastMin,
  getResizeStartAutoSizeUpdate,
  isHeightResizeDirection,
  setSelfParentSiblingChildrenWidths,
  type ResizeHandleDirection,
} from "state/actions/sections/sectionSizes";
import {
  useLocalStorage,
  useMisc,
  useProjectState,
  useResizeEvent,
  useSettings,
} from "state/definitions";
import { useSectionMinMaxDims } from "state/hooks/sectionSizes";
import { useShareCapabilities } from "state/hooks/share";
import { route_set_section_sizes } from "utils/generatedEndpoints";
import { SectionSize } from "utils/generatedTypes";
import {
  getChangedSize,
  getResizeHandleClickState,
  isResizeDoubleClick,
  SIZE_MODE,
} from "./utils";

const AUTO_CLAMP_TOLERANCE = 2;

type ResizeStopEvent = {
  detail?: number;
};

type ResizeStopRef = {
  style: { width: string; height: string };
  offsetWidth: number;
  offsetHeight: number;
  getBoundingClientRect?: () => unknown;
};

type ResizeDelta = {
  width: number;
  height: number;
};

type ResizeStopArgs = [
  ResizeStopEvent,
  ResizeHandleDirection,
  ResizeStopRef,
  ResizeDelta,
];

function dispatchSectionSizeUpdate(
  sectionId: string,
  changedSize: Partial<SectionSize>,
) {
  let updatedSectionSizes: Record<string, SectionSize> = {};
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      updatedSectionSizes = setSelfParentSiblingChildrenWidths(
        sectionId,
        changedSize,
        state,
      );
    },
    send: (frontendOpId) =>
      route_set_section_sizes({
        projectConfigId: getCurrProjectConfigId(),
        sectionSizes: updatedSectionSizes,
        frontendOpId,
      }),
  });
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

function setSectionResizeEvent(
  sectionId: string,
  resizeEvent: "start" | "end",
  state: { resizeEvent: Record<string, "start" | "end" | undefined> },
) {
  state.resizeEvent[sectionId] = resizeEvent;
}

type ResizeEndDecisionInput = {
  resizeStarted: boolean;
  resizeAttempted: boolean;
  isZeroDelta: boolean;
  isDoubleClick: boolean;
};

export function shouldEmitResizeEndEvent({
  resizeStarted,
  resizeAttempted,
  isZeroDelta,
  isDoubleClick,
}: ResizeEndDecisionInput): boolean {
  if (!resizeStarted) {
    return false;
  }
  if (isZeroDelta && !isDoubleClick && !resizeAttempted) {
    return false;
  }
  return true;
}

export function clampChangedSize({
  changedSize,
  minHeight,
  minWidth,
  aspectRatio,
}: {
  changedSize: Partial<SectionSize>;
  minHeight: number;
  minWidth: number;
  aspectRatio: boolean;
}) {
  const clampedSize = { ...changedSize };
  const hasHeight = typeof changedSize.height === "number";
  const hasWidth = typeof changedSize.width === "number";

  if (hasHeight && hasWidth) {
    if (aspectRatio) {
      const adjusted = adjustSizeToBeAtLeastMin(
        changedSize.height,
        changedSize.width,
        minHeight,
        minWidth,
      );
      clampedSize.height = adjusted.height;
      clampedSize.width = adjusted.width;
      return clampedSize;
    }
    if (changedSize.height < minHeight) {
      clampedSize.height = minHeight;
    }
    if (changedSize.width < minWidth) {
      clampedSize.width = minWidth;
    }
    return clampedSize;
  }

  if (hasHeight && changedSize.height < minHeight) {
    clampedSize.height = minHeight;
  }
  if (hasWidth && changedSize.width < minWidth) {
    clampedSize.width = minWidth;
  }

  return clampedSize;
}

export function resolveCommittedResizeStopSize({
  props,
  sizeMode,
  aspectRatio,
  minHeight,
  minWidth,
  isDoubleClickOverride,
}: {
  props: ResizeStopArgs;
  sizeMode: {
    width: (typeof SIZE_MODE)[keyof typeof SIZE_MODE];
    height: (typeof SIZE_MODE)[keyof typeof SIZE_MODE];
  };
  aspectRatio: boolean;
  minHeight: number;
  minWidth: number;
  isDoubleClickOverride: boolean;
}) {
  const [, , ref] = props;
  const changedSize = getChangedSize({
    props,
    sizeMode,
    aspectRatio,
    isDoubleClickOverride,
  });

  if (
    !isDoubleClickOverride &&
    typeof ref.getBoundingClientRect === "function"
  ) {
    if (
      changedSize.height === "auto" ||
      (typeof changedSize.height === "number" &&
        Number.isNaN(changedSize.height))
    ) {
      changedSize.height = Math.round(ref.offsetHeight);
    }
    if (
      changedSize.width === "auto" ||
      (typeof changedSize.width === "number" && Number.isNaN(changedSize.width))
    ) {
      changedSize.width = Math.round(ref.offsetWidth);
    }
  }

  return clampChangedSize({
    changedSize,
    minHeight,
    minWidth,
    aspectRatio,
  });
}

export function useSectionResizeController({
  sectionId,
  positionAndSizeLocked,
}: {
  sectionId: string;
  positionAndSizeLocked: boolean;
}) {
  const { minHeight, maxHeight, minWidth, maxWidth, sizeMode } =
    useSectionMinMaxDims(sectionId);
  const { size, aspectRatio, aspectRatioExtraHeight, aspectRatioExtraWidth } =
    useAspectRatio(sectionId);
  const { canEditLayout } = useShareCapabilities();
  const resizeStartedRef = useRef(false);
  const autoSizePromotedRef = useRef(false);
  const resizeAttemptedRef = useRef(false);
  const resizeClickRef = useRef<{
    lastTimestampMs: number | null;
    lastDirection: ResizeHandleDirection | null;
  }>({ lastTimestampMs: null, lastDirection: null });
  const doubleClickPendingRef = useRef(false);
  const snapGrid = useSettings((x) => x.gui.snapGrid);
  const snapToGrid = useLocalStorage((x) => x.snapToGrid);

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
  }, [sectionId, sizeMode.height, sizeMode.width]);

  function maybePromoteAutoSize(
    direction: ResizeHandleDirection,
    ref: ResizeStopRef,
  ) {
    if (
      autoSizePromotedRef.current ||
      !canEditLayout ||
      positionAndSizeLocked ||
      typeof ref.getBoundingClientRect !== "function"
    ) {
      return;
    }

    const nextSize = getResizeStartAutoSizeUpdate({
      size,
      direction,
      rect: { width: ref.offsetWidth, height: ref.offsetHeight },
    });
    if (!nextSize) {
      return;
    }

    autoSizePromotedRef.current = true;
    dispatchSectionSizeUpdate(sectionId, nextSize);
  }

  function startResizeEvent(direction: ResizeHandleDirection) {
    if (isHeightResizeDirection(direction) && !resizeStartedRef.current) {
      resizeStartedRef.current = true;
      useResizeEvent.setState((state) => {
        setSectionResizeEvent(sectionId, "start", state);
      });
    }
  }

  function beginResize(direction: ResizeHandleDirection, ref: ResizeStopRef) {
    maybePromoteAutoSize(direction, ref);
    startResizeEvent(direction);
  }

  function onResizeStart(
    _event: unknown,
    _direction: ResizeHandleDirection,
    _ref: ResizeStopRef,
  ) {
    resizeStartedRef.current = false;
    autoSizePromotedRef.current = false;
    resizeAttemptedRef.current = false;
    useMisc.setState({ mouseDownDraggingSection: true });
  }

  function onResize(
    _event: unknown,
    direction: ResizeHandleDirection,
    ref: ResizeStopRef,
    _delta: ResizeDelta,
  ) {
    resizeAttemptedRef.current = true;
    doubleClickPendingRef.current = false;
    beginResize(direction, ref);
  }

  function onResizePointerDown(direction: ResizeHandleDirection) {
    const { nextState, isDoubleClick } = getResizeHandleClickState({
      state: resizeClickRef.current,
      direction,
      timestampMs: Date.now(),
    });
    resizeClickRef.current = nextState;
    if (isDoubleClick) {
      doubleClickPendingRef.current = true;
    }
  }

  function resetResizeRefs() {
    useMisc.setState({ mouseDownDraggingSection: false });
    resizeStartedRef.current = false;
    autoSizePromotedRef.current = false;
    resizeAttemptedRef.current = false;
    doubleClickPendingRef.current = false;
  }

  function maybeEmitResizeEnd(shouldEmitResizeEnd: boolean) {
    if (!shouldEmitResizeEnd) {
      return;
    }
    useResizeEvent.setState((state) => {
      setSectionResizeEvent(sectionId, "end", state);
    });
  }

  function onResizeStop(...props: ResizeStopArgs) {
    const [event, , , delta] = props;
    const isZeroDelta = delta.width === 0 && delta.height === 0;
    const isDoubleClick = isResizeDoubleClick({
      isPending: doubleClickPendingRef.current,
      eventDetail: event.detail,
      isZeroDelta,
      resizeAttempted: resizeAttemptedRef.current,
    });
    const shouldEmitResizeEnd = shouldEmitResizeEndEvent({
      resizeStarted: resizeStartedRef.current,
      resizeAttempted: resizeAttemptedRef.current,
      isZeroDelta,
      isDoubleClick,
    });

    if (isZeroDelta && !isDoubleClick && !resizeAttemptedRef.current) {
      maybeEmitResizeEnd(shouldEmitResizeEnd);
      resetResizeRefs();
      return;
    }

    const nextSize = resolveCommittedResizeStopSize({
      props,
      sizeMode,
      aspectRatio,
      minHeight,
      minWidth,
      isDoubleClickOverride: isDoubleClick,
    });
    dispatchSectionSizeUpdate(sectionId, nextSize);
    maybeEmitResizeEnd(shouldEmitResizeEnd);
    resetResizeRefs();
  }

  useEffect(() => {
    const hasHeight = typeof size.height === "number";
    const hasWidth = typeof size.width === "number";
    const heightDelta = hasHeight ? minHeight - size.height : null;
    const widthDelta = hasWidth ? minWidth - size.width : null;
    const shouldClampHeight =
      sizeMode.height !== SIZE_MODE.auto_only &&
      heightDelta !== null &&
      heightDelta > AUTO_CLAMP_TOLERANCE;
    const shouldClampWidth =
      sizeMode.width !== SIZE_MODE.auto_only &&
      widthDelta !== null &&
      widthDelta > AUTO_CLAMP_TOLERANCE;

    if (!shouldClampHeight && !shouldClampWidth) {
      return;
    }
    if (!canEditLayout || positionAndSizeLocked) {
      return;
    }

    const nextSize: Partial<SectionSize> = {};
    if (
      aspectRatio &&
      hasHeight &&
      hasWidth &&
      sizeMode.height !== SIZE_MODE.auto_only &&
      sizeMode.width !== SIZE_MODE.auto_only
    ) {
      const adjusted = adjustSizeToBeAtLeastMin(
        size.height,
        size.width,
        minHeight,
        minWidth,
      );
      if (adjusted.height !== size.height) {
        nextSize.height = adjusted.height;
      }
      if (adjusted.width !== size.width) {
        nextSize.width = adjusted.width;
      }
    } else {
      if (shouldClampHeight) {
        nextSize.height = minHeight;
      }
      if (shouldClampWidth) {
        nextSize.width = minWidth;
      }
    }

    if (_.size(nextSize) === 0) {
      return;
    }

    dispatchSectionSizeUpdate(sectionId, nextSize);
  }, [
    aspectRatio,
    canEditLayout,
    minHeight,
    minWidth,
    positionAndSizeLocked,
    sectionId,
    size.height,
    size.width,
    sizeMode.height,
    sizeMode.width,
  ]);

  const heightResizable =
    minHeight !== maxHeight && sizeMode.height !== SIZE_MODE.auto_only;
  const widthResizable = sizeMode.width !== SIZE_MODE.auto_only;

  return {
    aspectRatio,
    aspectRatioExtraHeight,
    aspectRatioExtraWidth,
    heightResizable,
    maxHeight,
    maxWidth,
    minHeight,
    minWidth,
    onResize,
    onResizePointerDown,
    onResizeStart,
    onResizeStop,
    size,
    snapGrid,
    snapToGrid,
    widthResizable,
  };
}
