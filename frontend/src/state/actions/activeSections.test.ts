import * as endpoints from "openapi/http";
import {
  NULL_PROJECT_CONFIG_ID,
  useActiveSectionUI,
  useNodeInternals,
  useProjectState,
  useServerMode,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createCodeSectionImpl,
  createCore,
  createProjectChatWindowingState,
  createProjectConfig,
  createSingletonSections,
  createVariant,
  type ProjectStateSingleConfigWithCompletedOpIDs,
  type SingleConfig,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelPendingActiveSectionIdsSync,
  setActiveSectionIds,
} from "./activeSections";
import { loadProjectState } from "./project/loadProject";
import {
  getCurrEffectiveSectionImpl,
  processProjectStateUpdateFromBackend,
} from "./sectionInfos";
function createWindowStub() {
  const location = { search: "" };
  const history = {
    replaceState: (
      _data: unknown,
      _unused: string,
      url: string | URL | null | undefined,
    ) => {
      if (typeof url === "string") {
        const queryIndex = url.indexOf("?");
        location.search = queryIndex >= 0 ? url.slice(queryIndex) : "";
        return;
      }
      if (url instanceof URL) {
        location.search = url.search;
        return;
      }
      location.search = "";
    },
  };
  return {
    location,
    history,
    requestAnimationFrame: (_callback: FrameRequestCallback) => 1,
    cancelAnimationFrame: (_handle: number) => undefined,
  } as unknown as Window & typeof globalThis;
}
async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
describe("activeSections", () => {
  beforeEach(() => {
    resetProjectStores();
    cancelPendingActiveSectionIdsSync();
    vi.stubGlobal("window", createWindowStub());
    window.history.replaceState({}, "", "/");
    useProjectState.setState((state) => {
      state.projectConfig.id = NULL_PROJECT_CONFIG_ID;
      state.projectConfig.activeIds = [];
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    cancelPendingActiveSectionIdsSync();
    resetProjectStores();
  });
  it("does not call the backend when config id is null in app mode", () => {
    useServerMode.setState({
      mode: "app",
      modeResolved: true,
      modeError: null,
    });
    const spy = vi.spyOn(endpoints, "setActiveIds");
    setActiveSectionIds(["section-a"]);
    expect(spy).not.toHaveBeenCalled();
    expect(useProjectState.getState().projectConfig.activeIds).toEqual([]);
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
  });
  it("warns and skips the backend when config id is null outside app mode", () => {
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const endpointSpy = vi.spyOn(endpoints, "setActiveIds");
    setActiveSectionIds(["section-a"]);
    expect(endpointSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(useProjectState.getState().projectConfig.activeIds).toEqual([]);
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
  });
  it("updates the UI active ids immediately and defers the durable project-state sync when a real project config is loaded", () => {
    useProjectState.setState(buildProjectState("project-a", []).projectState);
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
    setActiveSectionIds(["section-a"]);
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
    expect(useProjectState.getState().projectConfig.activeIds).toEqual([]);
    expect(scheduledFrame).not.toBeNull();
    expect(endpointSpy).not.toHaveBeenCalled();
    scheduledFrame?.(16);
    expect(useProjectState.getState().projectConfig.activeIds).toEqual([]);
    expect(endpointSpy).toHaveBeenCalledOnce();
    expect(endpointSpy).toHaveBeenCalledWith({
      activeIds: ["section-a"],
      frontendOpId: expect.any(String),
      projectConfigId: "project-a",
    });
  });
  it("keeps marquee-style UI-only active-id updates out of the durable project/backend path until forced to sync", () => {
    useProjectState.setState(buildProjectState("project-a", []).projectState);
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
    setActiveSectionIds(["section-a"], { syncMode: "ui-only" });
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
    expect(useProjectState.getState().projectConfig.activeIds).toEqual([]);
    expect(endpointSpy).not.toHaveBeenCalled();
    expect(scheduledFrame).toBeNull();
    setActiveSectionIds(["section-a"], { forceDurableSync: true });
    expect(scheduledFrame).not.toBeNull();
    expect(endpointSpy).not.toHaveBeenCalled();
    scheduledFrame?.(16);
    expect(useProjectState.getState().projectConfig.activeIds).toEqual([]);
    expect(endpointSpy).toHaveBeenCalledOnce();
    expect(endpointSpy).toHaveBeenCalledWith({
      activeIds: ["section-a"],
      frontendOpId: expect.any(String),
      projectConfigId: "project-a",
    });
  });
  it("cancels a queued durable sync when a same-id ui-only update arrives", () => {
    useProjectState.setState(buildProjectState("project-a", []).projectState);
    const endpointSpy = vi.spyOn(endpoints, "setActiveIds").mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: undefined,
    });
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrame = callback;
      return 42;
    });
    const cancelSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => {});
    setActiveSectionIds(["section-a"]);
    setActiveSectionIds(["section-a"], { syncMode: "ui-only" });
    expect(cancelSpy).toHaveBeenCalledWith(42);
    scheduledFrame?.(16);
    expect(endpointSpy).not.toHaveBeenCalled();
  });
  it("cancels a queued durable sync when a different-id ui-only update replaces it", () => {
    useProjectState.setState(buildProjectState("project-a", []).projectState);
    const endpointSpy = vi.spyOn(endpoints, "setActiveIds").mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: undefined,
    });
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrame = callback;
      return 77;
    });
    const cancelSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => {});
    setActiveSectionIds(["section-a"]);
    setActiveSectionIds(["section-b"], { syncMode: "ui-only" });
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-b"]);
    expect(useActiveSectionUI.getState().scheduledBackendSync).toBeNull();
    expect(cancelSpy).toHaveBeenCalledWith(77);
    scheduledFrame?.(16);
    expect(endpointSpy).not.toHaveBeenCalled();
  });
  it("drops a deferred sync if the project config changes before the frame flushes", () => {
    useProjectState.setState(buildProjectState("project-a", []).projectState);
    const endpointSpy = vi.spyOn(endpoints, "setActiveIds").mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: undefined,
    });
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrame = callback;
      return 7;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    setActiveSectionIds(["section-a"]);
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-b";
    });
    scheduledFrame?.(16);
    expect(endpointSpy).not.toHaveBeenCalledWith({
      activeIds: ["section-a"],
      frontendOpId: expect.any(String),
      projectConfigId: "project-b",
    });
    expect(endpointSpy).not.toHaveBeenCalled();
  });
  it("keeps the UI selection stable when backend state arrives before a deferred sync flushes", () => {
    useProjectState.setState(
      buildProjectState("project-a", [], ["section-a"]).projectState,
    );
    const endpointSpy = vi.spyOn(endpoints, "setActiveIds").mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: undefined,
    });
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrame = callback;
      return 8;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    setActiveSectionIds(["section-a"]);
    processProjectStateUpdateFromBackend(
      buildProjectState("project-a", [], ["section-a"]),
    );
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
    scheduledFrame?.(16);
    expect(endpointSpy).toHaveBeenCalledOnce();
  });
  it("publishes the next project snapshot before loadProjectState exposes the next active id", async () => {
    useProjectState.setState(
      buildProjectState("project-a", ["section-a"], ["section-a"]).projectState,
    );
    useActiveSectionUI.setState({ activeIds: ["section-a"] });
    const observedSelections: Array<string> = [];
    const unsubscribe = useActiveSectionUI.subscribe(
      (state) => state.activeIds,
      (activeIds) => {
        const activeId = activeIds[0];
        if (!activeId) {
          return;
        }
        const resolved = getCurrEffectiveSectionImpl(
          useProjectState.getState(),
          activeId,
        );
        observedSelections.push(
          `${useProjectState.getState().projectConfig.id}:${activeId}:${resolved.type}`,
        );
      },
    );
    try {
      await loadProjectState(
        buildProjectStateData("project-b", ["section-b"], ["section-b"]),
      );
    } finally {
      unsubscribe();
    }
    expect(useProjectState.getState().projectConfig.id).toBe("project-b");
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-b"]);
    expect(observedSelections).toEqual(["project-b:section-b:Code"]);
  });
  it("keeps useProjectState subscribers coherent during loadProjectState publication", async () => {
    useProjectState.setState(
      buildProjectState("project-a", ["section-a"], ["section-a"]).projectState,
    );
    useActiveSectionUI.setState({ activeIds: ["section-a"] });
    const observations: Array<{
      projectId: string;
      activeIds: string[];
      nodeIds: string[];
    }> = [];
    const unsubscribe = useProjectState.subscribe(
      (state) => state.projectConfig,
      (projectConfig) => {
        observations.push({
          projectId: projectConfig.id,
          activeIds: [...useActiveSectionUI.getState().activeIds],
          nodeIds: [...useNodeInternals.getState().x.keys()],
        });
      },
      { fireImmediately: false },
    );
    try {
      await loadProjectState(
        buildProjectStateData("project-b", ["section-b"], ["section-b"]),
      );
    } finally {
      unsubscribe();
    }
    expect(observations).toEqual([
      {
        projectId: "project-b",
        activeIds: ["section-b"],
        nodeIds: ["section-b"],
      },
    ]);
  });
  it("publishes backend project updates before exposing the reconciled active id", () => {
    useProjectState.setState(
      buildProjectState("project-a", ["section-a"], ["section-a"]).projectState,
    );
    useActiveSectionUI.setState({ activeIds: ["section-a"] });
    const observedSelections: Array<string> = [];
    const unsubscribe = useActiveSectionUI.subscribe(
      (state) => state.activeIds,
      (activeIds) => {
        const activeId = activeIds[0];
        if (!activeId) {
          return;
        }
        const resolved = getCurrEffectiveSectionImpl(
          useProjectState.getState(),
          activeId,
        );
        observedSelections.push(
          `${useProjectState.getState().projectConfig.id}:${activeId}:${resolved.type}`,
        );
      },
    );
    try {
      processProjectStateUpdateFromBackend(
        buildProjectState("project-a", ["section-b"], ["section-b"]),
      );
    } finally {
      unsubscribe();
    }
    expect(useProjectState.getState().sections["section-b"]).toBeDefined();
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-b"]);
    expect(observedSelections).toEqual(["project-a:section-b:Code"]);
  });
  it("keeps useProjectState subscribers coherent during backend reconciliation", () => {
    useProjectState.setState(
      buildProjectState("project-a", ["section-a"], ["section-a"]).projectState,
    );
    useActiveSectionUI.setState({ activeIds: ["section-a"] });
    const observations: Array<{
      sectionIds: string[];
      activeIds: string[];
      nodeIds: string[];
    }> = [];
    const unsubscribe = useProjectState.subscribe(
      (state) => state.projectConfig.sectionVariantMap,
      (sectionVariantMap) => {
        observations.push({
          sectionIds: Object.keys(sectionVariantMap),
          activeIds: [...useActiveSectionUI.getState().activeIds],
          nodeIds: [...useNodeInternals.getState().x.keys()],
        });
      },
      { fireImmediately: false },
    );
    try {
      processProjectStateUpdateFromBackend(
        buildProjectState("project-a", ["section-b"], ["section-b"]),
      );
    } finally {
      unsubscribe();
    }
    expect(observations).toEqual([
      {
        sectionIds: ["section-b"],
        activeIds: ["section-b"],
        nodeIds: ["section-b"],
      },
    ]);
  });
  it("ignores a stale durable-selection completion after a newer ui-only selection", () => {
    useProjectState.setState(
      buildProjectState("project-a", [], ["section-a", "section-b"])
        .projectState,
    );
    const endpointSpy = vi.spyOn(endpoints, "setActiveIds").mockImplementation(
      () =>
        new Promise(() => {
          return undefined;
        }),
    );
    setActiveSectionIds(["section-a"], { syncMode: "immediate" });
    const staleOpId = endpointSpy.mock.calls[0]?.[0].frontendOpId;
    if (typeof staleOpId !== "string") {
      throw new Error("Expected a frontend op id for the durable selection.");
    }
    setActiveSectionIds(["section-b"], { syncMode: "ui-only" });
    processProjectStateUpdateFromBackend({
      projectState: buildProjectStateData(
        "project-a",
        ["section-a"],
        ["section-a", "section-b"],
      ),
      completedOpIds: [staleOpId],
      pendingOpIds: [],
    });
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-b"]);
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([]);
  });
  it("keeps the UI selection authoritative until the last same-generation durable completion settles", () => {
    useProjectState.setState(
      buildProjectState("project-a", [], ["section-a"]).projectState,
    );
    const endpointSpy = vi.spyOn(endpoints, "setActiveIds").mockImplementation(
      () =>
        new Promise(() => {
          return undefined;
        }),
    );
    setActiveSectionIds(["section-a"], { syncMode: "immediate" });
    setActiveSectionIds(["section-a"], {
      syncMode: "immediate",
      forceDurableSync: true,
    });
    const firstOpId = endpointSpy.mock.calls[0]?.[0].frontendOpId;
    const secondOpId = endpointSpy.mock.calls[1]?.[0].frontendOpId;
    if (typeof firstOpId !== "string" || typeof secondOpId !== "string") {
      throw new Error(
        "Expected two durable frontend op ids for the selection.",
      );
    }
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([
      firstOpId,
      secondOpId,
    ]);
    processProjectStateUpdateFromBackend({
      projectState: buildProjectStateData("project-a", [], ["section-a"]),
      completedOpIds: [firstOpId],
      pendingOpIds: [],
    });
    // The first ack is stale while the second same-generation sync still owns
    // the selection, so the backend snapshot must not clobber the UI ids yet.
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(false);
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([
      secondOpId,
    ]);
    processProjectStateUpdateFromBackend({
      projectState: buildProjectStateData("project-a", [], ["section-a"]),
      completedOpIds: [secondOpId],
      pendingOpIds: [],
    });
    expect(useActiveSectionUI.getState().activeIds).toEqual([]);
    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(true);
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([]);
  });
  it("prunes ui-only active ids that no longer exist in the incoming project snapshot", () => {
    useProjectState.setState(
      buildProjectState("project-a", [], ["section-a", "section-b"])
        .projectState,
    );
    setActiveSectionIds(["section-b"], { syncMode: "ui-only" });
    processProjectStateUpdateFromBackend(
      buildProjectState("project-a", [], ["section-a"]),
    );
    expect(useActiveSectionUI.getState().activeIds).toEqual([]);
    expect(useProjectState.getState().sections["section-b"]).toBeUndefined();
  });
  it("restores backend hydration after pruning an invalid active id and later receiving the durable completion", () => {
    useProjectState.setState(
      buildProjectState("project-a", [], ["section-a"]).projectState,
    );
    const endpointSpy = vi.spyOn(endpoints, "setActiveIds").mockImplementation(
      () =>
        new Promise(() => {
          return undefined;
        }),
    );
    setActiveSectionIds(["section-a"], { syncMode: "immediate" });
    const staleOpId = endpointSpy.mock.calls[0]?.[0].frontendOpId;
    if (typeof staleOpId !== "string") {
      throw new Error("Expected a frontend op id for the durable selection.");
    }
    processProjectStateUpdateFromBackend(buildProjectState("project-a", []));
    expect(useActiveSectionUI.getState().activeIds).toEqual([]);
    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(false);
    processProjectStateUpdateFromBackend({
      ...buildProjectState("project-a", []),
      completedOpIds: [staleOpId],
    });
    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(true);
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([]);
    expect(useActiveSectionUI.getState().activeIds).toEqual([]);
    processProjectStateUpdateFromBackend(
      buildProjectState("project-a", ["section-a"], ["section-a"]),
    );
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
  });
  it("restores backend hydration after pruning an invalid active id and later failing the durable sync", async () => {
    useProjectState.setState(
      buildProjectState("project-a", [], ["section-a"]).projectState,
    );
    let rejectSetActiveIds: ((reason?: unknown) => void) | null = null;
    vi.spyOn(endpoints, "setActiveIds").mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectSetActiveIds = reject;
        }),
    );
    setActiveSectionIds(["section-a"], { syncMode: "immediate" });
    processProjectStateUpdateFromBackend(buildProjectState("project-a", []));
    expect(useActiveSectionUI.getState().activeIds).toEqual([]);
    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(false);
    rejectSetActiveIds?.(new Error("setActiveIds failed"));
    await flushPromises();
    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(true);
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([]);
    expect(useActiveSectionUI.getState().activeIds).toEqual([]);
    processProjectStateUpdateFromBackend(
      buildProjectState("project-a", ["section-a"], ["section-a"]),
    );
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
  });
  it("lets the next backend snapshot restore backend selection after a non-200 durable sync failure", async () => {
    useProjectState.setState(
      buildProjectState("project-a", [], ["section-a"]).projectState,
    );
    vi.spyOn(endpoints, "setActiveIds").mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: undefined,
    });
    setActiveSectionIds(["section-a"], { syncMode: "immediate" });
    await flushPromises();
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([]);
    processProjectStateUpdateFromBackend(buildProjectState("project-a", []));
    expect(useActiveSectionUI.getState().activeIds).toEqual([]);
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([]);
  });
  it("lets the next backend snapshot restore backend selection after a rejected durable sync failure", async () => {
    useProjectState.setState(
      buildProjectState("project-a", [], ["section-a"]).projectState,
    );
    vi.spyOn(endpoints, "setActiveIds").mockRejectedValue(
      new Error("setActiveIds failed"),
    );
    setActiveSectionIds(["section-a"], { syncMode: "immediate" });
    await flushPromises();
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-a"]);
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([]);
    processProjectStateUpdateFromBackend(buildProjectState("project-a", []));
    expect(useActiveSectionUI.getState().activeIds).toEqual([]);
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([]);
  });
  it("cancels any queued deferred sync when a new project loads", async () => {
    useProjectState.setState(buildProjectState("project-a", []).projectState);
    const endpointSpy = vi.spyOn(endpoints, "setActiveIds").mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: undefined,
    });
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrame = callback;
      return 9;
    });
    const cancelSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => {});
    setActiveSectionIds(["section-a"]);
    await loadProjectState(buildProjectStateData("project-b", ["section-b"]));
    expect(cancelSpy).toHaveBeenCalledWith(9);
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-b"]);
    scheduledFrame?.(16);
    expect(endpointSpy).not.toHaveBeenCalled();
  });
});
function buildProjectState(
  projectConfigId: string,
  activeIds: Array<string>,
  sectionIds: Array<string> = [],
): ProjectStateSingleConfigWithCompletedOpIDs {
  return {
    projectState: buildProjectStateData(projectConfigId, activeIds, sectionIds),
    completedOpIds: [],
    pendingOpIds: [],
  };
}
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
      x: index * 240,
      y: index * 120,
      zIndex: index,
      w: 200,
      h: 160,
    };
    sections[sectionId] = createCore({ id: sectionId });
    sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      nonPresetImpls: [implId],
      name: `variant-${sectionId}`,
    });
    sectionImpls[implId] = createCodeSectionImpl({
      id: implId,
    });
  }
  return {
    projectConfig: createProjectConfig({
      id: projectConfigId,
      activeIds,
      sectionVariantMap,
      topLevelSections,
    }),
    projectChatWindowing: createProjectChatWindowingState(),
    sections,
    sectionImpls,
    sectionVariants,
    codeObjs: {},
    codeObjImpls: {},
    codeObjVariants: {},
    artifactGroups: {},
    singletonSections: createSingletonSections(),
    parentSectionMap,
    shownParamIds: {},
    requiredDecodedImages: [],
    genCodeBinding: null,
  };
}
