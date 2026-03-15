import { useProjectState } from "state/definitions";
import { useRunControl } from "state/stores/projectStatusStores";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runFromMainRunButton, stopCode } from "./runCodeControls";

vi.mock("./runCodeExecution", () => ({
  runEntryCodeBlock: vi.fn(async () => {}),
}));

vi.mock("./listeners", () => ({
  triggerListenerForceRefresh: vi.fn(async () => {}),
}));

vi.mock("./notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_kill_subprocesses: vi.fn(),
}));

describe("runCodeControls", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("delegates once-mode main runs to the entry code block", async () => {
    // Main-run clicks in once mode should clear stale continuous metadata and reuse the entry-run action.
    useRunControl.setState({
      runMode: "once",
      continuousRunStarted: true,
      continuousRunCustomRunId: "run-1",
    });

    await runFromMainRunButton();

    const { runEntryCodeBlock } = await import("./runCodeExecution");
    expect(runEntryCodeBlock).toHaveBeenCalledTimes(1);
    expect(useRunControl.getState()).toMatchObject({
      runMode: "once",
      continuousRunStarted: false,
      continuousRunCustomRunId: null,
    });
  });

  it("starts continuous runs by forcing an immediate listener refresh", async () => {
    // Switching a dormant continuous run on should prime the first tick and clear any custom-run pointer.
    useRunControl.setState({
      runMode: "continuous",
      continuousRunStarted: false,
      continuousRunCustomRunId: "stale-run",
    });

    await runFromMainRunButton();

    const { triggerListenerForceRefresh } = await import("./listeners");
    expect(triggerListenerForceRefresh).toHaveBeenCalledTimes(1);
    expect(useRunControl.getState()).toMatchObject({
      runMode: "continuous",
      continuousRunStarted: true,
      continuousRunCustomRunId: null,
    });
  });

  it("toggles active continuous runs back off without triggering another refresh", async () => {
    // A second click in continuous mode should only stop the loop; it should not enqueue another listener tick.
    useRunControl.setState({
      runMode: "continuous",
      continuousRunStarted: true,
      continuousRunCustomRunId: "run-1",
    });

    await runFromMainRunButton();

    const { triggerListenerForceRefresh } = await import("./listeners");
    expect(triggerListenerForceRefresh).not.toHaveBeenCalled();
    expect(useRunControl.getState()).toMatchObject({
      runMode: "continuous",
      continuousRunStarted: false,
      continuousRunCustomRunId: null,
    });
  });

  it("stops subprocesses for the current project config", async () => {
    // Stop should always target the active project config and surface the shared feedback notification.
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });

    await stopCode();

    const { addTemporaryNotification } = await import("./notifications");
    const { route_kill_subprocesses } = await import(
      "utils/generatedEndpoints"
    );
    expect(addTemporaryNotification).toHaveBeenCalledWith(
      "Stopping subprocesses",
    );
    expect(route_kill_subprocesses).toHaveBeenCalledWith({
      projectConfigId: "project-1",
    });
  });
});
