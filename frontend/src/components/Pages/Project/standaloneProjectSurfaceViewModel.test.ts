import {
  ChatWindowModeEnum,
  SectionTypeEnum,
  WindowSpaceSurfaceKindEnum,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildStandaloneManagedChatAuthorityState,
  resolveStandaloneManagedChatGuardState,
  resolveStandaloneProjectChatThreadTitle,
} from "./standaloneProjectSurfaceViewModel";

function createManagedChatAuthorityState() {
  return buildStandaloneManagedChatAuthorityState({
    sections: {
      "section-1": {
        name: "Managed Chat",
        sharedModifier: {},
      },
      "section-2": {
        name: "Scriptable Chat",
        sharedModifier: {},
      },
    },
    sectionVariants: {
      "section-1-variant": {
        impl: "section-1-impl",
        modifier: {},
      },
      "section-2-variant": {
        impl: "section-2-impl",
        modifier: {},
      },
    },
    sectionImpls: {
      "section-1-impl": {
        type: SectionTypeEnum.Chat,
        managed: true,
      },
      "section-2-impl": {
        type: SectionTypeEnum.Chat,
        managed: false,
      },
    },
    sectionVariantMap: {
      "section-1": "section-1-variant",
      "section-2": "section-2-variant",
    },
  });
}

describe("standaloneProjectSurfaceViewModel", () => {
  it("builds managed-chat authority state with the expected projectConfig shape", () => {
    const authorityState = createManagedChatAuthorityState();

    expect(authorityState.projectConfig.sectionVariantMap).toEqual({
      "section-1": "section-1-variant",
      "section-2": "section-2-variant",
    });
    expect(authorityState.sectionImpls["section-1-impl"]?.type).toBe(
      SectionTypeEnum.Chat,
    );
  });

  it("derives a thread title from history and falls back to the chat id prefix", () => {
    expect(
      resolveStandaloneProjectChatThreadTitle({
        target: {
          kind: "project_chat_thread",
          chatId: "chat-alpha-12345678",
        },
        projectChatHistoryEntries: [
          { chatId: "chat-alpha-12345678", label: "Alpha Chat" },
        ],
      }),
    ).toBe("Alpha Chat");
    expect(
      resolveStandaloneProjectChatThreadTitle({
        target: {
          kind: "project_chat_thread",
          chatId: "chat-beta-87654321",
        },
        projectChatHistoryEntries: [],
      }),
    ).toBe("Chat chat-bet");
  });

  it("blocks standalone managed chat surfaces when deployment access is denied", () => {
    const authorityState = createManagedChatAuthorityState();

    expect(
      resolveStandaloneManagedChatGuardState({
        target: { kind: "project_chat" },
        standaloneSurfaceErrorState: {
          ownerKey: "project-1:project-chat",
          errorCode: null,
        },
        standaloneSurfaceOwnerKey: "project-1:project-chat",
        managedChatAuthorityState: authorityState,
        standaloneWindowSpace: null,
        canUseManagedChat: false,
      }).shouldBlockStandaloneManagedChat,
    ).toBe(true);
    expect(
      resolveStandaloneManagedChatGuardState({
        target: {
          kind: "section",
          sectionId: "section-2",
          sectionName: "Scriptable Chat",
          sectionType: SectionTypeEnum.Chat,
        },
        standaloneSurfaceErrorState: {
          ownerKey: null,
          errorCode: null,
        },
        standaloneSurfaceOwnerKey: "project-1:section:section-2",
        managedChatAuthorityState: authorityState,
        standaloneWindowSpace: null,
        canUseManagedChat: false,
      }).shouldBlockStandaloneManagedChat,
    ).toBe(false);
  });

  it("tracks standalone thread-not-found and llm-denied guard states", () => {
    const authorityState = createManagedChatAuthorityState();

    expect(
      resolveStandaloneManagedChatGuardState({
        target: {
          kind: "project_chat_thread",
          chatId: "chat-alpha",
        },
        standaloneSurfaceErrorState: {
          ownerKey: "project-1:project-chat:chat-alpha",
          errorCode: "chat_not_found",
        },
        standaloneSurfaceOwnerKey: "project-1:project-chat:chat-alpha",
        managedChatAuthorityState: authorityState,
        standaloneWindowSpace: null,
        canUseManagedChat: true,
      }).standaloneProjectChatThreadMissing,
    ).toBe(true);
    expect(
      resolveStandaloneManagedChatGuardState({
        target: {
          kind: "window_space",
          windowSpaceId: "window-space-1",
          windowSpaceName: "Managed Workspace",
        },
        standaloneSurfaceErrorState: {
          ownerKey: "project-1:window-space:window-space-1",
          errorCode: "llm_disallowed",
        },
        standaloneSurfaceOwnerKey: "project-1:window-space:window-space-1",
        managedChatAuthorityState: authorityState,
        standaloneWindowSpace: createWindowSpaceConfig({
          id: "window-space-1",
          name: "Managed Workspace",
          windowsById: {
            "window-1": {
              id: "window-1",
              kind: WindowSpaceSurfaceKindEnum.chat,
              x: 0,
              y: 0,
              w: 400,
              h: 300,
              zIndex: 1,
              collapsed: false,
              sectionId: "section-1",
              mode: ChatWindowModeEnum.section_ai_mode,
            },
          },
        }),
        canUseManagedChat: false,
      }).shouldBlockStandaloneManagedChat,
    ).toBe(true);
  });
});
