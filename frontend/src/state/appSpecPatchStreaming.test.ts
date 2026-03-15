import { afterEach, describe, expect, it } from "vitest";

import {
  __resetAppSpecPatchStreamsForTests,
  applyAppSpecPatchPreviewDelta,
  setNextAppSpecPatchStreamBase,
} from "./appSpecPatchStreaming";

describe("appSpecPatchStreaming", () => {
  afterEach(() => {
    __resetAppSpecPatchStreamsForTests();
  });

  it("seeds the next stream from the prepared base spec", () => {
    setNextAppSpecPatchStreamBase({
      root: "app-root",
      elements: {
        "app-root": {
          key: "app-root",
          type: "Card",
          props: { title: "Initial" },
          children: [],
        },
      },
    });

    const nextSpec = applyAppSpecPatchPreviewDelta({
      toolCallId: "tool-call-seeded",
      previewValueDelta:
        '{"op":"set","path":"/elements/app-root/props/title","value":"Updated"}\n',
    });

    expect(nextSpec).toMatchObject({
      root: "app-root",
      elements: {
        "app-root": {
          props: { title: "Updated" },
        },
      },
    });
  });
});
