import { describe, expect, test } from "vitest";

import { rendererOptionsWithDefaults } from "./pixi-renderer-options";

describe("workflow graph renderer options", () => {
  test("requires the surface controller to supply the graph", () => {
    expect(() =>
      rendererOptionsWithDefaults({
        debugEnabled: false,
        host: {},
      }),
    ).toThrow(/controller-supplied graph/);
  });

  test("preserves the controller-supplied graph", () => {
    const graph = { edges: [], nodes: [] };

    expect(
      rendererOptionsWithDefaults({
        debugEnabled: false,
        graph,
        host: {},
      }).graph,
    ).toBe(graph);
  });
});
