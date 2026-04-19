import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  resetAppSubsystemFrontendRuntimeState,
  syncAppSubsystemFrontendRegistration,
} from "plugins/appSubsystemRuntime";
import { useAIStore, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  StreamingEventTypeEnum,
  createAssistantChatMessage,
  createProjectConfig,
} from "utils/generatedTypes";
import { clearAllAppSpecPatchPreviewStreams } from "../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemPreviewController";
import { useAppPreview } from "../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemProjectState";
import { getDefaultChatDetails, receiveLLMResponseChunk } from "./ai";

const ENABLED_APP_SUBSYSTEM_CAPABILITIES = {
  pluginId: "setta-json-render-app-gen",
  pluginEnabled: true,
  appAuthoringUi: true,
  appPreviewUi: true,
  appGenerationChatModes: true,
  appDeploymentRuntime: true,
} as const;

describe("ai app spec patch preview streaming", () => {
  beforeEach(async () => {
    resetProjectStores();
    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
    );
    clearAllAppSpecPatchPreviewStreams();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
  });

  afterEach(() => {
    clearAllAppSpecPatchPreviewStreams();
    resetAppSubsystemFrontendRuntimeState();
    resetProjectStores();
  });

  it("applies streamed patch lines to the AI preview override", () => {
    expect(useAppPreview.getState().aiPreviewSpecOverride).toBeUndefined();

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

    expect(useAppPreview.getState().aiPreviewSpecOverride).toMatchObject({
      root: "app-root",
      elements: {
        "app-root": {
          type: "Card",
          props: { title: "Hello" },
        },
      },
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

    expect(useAppPreview.getState().aiPreviewSpecOverride).toMatchObject({
      elements: {
        "app-root": {
          props: { title: "Hello 2" },
        },
      },
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
