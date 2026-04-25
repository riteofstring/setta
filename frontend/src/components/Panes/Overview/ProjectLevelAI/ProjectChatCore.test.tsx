/* @vitest-environment jsdom */

import {
  type AppSubsystemFrontendRegistrationsByPluginId,
  resetAppSubsystemFrontendRuntimeState,
  syncAppSubsystemFrontendRegistration,
} from "plugins/appSubsystem";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildProjectChatHydrationCacheKey,
  buildProjectChatSubmitReadinessKey,
  clearProjectChatHydrationCacheEntriesForChat,
  hasRetainedImageAttachmentFromImageModeThread,
  resolveProjectChatSubmitAppGeneration,
} from "./projectChatCoreUtils";

type HydrationCacheEntry = {
  attempt: number;
  lastTouchedAt: number;
  status: "failed" | "succeeded" | "terminal_failure";
  timerId: number | null;
};

function createEntry(
  status: HydrationCacheEntry["status"],
): HydrationCacheEntry {
  return {
    attempt: 0,
    lastTouchedAt: 0,
    status,
    timerId: null,
  };
}

const NOOP_APP_SUBSYSTEM_RENDERER = { mount: () => undefined };

const ENABLED_APP_SUBSYSTEM_CAPABILITIES = {
  pluginId: "setta-json-render-app-gen",
  pluginEnabled: true,
  appAuthoringUi: true,
  appPreviewUi: true,
  appGenerationChatModes: true,
  appDeploymentRuntime: true,
} as const;
const APP_SUBSYSTEM_FRONTEND_REGISTRATIONS: AppSubsystemFrontendRegistrationsByPluginId =
  {
    [ENABLED_APP_SUBSYSTEM_CAPABILITIES.pluginId]: {
      pluginId: ENABLED_APP_SUBSYSTEM_CAPABILITIES.pluginId,
      overviewTab: {
        renderer: NOOP_APP_SUBSYSTEM_RENDERER,
        titleQuickInfo: "Authoring quick info",
        moreMenuQuickInfo: "More menu quick info",
        moreMenuLabel: "JSON Render",
      },
      previewSurface: {
        renderer: NOOP_APP_SUBSYSTEM_RENDERER,
      },
      appModeRoute: {
        renderer: NOOP_APP_SUBSYSTEM_RENDERER,
      },
      appDeploymentModal: {
        renderer: NOOP_APP_SUBSYSTEM_RENDERER,
      },
      chat: {
        slashCommands: [
          {
            command: "/app-image",
            action: "app_json_render_with_image",
            summary: "Generate an app spec using attached image guidance.",
            promptTemplate: "Generate an app spec using an image.",
            appGenerationMode: "json_render_with_image",
            requiresImageAttachment: true,
          },
        ],
        imageRequiredModes: ["json_render_with_image"],
        customSlashCommandModes: {
          options: [
            { id: "plain_chat", name: "Plain chat" },
            { id: "json_render_with_image", name: "Image to JSON Render" },
          ],
          defaultMode: "plain_chat",
        },
      },
      controller: {
        initializeAppSessionFromCurrentDeployment: async () => true,
      },
    },
  };

beforeEach(async () => {
  resetAppSubsystemFrontendRuntimeState();
  await syncAppSubsystemFrontendRegistration(
    ENABLED_APP_SUBSYSTEM_CAPABILITIES,
    APP_SUBSYSTEM_FRONTEND_REGISTRATIONS,
  );
});

afterEach(() => {
  resetAppSubsystemFrontendRuntimeState();
});

describe("ProjectChatCore hydration cache identity", () => {
  it("changes the hydration cache key when only the project config changes", () => {
    const projectAKey = buildProjectChatHydrationCacheKey({
      projectConfigId: "project-a",
      chatId: "shared-chat",
      hydrationRunType: "llm_chat",
      hydrationMetadataRevision: "revision-1",
    });
    const projectBKey = buildProjectChatHydrationCacheKey({
      projectConfigId: "project-b",
      chatId: "shared-chat",
      hydrationRunType: "llm_chat",
      hydrationMetadataRevision: "revision-1",
    });

    expect(projectAKey).not.toBeNull();
    expect(projectBKey).not.toBeNull();
    expect(projectAKey).not.toBe(projectBKey);
  });

  it("only evicts cache entries for the same project-owned route identity", () => {
    const cache: Record<string, HydrationCacheEntry> = {
      "project-a:shared-chat:llm_chat:revision-1":
        createEntry("terminal_failure"),
      "project-a:shared-chat:external_agent:revision-1": createEntry("failed"),
      "project-b:shared-chat:llm_chat:revision-1": createEntry("succeeded"),
      "project-a:other-chat:llm_chat:revision-1": createEntry("succeeded"),
    };

    const removed = clearProjectChatHydrationCacheEntriesForChat({
      cache,
      projectConfigId: "project-a",
      chatId: "shared-chat",
      keepCacheKey: "project-a:shared-chat:llm_chat:revision-1",
    });

    expect(removed).toEqual([
      "project-a:shared-chat:external_agent:revision-1",
    ]);
  });
});

describe("ProjectChatCore submit app-generation resolution", () => {
  it("keeps inheriting the active app-generation mode when no override is provided", () => {
    expect(
      resolveProjectChatSubmitAppGeneration({
        activeAppGeneration: { mode: "json_render" },
      }),
    ).toEqual({ mode: "json_render" });
  });

  it("treats an explicit null override as plain chat instead of inheriting", () => {
    expect(
      resolveProjectChatSubmitAppGeneration({
        activeAppGeneration: { mode: "json_render" },
        options: {
          appGeneration: null,
        },
      }),
    ).toBeNull();
  });

  it("changes the submit readiness key when runtime prerequisites recover", () => {
    const unavailableKey = buildProjectChatSubmitReadinessKey({
      requiresNewThreadContinuation: false,
      engineConfigId: "engine-1",
      hasLLMConfig: false,
      isExternalEngine: false,
      externalEngineAvailable: true,
    });
    const readyKey = buildProjectChatSubmitReadinessKey({
      requiresNewThreadContinuation: false,
      engineConfigId: "engine-1",
      hasLLMConfig: true,
      isExternalEngine: false,
      externalEngineAvailable: true,
    });

    expect(unavailableKey).not.toBe(readyKey);
  });

  it("only treats retained images from prior image-mode turns as reusable", () => {
    expect(
      hasRetainedImageAttachmentFromImageModeThread(
        [
          {
            id: "msg-plain-image",
            role: "user",
            content: [],
            attachments: [
              {
                id: "attachment-1",
                name: "plain.png",
                mimeType: "image/png",
              },
            ],
          },
        ],
        {},
      ),
    ).toBe(false);

    expect(
      hasRetainedImageAttachmentFromImageModeThread(
        [
          {
            id: "msg-image-mode",
            role: "user",
            content: [],
            attachments: [
              {
                id: "attachment-2",
                name: "reference.png",
                mimeType: "image/png",
              },
            ],
          },
        ],
        {
          "msg-image-mode": { mode: "json_render_with_image" },
        },
      ),
    ).toBe(true);
  });
});
