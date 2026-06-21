import { describe, expect, test } from "vitest";

import {
  createWorkspaceTrackpadNavigationState,
  interpretWorkspaceTrackpadWheel,
  paneTopBarPaneIdFromWheelTarget,
  workspaceWheelNavigationTargetFromEventTarget,
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

  test("releases a consumed swipe after trackpad momentum decays", () => {
    const state = createWorkspaceTrackpadNavigationState();

    expect(trackpadWheel(state, { deltaX: 120, timeStampMs: 0 })).toEqual({
      directions: ["right"],
      shouldHandle: true,
    });
    expect(trackpadWheel(state, { deltaX: 120, timeStampMs: 120 })).toEqual({
      directions: [],
      shouldHandle: true,
    });
    expect(trackpadWheel(state, { deltaX: 90, timeStampMs: 260 })).toEqual({
      directions: [],
      shouldHandle: true,
    });
    expect(trackpadWheel(state, { deltaX: 4, timeStampMs: 380 })).toEqual({
      directions: [],
      shouldHandle: true,
    });
    expect(trackpadWheel(state, { deltaX: 120, timeStampMs: 500 })).toEqual({
      directions: ["right"],
      shouldHandle: true,
    });
  });

  test("lets a strong opposite swipe interrupt a consumed gesture", () => {
    const state = createWorkspaceTrackpadNavigationState();

    expect(trackpadWheel(state, { deltaX: 120, timeStampMs: 0 })).toEqual({
      directions: ["right"],
      shouldHandle: true,
    });
    expect(trackpadWheel(state, { deltaX: -120, timeStampMs: 80 })).toEqual({
      directions: ["left"],
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

  test("identifies workspace background wheel targets", () => {
    const backgroundTarget = closestTarget((selector) =>
      selector === "[data-testid='workspace-presentation-engine']" ? backgroundTarget : null,
    );
    const root = rootContaining(backgroundTarget);

    expect(workspaceWheelNavigationTargetFromEventTarget(backgroundTarget, root)).toEqual({
      paneId: null,
      target: "background",
    });
  });

  test("identifies workspace pane top bar wheel targets", () => {
    const topBar = closestTarget((selector) =>
      selector === "[data-workspace-pane-top-bar]"
        ? { dataset: { paneId: "workspace_pane_1" } }
        : null,
    );
    const root = rootContaining(topBar);

    expect(workspaceWheelNavigationTargetFromEventTarget(topBar, root)).toEqual({
      paneId: "workspace_pane_1",
      target: "pane-top-bar",
    });
  });

  test("ignores pane content and targets outside the workspace", () => {
    const contentTarget = closestTarget(() => null);
    const outsideTarget = closestTarget((selector) =>
      selector === "[data-workspace-pane-top-bar]"
        ? { dataset: { paneId: "workspace_pane_2" } }
        : null,
    );

    expect(
      workspaceWheelNavigationTargetFromEventTarget(contentTarget, rootContaining(contentTarget)),
    ).toBeNull();
    expect(
      workspaceWheelNavigationTargetFromEventTarget(outsideTarget, rootContaining(contentTarget)),
    ).toBeNull();
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

interface FakeClosestTarget extends EventTarget {
  closest: (selector: string) => FakeClosestTarget | { dataset?: { paneId?: string } } | null;
  dataset?: { paneId?: string };
}

function closestTarget(
  closest: (selector: string) => FakeClosestTarget | { dataset?: { paneId?: string } } | null,
): FakeClosestTarget {
  return { closest } as unknown as FakeClosestTarget;
}

function rootContaining(containedTarget: EventTarget): HTMLElement {
  return {
    contains: (target: EventTarget) => target === containedTarget,
  } as unknown as HTMLElement;
}
