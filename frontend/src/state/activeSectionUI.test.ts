import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  failPendingActiveSectionBackendSyncOp,
  getReconciledActiveSectionUIStateFromBackend,
  markPendingActiveSectionBackendSyncOp,
} from "./activeSectionBackendSync";
import {
  getActiveSectionUISelectionGeneration,
  setActiveSectionUIIds,
} from "./activeSectionSelection";
import { useActiveSectionUI } from "./storeDefinitions";
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

  it("keeps backend hydration disabled until every same-generation durable completion settles", () => {
    const applyPatch = applyActiveSectionPatch();

    setActiveSectionUIIds(["section-a"]);
    const pendingGeneration = getActiveSectionUISelectionGeneration();
    markPendingActiveSectionBackendSyncOp("op-1", pendingGeneration);
    markPendingActiveSectionBackendSyncOp("op-2", pendingGeneration);

    // The first same-generation ack must not hand authority back to backend
    // hydration while another durable owner for that generation is still live.
    applyPatch(
      getReconciledActiveSectionUIStateFromBackend([], ["op-1"], "project-a", [
        "section-a",
      ]),
    );

    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(false);
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([
      "op-2",
    ]);

    applyPatch(
      getReconciledActiveSectionUIStateFromBackend(
        ["section-a"],
        ["op-2"],
        "project-a",
        ["section-a"],
      ),
    );

    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(true);
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([]);
  });

  it("keeps backend hydration disabled until every same-generation durable failure settles", () => {
    setActiveSectionUIIds(["section-a"]);
    const pendingGeneration = getActiveSectionUISelectionGeneration();
    markPendingActiveSectionBackendSyncOp("op-1", pendingGeneration);
    markPendingActiveSectionBackendSyncOp("op-2", pendingGeneration);

    // A partial failure still leaves the generation locally owned until the
    // remaining durable op for that generation finishes or fails.
    failPendingActiveSectionBackendSyncOp("op-1");

    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(false);
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([
      "op-2",
    ]);

    failPendingActiveSectionBackendSyncOp("op-2");

    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(true);
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([]);
  });
});
