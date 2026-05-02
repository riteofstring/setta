import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type AppSubsystemFrontendRegistrationsByPluginId,
  resetAppSubsystemFrontendRuntimeState,
  syncAppSubsystemFrontendRegistration,
} from "plugins/appSubsystem";
import { useAIStore, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  StreamingEventTypeEnum,
  createAssistantChatMessage,
  createProjectConfig,
} from "utils/generatedTypes";
import { getDefaultChatDetails, receiveLLMResponseChunk } from "./ai";

const ENABLED_APP_SUBSYSTEM_CAPABILITIES = {
  pluginId: "setta-json-render-app-gen",
  pluginEnabled: true,
  appAuthoringUi: true,
  appPreviewUi: true,
  appGenerationChatModes: true,
  appDeploymentRuntime: true,
} as const;
const NOOP_APP_SUBSYSTEM_RENDERER = { mount: () => undefined };
const applyAppSpecPatchPreviewDeltaToStoreMock = vi.fn();
const clearAllAppSpecPatchPreviewStreamsMock = vi.fn();
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
        applyAppSpecPatchPreviewDeltaToStore:
          applyAppSpecPatchPreviewDeltaToStoreMock,
        clearAllAppSpecPatchPreviewStreams:
          clearAllAppSpecPatchPreviewStreamsMock,
        initializeAppSessionFromCurrentDeployment: async () => true,
      },
    },
  };

describe("ai app spec patch preview streaming", () => {
  beforeEach(async () => {
    resetProjectStores();
    applyAppSpecPatchPreviewDeltaToStoreMock.mockClear();
    clearAllAppSpecPatchPreviewStreamsMock.mockClear();
    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
      APP_SUBSYSTEM_FRONTEND_REGISTRATIONS,
    );
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
  });

  afterEach(() => {
    resetAppSubsystemFrontendRuntimeState();
    resetProjectStores();
  });

  it("routes streamed patch lines through the app-subsystem controller", () => {
    const delta1 =
      '{"op":"set","path":"/root","value":"app-root"}\n' +
      '{"op":"set","path":"/elements/app-root","value":{"key":"app-root","type":"Card","props":{"title":"Hello"},"children":[]}}\n';

    receiveLLMResponseChunk({
      chatId: "chat-1",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.tool_argument_preview_delta,
        message_id: "msg-1",
        tool_call_id: "tool-call-1",
        tool_name: "setta__stream_app_definition",
        arguments_delta: "",
        preview_kind: "appSpecPatch",
        target_ids_by_type: {},
        preview_value_delta: delta1,
      },
    });

    expect(applyAppSpecPatchPreviewDeltaToStoreMock).toHaveBeenCalledWith({
      toolCallId: "tool-call-1",
      previewValueDelta: delta1,
    });

    const delta2 =
      '{"op":"set","path":"/elements/app-root/props/title","value":"Hello 2"}\n';

    receiveLLMResponseChunk({
      chatId: "chat-1",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.tool_argument_preview_delta,
        message_id: "msg-1",
        tool_call_id: "tool-call-1",
        tool_name: "setta__stream_app_definition",
        arguments_delta: "",
        preview_kind: "appSpecPatch",
        target_ids_by_type: {},
        preview_value_delta: delta2,
      },
    });

    expect(applyAppSpecPatchPreviewDeltaToStoreMock).toHaveBeenLastCalledWith({
      toolCallId: "tool-call-1",
      previewValueDelta: delta2,
    });
  });

  it("does not append tool call arguments on app spec patch preview deltas", () => {
    useAIStore.setState({
      activeChatId: "chat-1",
      chatDetails: {
        "chat-1": {
          ...getDefaultChatDetails(),
          messages: [createAssistantChatMessage({ id: "msg-1" })],
        },
      },
    });

    let updateCount = 0;
    const unsubscribe = useAIStore.subscribe(() => {
      updateCount += 1;
    });

    receiveLLMResponseChunk({
      chatId: "chat-1",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.tool_argument_preview_delta,
        message_id: "msg-1",
        tool_call_id: "tool-call-1",
        tool_name: "setta__stream_app_definition",
        arguments_delta: '{"patches":"',
        preview_kind: "appSpecPatch",
        target_ids_by_type: {},
        preview_value_delta: '{"op":"set","path":"/root","value":"app-root"}\n',
      },
    });

    receiveLLMResponseChunk({
      chatId: "chat-1",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.tool_argument_preview_delta,
        message_id: "msg-1",
        tool_call_id: "tool-call-1",
        tool_name: "setta__stream_app_definition",
        arguments_delta: "more-args",
        preview_kind: "appSpecPatch",
        target_ids_by_type: {},
        preview_value_delta: "",
      },
    });

    unsubscribe();

    const details = useAIStore.getState().chatDetails["chat-1"];
    expect(details.toolCallArguments).toEqual({});
    expect(updateCount).toBe(1);

    const message = details.messages[0];
    if (message?.role !== "assistant") {
      throw new Error("Expected assistant message");
    }
    expect(message.tool_calls).toMatchObject([
      {
        id: "tool-call-1",
        function: { name: "setta__stream_app_definition" },
      },
    ]);
  });
});
