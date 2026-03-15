import _ from "lodash";
import {
  clearScheduledActiveSectionBackendSync,
  disableActiveSectionUIBackendHydration,
  failPendingActiveSectionBackendSyncOp,
  getScheduledActiveSectionBackendSync,
  markPendingActiveSectionBackendSyncOp,
  restoreBackendAuthoritativeActiveSectionUIIds,
  schedulePendingActiveSectionBackendSync,
} from "state/activeSectionBackendSync";
import {
  getActiveSectionUIIds,
  getActiveSectionUISelectionGeneration,
  setActiveSectionUIIds,
} from "state/activeSectionSelection";
import { NULL_PROJECT_CONFIG_ID, useServerMode } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_set_active_ids } from "utils/generatedEndpoints";
import { createNewId } from "utils/idNameCreation";
import { getCurrProjectConfigId } from "./sectionInfos";

let pendingProjectActiveIdsAnimationFrame: number | null = null;

type SetActiveSectionIdsSyncMode = "auto" | "ui-only" | "immediate";

export type SetActiveSectionIdsOptions = {
  syncMode?: SetActiveSectionIdsSyncMode;
  forceDurableSync?: boolean;
};

function sendProjectActiveSectionIdsToBackend(
  projectConfigId: string | null | undefined,
  ids: Array<string>,
  generation: number,
) {
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    const serverMode = useServerMode.getState();
    if (serverMode.modeResolved && serverMode.mode === "app") {
      return;
    }
    console.warn(
      `Skipping route_set_active_ids because projectConfigId is ${String(
        projectConfigId,
      )}.`,
    );
    return;
  }
  const frontendOpId = createNewId();
  markPendingActiveSectionBackendSyncOp(frontendOpId, generation);
  void route_set_active_ids({
    projectConfigId,
    activeIds: ids,
    frontendOpId,
  })
    .then((res) => {
      if (res200(res)) {
        return;
      }
      failPendingActiveSectionBackendSyncOp(frontendOpId);
    })
    .catch(() => {
      failPendingActiveSectionBackendSyncOp(frontendOpId);
    });
}

function shouldDeferProjectActiveSectionIdsSync() {
  if (typeof window === "undefined") {
    return false;
  }
  const projectConfigId = getCurrProjectConfigId();
  return (
    projectConfigId !== null &&
    projectConfigId !== undefined &&
    projectConfigId !== NULL_PROJECT_CONFIG_ID
  );
}

function cancelPendingProjectActiveIdsSync() {
  if (
    pendingProjectActiveIdsAnimationFrame !== null &&
    typeof window !== "undefined"
  ) {
    window.cancelAnimationFrame(pendingProjectActiveIdsAnimationFrame);
  }
  pendingProjectActiveIdsAnimationFrame = null;
  clearScheduledActiveSectionBackendSync();
}

export function cancelPendingActiveSectionIdsSync() {
  cancelPendingProjectActiveIdsSync();
}

export function restoreBackendAuthoritativeActiveSectionIds(
  ids: Array<string>,
) {
  cancelPendingProjectActiveIdsSync();
  restoreBackendAuthoritativeActiveSectionUIIds(ids);
}

function flushPendingProjectActiveIdsSync() {
  const scheduledSync = getScheduledActiveSectionBackendSync();
  pendingProjectActiveIdsAnimationFrame = null;
  if (scheduledSync === null) {
    return;
  }
  const currentProjectConfigId = getCurrProjectConfigId();
  if (scheduledSync.projectConfigId !== currentProjectConfigId) {
    clearScheduledActiveSectionBackendSync(scheduledSync.projectConfigId);
    return;
  }
  clearScheduledActiveSectionBackendSync(scheduledSync.projectConfigId);
  sendProjectActiveSectionIdsToBackend(
    scheduledSync.projectConfigId,
    scheduledSync.activeIds,
    scheduledSync.generation,
  );
}

function scheduleProjectActiveSectionIdsSync(
  projectConfigId: string,
  ids: Array<string>,
) {
  schedulePendingActiveSectionBackendSync(
    projectConfigId,
    ids,
    getActiveSectionUISelectionGeneration(),
  );
  if (typeof window === "undefined") {
    flushPendingProjectActiveIdsSync();
    return;
  }
  if (pendingProjectActiveIdsAnimationFrame !== null) {
    window.cancelAnimationFrame(pendingProjectActiveIdsAnimationFrame);
  }
  pendingProjectActiveIdsAnimationFrame = window.requestAnimationFrame(() => {
    flushPendingProjectActiveIdsSync();
  });
}

export function setActiveSectionIds(
  ids: Array<string>,
  options: SetActiveSectionIdsOptions = {},
) {
  const { syncMode = "auto", forceDurableSync = false } = options;
  const currentUIActiveIds = getActiveSectionUIIds();
  const uiChanged = !_.isEqual(currentUIActiveIds, ids);

  if (uiChanged) {
    setActiveSectionUIIds(ids);
  }

  if (syncMode === "ui-only") {
    cancelPendingProjectActiveIdsSync();
    disableActiveSectionUIBackendHydration();
    return;
  }

  if (!uiChanged && !forceDurableSync) {
    return;
  }

  const resolvedSyncMode =
    syncMode === "immediate"
      ? "immediate"
      : shouldDeferProjectActiveSectionIdsSync()
        ? "deferred"
        : "immediate";

  if (resolvedSyncMode === "immediate") {
    const projectConfigId = getCurrProjectConfigId();
    cancelPendingProjectActiveIdsSync();
    disableActiveSectionUIBackendHydration();
    sendProjectActiveSectionIdsToBackend(
      projectConfigId,
      ids,
      getActiveSectionUISelectionGeneration(),
    );
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    throw new Error("Deferred active-section sync requires a real project id.");
  }
  disableActiveSectionUIBackendHydration();
  scheduleProjectActiveSectionIdsSync(projectConfigId, ids);
}
