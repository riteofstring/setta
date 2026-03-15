import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearRevealMutationOwnershipForLease,
  registerRevealMutationLease,
} from "./uiSettingRevealMutationOwnership";
import { restoreRevealProjectStateSnapshotIfOwned } from "./uiSettingRevealMutationProjectStateRestore";
import type {
  RevealLocalStorageSnapshot,
  RevealMutationDiff,
  RevealMutationLease,
  RevealProjectStateSnapshot,
} from "./uiSettingRevealMutationTypes";

function createLocalStorageSnapshot(): RevealLocalStorageSnapshot {
  return {
    overviewVis: false,
    overviewTab: "Overview",
    watchCodePortalOpen: false,
    uiEditorVis: false,
    uiEditorTab: {},
    projectChatAuxViewByProjectConfigId: {},
    runInstructionsAccordionOpenValuesByProjectConfigId: {},
    projectAiSettingsAccordionOpenValuesByProjectConfigId: {},
  };
}

function createProjectStateSnapshot(
  overrides: Partial<RevealProjectStateSnapshot>,
): RevealProjectStateSnapshot {
  return {
    projectConfigId: "project-1",
    activeIds: [],
    ...overrides,
  };
}

function createMutationDiff(
  overrides: Partial<RevealMutationDiff>,
): RevealMutationDiff {
  return {
    touchedOverviewVis: false,
    touchedOverviewTab: false,
    touchedWatchCodePortalOpen: false,
    touchedUiEditorVis: false,
    touchedUiEditorTabSectionTypes: new Set<string>(),
    touchedProjectChatAuxViewProjectConfigIds: new Set<string>(),
    touchedRunInstructionsProjectConfigIds: new Set<string>(),
    touchedProjectAiProjectConfigIds: new Set<string>(),
    touchedProjectStateActiveIdsProjectConfigIds: new Set<string>(),
    ...overrides,
  };
}

const leasesToCleanup: Array<RevealMutationLease> = [];

function registerLease({
  projectStateSnapshot,
  postMutationProjectStateSnapshot,
  mutationDiff,
}: {
  projectStateSnapshot: RevealProjectStateSnapshot;
  postMutationProjectStateSnapshot: RevealProjectStateSnapshot;
  mutationDiff: RevealMutationDiff;
}): RevealMutationLease {
  const lease = registerRevealMutationLease(
    createLocalStorageSnapshot(),
    createLocalStorageSnapshot(),
    projectStateSnapshot,
    postMutationProjectStateSnapshot,
    mutationDiff,
  );
  leasesToCleanup.push(lease);
  return lease;
}

describe("uiSettingRevealMutationProjectStateRestore", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
    useActiveSectionUI.setState({
      activeIds: ["section-after"],
      selectionGeneration: 4,
      backendGeneration: 4,
      backendHydrationEnabled: false,
      pendingBackendSyncOpIds: [],
      pendingBackendSyncGenerationByOpId: {},
      scheduledBackendSync: null,
    });
  });

  afterEach(() => {
    while (leasesToCleanup.length > 0) {
      const lease = leasesToCleanup.pop();
      if (!lease) {
        continue;
      }
      clearRevealMutationOwnershipForLease(lease);
    }
    resetProjectStores();
  });

  it("restores backend-authoritative active ids when the owned post-mutation project state is still current", () => {
    // Project-state rollback should restore active ids only when the reveal-owned post-mutation snapshot still matches.
    const snapshot = createProjectStateSnapshot({
      activeIds: ["section-before"],
    });
    const postMutationSnapshot = createProjectStateSnapshot({
      activeIds: ["section-after"],
    });
    const lease = registerLease({
      projectStateSnapshot: snapshot,
      postMutationProjectStateSnapshot: postMutationSnapshot,
      mutationDiff: createMutationDiff({
        touchedProjectStateActiveIdsProjectConfigIds: new Set(["project-1"]),
      }),
    });

    restoreRevealProjectStateSnapshotIfOwned({
      snapshot,
      postMutationSnapshot,
      mutationDiff: lease.mutationDiff,
      leaseId: lease.leaseId,
    });

    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-before"]);
    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(true);
  });

  it("leaves newer active ids alone after the project state has diverged", () => {
    // Rollback must not overwrite later active-section changes that no longer match the post-mutation snapshot.
    const snapshot = createProjectStateSnapshot({
      activeIds: ["section-before"],
    });
    const postMutationSnapshot = createProjectStateSnapshot({
      activeIds: ["section-after"],
    });
    const lease = registerLease({
      projectStateSnapshot: snapshot,
      postMutationProjectStateSnapshot: postMutationSnapshot,
      mutationDiff: createMutationDiff({
        touchedProjectStateActiveIdsProjectConfigIds: new Set(["project-1"]),
      }),
    });
    useActiveSectionUI.setState({
      activeIds: ["section-newer"],
    });

    restoreRevealProjectStateSnapshotIfOwned({
      snapshot,
      postMutationSnapshot,
      mutationDiff: lease.mutationDiff,
      leaseId: lease.leaseId,
    });

    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-newer"]);
  });
});
