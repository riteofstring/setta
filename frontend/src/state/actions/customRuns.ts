import {
  CustomRunAction,
  CustomRunItem,
  useLocalStorage,
  useProjectState,
} from "state/definitions";
import { useRunControl } from "state/stores/runtimeStores";
import { createNewId } from "utils/idNameCreation";
import { triggerListenerForceRefresh } from "./listeners";
import { runCodeBlock } from "./runOrImportCode";

function getCustomRunsForProjectConfig(
  projectConfigId: string,
): Array<CustomRunItem> {
  return (
    useLocalStorage.getState().customRunsByProjectConfigId[projectConfigId] ??
    []
  );
}

function setCustomRunsForProjectConfig(
  projectConfigId: string,
  customRuns: Array<CustomRunItem>,
) {
  useLocalStorage.setState((state) => ({
    customRunsByProjectConfigId: {
      ...state.customRunsByProjectConfigId,
      [projectConfigId]: customRuns,
    },
  }));
}

export function toggleCustomRunInDropdown(
  projectConfigId: string,
  runId: string,
) {
  const runs = getCustomRunsForProjectConfig(projectConfigId);
  const nextRuns = runs.map((run) =>
    run.id === runId
      ? { ...run, includeInRunDropdown: !run.includeInRunDropdown }
      : run,
  );
  setCustomRunsForProjectConfig(projectConfigId, nextRuns);
}

export function setCustomRunMode(
  projectConfigId: string,
  runId: string,
  runMode: CustomRunItem["runMode"],
) {
  const runs = getCustomRunsForProjectConfig(projectConfigId);
  const nextRuns = runs.map((run) =>
    run.id === runId ? { ...run, runMode } : run,
  );
  setCustomRunsForProjectConfig(projectConfigId, nextRuns);
}

export function deleteCustomRun(projectConfigId: string, runId: string) {
  const runs = getCustomRunsForProjectConfig(projectConfigId);
  const nextRuns = runs.filter((run) => run.id !== runId);
  setCustomRunsForProjectConfig(projectConfigId, nextRuns);

  const { continuousRunCustomRunId, runMode, continuousRunStarted } =
    useRunControl.getState();
  if (
    runMode === "continuous" &&
    continuousRunStarted &&
    continuousRunCustomRunId === runId
  ) {
    useRunControl.setState({
      continuousRunStarted: false,
      continuousRunCustomRunId: null,
    });
  }
}

function addCustomRun(
  projectConfigId: string,
  customRun: Omit<CustomRunItem, "id">,
) {
  const runs = getCustomRunsForProjectConfig(projectConfigId);
  setCustomRunsForProjectConfig(projectConfigId, [
    ...runs,
    { ...customRun, id: createNewId() },
  ]);
}

export function ensureDefaultCustomRuns(projectConfigId: string) {
  const runs = getCustomRunsForProjectConfig(projectConfigId);

  const hasEntryRun = runs.some(
    (run) =>
      run.action.type === "runCodeBlock" && run.action.sectionId === null,
  );
  const hasListenerRefreshRun = runs.some(
    (run) => run.action.type === "triggerListenerForceRefresh",
  );

  if (hasEntryRun && hasListenerRefreshRun) {
    return;
  }

  const nextRuns = [...runs];
  if (!hasEntryRun) {
    nextRuns.push({
      id: createNewId(),
      name: "Entry run",
      includeInRunDropdown: true,
      runMode: "once",
      action: { type: "runCodeBlock", sectionId: null },
    });
  }
  if (!hasListenerRefreshRun) {
    nextRuns.push({
      id: createNewId(),
      name: "Listener refresh",
      includeInRunDropdown: false,
      runMode: "continuous",
      action: { type: "triggerListenerForceRefresh" },
    });
  }
  setCustomRunsForProjectConfig(projectConfigId, nextRuns);
}

export function addOrGetCustomRunForCodeBlock(
  projectConfigId: string,
  sectionId: string,
  name: string,
) {
  const runs = getCustomRunsForProjectConfig(projectConfigId);
  const existing = runs.find(
    (run) =>
      run.action.type === "runCodeBlock" && run.action.sectionId === sectionId,
  );
  if (existing) {
    return existing.id;
  }

  const id = createNewId();
  setCustomRunsForProjectConfig(projectConfigId, [
    ...runs,
    {
      id,
      name,
      includeInRunDropdown: false,
      runMode: "once",
      action: { type: "runCodeBlock", sectionId },
    },
  ]);
  return id;
}

async function runCustomRunAction(action: CustomRunAction) {
  if (action.type === "runCodeBlock") {
    await runCodeBlock(action.sectionId);
    return;
  }
  await triggerListenerForceRefresh();
}

export async function runCustomRun(projectConfigId: string, runId: string) {
  const runs = getCustomRunsForProjectConfig(projectConfigId);
  const run = runs.find((x) => x.id === runId);
  if (!run) {
    return;
  }

  if (run.runMode === "once") {
    await runCustomRunAction(run.action);
    return;
  }

  await toggleContinuousRunForCustomRun(projectConfigId, run.id);
}

async function toggleContinuousRunForCustomRun(
  projectConfigId: string,
  runId: string,
) {
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

export async function runContinuousTick() {
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
  const run = runs.find((x) => x.id === continuousRunCustomRunId);
  if (!run) {
    await triggerListenerForceRefresh();
    return;
  }

  await runCustomRunAction(run.action);
}
