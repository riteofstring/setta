import { describe, expect, it } from "vitest";
import type { ReactFlowState } from "../types";
import { getPaneRect } from "./graph";

describe("getPaneRect", () => {
  it("uses transform math when the dom node is missing", () => {
    const state = {
      domNode: null,
      transform: [10, 20, 2],
      width: 200,
      height: 100,
    } as ReactFlowState;

    const result = getPaneRect(state, 50, 75);

    expect(result).toEqual({ x: 20, y: -10, width: 100, height: 50 });
  });

  it("derives the visible rect from the dom node bounds using transform math", () => {
    const domNode = {
      getBoundingClientRect: () => ({
        left: 100,
        top: 200,
        width: 500,
        height: 400,
      }),
    } as HTMLDivElement;

    const state = {
      domNode,
      transform: [10, 20, 2],
      width: 0,
      height: 0,
    } as ReactFlowState;

    const result = getPaneRect(state, 50, 100);

    expect(result).toEqual({ x: 20, y: -10, width: 175, height: 200 });
  });

  it("uses an override transform when provided", () => {
    const domNode = {
      getBoundingClientRect: () => ({
        left: 100,
        top: 200,
        width: 500,
        height: 400,
      }),
    } as HTMLDivElement;

    const state = {
      domNode,
      transform: [10, 20, 2],
      width: 0,
      height: 0,
    } as ReactFlowState;

    const result = getPaneRect(state, 50, 100, [30, 50, 4]);

    expect(result).toEqual({ x: 5, y: -12.5, width: 87.5, height: 100 });
  });
});
