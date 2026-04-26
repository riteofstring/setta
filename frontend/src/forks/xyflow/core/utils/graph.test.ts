import { setActiveSectionUIIds } from "state/activeSectionUI";
import {
  useLocalStorage,
  useNodeInternals,
  useProjectState,
  useSectionRefs,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createCore } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screenToFlowPosition } from "../hooks/useViewportHelper";
import { useReactFlow } from "../store";
import initialState from "../store/initialState";
import type { ReactFlowState } from "../types";
import {
  getActiveSectionsBounds,
  getNodesInside,
  getPaneRect,
  movePaneToIncludeElement,
} from "./graph";

vi.mock("../hooks/useViewportHelper", () => ({
  screenToFlowPosition: vi.fn((point) => point),
}));

const mockedScreenToFlowPosition = vi.mocked(screenToFlowPosition);

function createSectionElement(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return {
    clientWidth: rect.width,
    clientHeight: rect.height,
    getBoundingClientRect: () => ({
      x: rect.x,
      y: rect.y,
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      width: rect.width,
      height: rect.height,
      toJSON: () => "",
    }),
  } as unknown as HTMLElement;
}

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

describe("movePaneToIncludeElement", () => {
  beforeEach(() => {
    mockedScreenToFlowPosition.mockClear();
    useReactFlow.setState({ ...initialState });
    useLocalStorage.setState({
      overviewTrueWidth: 0,
      uiEditorTrueWidth: 0,
    });
  });

  it("updates the canvas transform directly when the element is outside the padded pane", () => {
    useReactFlow.setState({
      domNode: null,
      height: 800,
      transform: [0, 0, 2],
      width: 1000,
    });

    movePaneToIncludeElement(
      createSectionElement({
        x: 50,
        y: 250,
        width: 40,
        height: 40,
      }),
    );

    expect(useReactFlow.getState().transform).toEqual([100, 0, 2]);
  });

  it("leaves the transform unchanged when the element is already inside the padded pane", () => {
    useReactFlow.setState({
      domNode: null,
      height: 800,
      transform: [20, 30, 2],
      width: 1000,
    });

    movePaneToIncludeElement(
      createSectionElement({
        x: 250,
        y: 200,
        width: 40,
        height: 40,
      }),
    );

    expect(useReactFlow.getState().transform).toEqual([20, 30, 2]);
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

    expect(getNodesInside({ x: 0, y: 0, width: 150, height: 140 })).toEqual([
      "section-a",
    ]);
    expect(getNodesInside({ x: 0, y: 0, width: 400, height: 200 })).toEqual([
      "section-a",
      "section-b",
    ]);
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

  it("does not select unmeasured nodes when no fallback bounds overlap", () => {
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

    expect(getNodesInside({ x: 500, y: 500, width: 10, height: 10 })).toEqual(
      [],
    );
  });

  it("falls back to section DOM bounds for unmeasured node internals", () => {
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
    useSectionRefs.setState((state) => {
      state.selfOnly["section-a"] = createSectionElement({
        x: 40,
        y: 60,
        width: 120,
        height: 80,
      });
    });

    expect(getNodesInside({ x: 30, y: 50, width: 140, height: 100 })).toEqual([
      "section-a",
    ]);
    expect(getNodesInside({ x: 500, y: 500, width: 10, height: 10 })).toEqual(
      [],
    );
  });

  it("treats zero-sized node internals as unmeasured for marquee hit testing", () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-width-zero",
          {
            id: "section-width-zero",
            position: { x: 1000, y: 1000 },
            width: 0,
            height: 40,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
        [
          "section-height-zero",
          {
            id: "section-height-zero",
            position: { x: 1000, y: 1080 },
            width: 40,
            height: 0,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    });

    expect(getNodesInside({ x: 0, y: 0, width: 20, height: 20 })).toEqual([]);
  });

  it("falls back to section DOM bounds when node internals have zero-sized geometry", () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            id: "section-a",
            position: { x: 10, y: 20 },
            width: 0,
            height: 40,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    });
    useSectionRefs.setState((state) => {
      state.selfOnly["section-a"] = createSectionElement({
        x: 40,
        y: 60,
        width: 120,
        height: 80,
      });
    });

    expect(getNodesInside({ x: 30, y: 50, width: 140, height: 100 })).toEqual([
      "section-a",
    ]);
  });

  it("falls back to nested section DOM geometry when a selectable section has no node internals entry", () => {
    useProjectState.setState((state) => {
      state.sections["group-section"] = createCore({ id: "group-section" });
      state.sections["group-child-a"] = createCore({ id: "group-child-a" });
    });
    useNodeInternals.setState({
      x: new Map([
        [
          "group-section",
          {
            id: "group-section",
            position: { x: 300, y: 120 },
            width: 260,
            height: 220,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    });
    useSectionRefs.setState((state) => {
      state.selfOnly["group-child-a"] = createSectionElement({
        x: 360,
        y: 180,
        width: 120,
        height: 64,
      });
    });

    expect(getNodesInside({ x: 350, y: 170, width: 140, height: 84 })).toEqual([
      "group-child-a",
    ]);
  });
});

describe("getActiveSectionsBounds", () => {
  beforeEach(() => {
    mockedScreenToFlowPosition.mockClear();
    resetProjectStores();
  });

  it("uses node internals geometry for active section bounds without DOM refs", () => {
    setActiveSectionUIIds(["section-a", "section-b"]);
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

    expect(getActiveSectionsBounds()).toEqual({
      x: 10,
      y: 20,
      width: 290,
      height: 110,
    });
    expect(mockedScreenToFlowPosition).not.toHaveBeenCalled();
  });

  it("falls back to DOM bounds when active node internals have zero-sized geometry", () => {
    setActiveSectionUIIds(["section-a"]);
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            id: "section-a",
            position: { x: 10, y: 20 },
            width: 0,
            height: 0,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    });
    useSectionRefs.setState((state) => {
      state.selfOnly["section-a"] = createSectionElement({
        x: 40,
        y: 60,
        width: 120,
        height: 80,
      });
    });

    expect(getActiveSectionsBounds()).toEqual({
      x: 40,
      y: 60,
      width: 120,
      height: 80,
    });
  });
});
