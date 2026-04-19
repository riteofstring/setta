import {
  resetAppSubsystemFrontendRuntimeState,
  syncAppSubsystemFrontendRegistration,
} from "plugins/appSubsystem";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyAppSpecPatchPreviewDelta,
  clearAllAppSpecPatchStreams,
} from "../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemPreviewController";
import { useAppPreview } from "../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemProjectState";
import { appSubsystemFrontendRegistration } from "../../../plugins/setta-json-render-app-gen/frontend/src/index";

const ENABLED_APP_SUBSYSTEM_CAPABILITIES = {
  pluginId: "setta-json-render-app-gen",
  pluginEnabled: true,
  appAuthoringUi: true,
  appPreviewUi: true,
  appGenerationChatModes: true,
  appDeploymentRuntime: true,
} as const;

describe("appSubsystemPreviewController", () => {
  beforeEach(async () => {
    resetAppSubsystemFrontendRuntimeState();
    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
      {
        [ENABLED_APP_SUBSYSTEM_CAPABILITIES.pluginId]: {
          ...appSubsystemFrontendRegistration,
          pluginId: ENABLED_APP_SUBSYSTEM_CAPABILITIES.pluginId,
        },
      },
    );
  });

  afterEach(() => {
    resetAppSubsystemFrontendRuntimeState();
    clearAllAppSpecPatchStreams();
  });

  it("accumulates streamed patch lines per tool call", () => {
    const firstChunk = applyAppSpecPatchPreviewDelta({
      toolCallId: "tool-1",
      previewValueDelta:
        '{"op":"set","path":"/root","value":"screen"}\n{"op":"set","path":"/elements/screen","value":{"key":"screen","type":"Card","props":{"title":"Hello"},"children":[]}}\n{"op":"set","path":"/elements/screen/props/title","value":"He',
    });

    expect(firstChunk).toMatchObject({
      root: "screen",
      elements: {
        screen: {
          key: "screen",
          type: "Card",
          props: {
            title: "Hello",
          },
        },
      },
    });

    const secondChunk = applyAppSpecPatchPreviewDelta({
      toolCallId: "tool-1",
      previewValueDelta: 'llo 2"}\n',
    });

    expect(secondChunk).toMatchObject({
      elements: {
        screen: {
          props: {
            title: "Hello 2",
          },
        },
      },
    });
  });

  it("clears partial streamed patch state on project reset", () => {
    applyAppSpecPatchPreviewDelta({
      toolCallId: "tool-1",
      previewValueDelta:
        '{"op":"set","path":"/root","value":"screen"}\n{"op":"set","path":"/elements/screen","value":{"key":"screen","type":"Card","props":{"title":"Hello"},"children":[]}}\n{"op":"set","path":"/elements/screen/props/title","value":"He',
    });
    useAppPreview.setState({
      aiPreviewSpecOverride: {
        root: "screen",
        elements: {
          screen: {
            key: "screen",
            type: "Card",
            props: { title: "Hello" },
            children: [],
          },
        },
      },
    });

    resetProjectStores();

    const continuedChunk = applyAppSpecPatchPreviewDelta({
      toolCallId: "tool-1",
      previewValueDelta: 'llo 2"}\n',
    });

    expect(continuedChunk).toBeNull();
    expect(useAppPreview.getState().aiPreviewSpecOverride).toBeUndefined();
  });
});
