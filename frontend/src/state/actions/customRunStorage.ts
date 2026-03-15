import {
  type CustomRunItem,
  useRunControl,
} from "state/stores/projectStatusStores";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { createNewId } from "utils/idNameCreation";

import {
  findCustomRunForCodeBlock,
  hasEntryCustomRun,
  hasListenerRefreshCustomRun,
} from "./customRunQueries";

export function getCustomRunsForProjectConfig(
  projectConfigId: string,
): Array<CustomRunItem> {
  return (
    useLocalStorage.getState().customRunsByProjectConfigId[projectConfigId] ??
    []
  );
}

export function setCustomRunsForProjectConfig(
  projectConfigId: string,
  customRuns: Array<CustomRunItem>,
): void {
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
): void {
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
): void {
  const runs = getCustomRunsForProjectConfig(projectConfigId);
  const nextRuns = runs.map((run) =>
    run.id === runId ? { ...run, runMode } : run,
  );
  setCustomRunsForProjectConfig(projectConfigId, nextRuns);
}

export function deleteCustomRun(projectConfigId: string, runId: string): void {
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
): void {
  const runs = getCustomRunsForProjectConfig(projectConfigId);
  setCustomRunsForProjectConfig(projectConfigId, [
    ...runs,
    { ...customRun, id: createNewId() },
  ]);
}

export function ensureDefaultCustomRuns(projectConfigId: string): void {
  const runs = getCustomRunsForProjectConfig(projectConfigId);
  const hasEntryRun = hasEntryCustomRun(runs);
  const hasListenerRefreshRun = hasListenerRefreshCustomRun(runs);

  if (hasEntryRun && hasListenerRefreshRun) {
    return;
  }

  if (!hasEntryRun) {
    addCustomRun(projectConfigId, {
      name: "Entry run",
      includeInRunDropdown: true,
      runMode: "once",
      action: { type: "runCodeBlock", sectionId: null },
    });
  }
  if (!hasListenerRefreshRun) {
    addCustomRun(projectConfigId, {
      name: "Listener refresh",
      includeInRunDropdown: false,
      runMode: "continuous",
      action: { type: "triggerListenerForceRefresh" },
    });
  }
}

export function addOrGetCustomRunForCodeBlock(
  projectConfigId: string,
  sectionId: string,
  name: string,
): string {
  const runs = getCustomRunsForProjectConfig(projectConfigId);
  const existing = findCustomRunForCodeBlock(runs, sectionId);
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
