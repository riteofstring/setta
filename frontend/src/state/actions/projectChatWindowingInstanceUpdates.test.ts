import {
  ChatWindowModeEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  getHighestProjectChatWindowZIndex,
  withUpdatedProjectChatWindowInState,
} from "./projectChatWindowingInstanceUpdates";

describe("projectChatWindowingInstanceUpdates", () => {
  it("normalizes section-mode chat ids during shared instance updates", () => {
    const instanceId = "project-chat-window-1";
    const initial = createProjectChatWindowingState({
      instancesById: {
        [instanceId]: createProjectChatWindowInstance({
          instanceId,
          mode: ChatWindowModeEnum.project_ai_mode,
          chatId: null,
        }),
      },
      order: [instanceId],
      nextInstanceNumber: 2,
    });

    const next = withUpdatedProjectChatWindowInState(
      initial,
      instanceId,
      (current) => ({
        ...current,
        mode: ChatWindowModeEnum.section_mode,
        chatId: "chat-should-clear",
      }),
    );

    expect(next.instancesById[instanceId]).toMatchObject({
      mode: ChatWindowModeEnum.section_mode,
      chatId: null,
    });
  });

  it("returns the highest window z-index across open instances", () => {
    const initial = createProjectChatWindowingState({
      instancesById: {
        "project-chat-window-1": createProjectChatWindowInstance({
          instanceId: "project-chat-window-1",
          zIndex: 4,
        }),
        "project-chat-window-2": createProjectChatWindowInstance({
          instanceId: "project-chat-window-2",
          zIndex: 9,
        }),
      },
      order: ["project-chat-window-1", "project-chat-window-2"],
      nextInstanceNumber: 3,
    });

    expect(getHighestProjectChatWindowZIndex(initial)).toBe(9);
  });
});
