import { beforeEach, describe, expect, it } from "vitest";

import { useProjectState } from "state/definitions";
import { useToolArgumentPreview } from "state/stores/aiStores";
import { useAppDefinition, useAppPreview } from "state/stores/appStores";
import { resetProjectStores } from "state/utils";
import {
  ToolArgumentPreviewDeltaEvent,
  createProjectConfig,
  createToolChatMessage,
  type ToolCallDeltaEvent,
} from "utils/generatedTypes";
import { maybeApplyAppDefinitionToolResult } from "./aiChatStreamingAppDefinition";
import { applyToolCallDeltaToChatMessages } from "./aiChatStreamingToolCalls";
import {
  applyToolArgumentPreviewDeltaToPreviewStore,
  clearToolArgumentPreviewByToolCallIds,
} from "./aiChatStreamingToolPreviews";

describe("ai chat streaming tools", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
  });

  it("clears matching tool previews across all preview kinds", () => {
    useToolArgumentPreview.setState({
      byProjectConfigId: {
        "project-1": {
          previewCodeBySectionId: {
            "section-1": { value: "code-a", toolCallId: "tool-1" },
          },
          previewParamValueBySectionAndParamId: {
            "section-1": {
              "param-1": { value: "param-a", toolCallId: "tool-1" },
              "param-2": { value: "param-b", toolCallId: "tool-2" },
            },
          },
          previewCallableNameBySectionId: {
            "section-2": { value: "callable-a", toolCallId: "tool-2" },
          },
        },
      },
    });

    clearToolArgumentPreviewByToolCallIds("project-1", ["tool-1"]);

    expect(useToolArgumentPreview.getState().byProjectConfigId).toEqual({
      "project-1": {
        previewCodeBySectionId: {},
        previewParamValueBySectionAndParamId: {
          "section-1": {
            "param-2": { value: "param-b", toolCallId: "tool-2" },
          },
        },
        previewCallableNameBySectionId: {
          "section-2": { value: "callable-a", toolCallId: "tool-2" },
        },
      },
    });
  });

  it("applies section-scoped preview deltas into the preview store", () => {
    const chunk: ToolArgumentPreviewDeltaEvent = {
      type: "tool_argument_preview_delta",
      message_id: "assistant-1",
      tool_call_id: "tool-preview-1",
      tool_name: "setta__edit_code",
      arguments_delta: "",
      preview_kind: "code",
      target_ids_by_type: {
        section: ["section-1"],
        codeObj: [],
      },
      preview_value_delta: "print('hi')",
    };

    applyToolArgumentPreviewDeltaToPreviewStore(chunk, "project-1");

    expect(
      useToolArgumentPreview.getState().byProjectConfigId["project-1"]
        ?.previewCodeBySectionId["section-1"],
    ).toEqual({
      value: "print('hi')",
      toolCallId: "tool-preview-1",
    });
  });

  it("applies app-definition tool results to the app stores", () => {
    useAppDefinition.setState({ appSpec: null, appDefinition: null });
    useAppPreview.setState({
      previewSpecOverride: { stale: true },
      aiPreviewSpecOverride: { stale: "ai" },
      previewThemeOverride: { mode: "dark" },
      previewAssetsOverride: [],
    });

    maybeApplyAppDefinitionToolResult(
      createToolChatMessage({
        tool_call_id: "tool-call-1",
        tool_name: "setta__stream_app_definition",
        result: {
          meta: null,
          content: [],
          structuredContent: {
            appSpec: {
              root: "root",
              elements: {
                root: { key: "root", type: "Stack" },
              },
            },
            appDefinition: {
              catalogId: "setta.app.default",
              appSpecVersion: "v1",
              appSpecPath: "app_specs/app.json",
              routes: [],
              dataBindings: {},
              actions: {},
              theme: null,
              assets: [],
            },
          },
          isError: false,
        },
      }),
    );

    expect(useAppDefinition.getState().appSpec).toEqual({
      root: "root",
      elements: {
        root: { key: "root", type: "Stack" },
      },
    });
    expect(useAppDefinition.getState().appDefinition).toMatchObject({
      catalogId: "setta.app.default",
      appSpecPath: "app_specs/app.json",
    });
    expect(useAppPreview.getState().previewSpecOverride).toBeUndefined();
    expect(useAppPreview.getState().aiPreviewSpecOverride).toBeUndefined();
    expect(useAppPreview.getState().previewThemeOverride).toBeUndefined();
    expect(useAppPreview.getState().previewAssetsOverride).toBeUndefined();
  });

  it("creates an assistant placeholder and accumulates tool call arguments", () => {
    const chunk: ToolCallDeltaEvent = {
      type: "tool_call_delta",
      message_id: "assistant-1",
      tool_call_id: "tool-call-1",
      tool_name: "setta__do_work",
      arguments_delta: '{"step":1}',
    };

    const result = applyToolCallDeltaToChatMessages([], {}, chunk);

    expect(result.toolCallArguments).toEqual({
      "tool-call-1": '{"step":1}',
    });
    expect(result.messages).toMatchObject([
      {
        id: "assistant-1",
        role: "assistant",
        tool_calls: [
          {
            id: "tool-call-1",
            function: { name: "setta__do_work" },
          },
        ],
      },
    ]);
  });
});
