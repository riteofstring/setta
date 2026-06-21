import { describe, expect, test } from "vitest";

import {
  createWorkspaceTrackpadNavigationState,
  interpretWorkspaceTrackpadWheel,
  paneTopBarPaneIdFromWheelTarget,
  wheelTargetIsAppTitleBar,
} from "./trackpad-navigation";

describe("workspace trackpad navigation", () => {
  test("does not handle plain wheel events", () => {
    const state = createWorkspaceTrackpadNavigationState();

    expect(trackpadWheel(state, { deltaX: 120, metaKey: false })).toEqual({
      directions: [],
      shouldHandle: false,
    });
    expect(state).toEqual({
      accumulatedDelta: 0,
      axis: null,
    });
  });

  test("accumulates horizontal meta wheel movement before moving right", () => {
    const state = createWorkspaceTrackpadNavigationState();

    expect(trackpadWheel(state, { deltaX: 40 })).toEqual({
      directions: [],
      shouldHandle: true,
    });
    expect(trackpadWheel(state, { deltaX: 39 })).toEqual({
      directions: [],
      shouldHandle: true,
    });
    expect(trackpadWheel(state, { deltaX: 1 })).toEqual({
      directions: ["right"],
      shouldHandle: true,
    });
    expect(state).toEqual({
      accumulatedDelta: 0,
      axis: "horizontal",
    });
  });

  test("maps negative horizontal movement to left", () => {
    const state = createWorkspaceTrackpadNavigationState();

    expect(trackpadWheel(state, { deltaX: -96 })).toEqual({
      directions: ["left"],
      shouldHandle: true,
    });
    expect(state).toEqual({
      accumulatedDelta: 0,
      axis: "horizontal",
    });
  });

  test("uses the dominant vertical axis for stacked panes", () => {
    const state = createWorkspaceTrackpadNavigationState();

    expect(trackpadWheel(state, { deltaX: 30, deltaY: 85, timeStampMs: 0 })).toEqual({
      directions: ["down"],
      shouldHandle: true,
    });
    expect(trackpadWheel(state, { deltaX: 10, deltaY: -96, timeStampMs: 260 })).toEqual({
      directions: ["up"],
      shouldHandle: true,
    });
  });

  test("resets partial movement when the gesture changes axis", () => {
    const state = createWorkspaceTrackpadNavigationState();

    expect(trackpadWheel(state, { deltaX: 72 })).toEqual({
      directions: [],
      shouldHandle: true,
    });
    expect(trackpadWheel(state, { deltaY: 16 })).toEqual({
      directions: [],
      shouldHandle: true,
    });
    expect(state).toEqual({
      accumulatedDelta: 16,
      axis: "vertical",
    });
  });

  test("normalizes line-mode wheel deltas", () => {
    const state = createWorkspaceTrackpadNavigationState();

    expect(trackpadWheel(state, { deltaMode: 1, deltaX: 5 })).toEqual({
      directions: ["right"],
      shouldHandle: true,
    });
  });

  test("handles plain wheel events when modifier navigation is not required", () => {
    const state = createWorkspaceTrackpadNavigationState();

    expect(trackpadWheel(state, { deltaX: 100, metaKey: false, modifierRequired: false })).toEqual({
      directions: ["right"],
      shouldHandle: true,
    });
  });

  test("emits one direction while a swipe continues", () => {
    const state = createWorkspaceTrackpadNavigationState();

    expect(trackpadWheel(state, { deltaX: 240, timeStampMs: 10 })).toEqual({
      directions: ["right"],
      shouldHandle: true,
    });
    expect(trackpadWheel(state, { deltaX: 240, timeStampMs: 40 })).toEqual({
      directions: [],
      shouldHandle: true,
    });
    expect(trackpadWheel(state, { deltaX: 80, timeStampMs: 280 })).toEqual({
      directions: ["right"],
      shouldHandle: true,
    });
  });

  test("identifies pane title bar wheel targets", () => {
    const target = {
      closest: (selector: string) =>
        selector === "[data-workspace-pane-top-bar]"
          ? { dataset: { paneId: "workspace_pane_1" } }
          : null,
    } as unknown as EventTarget;

    expect(paneTopBarPaneIdFromWheelTarget(target)).toBe("workspace_pane_1");
    expect(paneTopBarPaneIdFromWheelTarget({ closest: () => null } as unknown as EventTarget)).toBe(
      null,
    );
    expect(paneTopBarPaneIdFromWheelTarget(null)).toBeNull();
  });

  test("identifies app title bar wheel targets", () => {
    const shellTarget = {
      closest: (selector: string) =>
        selector === "[data-setta-shell-title-bar]" ? { dataset: {} } : null,
    } as unknown as EventTarget;
    const toolbarTarget = {
      closest: (selector: string) =>
        selector === "[data-workspace-title-bar]" ? { dataset: {} } : null,
    } as unknown as EventTarget;

    expect(wheelTargetIsAppTitleBar(shellTarget)).toBe(true);
    expect(wheelTargetIsAppTitleBar(toolbarTarget)).toBe(true);
    expect(wheelTargetIsAppTitleBar({ closest: () => null } as unknown as EventTarget)).toBe(false);
    expect(wheelTargetIsAppTitleBar(null)).toBe(false);
  });
});

function trackpadWheel(
  state: ReturnType<typeof createWorkspaceTrackpadNavigationState>,
  input: Partial<Parameters<typeof interpretWorkspaceTrackpadWheel>[0]>,
) {
  return interpretWorkspaceTrackpadWheel(
    {
      deltaMode: 0,
      deltaX: 0,
      deltaY: 0,
      metaKey: true,
      ...input,
    },
    state,
  );
}
