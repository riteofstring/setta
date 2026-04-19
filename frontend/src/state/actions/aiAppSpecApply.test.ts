import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { receiveLLMResponseChunk } from "./ai";

import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatRoleEnum,
  StreamingEventTypeEnum,
  createProjectConfig,
} from "utils/generatedTypes";
import { useAppDefinition } from "../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemDefinitionState";
import { useAppPreview } from "../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemProjectState";

describe("ai app spec tool results", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    resetProjectStores();
  });

  it("applies set_app_definition tool results to the app preview stores", () => {
    useAppDefinition.setState({ appSpec: null, appDefinition: null });
    useAppPreview.setState({
      previewSpecOverride: { stale: true },
      aiPreviewSpecOverride: { stale: "ai" },
      previewThemeOverride: { mode: "dark" },
      previewAssetsOverride: [],
    });

    const nextSpec = {
      root: { key: "root", type: "Stack" },
      elements: {},
    };
    const nextDefinition = {
      catalogId: "setta.app.default",
      appSpecVersion: "v1",
      appSpecPath: "app_specs/app.json",
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

    expect(useAppDefinition.getState().appSpec).toEqual(nextSpec);
    expect(useAppDefinition.getState().appDefinition).toEqual(nextDefinition);
    expect(useAppPreview.getState().previewSpecOverride).toBeUndefined();
    expect(useAppPreview.getState().aiPreviewSpecOverride).toBeUndefined();
    expect(useAppPreview.getState().previewThemeOverride).toBeUndefined();
    expect(useAppPreview.getState().previewAssetsOverride).toBeUndefined();
  });

  it("applies stream_app_definition tool results to the app preview stores", () => {
    useAppDefinition.setState({ appSpec: null, appDefinition: null });
    useAppPreview.setState({
      previewSpecOverride: { stale: true },
      aiPreviewSpecOverride: { stale: "ai" },
    });

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
          content: [],
          is_error: false,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
      },
    });

    expect(useAppDefinition.getState().appSpec).toEqual(nextSpec);
    expect(useAppPreview.getState().previewSpecOverride).toBeUndefined();
    expect(useAppPreview.getState().aiPreviewSpecOverride).toBeUndefined();
  });

  it("ignores tool results from other tools", () => {
    useAppDefinition.setState({ appSpec: null, appDefinition: null });
    useAppPreview.setState({
      previewSpecOverride: { stale: true },
      aiPreviewSpecOverride: { stale: "ai" },
      previewThemeOverride: { mode: "dark" },
      previewAssetsOverride: [],
    });

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

    expect(useAppDefinition.getState().appSpec).toBeNull();
    expect(useAppPreview.getState().previewSpecOverride).toEqual({
      stale: true,
    });
    expect(useAppPreview.getState().aiPreviewSpecOverride).toEqual({
      stale: "ai",
    });
  });

  it("ignores errored tool results", () => {
    useAppDefinition.setState({ appSpec: null, appDefinition: null });
    useAppPreview.setState({
      previewSpecOverride: { stale: true },
      aiPreviewSpecOverride: { stale: "ai" },
      previewThemeOverride: { mode: "dark" },
      previewAssetsOverride: [],
    });

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

    expect(useAppDefinition.getState().appSpec).toBeNull();
    expect(useAppPreview.getState().previewSpecOverride).toEqual({
      stale: true,
    });
    expect(useAppPreview.getState().aiPreviewSpecOverride).toEqual({
      stale: "ai",
    });
  });

  it("keeps the streamed app preview on stream_app_definition tool errors", () => {
    useAppDefinition.setState({ appSpec: null, appDefinition: null });
    useAppPreview.setState({
      aiPreviewSpecOverride: {
        root: "root",
        elements: { root: { key: "root", type: "Stack" } },
      },
    });

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

    expect(useAppDefinition.getState().appSpec).toBeNull();
    expect(useAppPreview.getState().aiPreviewSpecOverride).toMatchObject({
      root: "root",
      elements: { root: { key: "root", type: "Stack" } },
    });
  });
});
