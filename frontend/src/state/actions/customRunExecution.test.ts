import { useProjectState } from "state/definitions";
import { useRunControl } from "state/stores/projectStatusStores";
import { createDefaultUIPreferenceState } from "state/stores/uiPreferenceState";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runContinuousTick, runCustomRun } from "./customRunExecution";

vi.mock("./listeners", () => ({
  triggerListenerForceRefresh: vi.fn(async () => {}),
}));

vi.mock("./runCodeExecution", () => ({
  runCodeBlock: vi.fn(async () => {}),
}));

describe("customRunExecution", () => {
  beforeEach(() => {
    resetProjectStores();
    useLocalStorage.setState(createDefaultUIPreferenceState());
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
    vi.clearAllMocks();
  });

  it("runs one-shot custom code-block actions directly", async () => {
    // Once-mode custom runs should dispatch immediately without changing continuous-run state.
    const { runCodeBlock } = await import("./runCodeExecution");
    useLocalStorage.setState({
      customRunsByProjectConfigId: {
        "project-1": [
          {
            id: "run-1",
            name: "Section run",
            includeInRunDropdown: true,
            runMode: "once",
            action: { type: "runCodeBlock", sectionId: "section-1" },
          },
        ],
      },
    });

    await runCustomRun("project-1", "run-1");

    expect(runCodeBlock).toHaveBeenCalledWith("section-1");
    expect(useRunControl.getState()).toMatchObject({
      runMode: "once",
      continuousRunStarted: false,
      continuousRunCustomRunId: null,
    });
  });

  it("starts a continuous run, executes its first tick, and toggles it back off", async () => {
    // Continuous custom runs should own the run-control pointer until the same run is toggled off again.
    const { triggerListenerForceRefresh } = await import("./listeners");
    useLocalStorage.setState({
      customRunsByProjectConfigId: {
        "project-1": [
          {
            id: "run-1",
            name: "Listener refresh",
            includeInRunDropdown: false,
            runMode: "continuous",
            action: { type: "triggerListenerForceRefresh" },
          },
        ],
      },
    });

    await runCustomRun("project-1", "run-1");

    expect(triggerListenerForceRefresh).toHaveBeenCalledTimes(1);
    expect(useRunControl.getState()).toMatchObject({
      runMode: "continuous",
      continuousRunStarted: true,
      continuousRunCustomRunId: "run-1",
    });

    await runCustomRun("project-1", "run-1");

    expect(triggerListenerForceRefresh).toHaveBeenCalledTimes(1);
    expect(useRunControl.getState()).toMatchObject({
      runMode: "continuous",
      continuousRunStarted: false,
      continuousRunCustomRunId: null,
    });
  });

  it("falls back to listener refresh when the active continuous run cannot be resolved", async () => {
    // Listener refresh should remain the safe fallback for continuous mode when the stored custom run disappears.
    const { triggerListenerForceRefresh } = await import("./listeners");
    useRunControl.setState({
      runMode: "continuous",
      continuousRunStarted: true,
      continuousRunCustomRunId: "missing-run",
    });

    await runContinuousTick();

    expect(triggerListenerForceRefresh).toHaveBeenCalledTimes(1);
  });
});
