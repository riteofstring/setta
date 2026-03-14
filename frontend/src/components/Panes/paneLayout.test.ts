import { useLocalStorage } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { CLOSED_PANE_WIDTH, PaneNameEnum } from "utils/constants/panes";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getPaneMaxWidthForViewport,
  normalizePaneWidthForViewportChange,
  resetPaneLayoutTransientStateForTests,
  setPaneFullWidth,
  setPaneWidthWithLayout,
  togglePaneFullWidth,
  togglePaneVisibility,
} from "./paneLayout";

function setViewportWidth(width: number) {
  const nextWindow =
    typeof globalThis.window === "object" && globalThis.window
      ? globalThis.window
      : ({} as Window);
  Object.defineProperty(nextWindow, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: nextWindow,
  });
}

describe("pane layout helpers", () => {
  beforeEach(() => {
    resetProjectStores();
    resetPaneLayoutTransientStateForTests();
    setViewportWidth(1400);
    useLocalStorage.setState({
      overviewVis: true,
      overviewWidth: 335,
      overviewTrueWidth: 335,
      uiEditorVis: false,
      uiEditorWidth: 500,
      uiEditorTrueWidth: CLOSED_PANE_WIDTH,
    });
  });

  it("shrinks the opposite pane just enough when opening from the other side", () => {
    // Opening the right pane should preserve both panes when possible by reducing
    // only the necessary width on the already-open left pane.
    useLocalStorage.setState({
      overviewVis: true,
      overviewWidth: 1050,
      overviewTrueWidth: 1050,
      uiEditorVis: false,
      uiEditorWidth: 500,
      uiEditorTrueWidth: CLOSED_PANE_WIDTH,
    });

    togglePaneVisibility(PaneNameEnum.uiEditor);

    const state = useLocalStorage.getState();
    expect(state.uiEditorVis).toBe(true);
    expect(state.uiEditorTrueWidth).toBe(500);
    expect(state.overviewVis).toBe(true);
    expect(state.overviewTrueWidth).toBe(900);
  });

  it("closes the full-width pane when opening the opposing pane", () => {
    // If one pane already occupies full width, opening the opposite side should
    // close the full-width pane instead of forcing both into unusable sizes.
    setViewportWidth(1200);
    const fullWidth = getPaneMaxWidthForViewport(1200);
    useLocalStorage.setState({
      overviewVis: true,
      overviewWidth: fullWidth,
      overviewTrueWidth: fullWidth,
      uiEditorVis: false,
      uiEditorWidth: 500,
      uiEditorTrueWidth: CLOSED_PANE_WIDTH,
    });

    togglePaneVisibility(PaneNameEnum.uiEditor);

    const state = useLocalStorage.getState();
    expect(state.overviewVis).toBe(false);
    expect(state.overviewTrueWidth).toBe(CLOSED_PANE_WIDTH);
    expect(state.uiEditorVis).toBe(true);
    expect(state.uiEditorTrueWidth).toBe(500);
  });

  it("supports explicit full-width mode and closes the opposite pane", () => {
    // Full-screen is modeled as full-width pane sizing with the opposing pane
    // collapsed to its icon rail width.
    setViewportWidth(1300);
    setPaneFullWidth(PaneNameEnum.overview);

    const state = useLocalStorage.getState();
    expect(state.overviewVis).toBe(true);
    expect(state.overviewTrueWidth).toBe(getPaneMaxWidthForViewport(1300));
    expect(state.uiEditorVis).toBe(false);
    expect(state.uiEditorTrueWidth).toBe(CLOSED_PANE_WIDTH);
  });

  it("restores the previous pane width when toggling full-width off", () => {
    setViewportWidth(1300);
    useLocalStorage.setState({
      overviewVis: true,
      overviewWidth: 460,
      overviewTrueWidth: 460,
      uiEditorVis: false,
      uiEditorWidth: 500,
      uiEditorTrueWidth: CLOSED_PANE_WIDTH,
    });

    togglePaneFullWidth(PaneNameEnum.overview);
    expect(useLocalStorage.getState().overviewTrueWidth).toBe(
      getPaneMaxWidthForViewport(1300),
    );

    togglePaneFullWidth(PaneNameEnum.overview);
    const restoredState = useLocalStorage.getState();
    expect(restoredState.overviewVis).toBe(true);
    expect(restoredState.overviewTrueWidth).toBe(460);
    expect(restoredState.uiEditorVis).toBe(false);
  });

  it("resizes a single open pane up to full width", () => {
    setViewportWidth(1280);
    useLocalStorage.setState({
      overviewVis: true,
      uiEditorVis: false,
      uiEditorTrueWidth: CLOSED_PANE_WIDTH,
    });

    setPaneWidthWithLayout(PaneNameEnum.overview, 9999);

    expect(useLocalStorage.getState().overviewTrueWidth).toBe(
      getPaneMaxWidthForViewport(1280),
    );
  });

  it("keeps full-width panes pinned to viewport max after viewport resize", () => {
    // Full-screen should stay full-screen as viewport size changes.
    const previousViewportWidth = 1200;
    const nextViewportWidth = 1440;
    const previousMax = getPaneMaxWidthForViewport(previousViewportWidth);

    const normalizedWidth = normalizePaneWidthForViewportChange({
      paneName: PaneNameEnum.overview,
      width: previousMax,
      viewportWidth: nextViewportWidth,
      previousViewportWidth,
    });

    expect(normalizedWidth).toBe(getPaneMaxWidthForViewport(nextViewportWidth));
  });

  it("supports home pane ids with paired layout behavior", () => {
    setViewportWidth(1200);
    useLocalStorage.setState({
      homeWorkspacePaneVis: true,
      homeWorkspacePaneWidth: 1040,
      homeWorkspacePaneTrueWidth: 1040,
      homeSelectedProjectPaneVis: false,
      homeSelectedProjectPaneWidth: 280,
      homeSelectedProjectPaneTrueWidth: CLOSED_PANE_WIDTH,
    });

    togglePaneVisibility(PaneNameEnum.homeSelectedProject);

    const state = useLocalStorage.getState();
    expect(state.homeSelectedProjectPaneVis).toBe(true);
    expect(state.homeSelectedProjectPaneTrueWidth).toBe(280);
    expect(state.homeWorkspacePaneVis).toBe(true);
    expect(state.homeWorkspacePaneTrueWidth).toBe(920);
  });

  it("closes a full-width home pane when opening the opposite home pane", () => {
    setViewportWidth(1200);
    const fullWidth = getPaneMaxWidthForViewport(1200);
    useLocalStorage.setState({
      homeWorkspacePaneVis: true,
      homeWorkspacePaneWidth: fullWidth,
      homeWorkspacePaneTrueWidth: fullWidth,
      homeSelectedProjectPaneVis: false,
      homeSelectedProjectPaneWidth: 280,
      homeSelectedProjectPaneTrueWidth: CLOSED_PANE_WIDTH,
    });

    togglePaneVisibility(PaneNameEnum.homeSelectedProject);

    const state = useLocalStorage.getState();
    expect(state.homeWorkspacePaneVis).toBe(false);
    expect(state.homeWorkspacePaneTrueWidth).toBe(CLOSED_PANE_WIDTH);
    expect(state.homeSelectedProjectPaneVis).toBe(true);
    expect(state.homeSelectedProjectPaneTrueWidth).toBe(280);
  });
});
