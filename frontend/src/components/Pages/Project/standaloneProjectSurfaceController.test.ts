import { describe, expect, it } from "vitest";
import {
  applyStandaloneSurfaceErrorCode,
  clearStandaloneLlmDeniedSurfaceError,
  resolveStandaloneProjectChatNavigationPath,
  syncStandaloneSurfaceErrorOwner,
} from "./standaloneProjectSurfaceController";

describe("standaloneProjectSurfaceController", () => {
  it("normalizes and applies standalone surface error codes per owner key", () => {
    expect(
      applyStandaloneSurfaceErrorCode({
        current: {
          ownerKey: "project-1:project-chat",
          errorCode: null,
        },
        ownerKey: "project-1:project-chat",
        errorCode: "chat_not_found",
      }),
    ).toEqual({
      ownerKey: "project-1:project-chat",
      errorCode: "chat_not_found",
    });
    expect(
      applyStandaloneSurfaceErrorCode({
        current: {
          ownerKey: "project-1:project-chat",
          errorCode: null,
        },
        ownerKey: "project-1:project-chat",
        errorCode: "other",
      }),
    ).toEqual({
      ownerKey: "project-1:project-chat",
      errorCode: null,
    });
  });

  it("resets stale standalone error state when the owner key changes", () => {
    expect(
      syncStandaloneSurfaceErrorOwner({
        current: {
          ownerKey: "project-1:project-chat",
          errorCode: "chat_not_found",
        },
        ownerKey: "project-2:project-chat",
      }),
    ).toEqual({
      ownerKey: "project-2:project-chat",
      errorCode: null,
    });
  });

  it("clears only llm_disallowed errors when access is restored", () => {
    expect(
      clearStandaloneLlmDeniedSurfaceError({
        current: {
          ownerKey: "project-1:project-chat",
          errorCode: "llm_disallowed",
        },
        ownerKey: "project-1:project-chat",
      }),
    ).toEqual({
      ownerKey: "project-1:project-chat",
      errorCode: null,
    });
    expect(
      clearStandaloneLlmDeniedSurfaceError({
        current: {
          ownerKey: "project-1:project-chat",
          errorCode: "chat_not_found",
        },
        ownerKey: "project-1:project-chat",
      }),
    ).toEqual({
      ownerKey: "project-1:project-chat",
      errorCode: "chat_not_found",
    });
  });

  it("resolves standalone chat navigation paths from direct values and updater functions", () => {
    expect(
      resolveStandaloneProjectChatNavigationPath({
        projectConfigName: "demo project",
        standaloneProjectChatId: "chat-alpha",
        next: null,
      }),
    ).toBe("/demo%20project/chat");
    expect(
      resolveStandaloneProjectChatNavigationPath({
        projectConfigName: "demo project",
        standaloneProjectChatId: "chat-alpha",
        next: (current) => `${current ?? "chat"}-beta`,
      }),
    ).toBe("/demo%20project/chat/chat-alpha-beta");
    expect(
      resolveStandaloneProjectChatNavigationPath({
        projectConfigName: undefined,
        standaloneProjectChatId: "chat-alpha",
        next: "chat-beta",
      }),
    ).toBeNull();
  });
});
