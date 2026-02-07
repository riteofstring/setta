import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  useAppPreview,
  useProjectState,
} from "state/definitions";
import { __resetAppSpecPatchStreamsForTests } from "state/appSpecPatchStreaming";
import { resetProjectStores } from "state/utils";
import { receiveLLMResponseChunk } from "./ai";
import {
  StreamingEventTypeEnum,
  createProjectConfig,
} from "utils/generatedTypes";

describe("ai app spec patch preview streaming", () => {
  beforeEach(() => {
    resetProjectStores();
    __resetAppSpecPatchStreamsForTests();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
  });

  afterEach(() => {
    __resetAppSpecPatchStreamsForTests();
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
        type: StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA,
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
        type: StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA,
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
});

