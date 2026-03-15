import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  allocateFreshProjectChatWindowInstanceId,
  buildOrderedProjectChatWindowInstanceIds,
} from "./windowSpaceSnapshotRestoreInstanceIds";

describe("windowSpaceSnapshotRestoreInstanceIds", () => {
  it("allocates the next unused project chat window id without colliding with existing instances", () => {
    // Restored floating windows should avoid reusing live ids even when numbering gaps exist.
    const usedInstanceIds = new Set([
      "project-chat-window-2",
      "project-chat-window-3",
      "other-window",
    ]);

    expect(
      allocateFreshProjectChatWindowInstanceId(usedInstanceIds, 2),
    ).toEqual({
      instanceId: "project-chat-window-4",
      nextInstanceNumber: 5,
    });
  });

  it("builds a stable ordered instance id list from order plus remaining instances", () => {
    // Restore and reuse planning should preserve the explicit order first, then append any unlisted instances once.
    const windowing = createProjectChatWindowingState({
      order: ["window-b", "window-missing", "window-a", "window-b"],
      instancesById: {
        "window-a": {
          instanceId: "window-a",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          sectionIdOrNull: null,
          title: "A",
          chatId: "chat-a",
          isClosed: false,
          isMinimized: false,
          isMaximized: false,
          lastPlacementBeforeMaximize: null,
          zIndex: 2,
          lastFocusedAt: 2,
          bounds: { x: 0, y: 0, width: 320, height: 240 },
        },
        "window-b": {
          instanceId: "window-b",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          sectionIdOrNull: null,
          title: "B",
          chatId: "chat-b",
          isClosed: false,
          isMinimized: false,
          isMaximized: false,
          lastPlacementBeforeMaximize: null,
          zIndex: 3,
          lastFocusedAt: 3,
          bounds: { x: 40, y: 40, width: 320, height: 240 },
        },
        "window-c": {
          instanceId: "window-c",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          sectionIdOrNull: null,
          title: "C",
          chatId: "chat-c",
          isClosed: false,
          isMinimized: false,
          isMaximized: false,
          lastPlacementBeforeMaximize: null,
          zIndex: 1,
          lastFocusedAt: 1,
          bounds: { x: 80, y: 80, width: 320, height: 240 },
        },
      },
    });

    expect(buildOrderedProjectChatWindowInstanceIds(windowing)).toEqual([
      "window-b",
      "window-a",
      "window-c",
    ]);
  });
});
