import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type AppSubsystemFrontendRegistrationsByPluginId,
  resetAppSubsystemFrontendRuntimeState,
  syncAppSubsystemFrontendRegistration,
} from "plugins/appSubsystem";
import { receiveLLMResponseChunk } from "./ai";

import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatRoleEnum,
  StreamingEventTypeEnum,
  createProjectConfig,
} from "utils/generatedTypes";

const ENABLED_APP_SUBSYSTEM_CAPABILITIES = {
  pluginId: "setta-json-render-app-gen",
  pluginEnabled: true,
  appAuthoringUi: true,
  appPreviewUi: true,
  appGenerationChatModes: true,
  appDeploymentRuntime: true,
} as const;
const NOOP_APP_SUBSYSTEM_RENDERER = { mount: () => undefined };
const applyAppDefinitionStructuredContentToStoreMock = vi.fn(() => true);
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
            command: "/app-json",
            action: "app_json_render",
            summary: "Generate an app spec.",
            promptTemplate: "Generate an app spec.",
            appGenerationMode: "json_render",
          },
        ],
        imageRequiredModes: [],
        customSlashCommandModes: {
          options: [{ id: "plain_chat", name: "Plain chat" }],
          defaultMode: "plain_chat",
        },
      },
      controller: {
        applyAppDefinitionStructuredContentToStore:
          applyAppDefinitionStructuredContentToStoreMock,
      },
    },
  };

describe("ai app spec tool results", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    applyAppDefinitionStructuredContentToStoreMock.mockClear();
    resetProjectStores();
    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
      APP_SUBSYSTEM_FRONTEND_REGISTRATIONS,
    );
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    resetAppSubsystemFrontendRuntimeState();
    resetProjectStores();
  });

  it("applies set_app_definition tool results through the app-subsystem controller", () => {
    const nextSpec = {
      root: { key: "root", type: "Stack" },
      elements: {},
    };
    const nextDefinition = {
      catalogId: "setta.app.default",
      appSpecVersion: "v1",
      appSpecPath: "plugins/setta-json-render-app-gen/app_specs/app.json",
      routes: [],
      dataBindings: {},
      actions: {},
      theme: null,
      assets: [],
    };

    receiveLLMResponseChunk({
      chatId: "chat-ai-apply-1",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.tool_result,
        result: {
          id: "tool-msg-1",
          role: ChatRoleEnum.tool,
          tool_call_id: "tool-call-1",
          tool_name: "setta__set_app_definition",
          arguments: {},
          result: {
            meta: null,
            content: [],
            structuredContent: {
              appSpec: nextSpec,
              appDefinition: nextDefinition,
            },
            isError: false,
          },
          content: [],
          is_error: false,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
      },
    });

    expect(applyAppDefinitionStructuredContentToStoreMock).toHaveBeenCalledWith(
      {
        appSpec: nextSpec,
        appDefinition: nextDefinition,
      },
    );
  });

  it("applies stream_app_definition tool results through the app-subsystem controller", () => {
    const nextSpec = {
      root: "root",
      elements: {
        root: { key: "root", type: "Stack" },
      },
    };

    receiveLLMResponseChunk({
      chatId: "chat-ai-apply-stream-1",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.tool_result,
        result: {
          id: "tool-msg-stream-1",
          role: ChatRoleEnum.tool,
          tool_call_id: "tool-call-stream-1",
          tool_name: "setta__stream_app_definition",
          arguments: {},
          result: {
            meta: null,
            content: [],
            structuredContent: {
              appSpec: nextSpec,
              appDefinition: {
                catalogId: "setta.app.default",
                appSpecVersion: "v1",
                appSpecPath:
                  "plugins/setta-json-render-app-gen/app_specs/app.json",
                routes: [],
                dataBindings: {},
                actions: {},
                theme: null,
                assets: [],
              },
            },
            isError: false,
          },
          content: [],
          is_error: false,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
      },
    });

    expect(applyAppDefinitionStructuredContentToStoreMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appSpec: nextSpec,
      }),
    );
  });

  it("ignores tool results from other tools", () => {
    receiveLLMResponseChunk({
      chatId: "chat-ai-apply-2",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.tool_result,
        result: {
          id: "tool-msg-2",
          role: ChatRoleEnum.tool,
          tool_call_id: "tool-call-2",
          tool_name: "setta__get_app_catalog",
          arguments: {},
          result: {
            meta: null,
            content: [],
            structuredContent: { catalog: { id: "setta.app.default" } },
            isError: false,
          },
          content: [],
          is_error: false,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
      },
    });

    expect(
      applyAppDefinitionStructuredContentToStoreMock,
    ).not.toHaveBeenCalled();
  });

  it("ignores errored tool results", () => {
    receiveLLMResponseChunk({
      chatId: "chat-ai-apply-3",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.tool_result,
        result: {
          id: "tool-msg-3",
          role: ChatRoleEnum.tool,
          tool_call_id: "tool-call-3",
          tool_name: "setta__set_app_definition",
          arguments: {},
          result: {
            meta: null,
            content: [],
            structuredContent: {
              appSpec: {
                root: { key: "root", type: "Stack" },
                elements: {},
              },
            },
            isError: true,
          },
          content: [],
          is_error: true,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
      },
    });

    expect(
      applyAppDefinitionStructuredContentToStoreMock,
    ).not.toHaveBeenCalled();
  });

  it("keeps the streamed app preview on stream_app_definition tool errors", () => {
    receiveLLMResponseChunk({
      chatId: "chat-ai-apply-stream-err-1",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.tool_result,
        result: {
          id: "tool-msg-stream-err-1",
          role: ChatRoleEnum.tool,
          tool_call_id: "tool-call-stream-err-1",
          tool_name: "setta__stream_app_definition",
          arguments: {},
          result: {
            meta: null,
            content: [],
            structuredContent: null,
            isError: true,
          },
          content: [],
          is_error: true,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
      },
    });

    expect(
      applyAppDefinitionStructuredContentToStoreMock,
    ).not.toHaveBeenCalled();
  });
});
