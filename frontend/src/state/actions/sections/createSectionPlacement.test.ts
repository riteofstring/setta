import { useReactFlow } from "forks/xyflow/core/store";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getEmptySpacePosition } from "./createSectionPlacement";

describe("getEmptySpacePosition", () => {
  const initialReactFlowState = useReactFlow.getState();
  const initialOverviewWidth = useLocalStorage.getState().overviewTrueWidth;
  const initialUiEditorWidth = useLocalStorage.getState().uiEditorTrueWidth;

  beforeEach(() => {
    useReactFlow.setState({
      domNode: initialReactFlowState.domNode,
      height: initialReactFlowState.height,
      transform: initialReactFlowState.transform,
      width: initialReactFlowState.width,
    });
    useLocalStorage.setState({
      overviewTrueWidth: initialOverviewWidth,
      uiEditorTrueWidth: initialUiEditorWidth,
    });
  });

  afterEach(() => {
    useReactFlow.setState({
      domNode: initialReactFlowState.domNode,
      height: initialReactFlowState.height,
      transform: initialReactFlowState.transform,
      width: initialReactFlowState.width,
    });
    useLocalStorage.setState({
      overviewTrueWidth: initialOverviewWidth,
      uiEditorTrueWidth: initialUiEditorWidth,
    });
  });

  it("uses the visible pane bounds when the viewport is measured", () => {
    useReactFlow.setState({
      domNode: null,
      height: 600,
      transform: [100, 50, 2],
      width: 800,
    });
    useLocalStorage.setState({
      overviewTrueWidth: 120,
      uiEditorTrueWidth: 80,
    });

    expect(getEmptySpacePosition()).toEqual({ x: 20, y: -15 });
  });

  it("falls back to the transformed origin when pane bounds are unavailable", () => {
    useReactFlow.setState({
      domNode: null,
      height: 0,
      transform: [100, 50, 2],
      width: 0,
    });
    useLocalStorage.setState({
      overviewTrueWidth: 120,
      uiEditorTrueWidth: 80,
    });

    expect(getEmptySpacePosition()).toEqual({ x: 20, y: -15 });
  });
});
