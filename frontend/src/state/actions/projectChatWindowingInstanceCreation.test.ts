import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import { addProjectChatWindowInstanceInState } from "./projectChatWindowingInstanceCreation";

describe("projectChatWindowingInstanceCreation", () => {
  it("clears chat ids for section-mode instances during creation normalization", () => {
    const { state, instanceId } = addProjectChatWindowInstanceInState(
      createProjectChatWindowingState(),
      {
        placement: ChatWindowPlacementEnum.canvas_section,
        mode: ChatWindowModeEnum.section_mode,
        sectionIdOrNull: "section-1",
        chatId: "chat-should-clear",
      },
    );

    expect(state.instancesById[instanceId]).toMatchObject({
      mode: ChatWindowModeEnum.section_mode,
      sectionIdOrNull: "section-1",
      chatId: null,
    });
  });

  it("bumps the next instance number when an explicit numbered id is provided", () => {
    const { state } = addProjectChatWindowInstanceInState(
      createProjectChatWindowingState(),
      {
        instanceId: "project-chat-window-7",
      },
    );

    expect(state.nextInstanceNumber).toBe(8);
    expect(state.order).toEqual(["project-chat-window-7"]);
  });
});
