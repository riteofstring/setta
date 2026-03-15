import {
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  normalizeProjectChatWindowingState,
  resolveDefaultDockedChatHeightPx,
  resolveDefaultFloatingChatBounds,
} from "./projectChatWindowingNormalization";

describe("projectChatWindowingNormalization", () => {
  it("resolves default docked chat height from the viewport height", () => {
    // Default docked windows should take seventy percent of the viewport, clamped to the dock space.
    expect(
      resolveDefaultDockedChatHeightPx({
        viewportHeightPx: 900,
        workspaceTopInsetPx: 40,
        bottomInsetPx: 36,
      }),
    ).toBe(630);
  });

  it("resolves default floating chat bounds in the center at seventy percent viewport height", () => {
    // Explicit floating windows should open centered within the floating work area.
    const bounds = resolveDefaultFloatingChatBounds({
      viewportWidthPx: 1440,
      viewportHeightPx: 900,
      workspaceTopInsetPx: 40,
      bottomInsetPx: 0,
    });

    expect(bounds).toEqual({
      x: 310,
      y: 155,
      width: 820,
      height: 630,
    });
  });

  it("dedupes order entries and reassigns duplicate z-indexes deterministically", () => {
    // Duplicate order ids and duplicate z-indexes should normalize to one order
    // entry per instance with a stable front-to-back layering sequence.
    const first = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
      zIndex: 4,
      lastFocusedAt: 10,
    });
    const second = createProjectChatWindowInstance({
      instanceId: "chat-window-b",
      zIndex: 4,
      lastFocusedAt: 20,
    });
    const third = createProjectChatWindowInstance({
      instanceId: "chat-window-c",
      zIndex: 7,
      lastFocusedAt: 30,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [first.instanceId]: first,
        [second.instanceId]: second,
        [third.instanceId]: third,
      },
      order: [second.instanceId, second.instanceId, first.instanceId],
      nextInstanceNumber: 4,
    });

    const normalized = normalizeProjectChatWindowingState(initial);

    expect(normalized.order).toEqual([
      second.instanceId,
      first.instanceId,
      third.instanceId,
    ]);
    expect(normalized.instancesById[first.instanceId]?.zIndex).toBe(1);
    expect(normalized.instancesById[second.instanceId]?.zIndex).toBe(2);
    expect(normalized.instancesById[third.instanceId]?.zIndex).toBe(3);
  });
});
