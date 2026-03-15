import { afterEach, describe, expect, it } from "vitest";
import {
  clearRevealMutationOwnershipForLease,
  registerRevealMutationLease,
  revealMutationOwners,
} from "./uiSettingRevealMutationOwnership";
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

function registerLease(diff: RevealMutationDiff): RevealMutationLease {
  const lease = registerRevealMutationLease(
    createLocalStorageSnapshot(),
    createLocalStorageSnapshot(),
    createProjectStateSnapshot(),
    createProjectStateSnapshot(),
    diff,
  );
  leasesToCleanup.push(lease);
  return lease;
}

describe("uiSettingRevealMutationOwnership", () => {
  afterEach(() => {
    while (leasesToCleanup.length > 0) {
      const lease = leasesToCleanup.pop();
      if (!lease) {
        continue;
      }
      clearRevealMutationOwnershipForLease(lease);
    }
  });

  it("registers and clears field ownership for a reveal mutation lease", () => {
    // Each touched field should point to the active lease until that lease finalizes.
    const lease = registerLease(
      createMutationDiff({
        touchedOverviewVis: true,
        touchedUiEditorTabSectionTypes: new Set(["Code"]),
        touchedProjectChatAuxViewProjectConfigIds: new Set(["project-1"]),
      }),
    );

    expect(revealMutationOwners.overviewVis).toBe(lease.leaseId);
    expect(revealMutationOwners.uiEditorTabSectionType.get("Code")).toBe(
      lease.leaseId,
    );
    expect(
      revealMutationOwners.projectChatAuxViewProjectConfigId.get("project-1"),
    ).toBe(lease.leaseId);

    clearRevealMutationOwnershipForLease(lease);
    leasesToCleanup.pop();

    expect(revealMutationOwners.overviewVis).toBeNull();
    expect(revealMutationOwners.uiEditorTabSectionType.has("Code")).toBe(false);
    expect(
      revealMutationOwners.projectChatAuxViewProjectConfigId.has("project-1"),
    ).toBe(false);
  });

  it("keeps newer ownership when an older lease finalizes later", () => {
    // Finalizing an older lease must not erase ownership claimed by a newer reveal.
    const olderLease = registerLease(
      createMutationDiff({
        touchedOverviewVis: true,
      }),
    );
    const newerLease = registerLease(
      createMutationDiff({
        touchedOverviewVis: true,
      }),
    );

    clearRevealMutationOwnershipForLease(olderLease);

    expect(revealMutationOwners.overviewVis).toBe(newerLease.leaseId);
  });
});
