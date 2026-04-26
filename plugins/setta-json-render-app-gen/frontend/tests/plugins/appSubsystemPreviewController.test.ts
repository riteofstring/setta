import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyAppSpecPatchPreviewDelta,
  clearAllAppSpecPatchStreams,
} from "../../src/appSubsystemPreviewController";
import { useAppPreview } from "../../src/appSubsystemProjectState";
import { resetAppSubsystemPluginStores } from "../testUtils/appSubsystemTestState";

describe("appSubsystemPreviewController", () => {
  beforeEach(() => {
    resetAppSubsystemPluginStores();
  });

  afterEach(() => {
    resetAppSubsystemPluginStores();
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

    useAppPreview.getState().reset?.();
    clearAllAppSpecPatchStreams();

    const continuedChunk = applyAppSpecPatchPreviewDelta({
      toolCallId: "tool-1",
      previewValueDelta: 'llo 2"}\n',
    });

    expect(continuedChunk).toBeNull();
    expect(useAppPreview.getState().aiPreviewSpecOverride).toBeUndefined();
  });
});
