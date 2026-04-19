import { afterEach, describe, expect, it } from "vitest";

import {
  applyAppSpecPatchPreviewDelta,
  clearAllAppSpecPatchStreams,
} from "../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemPreviewController";

describe("appSubsystemPreviewController", () => {
  afterEach(() => {
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
});
