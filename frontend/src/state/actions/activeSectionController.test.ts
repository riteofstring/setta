import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import * as endpoints from "openapi/http";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createCodeSectionImpl,
  createCore,
  createProjectChatWindowingState,
  createProjectConfig,
  createSingletonSections,
  createVariant,
  type SingleConfig,
} from "utils/generatedTypes";
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
    useProjectState.setState(
      buildProjectStateData("project-a", ["section-a"], ["section-a"]),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    cancelPendingActiveSectionIdsSync();
    resetProjectStores();
    gpuFlowViewportStore.getState().setNodesSelectionBounds(null);
  });
  it("honors a durable pane-click commit even when the UI store already matches the cleared selection", () => {
    const endpointSpy = vi.spyOn(endpoints, "setActiveIds").mockResolvedValue({
      data: undefined,
      response: { status: 200 } as Response,
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
      body: {
        activeIds: [],
        frontendOpId: expect.any(String),
        projectConfigId: "project-a",
      },
    });
  });

  it("clears stale selection bounds when an ordinary section click resolves to one active section", () => {
    gpuFlowViewportStore.getState().setNodesSelectionBounds({
      height: 100,
      width: 160,
      x: 20,
      y: 30,
    });

    applyActiveSectionChange({
      interaction: "section-click",
      sectionId: "section-a",
    });

    expect(gpuFlowViewportStore.getState().nodesSelectionBounds).toBeNull();
  });
});

function buildProjectStateData(
  projectConfigId: string,
  activeIds: Array<string>,
  sectionIds: Array<string> = [],
): SingleConfig {
  const sectionVariantMap: Record<string, string> = {};
  const sections: SingleConfig["sections"] = {};
  const sectionImpls: SingleConfig["sectionImpls"] = {};
  const sectionVariants: SingleConfig["sectionVariants"] = {};
  const parentSectionMap: SingleConfig["parentSectionMap"] = {};
  const topLevelSections: SingleConfig["projectConfig"]["topLevelSections"] =
    {};
  const uniqueSectionIds = [...new Set([...sectionIds, ...activeIds])];
  for (const [index, sectionId] of uniqueSectionIds.entries()) {
    const variantId = `variant-${sectionId}`;
    const implId = `impl-${sectionId}`;
    sectionVariantMap[sectionId] = variantId;
    parentSectionMap[sectionId] = null;
    topLevelSections[sectionId] = {
      h: 160,
      w: 200,
      x: index * 240,
      y: index * 120,
      zIndex: index,
    };
    sections[sectionId] = createCore({ id: sectionId });
    sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      name: `variant-${sectionId}`,
      nonPresetImpls: [implId],
    });
    sectionImpls[implId] = createCodeSectionImpl({
      id: implId,
    });
  }
  return {
    artifactGroups: {},
    codeObjImpls: {},
    codeObjVariants: {},
    codeObjs: {},
    genCodeBinding: null,
    parentSectionMap,
    projectChatWindowing: createProjectChatWindowingState(),
    projectConfig: createProjectConfig({
      activeIds,
      id: projectConfigId,
      sectionVariantMap,
      topLevelSections,
    }),
    requiredDecodedImages: [],
    sectionImpls,
    sectionVariants,
    sections,
    shownParamIds: {},
    singletonSections: createSingletonSections(),
  };
}
