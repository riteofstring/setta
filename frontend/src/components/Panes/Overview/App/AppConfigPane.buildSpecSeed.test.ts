import { describe, expect, it } from "vitest";

import { buildSpecSeed } from "./AppConfigPane";

describe("buildSpecSeed", () => {
  it("uses valid draft JSON as the generation seed", () => {
    const persistedSpec = {
      root: {
        key: "persisted-root",
        type: "Stack",
        props: {},
        children: [],
      },
      elements: {},
    };

    const seed = buildSpecSeed({
      draftSpec: JSON.stringify({
        root: {
          key: "draft-root",
          type: "Stack",
          props: { gap: 8 },
          children: [],
        },
        elements: {},
      }),
      persistedSpec,
    });

    expect(seed.root?.key).toBe("draft-root");
  });

  it("returns a detached clone when falling back to persisted spec", () => {
    const persistedSpec = {
      root: {
        key: "persisted-root",
        type: "Stack",
        props: { gap: 12 },
        children: [],
      },
      elements: {
        "persisted-root": {
          key: "persisted-root",
          type: "Stack",
          props: { gap: 12 },
          children: [],
        },
      },
    };

    const seed = buildSpecSeed({
      // Keep invalid draft text to force fallback path.
      draftSpec: "{ invalid json",
      persistedSpec,
    });

    const root = seed.root as { props?: { gap?: number } };
    if (!root.props) {
      throw new Error("Expected root props");
    }
    root.props.gap = 48;

    expect((persistedSpec.root.props as { gap?: number }).gap).toBe(12);
  });
});
