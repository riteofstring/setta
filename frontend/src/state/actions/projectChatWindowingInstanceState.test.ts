import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { addProjectChatWindowInstanceInState } from "./projectChatWindowingInstanceState";

describe("projectChatWindowingInstanceState", () => {
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
});
