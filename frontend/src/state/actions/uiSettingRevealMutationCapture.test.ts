// @vitest-environment jsdom

import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildRevealMutationFailureResult,
  captureRevealLocalStorageSnapshot,
  createEmptyRevealMutationDiff,
} from "./uiSettingRevealMutationCapture";
import type { RevealLocalStorageSnapshot } from "./uiSettingRevealMutationTypes";

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

describe("uiSettingRevealMutationCapture", () => {
  beforeEach(() => {
    setRevealTestLocalStorageState({});
  });

  afterEach(() => {
    setRevealTestLocalStorageState({});
  });

  it("builds an empty mutation diff with no touched fields", () => {
    // New reveal mutations should start with no claimed state so later steps opt in explicitly.
    const diff = createEmptyRevealMutationDiff();

    expect(diff.touchedOverviewVis).toBe(false);
    expect(diff.touchedOverviewTab).toBe(false);
    expect(diff.touchedWatchCodePortalOpen).toBe(false);
    expect(diff.touchedUiEditorVis).toBe(false);
    expect(diff.touchedUiEditorTabSectionTypes.size).toBe(0);
    expect(diff.touchedProjectChatAuxViewProjectConfigIds.size).toBe(0);
    expect(diff.touchedRunInstructionsProjectConfigIds.size).toBe(0);
    expect(diff.touchedProjectAiProjectConfigIds.size).toBe(0);
    expect(diff.touchedProjectStateActiveIdsProjectConfigIds.size).toBe(0);
  });

  it("captures cloned local-storage records instead of reusing live arrays", () => {
    // Snapshot capture must freeze the reveal baseline so later mutations cannot rewrite it in place.
    setRevealTestLocalStorageState({
      runInstructionsAccordionOpenValuesByProjectConfigId: {
        "project-1": ["alpha"],
      },
    });

    const snapshot = captureRevealLocalStorageSnapshot();
    useLocalStorage.setState({
      runInstructionsAccordionOpenValuesByProjectConfigId: {
        "project-1": ["beta"],
      },
    });

    expect(
      snapshot.runInstructionsAccordionOpenValuesByProjectConfigId["project-1"],
    ).toEqual(["alpha"]);
  });

  it("restores touched local-storage fields when building a failure result", () => {
    // Failure result assembly should immediately unwind reveal-owned local state before returning.
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
    setRevealTestLocalStorageState({
      ...localStorageSnapshot,
      overviewVis: true,
    });

    const result = buildRevealMutationFailureResult(
      {
        settingId: "setting-1",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: "failed",
      },
      {
        localStorageSnapshot,
        projectStateSnapshot: {
          projectConfigId: "",
          activeIds: [],
        },
        mutationDiff: {
          ...createEmptyRevealMutationDiff(),
          touchedOverviewVis: true,
        },
      },
    );

    expect(result).toEqual({
      ok: false,
      status: {
        settingId: "setting-1",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: "failed",
      },
    });
    expect(useLocalStorage.getState().overviewVis).toBe(false);
  });
});
