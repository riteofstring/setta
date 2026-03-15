import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import { dedupeRestoredSectionBindings } from "./windowSpaceSnapshotRestoreSectionBindings";

describe("windowSpaceSnapshotRestoreSectionBindings", () => {
  it("keeps only the preferred restored window for a section binding", () => {
    // Restoring the same section twice should keep the most authoritative window and drop the duplicate binding.
    const restored = createProjectChatWindowingState({
      order: ["window-a", "window-b", "window-c"],
      instancesById: {
        "window-a": {
          instanceId: "window-a",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.section_mode,
          sectionIdOrNull: "section-1",
          title: null,
          chatId: null,
          isClosed: false,
          isMinimized: false,
          isMaximized: false,
          lastPlacementBeforeMaximize: null,
          zIndex: 4,
          lastFocusedAt: 4,
          bounds: { x: 0, y: 0, width: 320, height: 240 },
        },
        "window-b": {
          instanceId: "window-b",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.section_mode,
          sectionIdOrNull: "section-1",
          title: null,
          chatId: null,
          isClosed: false,
          isMinimized: false,
          isMaximized: false,
          lastPlacementBeforeMaximize: null,
          zIndex: 8,
          lastFocusedAt: 8,
          bounds: { x: 30, y: 30, width: 320, height: 240 },
        },
        "window-c": {
          instanceId: "window-c",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          sectionIdOrNull: null,
          title: "Chat",
          chatId: "chat-1",
          isClosed: false,
          isMinimized: false,
          isMaximized: false,
          lastPlacementBeforeMaximize: null,
          zIndex: 6,
          lastFocusedAt: 6,
          bounds: { x: 60, y: 60, width: 320, height: 240 },
        },
      },
    });

    expect(dedupeRestoredSectionBindings(restored)).toEqual(
      createProjectChatWindowingState({
        ...restored,
        instancesById: {
          "window-b": restored.instancesById["window-b"],
          "window-c": restored.instancesById["window-c"],
        },
        order: ["window-b", "window-c"],
      }),
    );
  });

  it("returns the original state when section bindings are already unique", () => {
    // Restore callers should be able to skip downstream churn when there is nothing to dedupe.
    const restored = createProjectChatWindowingState({
      order: ["window-a", "window-b"],
      instancesById: {
        "window-a": {
          instanceId: "window-a",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.section_mode,
          sectionIdOrNull: "section-1",
          title: null,
          chatId: null,
          isClosed: false,
          isMinimized: false,
          isMaximized: false,
          lastPlacementBeforeMaximize: null,
          zIndex: 4,
          lastFocusedAt: 4,
          bounds: { x: 0, y: 0, width: 320, height: 240 },
        },
        "window-b": {
          instanceId: "window-b",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.section_mode,
          sectionIdOrNull: "section-2",
          title: null,
          chatId: null,
          isClosed: false,
          isMinimized: false,
          isMaximized: false,
          lastPlacementBeforeMaximize: null,
          zIndex: 8,
          lastFocusedAt: 8,
          bounds: { x: 30, y: 30, width: 320, height: 240 },
        },
      },
    });

    expect(dedupeRestoredSectionBindings(restored)).toBe(restored);
  });
});
