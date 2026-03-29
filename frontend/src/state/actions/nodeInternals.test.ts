import { useReactFlow } from "forks/xyflow/core/store";
import { useMisc } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fitViewMock = vi.fn();

vi.mock("forks/xyflow/core/store/utils", () => ({
  fitView: (...args: unknown[]) => fitViewMock(...args),
}));

const debouncedRouteSetTopLevelSectionLayoutMock = vi.fn();

vi.mock("./sectionInfos", async () => {
  const actual =
    await vi.importActual<typeof import("./sectionInfos")>("./sectionInfos");
  return {
    ...actual,
    debounced_route_set_top_level_section_layout: (...args: unknown[]) =>
      debouncedRouteSetTopLevelSectionLayoutMock(...args),
  };
});

import { updateNodeDimensions } from "./nodeInternals";

function createReactFlowDomNode() {
  return {
    querySelector: (selector: string) =>
      selector === ".react-flow__viewport" ? {} : null,
  };
}

describe("updateNodeDimensions", () => {
  beforeEach(() => {
    resetProjectStores();
    fitViewMock.mockReset();
    debouncedRouteSetTopLevelSectionLayoutMock.mockReset();
    useMisc.setState({
      numDisplayedCodeAreas: 1,
      numInitializedCodeAreas: 1,
    });
    useReactFlow.setState({
      domNode: createReactFlowDomNode(),
      fitViewOnInit: true,
      fitViewOnInitDone: false,
      fitViewOnInitOptions: { nodes: [{ id: "section-1" }] },
    });
  });

  it("returns false when the viewport shell is not mounted yet", () => {
    useReactFlow.setState({ domNode: null });

    expect(updateNodeDimensions([])).toBe(false);
    expect(fitViewMock).not.toHaveBeenCalled();
  });

  it("returns false while code areas are still initializing", () => {
    useMisc.setState({
      numDisplayedCodeAreas: 2,
      numInitializedCodeAreas: 1,
    });

    expect(updateNodeDimensions([])).toBe(false);
    expect(fitViewMock).not.toHaveBeenCalled();
  });

  it("returns false until the initial fit-view pass succeeds", () => {
    fitViewMock.mockReturnValue(false);

    expect(updateNodeDimensions([])).toBe(false);
    expect(useReactFlow.getState().fitViewOnInitDone).toBe(false);
    expect(fitViewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initial: true,
        nodes: [{ id: "section-1" }],
      }),
    );
  });

  it("returns true once the initial fit-view pass succeeds", () => {
    fitViewMock.mockReturnValue(true);

    expect(updateNodeDimensions([])).toBe(true);
    expect(useReactFlow.getState().fitViewOnInitDone).toBe(true);
  });
});
