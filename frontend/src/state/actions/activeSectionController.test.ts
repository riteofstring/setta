import * as endpoints from "openapi/http";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyActiveSectionChange } from "./activeSectionController";
import {
  cancelPendingActiveSectionIdsSync,
  setActiveSectionIds,
} from "./activeSections";
function createWindowStub() {
  return {
    requestAnimationFrame: (_callback: FrameRequestCallback) => 1,
    cancelAnimationFrame: (_handle: number) => undefined,
  };
}
describe("activeSectionController", () => {
  beforeEach(() => {
    resetProjectStores();
    cancelPendingActiveSectionIdsSync();
    vi.stubGlobal("window", createWindowStub());
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-a";
      state.projectConfig.activeIds = ["section-a"];
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    cancelPendingActiveSectionIdsSync();
    resetProjectStores();
  });
  it("honors a durable pane-click commit even when the UI store already matches the cleared selection", () => {
    const endpointSpy = vi.spyOn(endpoints, "setActiveIds").mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: undefined,
    });
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    // Simulate the transient selection-rect path that already cleared the UI.
    setActiveSectionIds(["section-a"], { syncMode: "ui-only" });
    setActiveSectionIds([], { syncMode: "ui-only" });
    applyActiveSectionChange(
      { interaction: "pane-click" },
      { forceDurableSync: true },
    );
    // The controller must still schedule one durable publish for the final UI state.
    expect(scheduledFrame).not.toBeNull();
    expect(endpointSpy).not.toHaveBeenCalled();
    scheduledFrame?.(16);
    expect(endpointSpy).toHaveBeenCalledOnce();
    expect(endpointSpy).toHaveBeenCalledWith({
      activeIds: [],
      frontendOpId: expect.any(String),
      projectConfigId: "project-a",
    });
  });
});
