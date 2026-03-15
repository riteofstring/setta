import { useProjectState } from "state/definitions";
import {
  type CustomRunAction,
  useRunControl,
} from "state/stores/projectStatusStores";

import { findCustomRunById } from "./customRunQueries";
import { getCustomRunsForProjectConfig } from "./customRunStorage";
import { triggerListenerForceRefresh } from "./listeners";
import { runCodeBlock } from "./runCodeExecution";

async function runCustomRunAction(action: CustomRunAction): Promise<void> {
  if (action.type === "runCodeBlock") {
    await runCodeBlock(action.sectionId);
    return;
  }
  await triggerListenerForceRefresh();
}

export async function runCustomRun(
  projectConfigId: string,
  runId: string,
): Promise<void> {
  const runs = getCustomRunsForProjectConfig(projectConfigId);
  const run = findCustomRunById(runs, runId);
  if (!run) {
    return;
  }

  if (run.runMode === "once") {
    await runCustomRunAction(run.action);
    return;
  }

  await toggleContinuousRunForCustomRun(run.id);
}

async function toggleContinuousRunForCustomRun(runId: string): Promise<void> {
  const { runMode, continuousRunStarted, continuousRunCustomRunId } =
    useRunControl.getState();

  const isSameContinuousRun =
    runMode === "continuous" &&
    continuousRunStarted &&
    continuousRunCustomRunId === runId;

  if (isSameContinuousRun) {
    useRunControl.setState({
      continuousRunStarted: false,
      continuousRunCustomRunId: null,
      runMode: "continuous",
    });
    return;
  }

  useRunControl.setState({
    runMode: "continuous",
    continuousRunStarted: true,
    continuousRunCustomRunId: runId,
  });
  await runContinuousTick();
}

export async function runContinuousTick(): Promise<void> {
  const { runMode, continuousRunStarted, continuousRunCustomRunId } =
    useRunControl.getState();

  if (runMode !== "continuous" || !continuousRunStarted) {
    return;
  }

  if (continuousRunCustomRunId === null) {
    await triggerListenerForceRefresh();
    return;
  }

  const projectConfigId = useProjectState.getState().projectConfig.id;
  const runs = getCustomRunsForProjectConfig(projectConfigId);
  const run = findCustomRunById(runs, continuousRunCustomRunId);
  if (!run) {
    await triggerListenerForceRefresh();
    return;
  }

  await runCustomRunAction(run.action);
}
