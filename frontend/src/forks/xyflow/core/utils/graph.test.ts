import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetProjectStores } from "state/utils";
import { useNodeInternals } from "state/definitions";
import { screenToFlowPosition } from "../hooks/useViewportHelper";
import type { ReactFlowState } from "../types";
import { getNodesInside, getPaneRect } from "./graph";

vi.mock("../hooks/useViewportHelper", () => ({
  screenToFlowPosition: vi.fn((point) => point),
}));

const mockedScreenToFlowPosition = vi.mocked(screenToFlowPosition);

describe("getPaneRect", () => {
  beforeEach(() => {
    mockedScreenToFlowPosition.mockClear();
    resetProjectStores();
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

describe("getNodesInside", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  it("uses node internals geometry to resolve overlapping nodes", () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            id: "section-a",
            position: { x: 10, y: 20 },
            width: 100,
            height: 80,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
        [
          "section-b",
          {
            id: "section-b",
            position: { x: 180, y: 40 },
            width: 120,
            height: 90,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    });

    expect(
      getNodesInside({ x: 0, y: 0, width: 150, height: 140 }),
    ).toEqual(["section-a"]);
    expect(
      getNodesInside({ x: 0, y: 0, width: 400, height: 200 }),
    ).toEqual(["section-a", "section-b"]);
  });

  it("respects partial-overlap mode without needing DOM section refs", () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            id: "section-a",
            position: { x: 10, y: 20 },
            width: 100,
            height: 80,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    });

    expect(
      getNodesInside({ x: 90, y: 70, width: 40, height: 40 }, [0, 0, 1], false),
    ).toEqual([]);
    expect(
      getNodesInside({ x: 90, y: 70, width: 40, height: 40 }, [0, 0, 1], true),
    ).toEqual(["section-a"]);
  });

  it("treats nodes with unknown dimensions as selectable to preserve existing behavior", () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            id: "section-a",
            position: { x: 10, y: 20 },
            width: null,
            height: null,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    });

    expect(getNodesInside({ x: 500, y: 500, width: 10, height: 10 })).toEqual([
      "section-a",
    ]);
  });
});
