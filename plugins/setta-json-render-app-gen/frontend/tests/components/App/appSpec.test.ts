import { describe, expect, it } from "vitest";

import { normalizeAppSpec } from "../../../src/components/App/appSpec";

describe("normalizeAppSpec", () => {
  it("normalizes the requested override root and reachable descendants", () => {
    const spec = {
      root: "root",
      elements: {
        root: {
          key: "root",
          type: "Stack",
          children: ["panel"],
        },
        panel: {
          key: "panel",
          type: "Card",
          props: { title: "Panel" },
          visible: false,
          children: [
            "message",
            {
              key: "inline-action",
              type: "ActionButton",
              props: { label: "Go" },
            },
            "missing",
          ],
        },
        message: {
          key: "message",
          type: "Text",
        },
      },
    };

    expect(normalizeAppSpec(spec, "panel")).toEqual({
      root: "panel",
      elements: {
        panel: {
          key: "panel",
          type: "Card",
          props: { title: "Panel" },
          parentKey: null,
          visible: false,
          children: ["message", "inline-action"],
        },
        message: {
          key: "message",
          type: "Text",
          props: {},
          parentKey: "panel",
          children: undefined,
        },
        "inline-action": {
          key: "inline-action",
          type: "ActionButton",
          props: { label: "Go" },
          parentKey: "panel",
          children: undefined,
        },
      },
    });
  });

  it("returns null when an override root is missing", () => {
    const spec = {
      root: "root",
      elements: {
        root: { key: "root", type: "Stack" },
      },
    };

    expect(normalizeAppSpec(spec, "missing")).toBeNull();
  });

  it("supports inline single-root specs without an elements map", () => {
    const spec = {
      key: "root",
      type: "Stack",
      children: [{ key: "child", type: "Text" }],
    };

    expect(normalizeAppSpec(spec)).toEqual({
      root: "root",
      elements: {
        root: {
          key: "root",
          type: "Stack",
          props: {},
          parentKey: null,
          children: ["child"],
        },
        child: {
          key: "child",
          type: "Text",
          props: {},
          parentKey: "root",
          children: undefined,
        },
      },
    });
  });
});
