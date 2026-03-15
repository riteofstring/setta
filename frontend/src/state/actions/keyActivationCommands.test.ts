import { useReactFlow } from "forks/xyflow/core/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const edgeMutationMocks = vi.hoisted(() => ({
  deleteSelectedEdges: vi.fn(),
  deleteSelectedAgenticEdges: vi.fn(),
  deleteSelectedStateMachineEdges: vi.fn(),
  deleteAllActiveSections: vi.fn(),
}));

vi.mock("./edges", () => ({
  deleteSelectedEdges: edgeMutationMocks.deleteSelectedEdges,
}));

vi.mock("./agenticEdgeSelectionMutations", () => ({
  deleteSelectedAgenticEdges: edgeMutationMocks.deleteSelectedAgenticEdges,
}));

vi.mock("./stateMachineEdgeMutations", () => ({
  deleteSelectedStateMachineEdges:
    edgeMutationMocks.deleteSelectedStateMachineEdges,
}));

vi.mock("./projectStateCommands", async () => {
  const actual = await vi.importActual<typeof import("./projectStateCommands")>(
    "./projectStateCommands",
  );
  return {
    ...actual,
    deleteAllActiveSections: edgeMutationMocks.deleteAllActiveSections,
  };
});

import {
  activateMoveSectionMode,
  activatePanMode,
  activateSelectionKeyPressed,
  activateZoomMode,
  deactivateMoveSectionMode,
  deactivatePanMode,
  deactivateSelectionKeyPressed,
  deactivateZoomMode,
  deleteEdgesOrSections,
} from "./keyActivationCommands";

describe("keyActivationCommands", () => {
  const initialReactFlowState = useReactFlow.getState();

  beforeEach(() => {
    vi.clearAllMocks();
    useReactFlow.setState({
      moveSectionActivationKeyPressed:
        initialReactFlowState.moveSectionActivationKeyPressed,
      panActivationKeyPressed: initialReactFlowState.panActivationKeyPressed,
      selectionKeyPressed: initialReactFlowState.selectionKeyPressed,
      zoomActivationKeyPressed: initialReactFlowState.zoomActivationKeyPressed,
    });
  });

  afterEach(() => {
    useReactFlow.setState({
      moveSectionActivationKeyPressed:
        initialReactFlowState.moveSectionActivationKeyPressed,
      panActivationKeyPressed: initialReactFlowState.panActivationKeyPressed,
      selectionKeyPressed: initialReactFlowState.selectionKeyPressed,
      zoomActivationKeyPressed: initialReactFlowState.zoomActivationKeyPressed,
    });
  });

  it("falls back to deleting active sections only when no edge deletion succeeds", () => {
    edgeMutationMocks.deleteSelectedEdges.mockReturnValue(false);
    edgeMutationMocks.deleteSelectedAgenticEdges.mockReturnValue(false);
    edgeMutationMocks.deleteSelectedStateMachineEdges.mockReturnValue(false);

    deleteEdgesOrSections();

    expect(edgeMutationMocks.deleteAllActiveSections).toHaveBeenCalledTimes(1);

    edgeMutationMocks.deleteAllActiveSections.mockClear();
    edgeMutationMocks.deleteSelectedEdges.mockReturnValue(true);

    deleteEdgesOrSections();

    expect(edgeMutationMocks.deleteAllActiveSections).not.toHaveBeenCalled();
  });

  it("toggles the React Flow interaction-mode flags", () => {
    activateSelectionKeyPressed();
    activatePanMode();
    activateZoomMode();
    activateMoveSectionMode();

    expect(useReactFlow.getState().selectionKeyPressed).toBe(true);
    expect(useReactFlow.getState().panActivationKeyPressed).toBe(true);
    expect(useReactFlow.getState().zoomActivationKeyPressed).toBe(true);
    expect(useReactFlow.getState().moveSectionActivationKeyPressed).toBe(true);

    deactivateSelectionKeyPressed();
    deactivatePanMode();
    deactivateZoomMode();
    deactivateMoveSectionMode();

    expect(useReactFlow.getState().selectionKeyPressed).toBe(false);
    expect(useReactFlow.getState().panActivationKeyPressed).toBe(false);
    expect(useReactFlow.getState().zoomActivationKeyPressed).toBe(false);
    expect(useReactFlow.getState().moveSectionActivationKeyPressed).toBe(false);
  });
});
