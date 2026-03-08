import _ from "lodash";
import { getActiveSectionUIIds, setActiveSectionUIIds } from "state/activeSectionUI";
import {
  NULL_PROJECT_CONFIG_ID,
  useProjectState,
  useServerMode,
  ZustandProjectState,
} from "state/definitions";
import { route_set_active_ids } from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  getTopLevelSectionIdsForDisplay,
} from "./sectionInfos";
import { getAllVisibleParamsInSection } from "./sections/sectionContents";

let pendingProjectActiveIdsAnimationFrame: number | null = null;
let pendingProjectActiveIds: Array<string> | null = null;

export type SetActiveSectionIdsSyncMode = "auto" | "ui-only" | "immediate";

export type SetActiveSectionIdsOptions = {
  syncMode?: SetActiveSectionIdsSyncMode;
  forceDurableSync?: boolean;
};

function optimisticActiveIdsUpdate(
  apply: (state: ZustandProjectState) => void,
) {
  const projectConfigId = getCurrProjectConfigId();
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    const serverMode = useServerMode.getState();
    if (serverMode.modeResolved && serverMode.mode === "app") {
      // App mode can render before the IDE project config is hydrated; active ids are
      // irrelevant there, so keep this as a local-only update.
      useProjectState.setState(apply);
      return;
    }
    console.warn(
      `Skipping route_set_active_ids because projectConfigId is ${String(
        projectConfigId,
      )}.`,
    );
    useProjectState.setState(apply);
    return;
  }
  return dispatchOptimisticProjectStateUpdate({
    apply,
    send: (frontendOpId) => {
      return route_set_active_ids({
        projectConfigId,
        activeIds: useProjectState.getState().projectConfig.activeIds,
        frontendOpId,
      });
    },
  });
}

function applyProjectActiveSectionIds(ids: Array<string>) {
  const currentActiveIds = useProjectState.getState().projectConfig.activeIds;
  if (_.isEqual(currentActiveIds, ids)) {
    return;
  }
  optimisticActiveIdsUpdate((state) => {
    state.projectConfig.activeIds = ids;
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
  applyProjectActiveSectionIds(nextActiveIds);
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
  const currentDurableActiveIds =
    useProjectState.getState().projectConfig.activeIds;
  const uiChanged = !_.isEqual(currentUIActiveIds, ids);
  const durableChanged = !_.isEqual(currentDurableActiveIds, ids);

  if (!uiChanged && !(forceDurableSync && durableChanged)) {
    return;
  }

  if (uiChanged) {
    setActiveSectionUIIds(ids);
  }

  if (syncMode === "ui-only") {
    cancelPendingProjectActiveIdsSync();
    return;
  }

  if (!durableChanged) {
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
    applyProjectActiveSectionIds(ids);
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
