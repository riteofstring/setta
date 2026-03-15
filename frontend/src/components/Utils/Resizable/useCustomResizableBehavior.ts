import _ from "lodash";
import type { ResizeCallback, ResizeStartCallback } from "re-resizable";
import { useEffect, useRef } from "react";
import { dispatchOptimisticProjectStateUpdate } from "state/actions/projectStateOptimisticUpdates";
import {
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "state/actions/sectionEffectiveImpls";
import {
  getResizeStartAutoSizeUpdate,
  isHeightResizeDirection,
  setSelfParentSiblingChildrenWidths,
  type ResizeHandleDirection,
} from "state/actions/sections/sectionSizes";
import { useProjectState, useResizeEvent } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { useMisc } from "state/stores/layoutInteractionStores";
import { route_set_section_sizes } from "utils/generatedEndpoints";
import { SectionSize } from "utils/generatedTypes";
import {
  clampChangedSize,
  getAutoClampSize,
  shouldEmitResizeEndEvent,
} from "./customResizableSizing";
import {
  getChangedSize,
  getResizeHandleClickState,
  isResizeDoubleClick,
  SIZE_MODE,
} from "./utils";

type SizeModeValue = (typeof SIZE_MODE)[keyof typeof SIZE_MODE];

type ResizeSizeMode = {
  width: SizeModeValue;
  height: SizeModeValue;
};

type AspectRatioState = {
  size: SectionSize;
  aspectRatio: boolean;
  aspectRatioExtraHeight: number;
  aspectRatioExtraWidth: number;
};

type ResizeClickState = {
  lastTimestampMs: number | null;
  lastDirection: ResizeHandleDirection | null;
};

type ResizeBehaviorState = {
  size: SectionSize;
  aspectRatio: boolean;
  aspectRatioExtraHeight: number;
  aspectRatioExtraWidth: number;
  heightResizable: boolean;
  widthResizable: boolean;
  onResizeStart: ResizeStartCallback;
  onResize: ResizeCallback;
  onResizeStop: ResizeCallback;
  onResizePointerDown: (direction: ResizeHandleDirection) => void;
};

export function useCustomResizableBehavior({
  sectionId,
  minHeight,
  minWidth,
  maxHeight,
  sizeMode,
  positionAndSizeLocked,
}: {
  sectionId: string;
  minHeight: number;
  minWidth: number;
  maxHeight: number;
  sizeMode: ResizeSizeMode;
  positionAndSizeLocked: boolean;
}): ResizeBehaviorState {
  useAutoOnlySizeModeEffect(sectionId, sizeMode);

  const { size, aspectRatio, aspectRatioExtraHeight, aspectRatioExtraWidth } =
    useAspectRatio(sectionId);
  const { canEditLayout } = useShareCapabilities();
  const resizeStartedRef = useRef(false);
  const autoSizePromotedRef = useRef(false);
  const resizeAttemptedRef = useRef(false);
  const resizeClickRef = useRef<ResizeClickState>({
    lastTimestampMs: null,
    lastDirection: null,
  });
  const doubleClickPendingRef = useRef(false);

  const submitSectionSizeUpdate = (nextSize: Partial<SectionSize>) => {
    let updatedSectionSizes: Record<string, SectionSize> = {};
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        updatedSectionSizes = setSelfParentSiblingChildrenWidths(
          sectionId,
          nextSize,
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
  };

  const maybePromoteAutoSize = (
    direction: ResizeHandleDirection,
    ref: HTMLElement,
  ) => {
    if (
      autoSizePromotedRef.current ||
      !canEditLayout ||
      positionAndSizeLocked
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
    submitSectionSizeUpdate(nextSize);
  };

  const startResizeEvent = (direction: ResizeHandleDirection) => {
    if (!isHeightResizeDirection(direction) || resizeStartedRef.current) {
      return;
    }
    resizeStartedRef.current = true;
    useResizeEvent.setState((state) => {
      state.resizeEvent[sectionId] = "start";
    });
  };

  const beginResize = (direction: ResizeHandleDirection, ref: HTMLElement) => {
    maybePromoteAutoSize(direction, ref);
    startResizeEvent(direction);
  };

  const onResizeStart: ResizeStartCallback = () => {
    resizeStartedRef.current = false;
    autoSizePromotedRef.current = false;
    resizeAttemptedRef.current = false;
    useMisc.setState({ mouseDownDraggingSection: true });
  };

  const onResize: ResizeCallback = (_event, direction, ref) => {
    resizeAttemptedRef.current = true;
    doubleClickPendingRef.current = false;
    beginResize(direction as ResizeHandleDirection, ref);
  };

  const onResizePointerDown = (direction: ResizeHandleDirection) => {
    const { nextState, isDoubleClick } = getResizeHandleClickState({
      state: resizeClickRef.current,
      direction,
      timestampMs: Date.now(),
    });
    resizeClickRef.current = nextState;
    if (isDoubleClick) {
      doubleClickPendingRef.current = true;
    }
  };

  const resetResizeTracking = () => {
    useMisc.setState({ mouseDownDraggingSection: false });
    resizeStartedRef.current = false;
    autoSizePromotedRef.current = false;
    resizeAttemptedRef.current = false;
    doubleClickPendingRef.current = false;
  };

  const onResizeStop: ResizeCallback = (event, direction, ref, delta) => {
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
      if (shouldEmitResizeEnd) {
        useResizeEvent.setState((state) => {
          state.resizeEvent[sectionId] = "end";
        });
      }
      resetResizeTracking();
      return;
    }

    const changedSize = getChangedSize({
      props: [event, direction as ResizeHandleDirection, ref, delta],
      sizeMode,
      aspectRatio,
      isDoubleClickOverride: isDoubleClick,
    });
    if (!isDoubleClick) {
      if (
        changedSize.height === "auto" ||
        (typeof changedSize.height === "number" &&
          Number.isNaN(changedSize.height))
      ) {
        changedSize.height = Math.round(ref.offsetHeight);
      }
      if (
        changedSize.width === "auto" ||
        (typeof changedSize.width === "number" &&
          Number.isNaN(changedSize.width))
      ) {
        changedSize.width = Math.round(ref.offsetWidth);
      }
    }

    submitSectionSizeUpdate(
      clampChangedSize({
        changedSize,
        minHeight,
        minWidth,
        aspectRatio,
      }),
    );

    if (shouldEmitResizeEnd) {
      useResizeEvent.setState((state) => {
        state.resizeEvent[sectionId] = "end";
      });
    }
    resetResizeTracking();
  };

  useEffect(() => {
    const nextSize = getAutoClampSize({
      size,
      minHeight,
      minWidth,
      aspectRatio,
      sizeMode,
    });
    if (!nextSize || !canEditLayout || positionAndSizeLocked) {
      return;
    }
    submitSectionSizeUpdate(nextSize);
  }, [
    aspectRatio,
    canEditLayout,
    minHeight,
    minWidth,
    positionAndSizeLocked,
    sectionId,
    size,
    sizeMode,
  ]);

  return {
    size,
    aspectRatio,
    aspectRatioExtraHeight,
    aspectRatioExtraWidth,
    heightResizable:
      minHeight !== maxHeight && sizeMode.height !== SIZE_MODE.auto_only,
    widthResizable: sizeMode.width !== SIZE_MODE.auto_only,
    onResizeStart,
    onResize,
    onResizeStop,
    onResizePointerDown,
  };
}

function useAutoOnlySizeModeEffect(
  sectionId: string,
  sizeMode: ResizeSizeMode,
) {
  useEffect(() => {
    const changedSize: Partial<SectionSize> = {};
    if (sizeMode.height === SIZE_MODE.auto_only) {
      changedSize.height = "auto";
    }
    if (sizeMode.width === SIZE_MODE.auto_only) {
      changedSize.width = "auto";
    }
    if (Object.keys(changedSize).length === 0) {
      return;
    }
    useProjectState.setState((state) => {
      setSelfParentSiblingChildrenWidths(sectionId, changedSize, state);
    });
  }, [sectionId, sizeMode.height, sizeMode.width]);
}

function useAspectRatio(sectionId: string): AspectRatioState {
  return useProjectState((state) => {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
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
