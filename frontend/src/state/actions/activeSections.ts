import {
  callOpenAPI,
  createNewId,
  res200,
} from "@setta/app-subsystem-frontend-sdk";
import _ from "lodash";
import { setActiveIds } from "openapi/http";
import {
  clearScheduledActiveSectionBackendSync,
  disableActiveSectionUIBackendHydration,
  failPendingActiveSectionBackendSyncOp,
  getActiveSectionUIIds,
  getActiveSectionUISelectionGeneration,
  getScheduledActiveSectionBackendSync,
  markPendingActiveSectionBackendSyncOp,
  restoreBackendAuthoritativeActiveSectionUIIds,
  schedulePendingActiveSectionBackendSync,
  setActiveSectionUIIds,
} from "state/activeSectionUI";
import {
  NULL_PROJECT_CONFIG_ID,
  useProjectState,
  useServerMode,
} from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import {
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  getTopLevelSectionIdsForDisplay,
} from "./sectionInfos";
import { getAllVisibleParamsInSection } from "./sections/sectionContents";
let pendingProjectActiveIdsAnimationFrame: number | null = null;
type SetActiveSectionIdsSyncMode = "auto" | "ui-only" | "immediate";
export type SetActiveSectionIdsOptions = {
  syncMode?: SetActiveSectionIdsSyncMode;
  forceDurableSync?: boolean;
};

type ActiveSectionSyncPlan =
  | { kind: "ui-only" }
  | { kind: "skip" }
  | {
      kind: "immediate";
      projectConfigId: string | null | undefined;
      generation: number;
    }
  | {
      kind: "deferred";
      projectConfigId: string;
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
      `Skipping route_set_active_ids because projectConfigId is ${String(projectConfigId)}.`,
    );
    return;
  }
  const frontendOpId = createNewId();
  markPendingActiveSectionBackendSyncOp(frontendOpId, generation);
  void callOpenAPI(
    setActiveIds({
      body: {
        projectConfigId,
        activeIds: ids,
        frontendOpId,
      },
    } as Parameters<typeof setActiveIds>[0]),
  )
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

function resolveActiveSectionSyncPlan(
  uiChanged: boolean,
  syncMode: SetActiveSectionIdsSyncMode,
  forceDurableSync: boolean,
): ActiveSectionSyncPlan {
  if (syncMode === "ui-only") {
    return { kind: "ui-only" };
  }
  if (!uiChanged && !forceDurableSync) {
    return { kind: "skip" };
  }
  const projectConfigId = getCurrProjectConfigId();
  if (syncMode === "immediate" || !shouldDeferProjectActiveSectionIdsSync()) {
    return {
      kind: "immediate",
      projectConfigId,
      generation: getActiveSectionUISelectionGeneration(),
    };
  }
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    throw new Error("Deferred active-section sync requires a real project id.");
  }
  return { kind: "deferred", projectConfigId };
}

function runActiveSectionSyncPlan(
  plan: ActiveSectionSyncPlan,
  ids: Array<string>,
) {
  switch (plan.kind) {
    case "ui-only":
      cancelPendingProjectActiveIdsSync();
      disableActiveSectionUIBackendHydration();
      return;
    case "skip":
      return;
    case "immediate":
      cancelPendingProjectActiveIdsSync();
      disableActiveSectionUIBackendHydration();
      sendProjectActiveSectionIdsToBackend(
        plan.projectConfigId,
        ids,
        plan.generation,
      );
      return;
    case "deferred":
      disableActiveSectionUIBackendHydration();
      scheduleProjectActiveSectionIdsSync(plan.projectConfigId, ids);
      return;
  }
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
  const plan = resolveActiveSectionSyncPlan(
    uiChanged,
    syncMode,
    forceDurableSync,
  );
  runActiveSectionSyncPlan(plan, ids);
}
export function pruneActiveSectionIdsForViewMode(
  viewModeId: string | null | undefined,
  isEditingViewMode: boolean,
) {
  if (isEditingViewMode) {
    return;
  }
  const state = useProjectState.getState();
  const resolvedViewModeId = viewModeId ?? state.projectConfig.activeViewModeId;
  if (!resolvedViewModeId) {
    return;
  }
  const viewMode = state.projectConfig.viewModes[resolvedViewModeId];
  if (!viewMode) {
    throw new Error(`Active view mode ${resolvedViewModeId} not found`);
  }
  const nextIds = getActiveSectionUIIds().filter((sectionId) => {
    const visibility = viewMode.visibilityBySectionId[sectionId];
    if (visibility === undefined) {
      throw new Error(
        `Missing visibility for section ${sectionId} in view mode ${viewMode.id}`,
      );
    }
    return visibility;
  });
  setActiveSectionIds(nextIds);
}
export function clearActiveSectionIds() {
  if (getActiveSectionUIIds().length === 0) {
    return;
  }
  setActiveSectionIds([]);
}
export function selectAll() {
  const currActiveSections = getActiveSectionUIIds();
  // select all params within single active section
  if (currActiveSections.length === 1) {
    useProjectState.setState((state) => {
      const sectionId = currActiveSections[0];
      if (sectionId) {
        const ids = getAllVisibleParamsInSection(state, sectionId);
        //TODO set selected params:
        console.log("selectAll ids", ids);
      }
    });
  } else {
    // select all sections
    setActiveSectionIds(Object.keys(useProjectState.getState().sections));
  }
}
export function setTopLevelNonGroupSectionsAsActive() {
  const p = useProjectState.getState();
  const nonGroup: Array<string> = [];
  const topLevelSectionIds = getTopLevelSectionIdsForDisplay(p);
  for (const sectionId of topLevelSectionIds) {
    if (
      getCurrEffectiveSectionImpl(p, sectionId).type !== SectionTypeEnum.Group
    ) {
      nonGroup.push(sectionId);
    }
  }
  setActiveSectionIds(nonGroup);
}
