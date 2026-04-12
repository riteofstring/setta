import { afterEach, describe, expect, it } from "vitest";

import {
  applyAppSpecPatchPreviewDelta,
  clearAllAppSpecPatchStreams,
} from "./appSpecPatchStreaming";

describe("appSpecPatchStreaming", () => {
  afterEach(() => {
    clearAllAppSpecPatchStreams();
  });

  it("buffers incomplete patch lines until the stream receives a newline", () => {
    const firstChunk = applyAppSpecPatchPreviewDelta({
      toolCallId: "tool-call-buffered",
      previewValueDelta:
        '{"op":"set","path":"/root","value":"app-root"}' +
        '\n{"op":"set","path":"/elements/app-root","value":{"key":"app-root","type":"Card","props":{"title":"Updated"},"children":[]}}',
    });

    expect(firstChunk).toMatchObject({
      root: "app-root",
    });

    const secondChunk = applyAppSpecPatchPreviewDelta({
      toolCallId: "tool-call-buffered",
      previewValueDelta: "\n",
    });

    expect(secondChunk).toMatchObject({
      root: "app-root",
      elements: {
        "app-root": {
          props: { title: "Updated" },
        },
      },
    });
  });
});
