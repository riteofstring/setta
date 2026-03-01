import { useLocalStorage, useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { CLOSED_PANE_WIDTH, OverviewTabNameEnum } from "utils/constants";
import { createSettingsState } from "utils/generatedTypes";
import { beforeEach, describe, expect, it } from "vitest";
import { openOverviewTab } from "./paneFns";

describe("openOverviewTab", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    useSettings.setState((state) => ({
      gui: {
        ...state.gui,
        leftSidePaneShiftsMap: false,
      },
    }));
    useLocalStorage.setState({
      overviewVis: false,
      overviewTab: OverviewTabNameEnum.Overview,
      overviewWidth: 335,
      overviewTrueWidth: CLOSED_PANE_WIDTH,
      uiEditorVis: false,
      uiEditorWidth: 500,
      uiEditorTrueWidth: CLOSED_PANE_WIDTH,
    });
  });

  it("opens the overview pane and switches to the requested tab when hidden", () => {
    openOverviewTab(OverviewTabNameEnum.RunInstructions);

    const state = useLocalStorage.getState();
    expect(state.overviewVis).toBe(true);
    expect(state.overviewTab).toBe(OverviewTabNameEnum.RunInstructions);
  });

  it("keeps the overview pane visible when the requested tab is already selected", () => {
    useLocalStorage.setState({
      overviewVis: true,
      overviewTab: OverviewTabNameEnum.RunInstructions,
    });

    openOverviewTab(OverviewTabNameEnum.RunInstructions);

    expect(useLocalStorage.getState().overviewVis).toBe(true);
    expect(useLocalStorage.getState().overviewTab).toBe(
      OverviewTabNameEnum.RunInstructions,
    );
  });
});
