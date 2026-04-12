import type { Position } from "utils/generatedTypes";
import {
  shouldBlockSettingsGraphSubstrateCanaryPanePointerTarget,
  shouldBlockSettingsGraphSubstrateCanaryWheelTarget,
} from "./settingsGraphSubstrateCanaryInteractions";
import {
  resolveSettingsGraphSubstrateCanaryWheelOutcome,
  type SettingsGraphSubstrateCanaryWheelBehavior,
  type SettingsGraphSubstrateCanaryWheelEvent,
} from "./settingsGraphSubstrateCanaryViewport";
import { translateViewport, type GraphViewport } from "./viewportTransform";

const PAN_SCROLL_IDLE_TIMEOUT_MS = 150;
export const WHEEL_ZOOM_IDLE_TIMEOUT_MS = 180;

type ActiveViewportPan = {
  pointerId: number;
  originScreenPoint: Position;
  originViewport: GraphViewport;
};

type SettingsGraphSubstrateCanaryPanePointerDownInput = {
  button: number;
  clientX: number;
  clientY: number;
  pointerId: number;
  target: EventTarget | null;
};

type SettingsGraphSubstrateCanaryPanePointerMoveInput = {
  clientX: number;
  clientY: number;
  pointerId: number;
};

type SettingsGraphSubstrateCanaryPanePointerFinishInput = {
  pointerId: number;
};

type SettingsGraphSubstrateCanaryPaneWheelInput =
  SettingsGraphSubstrateCanaryWheelEvent & {
    clientX: number;
    clientY: number;
    target: EventTarget | null;
  };

type SettingsGraphSubstrateCanaryPaneInteractionState = {
  isPanScrolling: boolean;
  isViewportPanning: boolean;
  isWheelZooming: boolean;
};

type SettingsGraphSubstrateCanaryPaneInteractionControllerDependencies = {
  applyControlledViewportChange: (
    buildNextViewport: (currentViewport: GraphViewport) => GraphViewport | null,
  ) => void;
  commitLocalViewport: (viewport: GraphViewport) => void;
  getResolvedViewport: () => GraphViewport | null;
  getRootBounds: () => { left: number; top: number } | null;
  getWheelBehavior: () => SettingsGraphSubstrateCanaryWheelBehavior;
  onViewportPanningChange: (isViewportPanning: boolean) => void;
  syncViewportInteractionState: (
    state: SettingsGraphSubstrateCanaryPaneInteractionState,
  ) => void;
};

export type SettingsGraphSubstrateCanaryPaneInteractionController = {
  cleanup: () => void;
  finishPanePan: (
    input: SettingsGraphSubstrateCanaryPanePointerFinishInput,
  ) => boolean;
  handlePanePointerDown: (
    input: SettingsGraphSubstrateCanaryPanePointerDownInput,
  ) => boolean;
  handlePanePointerMove: (
    input: SettingsGraphSubstrateCanaryPanePointerMoveInput,
  ) => boolean;
  handlePaneWheel: (
    input: SettingsGraphSubstrateCanaryPaneWheelInput,
  ) => boolean;
};

