import {
  ChatWindowModeEnum,
  SectionTypeEnum,
  WindowSpaceSurfaceKindEnum,
  createWindowSpaceConfig,
  createWindowSpaceWindow,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { CHAT_SLASH_COMMANDS } from "./chatComposerControls";
import {
  canUseManagedChatLLM,
  filterManagedChatThreadSlashCommands,
  standaloneSectionRequiresManagedChat,
  standaloneWindowRequiresManagedChat,
  standaloneWindowSpaceRequiresManagedChat,
} from "./sharePolicyChatAccess";

describe("sharePolicyChatAccess", () => {
  it("allows managed chat LLM access outside deployment mode", () => {
    expect(
      canUseManagedChatLLM({
        isDeploymentMode: false,
        allowLLM: false,
      }),
    ).toBe(true);
  });

  it("blocks managed chat LLM access when deployment policy disallows it", () => {
    expect(
      canUseManagedChatLLM({
        isDeploymentMode: true,
        allowLLM: false,
      }),
    ).toBe(false);
  });

  it("keeps managed chat thread commands only when LLM access is allowed", () => {
    const filtered = filterManagedChatThreadSlashCommands(
      CHAT_SLASH_COMMANDS,
      false,
    );

    expect(filtered.some((command) => command.action === "new")).toBe(false);
    expect(filtered.some((command) => command.action === "resume")).toBe(false);
    expect(filtered.some((command) => command.action === "help")).toBe(true);
  });

  it("treats chat sections as managed-chat standalone surfaces", () => {
    expect(standaloneSectionRequiresManagedChat(SectionTypeEnum.Chat)).toBe(
      true,
    );
    expect(
      standaloneSectionRequiresManagedChat(SectionTypeEnum.TextBlock),
    ).toBe(false);
  });

  it("distinguishes git graph windows from managed-chat window-space entries", () => {
    const sectionTypesById = {
      "section-chat": SectionTypeEnum.Chat,
      "section-text": SectionTypeEnum.TextBlock,
    };

    expect(
      standaloneWindowRequiresManagedChat(
        createWindowSpaceWindow({
          surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
          mode: ChatWindowModeEnum.project_ai_mode,
          title: "Project Chat",
          chatId: null,
          zIndex: 1,
          normalizedBounds: {
            x: 0,
            y: 0,
            width: 0.5,
            height: 0.5,
          },
        }),
        sectionTypesById,
      ),
    ).toBe(true);
    expect(
      standaloneWindowRequiresManagedChat(
        createWindowSpaceWindow({
          surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
          mode: ChatWindowModeEnum.git_graph_mode,
          title: null,
          chatId: null,
          zIndex: 2,
          normalizedBounds: {
            x: 0,
            y: 0,
            width: 0.5,
            height: 0.5,
          },
        }),
        sectionTypesById,
      ),
    ).toBe(false);
    expect(
      standaloneWindowRequiresManagedChat(
        createWindowSpaceWindow({
          surfaceKind: WindowSpaceSurfaceKindEnum.section,
          sectionIdOrNull: "section-chat",
          mode: ChatWindowModeEnum.section_mode,
          title: null,
          chatId: null,
          zIndex: 3,
          normalizedBounds: {
            x: 0,
            y: 0,
            width: 0.5,
            height: 0.5,
          },
        }),
        sectionTypesById,
      ),
    ).toBe(true);
    expect(
      standaloneWindowRequiresManagedChat(
        createWindowSpaceWindow({
          surfaceKind: WindowSpaceSurfaceKindEnum.section,
          sectionIdOrNull: "section-text",
          mode: ChatWindowModeEnum.section_mode,
          title: null,
          chatId: null,
          zIndex: 4,
          normalizedBounds: {
            x: 0,
            y: 0,
            width: 0.5,
            height: 0.5,
          },
        }),
        sectionTypesById,
      ),
    ).toBe(false);
  });

  it("blocks standalone window spaces only when one of their windows needs managed chat", () => {
    const sectionTypesById = {
      "section-text": SectionTypeEnum.TextBlock,
    };

    expect(
      standaloneWindowSpaceRequiresManagedChat(
        createWindowSpaceConfig({
          id: "space-blocked",
          name: "Blocked Space",
          windowsById: {
            "chat-window": createWindowSpaceWindow({
              surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
              mode: ChatWindowModeEnum.project_ai_mode,
              title: "Project Chat",
              chatId: null,
              zIndex: 1,
              normalizedBounds: {
                x: 0,
                y: 0,
                width: 0.5,
                height: 0.5,
              },
            }),
          },
          order: ["chat-window"],
        }),
        sectionTypesById,
      ),
    ).toBe(true);
    expect(
      standaloneWindowSpaceRequiresManagedChat(
        createWindowSpaceConfig({
          id: "space-allowed",
          name: "Allowed Space",
          windowsById: {
            "graph-window": createWindowSpaceWindow({
              surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
              mode: ChatWindowModeEnum.git_graph_mode,
              title: null,
              chatId: null,
              zIndex: 1,
              normalizedBounds: {
                x: 0,
                y: 0,
                width: 0.5,
                height: 0.5,
              },
            }),
            "text-window": createWindowSpaceWindow({
              surfaceKind: WindowSpaceSurfaceKindEnum.section,
              sectionIdOrNull: "section-text",
              mode: ChatWindowModeEnum.section_mode,
              title: null,
              chatId: null,
              zIndex: 2,
              normalizedBounds: {
                x: 0.5,
                y: 0,
                width: 0.5,
                height: 0.5,
              },
            }),
          },
          order: ["graph-window", "text-window"],
        }),
        sectionTypesById,
      ),
    ).toBe(false);
  });
});
