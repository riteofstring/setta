import {
  ChatWindowModeEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  setProjectChatWindowChatIdInState,
  setProjectChatWindowTitleInState,
} from "./projectChatWindowingMetadataState";

describe("project chat windowing metadata state", () => {
  it("stores trimmed titles for unscoped project chat windows", () => {
    // Plain project chat windows own their header title instead of inheriting from a section.
    const projectWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-1",
      title: null,
      sectionIdOrNull: null,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [projectWindow.instanceId]: projectWindow,
      },
      order: [projectWindow.instanceId],
      nextInstanceNumber: 2,
    });

    const next = setProjectChatWindowTitleInState(
      initial,
      projectWindow.instanceId,
      "  Coast Bear  ",
    );

    expect(next.instancesById[projectWindow.instanceId]?.title).toBe(
      "Coast Bear",
    );
  });

  it("drops titles for section-backed windows", () => {
    // Section-bound window titles must stay derived from the section surface.
    const sectionWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-1",
      title: "Old title",
      sectionIdOrNull: "section-1",
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [sectionWindow.instanceId]: sectionWindow,
      },
      order: [sectionWindow.instanceId],
      nextInstanceNumber: 2,
    });

    const next = setProjectChatWindowTitleInState(
      initial,
      sectionWindow.instanceId,
      "Ignored title",
    );

    expect(next.instancesById[sectionWindow.instanceId]?.title).toBeNull();
  });

  it("stores trimmed chat ids only for project-ai windows", () => {
    // Window-scoped chat ids only apply to project-ai windows, not section or git surfaces.
    const projectWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-1",
      mode: ChatWindowModeEnum.project_ai_mode,
      chatId: null,
    });
    const sectionWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-2",
      mode: ChatWindowModeEnum.section_mode,
      chatId: null,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [projectWindow.instanceId]: projectWindow,
        [sectionWindow.instanceId]: sectionWindow,
      },
      order: [projectWindow.instanceId, sectionWindow.instanceId],
      nextInstanceNumber: 3,
    });

    const withProjectChat = setProjectChatWindowChatIdInState(
      initial,
      projectWindow.instanceId,
      "  project-chat  ",
    );
    const withSectionChat = setProjectChatWindowChatIdInState(
      withProjectChat,
      sectionWindow.instanceId,
      "section-chat",
    );

    expect(
      withSectionChat.instancesById[projectWindow.instanceId]?.chatId,
    ).toBe("project-chat");
    expect(
      withSectionChat.instancesById[sectionWindow.instanceId]?.chatId,
    ).toBeNull();
  });
});
