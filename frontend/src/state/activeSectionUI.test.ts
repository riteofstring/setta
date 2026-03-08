import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  failPendingActiveSectionBackendSyncOp,
  getActiveSectionUISelectionGeneration,
  getReconciledActiveSectionUIStateFromBackend,
  markPendingActiveSectionBackendSyncOp,
  setActiveSectionUIIds,
  useActiveSectionUI,
} from "./activeSectionUI";
import { resetProjectStores } from "./utils";

function applyActiveSectionPatch() {
  return (
    patch: ReturnType<typeof getReconciledActiveSectionUIStateFromBackend>,
  ) => {
    if (patch !== null) {
      useActiveSectionUI.setState(patch);
    }
  };
}

describe("activeSectionUI", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("keeps the same ownership generation when backend reconciliation prunes invalid active ids", () => {
    const applyPatch = applyActiveSectionPatch();

    setActiveSectionUIIds(["section-a"]);
    const pendingGeneration = getActiveSectionUISelectionGeneration();
    markPendingActiveSectionBackendSyncOp("op-1", pendingGeneration);

    applyPatch(
      getReconciledActiveSectionUIStateFromBackend([], [], "project-a", []),
    );

    const state = useActiveSectionUI.getState();
    expect(state.activeIds).toEqual([]);
    expect(state.selectionGeneration).toBe(pendingGeneration);
    expect(state.pendingBackendSyncOpIds).toEqual(["op-1"]);
    expect(state.backendHydrationEnabled).toBe(false);
  });

  it("restores backend hydration after an invalid-id prune once the owned durable sync fails", () => {
    const applyPatch = applyActiveSectionPatch();

    setActiveSectionUIIds(["section-a"]);
    const pendingGeneration = getActiveSectionUISelectionGeneration();
    markPendingActiveSectionBackendSyncOp("op-1", pendingGeneration);

    applyPatch(
      getReconciledActiveSectionUIStateFromBackend([], [], "project-a", []),
    );

    failPendingActiveSectionBackendSyncOp("op-1");

    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(true);
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([]);

    applyPatch(
      getReconciledActiveSectionUIStateFromBackend(
        ["section-a"],
        [],
        "project-a",
        ["section-a"],
      ),
    );

    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(true);
  });
});
