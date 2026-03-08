import _ from "lodash";
import {
  clearPendingActiveSectionBackendSyncOp,
  getActiveSectionUIIds,
  markPendingActiveSectionBackendSyncOp,
  setActiveSectionUIIds,
} from "state/activeSectionUI";
import {
  NULL_PROJECT_CONFIG_ID,
  useProjectState,
  useServerMode,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_set_active_ids } from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import {
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  getTopLevelSectionIdsForDisplay,
} from "./sectionInfos";
import { getAllVisibleParamsInSection } from "./sections/sectionContents";

let pendingProjectActiveIdsAnimationFrame: number | null = null;
let pendingProjectActiveIds: Array<string> | null = null;

type SetActiveSectionIdsSyncMode = "auto" | "ui-only" | "immediate";

export type SetActiveSectionIdsOptions = {
  syncMode?: SetActiveSectionIdsSyncMode;
  forceDurableSync?: boolean;
};

function sendProjectActiveSectionIdsToBackend(ids: Array<string>) {
  const projectConfigId = getCurrProjectConfigId();
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
  markPendingActiveSectionBackendSyncOp(frontendOpId);
  void route_set_active_ids({
    projectConfigId,
    activeIds: ids,
    frontendOpId,
  })
    .then((res) => {
      if (res200(res)) {
        return;
      }
      clearPendingActiveSectionBackendSyncOp(frontendOpId);
    })
    .catch(() => {
      clearPendingActiveSectionBackendSyncOp(frontendOpId);
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
  pendingProjectActiveIds = null;
}

function flushPendingProjectActiveIdsSync() {
  if (pendingProjectActiveIds === null) {
    return;
  }
  const nextActiveIds = pendingProjectActiveIds;
  pendingProjectActiveIds = null;
  pendingProjectActiveIdsAnimationFrame = null;
  sendProjectActiveSectionIdsToBackend(nextActiveIds);
}

function scheduleProjectActiveSectionIdsSync(ids: Array<string>) {
  pendingProjectActiveIds = [...ids];
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

  if (!uiChanged && !forceDurableSync) {
    return;
  }

  if (uiChanged) {
    setActiveSectionUIIds(ids);
  }

  if (syncMode === "ui-only") {
    cancelPendingProjectActiveIdsSync();
    return;
  }

  const resolvedSyncMode =
    syncMode === "immediate"
      ? "immediate"
      : shouldDeferProjectActiveSectionIdsSync()
        ? "deferred"
        : "immediate";

  if (resolvedSyncMode === "immediate") {
    cancelPendingProjectActiveIdsSync();
    sendProjectActiveSectionIdsToBackend(ids);
    return;
  }
  scheduleProjectActiveSectionIdsSync(ids);
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
