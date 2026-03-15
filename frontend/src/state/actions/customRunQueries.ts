import type { CustomRunItem } from "state/stores/projectStatusStores";

export function getCustomRunDropdownRuns(
  runs: Array<CustomRunItem>,
): Array<CustomRunItem> {
  return runs.filter((run) => run.includeInRunDropdown);
}

export function findCustomRunById(
  runs: Array<CustomRunItem>,
  runId: string,
): CustomRunItem | undefined {
  return runs.find((run) => run.id === runId);
}

export function findCustomRunForCodeBlock(
  runs: Array<CustomRunItem>,
  sectionId: string,
): CustomRunItem | undefined {
  return runs.find(
    (run) =>
      run.action.type === "runCodeBlock" && run.action.sectionId === sectionId,
  );
}

export function hasEntryCustomRun(runs: Array<CustomRunItem>): boolean {
  return runs.some(
    (run) =>
      run.action.type === "runCodeBlock" && run.action.sectionId === null,
  );
}

export function hasListenerRefreshCustomRun(
  runs: Array<CustomRunItem>,
): boolean {
  return runs.some((run) => run.action.type === "triggerListenerForceRefresh");
}
