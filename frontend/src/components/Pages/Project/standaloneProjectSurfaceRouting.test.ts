import { SectionTypeEnum, createWindowSpaceConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildStandaloneProjectChatPath,
  buildStandaloneSurfaceOwnerKey,
  normalizeStandaloneChatId,
  normalizeStandaloneSurfaceErrorCode,
  resolveStandaloneDocumentTitle,
  resolveStandaloneSurfaceTarget,
  type StandaloneSurfaceRouteState,
} from "./standaloneProjectSurfaceRouting";

function createStandaloneSurfaceRouteState(): StandaloneSurfaceRouteState {
  return {
    projectConfig: {
      sectionVariantMap: {
        "section-1": "section-1-variant",
      },
      windowSpaces: {
        "window-space-1": createWindowSpaceConfig({
          id: "window-space-1",
          name: "Primary Workspace",
        }),
      },
    },
    sections: {
      "section-1": {
        name: "Primary Notes",
        sharedModifier: {},
      },
    },
    sectionVariants: {
      "section-1-variant": {
        impl: "section-1-impl",
        modifier: {},
      },
    },
    sectionImpls: {
      "section-1-impl": {
        type: SectionTypeEnum.TextBlock,
      },
    },
    parentSectionMap: {},
  };
}

describe("standaloneProjectSurfaceRouting", () => {
  it("normalizes thread ids and rejects blank standalone thread routes", () => {
    expect(normalizeStandaloneChatId(" chat-alpha ")).toBe("chat-alpha");
    expect(normalizeStandaloneChatId("   ")).toBeNull();
    expect(normalizeStandaloneChatId(undefined)).toBeNull();
  });

  it("builds standalone project chat paths with optional thread ids", () => {
    expect(buildStandaloneProjectChatPath("demo project", null)).toBe(
      "/demo%20project/chat",
    );
    expect(buildStandaloneProjectChatPath("demo project", "chat alpha")).toBe(
      "/demo%20project/chat/chat%20alpha",
    );
  });

  it("resolves project chat, section, and window-space standalone targets", () => {
    const state = createStandaloneSurfaceRouteState();

    expect(
      resolveStandaloneSurfaceTarget(state, undefined, undefined, undefined),
    ).toEqual({
      kind: "project_chat",
    });
    expect(
      resolveStandaloneSurfaceTarget(
        state,
        undefined,
        " chat-alpha ",
        undefined,
      ),
    ).toEqual({
      kind: "project_chat_thread",
      chatId: "chat-alpha",
    });
    expect(
      resolveStandaloneSurfaceTarget(state, undefined, "   ", undefined),
    ).toEqual({
      kind: "project_chat_thread_not_found",
    });
    expect(
      resolveStandaloneSurfaceTarget(
        state,
        "primary_notes",
        undefined,
        undefined,
      ),
    ).toEqual({
      kind: "section",
      sectionId: "section-1",
      sectionName: "Primary Notes",
      sectionType: SectionTypeEnum.TextBlock,
    });
    expect(
      resolveStandaloneSurfaceTarget(
        state,
        undefined,
        undefined,
        "primary_workspace",
      ),
    ).toEqual({
      kind: "window_space",
      windowSpaceId: "window-space-1",
      windowSpaceName: "Primary Workspace",
    });
  });

  it("builds document titles for threads and not-found states", () => {
    expect(
      resolveStandaloneDocumentTitle(
        "demo",
        { kind: "project_chat_thread", chatId: "chat-alpha" },
        false,
        "Alpha Chat",
      ),
    ).toBe("demo · Alpha Chat");
    expect(
      resolveStandaloneDocumentTitle(
        "demo",
        { kind: "window_space_not_found" },
        false,
        null,
      ),
    ).toBe("demo · Window Space Not Found");
    expect(
      resolveStandaloneDocumentTitle(
        undefined,
        { kind: "project_chat" },
        false,
        null,
      ),
    ).toBe("setta.dev");
    expect(
      resolveStandaloneDocumentTitle(
        "demo",
        { kind: "section_not_found" },
        true,
        null,
      ),
    ).toBe("Not Found");
  });

  it("normalizes standalone error codes and owner keys", () => {
    expect(normalizeStandaloneSurfaceErrorCode("chat_not_found")).toBe(
      "chat_not_found",
    );
    expect(normalizeStandaloneSurfaceErrorCode("other")).toBeNull();

    expect(
      buildStandaloneSurfaceOwnerKey("project-1", {
        kind: "project_chat_thread",
        chatId: "chat-alpha",
      }),
    ).toBe("project-1:project-chat:chat-alpha");
    expect(
      buildStandaloneSurfaceOwnerKey("project-1", {
        kind: "window_space",
        windowSpaceId: "window-space-1",
        windowSpaceName: "Primary Workspace",
      }),
    ).toBe("project-1:window-space:window-space-1");
    expect(
      buildStandaloneSurfaceOwnerKey("project-1", {
        kind: "section_not_found",
      }),
    ).toBeNull();
  });
});
