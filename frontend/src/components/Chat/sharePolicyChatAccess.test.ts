import {
  ChatWindowModeEnum,
  WindowSpaceSurfaceKindEnum,
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createTextBlockSectionImpl,
  createUserDefaultChatSectionImpl,
  createUserDefaultTextBlockSectionImpl,
  createVariant,
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
  windowSurfaceRequiresManagedChat,
  type ManagedChatSurfaceAuthorityState,
} from "./sharePolicyChatAccess";

function createManagedChatAuthorityState(): {
  state: ManagedChatSurfaceAuthorityState;
  managedSectionId: string;
  scriptableSectionId: string;
  textSectionId: string;
} {
  const managedSectionId = "section-managed";
  const scriptableSectionId = "section-scriptable";
  const textSectionId = "section-text";
  const managedVariantId = "variant-managed";
  const scriptableVariantId = "variant-scriptable";
  const textVariantId = "variant-text";
  const managedImplId = "impl-managed";
  const scriptableImplId = "impl-scriptable";
  const textImplId = "impl-text";

  return {
    state: {
      projectConfig: createProjectConfig({
        sectionVariantMap: {
          [managedSectionId]: managedVariantId,
          [scriptableSectionId]: scriptableVariantId,
          [textSectionId]: textVariantId,
        },
      }),
      sections: {
        [managedSectionId]: createCore({
          id: managedSectionId,
          name: "Managed Chat",
          variants: [managedVariantId],
          defaultVariant: managedVariantId,
        }),
        [scriptableSectionId]: createCore({
          id: scriptableSectionId,
          name: "Scriptable Chat",
          variants: [scriptableVariantId],
          defaultVariant: scriptableVariantId,
        }),
        [textSectionId]: createCore({
          id: textSectionId,
          name: "Notes",
          variants: [textVariantId],
          defaultVariant: textVariantId,
        }),
      },
      sectionVariants: {
        [managedVariantId]: createVariant({
          id: managedVariantId,
          name: "Managed Variant",
          impl: managedImplId,
          nonPresetImpls: [],
        }),
        [scriptableVariantId]: createVariant({
          id: scriptableVariantId,
          name: "Scriptable Variant",
          impl: scriptableImplId,
          nonPresetImpls: [],
        }),
        [textVariantId]: createVariant({
          id: textVariantId,
          name: "Text Variant",
          impl: textImplId,
          nonPresetImpls: [],
        }),
      },
      sectionImpls: {
        [managedImplId]: createChatSectionImpl(
          createUserDefaultChatSectionImpl(),
          {
            id: managedImplId,
            managed: true,
          },
        ),
        [scriptableImplId]: createChatSectionImpl(
          createUserDefaultChatSectionImpl(),
          {
            id: scriptableImplId,
            managed: false,
          },
        ),
        [textImplId]: createTextBlockSectionImpl(
          createUserDefaultTextBlockSectionImpl(),
          {
            id: textImplId,
          },
        ),
      },
    },
    managedSectionId,
    scriptableSectionId,
    textSectionId,
  };
}

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

  it("treats only managed chat sections as managed-chat standalone surfaces", () => {
    const { state, managedSectionId, scriptableSectionId, textSectionId } =
      createManagedChatAuthorityState();

    expect(standaloneSectionRequiresManagedChat(state, managedSectionId)).toBe(
      true,
    );
    expect(
      standaloneSectionRequiresManagedChat(state, scriptableSectionId),
    ).toBe(false);
    expect(standaloneSectionRequiresManagedChat(state, textSectionId)).toBe(
      false,
    );
  });

  it("distinguishes project chat, scriptable section windows, and git graph windows", () => {
    const { state, managedSectionId, scriptableSectionId } =
      createManagedChatAuthorityState();

    expect(
      windowSurfaceRequiresManagedChat(
        {
          mode: ChatWindowModeEnum.project_ai_mode,
          sectionIdOrNull: null,
        },
        state,
      ),
    ).toBe(true);
    expect(
      windowSurfaceRequiresManagedChat(
        {
          mode: ChatWindowModeEnum.section_mode,
          sectionIdOrNull: managedSectionId,
        },
        state,
      ),
    ).toBe(true);
    expect(
      windowSurfaceRequiresManagedChat(
        {
          mode: ChatWindowModeEnum.section_mode,
          sectionIdOrNull: scriptableSectionId,
        },
        state,
      ),
    ).toBe(false);
    expect(
      windowSurfaceRequiresManagedChat(
        {
          mode: ChatWindowModeEnum.git_graph_mode,
          sectionIdOrNull: null,
        },
        state,
      ),
    ).toBe(false);
  });

  it("uses the same authority for standalone window-space entries", () => {
    const { state, managedSectionId, scriptableSectionId, textSectionId } =
      createManagedChatAuthorityState();

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
        state,
      ),
    ).toBe(true);
    expect(
      standaloneWindowRequiresManagedChat(
        createWindowSpaceWindow({
          surfaceKind: WindowSpaceSurfaceKindEnum.section,
          sectionIdOrNull: managedSectionId,
          mode: ChatWindowModeEnum.section_mode,
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
        state,
      ),
    ).toBe(true);
    expect(
      standaloneWindowRequiresManagedChat(
        createWindowSpaceWindow({
          surfaceKind: WindowSpaceSurfaceKindEnum.section,
          sectionIdOrNull: scriptableSectionId,
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
        state,
      ),
    ).toBe(false);
    expect(
      standaloneWindowRequiresManagedChat(
        createWindowSpaceWindow({
          surfaceKind: WindowSpaceSurfaceKindEnum.section,
          sectionIdOrNull: textSectionId,
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
        state,
      ),
    ).toBe(false);
    expect(
      standaloneWindowRequiresManagedChat(
        createWindowSpaceWindow({
          surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
          mode: ChatWindowModeEnum.git_graph_mode,
          title: null,
          chatId: null,
          zIndex: 5,
          normalizedBounds: {
            x: 0,
            y: 0,
            width: 0.5,
            height: 0.5,
          },
        }),
        state,
      ),
    ).toBe(false);
  });

  it("blocks standalone window spaces only when one of their windows needs managed chat", () => {
    const { state, managedSectionId, scriptableSectionId, textSectionId } =
      createManagedChatAuthorityState();

    expect(
      standaloneWindowSpaceRequiresManagedChat(
        createWindowSpaceConfig({
          id: "space-blocked",
          name: "Blocked Space",
          windowsById: {
            "managed-window": createWindowSpaceWindow({
              surfaceKind: WindowSpaceSurfaceKindEnum.section,
              sectionIdOrNull: managedSectionId,
              mode: ChatWindowModeEnum.section_mode,
              title: "Managed Chat",
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
          order: ["managed-window"],
        }),
        state,
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
            "scriptable-window": createWindowSpaceWindow({
              surfaceKind: WindowSpaceSurfaceKindEnum.section,
              sectionIdOrNull: scriptableSectionId,
              mode: ChatWindowModeEnum.section_mode,
              title: null,
              chatId: null,
              zIndex: 2,
              normalizedBounds: {
                x: 0.5,
                y: 0,
                width: 0.25,
                height: 0.5,
              },
            }),
            "text-window": createWindowSpaceWindow({
              surfaceKind: WindowSpaceSurfaceKindEnum.section,
              sectionIdOrNull: textSectionId,
              mode: ChatWindowModeEnum.section_mode,
              title: null,
              chatId: null,
              zIndex: 3,
              normalizedBounds: {
                x: 0.75,
                y: 0,
                width: 0.25,
                height: 0.5,
              },
            }),
          },
          order: ["graph-window", "scriptable-window", "text-window"],
        }),
        state,
      ),
    ).toBe(false);
  });
});
