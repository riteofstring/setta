import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ReactFlowState } from "../types";
import { screenToFlowPosition } from "../hooks/useViewportHelper";
import { getPaneRect } from "./graph";

vi.mock("../hooks/useViewportHelper", () => ({
  screenToFlowPosition: vi.fn((point) => point),
}));

const mockedScreenToFlowPosition = vi.mocked(screenToFlowPosition);

describe("getPaneRect", () => {
  beforeEach(() => {
    mockedScreenToFlowPosition.mockClear();
  });

  it("uses transform math when the dom node is missing", () => {
    const state = {
      domNode: null,
      transform: [10, 20, 2],
      width: 200,
      height: 100,
    } as ReactFlowState;

    const result = getPaneRect(state, 50, 75);

    expect(result).toEqual({ x: 20, y: -10, width: 100, height: 50 });
    expect(mockedScreenToFlowPosition).not.toHaveBeenCalled();
  });

  it("derives the visible rect from the dom node bounds", () => {
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
      transform: [0, 0, 1],
      width: 0,
      height: 0,
    } as ReactFlowState;

    const result = getPaneRect(state, 50, 100);

    expect(result).toEqual({ x: 150, y: 200, width: 350, height: 400 });
    expect(mockedScreenToFlowPosition).toHaveBeenCalledWith(
      { x: 150, y: 200 },
      true,
    );
    expect(mockedScreenToFlowPosition).toHaveBeenCalledWith(
      { x: 500, y: 600 },
      true,
    );
  });
});
