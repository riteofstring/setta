/* global performance */

import {
  activityChipClickMoveThresholdScreen,
  nodeOpenClickDistanceScreen,
  nodeOpenClickIntervalMs,
} from "./pixi-renderer-config";
import { releasePointer } from "./pixi-renderer-helpers";

// Builds the renderer's pointer click-intent trackers: the activity-chip click interaction and the
// node double-click-to-open tracker. Both read the live handlers object so they always see the
// latest onActivityChipOpen / onNodeOpen wiring.
export function createWorkflowGraphPointerClicks({
  getHandlers,
  hitTestChipAtScreen,
  moveCameraPan,
  startCameraPanning,
}) {
  return {
    activityChips: createWorkspaceActivityChipInteraction({
      getActivityChipHandler: () => getHandlers().onActivityChipOpen,
      hitTestChipAtScreen,
      moveCameraPan,
      startCameraPanning,
    }),
    nodeClicks: createNodeOpenClickTracker({
      getNodeOpenHandler: () => getHandlers().onNodeOpen,
    }),
  };
}

// Tracks an in-progress activity-chip press so a chip opens its node details on release, while a drag
// off the chip converts cleanly into a camera pan. Keeping the pending state and pointer responses
// here keeps the renderer's pointer handlers thin and low-complexity.
function createWorkspaceActivityChipInteraction({
  getActivityChipHandler,
  hitTestChipAtScreen,
  moveCameraPan,
  startCameraPanning,
}) {
  let pending = null;
  return {
    begin(chip, screen) {
      pending = { chip, x: screen.x, y: screen.y };
    },
    handlePointerCancel(event) {
      if (pending === null) {
        return false;
      }
      pending = null;
      releasePointer(event);
      return true;
    },
    handlePointerMove(screen) {
      if (pending === null) {
        return false;
      }
      const distance = Math.hypot(screen.x - pending.x, screen.y - pending.y);
      if (distance > activityChipClickMoveThresholdScreen) {
        const downScreen = { x: pending.x, y: pending.y };
        pending = null;
        startCameraPanning(downScreen);
        moveCameraPan(screen);
      }
      return true;
    },
    handlePointerUp(event) {
      if (pending === null) {
        return false;
      }
      const chip = pending.chip;
      pending = null;
      const openActivityChip = getActivityChipHandler();
      if (openActivityChip !== null) {
        openActivityChip(chip);
      }
      releasePointer(event);
      return true;
    },
    hitTest(screen) {
      return getActivityChipHandler() === null ? null : hitTestChipAtScreen(screen);
    },
  };
}

// Tracks the most recent node press so a repeated press on the same node within a short window opens
// it, matching the renderer's double-click-to-open affordance.
function createNodeOpenClickTracker({ getNodeOpenHandler }) {
  let lastClick = null;
  return {
    clear() {
      lastClick = null;
    },
    record(nodeId, screen) {
      lastClick = { nodeId, time: performance.now(), x: screen.x, y: screen.y };
    },
    repeatedOpenRequested(nodeId, screen) {
      if (getNodeOpenHandler() === null || lastClick === null || lastClick.nodeId !== nodeId) {
        return false;
      }
      const elapsed = performance.now() - lastClick.time;
      const distance = Math.hypot(screen.x - lastClick.x, screen.y - lastClick.y);
      return elapsed <= nodeOpenClickIntervalMs && distance <= nodeOpenClickDistanceScreen;
    },
  };
}
