import { describe, expect, test } from "vitest";

import {
  createNiriTrackpadNavigationState,
  interpretNiriTrackpadWheel,
} from "./trackpad-navigation";

describe("niri trackpad navigation", () => {
  test("does not handle plain wheel events", () => {
    const state = createNiriTrackpadNavigationState();

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
    const state = createNiriTrackpadNavigationState();

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
    const state = createNiriTrackpadNavigationState();

    expect(trackpadWheel(state, { deltaX: -96 })).toEqual({
      directions: ["left"],
      shouldHandle: true,
    });
    expect(state).toEqual({
      accumulatedDelta: -16,
      axis: "horizontal",
    });
  });

  test("uses the dominant vertical axis for stacked panes", () => {
    const state = createNiriTrackpadNavigationState();

    expect(trackpadWheel(state, { deltaX: 30, deltaY: 85 })).toEqual({
      directions: ["down"],
      shouldHandle: true,
    });
    expect(trackpadWheel(state, { deltaX: 10, deltaY: -96 })).toEqual({
      directions: ["up"],
      shouldHandle: true,
    });
  });

  test("resets partial movement when the gesture changes axis", () => {
    const state = createNiriTrackpadNavigationState();

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
    const state = createNiriTrackpadNavigationState();

    expect(trackpadWheel(state, { deltaMode: 1, deltaX: 5 })).toEqual({
      directions: ["right"],
      shouldHandle: true,
    });
  });

  test("handles plain wheel events when modifier navigation is not required", () => {
    const state = createNiriTrackpadNavigationState();

    expect(trackpadWheel(state, { deltaX: 100, metaKey: false, modifierRequired: false })).toEqual({
      directions: ["right"],
      shouldHandle: true,
    });
  });
});

function trackpadWheel(
  state: ReturnType<typeof createNiriTrackpadNavigationState>,
  input: Partial<Parameters<typeof interpretNiriTrackpadWheel>[0]>,
) {
  return interpretNiriTrackpadWheel(
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
