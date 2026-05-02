/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertHtmlSurfaceApiProbesPassed,
  evaluateHtmlSurfaceSourcePolicy,
  HtmlSurfaceApiProbeError,
  summarizeHtmlSurfaceApiProbeResults,
  type HtmlSurfaceApiProbeResult,
} from "./apiProbes";

describe("HTML surface API probe summaries", () => {
  it("fails loudly for required probes that fail or are unsupported", () => {
    const results: HtmlSurfaceApiProbeResult[] = [
      {
        name: "core-html-in-canvas-apis",
        requirement: "required",
        status: "pass",
      },
      {
        details: "Subrect overload missing.",
        name: "source-subrect-upload",
        requirement: "required",
        status: "fail",
      },
      {
        name: "get-element-transform",
        requirement: "required",
        status: "unsupported",
      },
      {
        name: "capture-element-image-worker",
        requirement: "documented",
        status: "unsupported",
      },
    ];

    const summary = summarizeHtmlSurfaceApiProbeResults(results);

    expect(summary.passCount).toBe(1);
    expect(summary.failedRequiredProbeNames).toEqual(["source-subrect-upload"]);
    expect(summary.unsupportedRequiredProbeNames).toEqual([
      "get-element-transform",
    ]);
    expect(() => assertHtmlSurfaceApiProbesPassed(summary)).toThrow(
      HtmlSurfaceApiProbeError,
    );
  });

  it("allows documented-only unavailable APIs", () => {
    const summary = summarizeHtmlSurfaceApiProbeResults([
      {
        name: "capture-element-image-worker",
        requirement: "documented",
        status: "unsupported",
      },
    ]);

    expect(() => assertHtmlSurfaceApiProbesPassed(summary)).not.toThrow();
  });

  it("treats transform-only paint behavior as documented after routing", () => {
    const summary = summarizeHtmlSurfaceApiProbeResults([
      {
        details: "Transform-only source movement fired paint.",
        name: "transform-only-paint-invalidation",
        requirement: "documented",
        status: "pass",
      },
    ]);

    expect(summary.failedRequiredProbes).toEqual([]);
    expect(() => assertHtmlSurfaceApiProbesPassed(summary)).not.toThrow();
  });
});

describe("HTML surface source policy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a direct canvas child that has an in-viewport layout box", () => {
    const { canvas, source } = createPolicyFixture();

    const result = evaluateHtmlSurfaceSourcePolicy(canvas, source);

    expect(result).toEqual({
      issues: [],
      ok: true,
    });
  });

  it("rejects nested sources and hidden capture-risk styles", () => {
    const { canvas, source } = createPolicyFixture({ nested: true });
    source.style.display = "none";
    source.style.visibility = "hidden";
    source.style.opacity = "0";
    source.style.clipPath = "inset(0 0 100% 0)";

    const result = evaluateHtmlSurfaceSourcePolicy(canvas, source);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "not-direct-canvas-child",
        "display-none",
        "visibility-hidden",
        "opacity-zero",
        "clip-path-hidden",
      ]),
    );
  });

  it("rejects missing boxes and offscreen parking", () => {
    const { canvas, source } = createPolicyFixture({
      rect: {
        bottom: -9_899,
        height: 100,
        left: -10_000,
        right: -9_900,
        width: 100,
      },
      rectCount: 0,
    });

    const result = evaluateHtmlSurfaceSourcePolicy(canvas, source);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(["missing-layout-box", "parked-offscreen"]),
    );
  });
});

type PolicyFixtureOptions = {
  nested?: boolean | undefined;
  rect?:
    | Pick<DOMRect, "bottom" | "height" | "left" | "right" | "width">
    | undefined;
  rectCount?: number | undefined;
};

function createPolicyFixture(options: PolicyFixtureOptions = {}) {
  const canvas = document.createElement("canvas");
  const source = document.createElement("div");
  source.style.position = "absolute";
  source.style.left = "0";
  source.style.top = "0";
  source.style.width = "100px";
  source.style.height = "60px";

  if (options.nested) {
    const wrapper = document.createElement("div");
    wrapper.append(source);
    canvas.append(wrapper);
  } else {
    canvas.append(source);
  }
  document.body.append(canvas);

  const rect = options.rect ?? {
    bottom: 60,
    height: 60,
    left: 0,
    right: 100,
    width: 100,
  };
  vi.spyOn(source, "getBoundingClientRect").mockReturnValue({
    ...rect,
    x: rect.left,
    y: rect.bottom - rect.height,
    toJSON: () => rect,
  } as DOMRect);
  vi.spyOn(source, "getClientRects").mockReturnValue({
    length: options.rectCount ?? 1,
  } as DOMRectList);

  return { canvas, source };
}