export function createSettingsGraphSubstrateCanaryPaneInteractionController({
  applyControlledViewportChange,
  commitLocalViewport,
  getResolvedViewport,
  getRootBounds,
  getWheelBehavior,
  onViewportPanningChange,
  syncViewportInteractionState,
}: SettingsGraphSubstrateCanaryPaneInteractionControllerDependencies): SettingsGraphSubstrateCanaryPaneInteractionController {
  let activeViewportPan: ActiveViewportPan | null = null;
  let isPanScrolling = false;
  let isViewportPanning = false;
  let isWheelZooming = false;
  let lastSyncedState: SettingsGraphSubstrateCanaryPaneInteractionState | null =
    null;
  let panScrollTimeout: ReturnType<typeof setTimeout> | null = null;
  let wheelZoomTimeout: ReturnType<typeof setTimeout> | null = null;

  function syncState() {
    const nextState = {
      isPanScrolling,
      isViewportPanning,
      isWheelZooming,
    };
    if (
      lastSyncedState &&
      areSettingsGraphSubstrateCanaryPaneInteractionStatesEqual(
        lastSyncedState,
        nextState,
      )
    ) {
      return;
    }
    lastSyncedState = nextState;
    syncViewportInteractionState(nextState);
  }

  function clearPanScrollTimeout() {
    if (!panScrollTimeout) {
      return;
    }
    clearTimeout(panScrollTimeout);
    panScrollTimeout = null;
  }

  function clearWheelZoomTimeout() {
    if (!wheelZoomTimeout) {
      return;
    }
    clearTimeout(wheelZoomTimeout);
    wheelZoomTimeout = null;
  }

  function setViewportPanning(nextViewportPanning: boolean) {
    if (isViewportPanning === nextViewportPanning) {
      return;
    }
    isViewportPanning = nextViewportPanning;
    onViewportPanningChange(nextViewportPanning);
  }

  return {
    cleanup() {
      activeViewportPan = null;
      clearPanScrollTimeout();
      clearWheelZoomTimeout();
      isPanScrolling = false;
      isViewportPanning = false;
      isWheelZooming = false;
      lastSyncedState = null;
    },
    finishPanePan({ pointerId }) {
      if (!activeViewportPan || activeViewportPan.pointerId !== pointerId) {
        return false;
      }

      activeViewportPan = null;
      setViewportPanning(false);
      syncState();
      return true;
    },
    handlePanePointerDown({ button, clientX, clientY, pointerId, target }) {
      const resolvedViewport = getResolvedViewport();
      if (!resolvedViewport || button !== 0) {
        return false;
      }
      if (shouldBlockSettingsGraphSubstrateCanaryPanePointerTarget(target)) {
        return false;
      }

      activeViewportPan = {
        pointerId,
        originScreenPoint: {
          x: clientX,
          y: clientY,
        },
        originViewport: resolvedViewport,
      };
      setViewportPanning(true);
      syncState();
      return true;
    },
    handlePanePointerMove({ clientX, clientY, pointerId }) {
      if (!activeViewportPan || activeViewportPan.pointerId !== pointerId) {
        return false;
      }

      commitLocalViewport(
        translateViewport(activeViewportPan.originViewport, {
          x: clientX - activeViewportPan.originScreenPoint.x,
          y: clientY - activeViewportPan.originScreenPoint.y,
        }),
      );
      return true;
    },
    handlePaneWheel({
      clientX,
      clientY,
      ctrlKey,
      deltaMode,
      deltaX,
      deltaY,
      shiftKey,
      target,
    }) {
      const resolvedViewport = getResolvedViewport();
      const rootBounds = getRootBounds();
      if (!resolvedViewport || !rootBounds) {
        return false;
      }

      const wheelBehavior = getWheelBehavior();
      if (
        shouldBlockSettingsGraphSubstrateCanaryWheelTarget(
          target,
          wheelBehavior,
        )
      ) {
        return false;
      }

      const anchorScreenPoint = {
        x: clientX - rootBounds.left,
        y: clientY - rootBounds.top,
      };
      const wheelEvent = {
        ctrlKey,
        deltaMode,
        deltaX,
        deltaY,
        shiftKey,
      };
      const wheelOutcome = resolveSettingsGraphSubstrateCanaryWheelOutcome(
        resolvedViewport,
        anchorScreenPoint,
        wheelEvent,
        wheelBehavior,
      );
      if (!wheelOutcome) {
        return false;
      }

      if (wheelOutcome.kind === "pan-scroll") {
        clearPanScrollTimeout();
        isPanScrolling = true;
        syncState();
        panScrollTimeout = setTimeout(() => {
          panScrollTimeout = null;
          isPanScrolling = false;
          syncState();
        }, PAN_SCROLL_IDLE_TIMEOUT_MS);
      } else {
        clearWheelZoomTimeout();
        isWheelZooming = true;
        syncState();
        wheelZoomTimeout = setTimeout(() => {
          wheelZoomTimeout = null;
          isWheelZooming = false;
          syncState();
        }, WHEEL_ZOOM_IDLE_TIMEOUT_MS);
      }

      applyControlledViewportChange((currentViewport) => {
        return (
          resolveSettingsGraphSubstrateCanaryWheelOutcome(
            currentViewport,
            anchorScreenPoint,
            wheelEvent,
            wheelBehavior,
          )?.nextViewport ?? currentViewport
        );
      });
      return true;
    },
  };
}

function areSettingsGraphSubstrateCanaryPaneInteractionStatesEqual(
  left: SettingsGraphSubstrateCanaryPaneInteractionState,
  right: SettingsGraphSubstrateCanaryPaneInteractionState,
) {
  return (
    left.isPanScrolling === right.isPanScrolling &&
    left.isViewportPanning === right.isViewportPanning &&
    left.isWheelZooming === right.isWheelZooming
  );
}
