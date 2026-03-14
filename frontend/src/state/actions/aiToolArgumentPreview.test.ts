import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  useAIStore,
  useProjectState,
  useToolArgumentPreview,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  StreamingEventTypeEnum,
  createAssistantChatMessage,
  createProjectConfig,
} from "utils/generatedTypes";

let getDefaultChatDetails: typeof import("./ai").getDefaultChatDetails;
let receiveLLMResponseChunk: typeof import("./ai").receiveLLMResponseChunk;

describe("ai tool argument preview streaming", () => {
  beforeAll(async () => {
    const ai = await import("./ai");
    getDefaultChatDetails = ai.getDefaultChatDetails;
    receiveLLMResponseChunk = ai.receiveLLMResponseChunk;
  });

  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
    useAIStore.setState({
      chatDetails: {
        "chat-1": {
          ...getDefaultChatDetails(),
          messages: [createAssistantChatMessage({ id: "assistant-1" })],
        },
      },
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("stores code preview deltas in the code preview bucket", () => {
    receiveLLMResponseChunk({
      chatId: "chat-1",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA,
        message_id: "assistant-1",
        tool_call_id: "tool-call-1",
        tool_name: "setta__set_code",
        arguments_delta: '{"sectionId":"section-a","code":"print(',
        preview_kind: "code",
        target_ids_by_type: { section: ["section-a"] },
        preview_value_delta: "print(",
      },
    });

    const details = useAIStore.getState().chatDetails["chat-1"];
    expect(details.toolCallArguments["tool-call-1"]).toBe(
      '{"sectionId":"section-a","code":"print(',
    );
    expect(details.messages[0]?.tool_calls?.[0]?.function.name).toBe(
      "setta__set_code",
    );

    const previewState =
      useToolArgumentPreview.getState().byProjectConfigId["project-1"];
    expect(previewState.previewCodeBySectionId["section-a"]).toEqual({
      toolCallId: "tool-call-1",
      value: "print(",
    });
  });

  it("stores callable preview deltas in the callable preview bucket", () => {
    receiveLLMResponseChunk({
      chatId: "chat-1",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA,
        message_id: "assistant-1",
        tool_call_id: "tool-call-2",
        tool_name: "setta__set_callable",
        arguments_delta: '{"sectionId":"section-b","callableName":"sorted"}',
        preview_kind: "callableName",
        target_ids_by_type: { section: ["section-b"] },
        preview_value_delta: "sorted",
      },
    });

    const details = useAIStore.getState().chatDetails["chat-1"];
    expect(details.toolCallArguments["tool-call-2"]).toBe(
      '{"sectionId":"section-b","callableName":"sorted"}',
    );
    expect(details.messages[0]?.tool_calls?.[0]?.function.name).toBe(
      "setta__set_callable",
    );

    const previewState =
      useToolArgumentPreview.getState().byProjectConfigId["project-1"];
    expect(previewState.previewCallableNameBySectionId["section-b"]).toEqual({
      toolCallId: "tool-call-2",
      value: "sorted",
    });
  });

  it("stores param preview deltas in the param preview bucket", () => {
    receiveLLMResponseChunk({
      chatId: "chat-1",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA,
        message_id: "assistant-1",
        tool_call_id: "tool-call-3",
        tool_name: "setta__set_param_entered_value",
        arguments_delta:
          '{"sectionId":"section-c","paramInfoId":"param-a","value":"updated"}',
        preview_kind: "paramValue",
        target_ids_by_type: {
          section: ["section-c"],
          codeObj: ["param-a"],
        },
        preview_value_delta: "updated",
      },
    });

    const details = useAIStore.getState().chatDetails["chat-1"];
    expect(details.toolCallArguments["tool-call-3"]).toBe(
      '{"sectionId":"section-c","paramInfoId":"param-a","value":"updated"}',
    );
    expect(details.messages[0]?.tool_calls?.[0]?.function.name).toBe(
      "setta__set_param_entered_value",
    );

    const previewState =
      useToolArgumentPreview.getState().byProjectConfigId["project-1"];
    expect(
      previewState.previewParamValueBySectionAndParamId["section-c"]?.["param-a"],
    ).toEqual({
      toolCallId: "tool-call-3",
      value: "updated",
    });
  });
});
