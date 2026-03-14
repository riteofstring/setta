// @vitest-environment jsdom

import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearRevealMutationOwnershipForLease,
  registerRevealMutationLease,
} from "./uiSettingRevealMutationOwnership";
import { rollbackRevealMutationSnapshotsForLease } from "./uiSettingRevealMutationSnapshots";
import type {
  RevealLocalStorageSnapshot,
  RevealMutationDiff,
  RevealMutationLease,
  RevealProjectStateSnapshot,
} from "./uiSettingRevealMutationTypes";

function setRevealTestLocalStorageState(
  overrides: Partial<RevealLocalStorageSnapshot>,
) {
  useLocalStorage.setState({
    overviewVis: false,
    overviewTab: "Overview",
    watchCodePortalOpen: false,
    uiEditorVis: false,
    uiEditorTab: {},
    projectChatAuxViewByProjectConfigId: {},
    runInstructionsAccordionOpenValuesByProjectConfigId: {},
    projectAiSettingsAccordionOpenValuesByProjectConfigId: {},
    ...overrides,
  });
}

function createProjectStateSnapshot(): RevealProjectStateSnapshot {
  return {
    projectConfigId: "project-1",
    activeIds: [],
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
  localStorageSnapshot,
  postMutationLocalStorageSnapshot,
  mutationDiff,
}: {
  localStorageSnapshot: RevealLocalStorageSnapshot;
  postMutationLocalStorageSnapshot: RevealLocalStorageSnapshot;
  mutationDiff: RevealMutationDiff;
}): RevealMutationLease {
  const lease = registerRevealMutationLease(
    localStorageSnapshot,
    postMutationLocalStorageSnapshot,
    createProjectStateSnapshot(),
    createProjectStateSnapshot(),
    mutationDiff,
  );
  leasesToCleanup.push(lease);
  return lease;
}

describe("uiSettingRevealMutationSnapshots", () => {
  beforeEach(() => {
    setRevealTestLocalStorageState({});
  });

  afterEach(() => {
    while (leasesToCleanup.length > 0) {
      const lease = leasesToCleanup.pop();
      if (!lease) {
        continue;
      }
      clearRevealMutationOwnershipForLease(lease);
    }
    setRevealTestLocalStorageState({});
  });

  it("rolls back touched local-storage fields when the post-mutation state is still present", () => {
    // Rollback should restore the snapshot when no later change has replaced the reveal mutation.
    const localStorageSnapshot: RevealLocalStorageSnapshot = {
      overviewVis: false,
      overviewTab: "Overview",
      watchCodePortalOpen: false,
      uiEditorVis: false,
      uiEditorTab: {},
      projectChatAuxViewByProjectConfigId: {},
      runInstructionsAccordionOpenValuesByProjectConfigId: {},
      projectAiSettingsAccordionOpenValuesByProjectConfigId: {},
    };
    const postMutationLocalStorageSnapshot: RevealLocalStorageSnapshot = {
      ...localStorageSnapshot,
      overviewVis: true,
    };
    setRevealTestLocalStorageState(postMutationLocalStorageSnapshot);
    const lease = registerLease({
      localStorageSnapshot,
      postMutationLocalStorageSnapshot,
      mutationDiff: createMutationDiff({
        touchedOverviewVis: true,
      }),
    });

    rollbackRevealMutationSnapshotsForLease(lease);

    expect(useLocalStorage.getState().overviewVis).toBe(false);
  });

  it("does not roll back a record entry after another change diverges from the post-mutation snapshot", () => {
    // If the user has changed the setting again, rollback must leave the newer value alone.
    const projectConfigId = "project-1";
    const localStorageSnapshot: RevealLocalStorageSnapshot = {
      overviewVis: false,
      overviewTab: "Overview",
      watchCodePortalOpen: false,
      uiEditorVis: false,
      uiEditorTab: {},
      projectChatAuxViewByProjectConfigId: {},
      runInstructionsAccordionOpenValuesByProjectConfigId: {
        [projectConfigId]: ["snapshot-value"],
      },
      projectAiSettingsAccordionOpenValuesByProjectConfigId: {},
    };
    const postMutationLocalStorageSnapshot: RevealLocalStorageSnapshot = {
      ...localStorageSnapshot,
      runInstructionsAccordionOpenValuesByProjectConfigId: {
        [projectConfigId]: ["post-mutation-value"],
      },
    };
    setRevealTestLocalStorageState({
      ...postMutationLocalStorageSnapshot,
      runInstructionsAccordionOpenValuesByProjectConfigId: {
        [projectConfigId]: ["newer-value"],
      },
    });
    const lease = registerLease({
      localStorageSnapshot,
      postMutationLocalStorageSnapshot,
      mutationDiff: createMutationDiff({
        touchedRunInstructionsProjectConfigIds: new Set([projectConfigId]),
      }),
    });

    rollbackRevealMutationSnapshotsForLease(lease);

    expect(
      useLocalStorage.getState()
        .runInstructionsAccordionOpenValuesByProjectConfigId[projectConfigId],
    ).toEqual(["newer-value"]);
  });
});
