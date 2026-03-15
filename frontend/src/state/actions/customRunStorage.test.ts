import { useRunControl } from "state/stores/projectStatusStores";
import { createDefaultUIPreferenceState } from "state/stores/uiPreferenceState";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it } from "vitest";

import {
  addOrGetCustomRunForCodeBlock,
  deleteCustomRun,
  ensureDefaultCustomRuns,
  getCustomRunsForProjectConfig,
  setCustomRunMode,
  toggleCustomRunInDropdown,
} from "./customRunStorage";

describe("customRunStorage", () => {
  beforeEach(() => {
    resetProjectStores();
    useLocalStorage.setState(createDefaultUIPreferenceState());
  });

  it("seeds the built-in entry and listener refresh runs once per project", () => {
    // Opening the run surfaces repeatedly should not duplicate the built-in custom runs.
    ensureDefaultCustomRuns("project-1");
    ensureDefaultCustomRuns("project-1");

    expect(
      getCustomRunsForProjectConfig("project-1").map((run) => ({
        name: run.name,
        runMode: run.runMode,
        includeInRunDropdown: run.includeInRunDropdown,
        actionType: run.action.type,
      })),
    ).toEqual([
      {
        name: "Entry run",
        runMode: "once",
        includeInRunDropdown: true,
        actionType: "runCodeBlock",
      },
      {
        name: "Listener refresh",
        runMode: "continuous",
        includeInRunDropdown: false,
        actionType: "triggerListenerForceRefresh",
      },
    ]);
  });

  it("reuses an existing code-block custom run instead of appending a duplicate", () => {
    // Adding the same runnable code block twice should keep a stable custom-run id for UI references.
    const firstId = addOrGetCustomRunForCodeBlock(
      "project-1",
      "section-1",
      "Section run",
    );
    const secondId = addOrGetCustomRunForCodeBlock(
      "project-1",
      "section-1",
      "Section run",
    );

    expect(secondId).toBe(firstId);
    expect(getCustomRunsForProjectConfig("project-1")).toHaveLength(1);
  });

  it("updates dropdown inclusion and run mode for the targeted run", () => {
    // Run authoring controls should only update the selected run row.
    const runId = addOrGetCustomRunForCodeBlock(
      "project-1",
      "section-1",
      "Section run",
    );

    toggleCustomRunInDropdown("project-1", runId);
    setCustomRunMode("project-1", runId, "continuous");

    expect(getCustomRunsForProjectConfig("project-1")).toEqual([
      expect.objectContaining({
        id: runId,
        includeInRunDropdown: true,
        runMode: "continuous",
      }),
    ]);
  });

  it("stops the active continuous run when its custom run is deleted", () => {
    // Deleting the currently running continuous custom run should clear the active run-control pointer.
    const runId = addOrGetCustomRunForCodeBlock(
      "project-1",
      "section-1",
      "Section run",
    );
    useRunControl.setState({
      runMode: "continuous",
      continuousRunStarted: true,
      continuousRunCustomRunId: runId,
    });

    deleteCustomRun("project-1", runId);

    expect(getCustomRunsForProjectConfig("project-1")).toEqual([]);
    expect(useRunControl.getState()).toMatchObject({
      continuousRunStarted: false,
      continuousRunCustomRunId: null,
    });
  });
});
