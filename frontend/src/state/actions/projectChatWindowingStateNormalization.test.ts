import {
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  normalizeProjectChatWindowingOrder,
  normalizeProjectChatWindowingState,
} from "./projectChatWindowingStateNormalization";

describe("projectChatWindowingStateNormalization", () => {
  it("dedupes order entries and appends instances missing from the order", () => {
    // Order normalization should keep one entry per existing instance before selector reads.
    const first = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
    });
    const second = createProjectChatWindowInstance({
      instanceId: "chat-window-b",
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [first.instanceId]: first,
        [second.instanceId]: second,
      },
      order: [second.instanceId, second.instanceId, "missing-window"],
      nextInstanceNumber: 3,
    });

    expect(normalizeProjectChatWindowingOrder(initial).state.order).toEqual([
      second.instanceId,
      first.instanceId,
    ]);
  });

  it("reassigns duplicate z-indexes deterministically", () => {
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
