/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState } from "../canvas/store";
import { registerWorkspaceXyflowInstance } from "../canvas/xyflow/workspaceXyflowRuntime";
import type { WorkspaceXyflowInstance } from "../canvas/xyflow/types";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import type {
  WorkspaceDocumentInput,
  WorkspaceSavedViewsState,
  WorkspaceSection,
} from "../document/types";
import {
  fitWorkspaceSections,
  getWorkspaceSectionAttentionState,
  setWorkspaceSectionAttention,
  useWorkspaceSectionAttentionHighlight,
  WORKSPACE_SECTION_ATTENTION_LINGER_DURATION,
  WORKSPACE_SECTION_FIT_DURATION,
} from "./workspaceSectionAttention";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createSection(
  id: string,
  children: Array<string> = [],
): WorkspaceSection {
  return {
    children,
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: "leaf",
    name: id,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 100, width: 200 },
    styleColor: null,
    tagColor: null,
  };
}

function createShell({
  height,
  width,
  x,
  y,
}: {
  height: number;
  width: number;
  x: number;
  y: number;
}): HTMLElement {
  return {
    clientHeight: height,
    clientWidth: width,
    getBoundingClientRect: () => ({ x, y }),
  } as unknown as HTMLElement;
}

function populateWorkspace(workspace: WorkspaceTestHost): void {
  workspace.document.setState({
    parentSectionMap: { nested: "root" },
    savedViews: null,
    sections: {
      leaf: createSection("leaf"),
      nested: createSection("nested"),
      root: createSection("root", ["nested"]),
    },
    topLevelSections: {
      leaf: { h: 100, w: 150, x: 600, y: 300, zIndex: 1 },
      root: { h: 500, w: 700, x: 100, y: 100, zIndex: 0 },
    },
    viewport: { x: 20, y: 30, zoom: 1 },
  });
  workspace.activeSections.setState({ activeIds: ["leaf"] });
  workspace.reactFlow.setState({
    ...initialCanvasState,
    height: 600,
    viewportInsets: { bottom: 0, left: 200, right: 100, top: 0 },
    width: 1000,
  });
  workspace.sectionRefs.setState({
    selfOnly: {
      leaf: createShell({ height: 100, width: 150, x: 600, y: 300 }),
      nested: createShell({ height: 80, width: 100, x: 300, y: 200 }),
    },
    withNested: {
      root: createShell({ height: 500, width: 700, x: 100, y: 100 }),
    },
  });
}

function setupXyflowRuntime(
  workspace: WorkspaceTestHost,
  transition: () => Promise<boolean> = () => Promise.resolve(true),
) {
  const setViewport = vi.fn(transition);
  registerWorkspaceXyflowInstance(workspace.host, {
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    screenToFlowPosition: vi.fn(),
    setViewport,
    zoomTo: vi.fn(() => Promise.resolve(true)),
  } as unknown as WorkspaceXyflowInstance);
  return { setViewport };
}

function createDeferredTransition() {
  let resolve: (value: boolean) => void;
  const promise = new Promise<boolean>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: (value: boolean) => resolve(value) };
}

async function settleTransitionPromise(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createSavedViews(): WorkspaceSavedViewsState {
  return {
    activeViewId: "view",
    views: {
      view: {
        id: "view",
        isTab: false,
        name: "View",
        sectionVisibility: { leaf: true, nested: false, root: true },
        sortIndex: 0,
        topLevelSections: {
          leaf: { h: 100, w: 150, x: 600, y: 300, zIndex: 1 },
          root: { h: 500, w: 700, x: 100, y: 100, zIndex: 0 },
        },
        viewport: { x: 20, y: 30, zoom: 1 },
      },
    },
  };
}

function createLoadedDocument(): WorkspaceDocumentInput {
  return {
    activeIds: [],
    savedViews: null,
    sections: { leaf: createSection("leaf") },
    topLevelSections: {
      leaf: { h: 100, w: 150, x: 600, y: 300, zIndex: 1 },
    },
    viewport: { x: 20, y: 30, zoom: 1 },
  };
}

let latestHighlight: boolean | null = null;

function AttentionHighlightProbe({ sectionId }: { sectionId: string }) {
  latestHighlight = useWorkspaceSectionAttentionHighlight(sectionId);
  return null;
}

describe("workspace section attention", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    populateWorkspace(testWorkspace);
    latestHighlight = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fits the exact nested shell union inside viewport insets without publishing a document mutation", () => {
    const { setViewport } = setupXyflowRuntime(testWorkspace);
    const before = structuredClone(testWorkspace.host.getSnapshot());
    const publish = vi.fn();
    const unsubscribe = testWorkspace.host.subscribe(publish);

    try {
      fitWorkspaceSections(testWorkspace.host, ["nested", "leaf"], {
        duration: 120,
        maxZoom: 1,
        padding: 0,
      });

      expect(setViewport).toHaveBeenCalledWith(
        { x: 25, y: 0, zoom: 1 },
        { duration: 120 },
      );
      expect(getWorkspaceSectionAttentionState(testWorkspace.host)).toEqual({
        isTransitioning: true,
        sectionIds: [],
      });
      expect(testWorkspace.host.getSnapshot()).toEqual(before);
      expect(publish).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("uses main's fit defaults and allows each viewport option to be overridden", () => {
    const { setViewport } = setupXyflowRuntime(testWorkspace);

    fitWorkspaceSections(testWorkspace.host, ["nested"]);

    expect(setViewport).toHaveBeenCalledWith(
      { x: 200, y: 60, zoom: 1 },
      { duration: WORKSPACE_SECTION_FIT_DURATION },
    );

    fitWorkspaceSections(testWorkspace.host, ["nested"], {
      duration: 0,
      maxZoom: 0.5,
      padding: 0,
    });

    expect(setViewport).toHaveBeenLastCalledWith(
      { x: 375, y: 180, zoom: 0.5 },
      { duration: 0 },
    );
    expect(getWorkspaceSectionAttentionState(testWorkspace.host)).toEqual({
      isTransitioning: false,
      sectionIds: [],
    });
  });

  it("frames a section together with its attached runtime result", () => {
    const { setViewport } = setupXyflowRuntime(testWorkspace);
    const joined = document.createElement("div");
    joined.setAttribute("data-workspace-joined-section-group", "");
    Object.defineProperties(joined, {
      clientWidth: { value: 100 },
      clientHeight: { value: 400 },
    });
    const shell = createShell({ height: 80, width: 100, x: 300, y: 200 });
    Object.defineProperty(shell, "parentElement", { value: joined });
    testWorkspace.sectionRefs.setState({ selfOnly: { nested: shell } });
    fitWorkspaceSections(testWorkspace.host, ["nested"], {
      duration: 0,
      padding: 0,
    });
    expect(setViewport).toHaveBeenCalledWith(
      { x: 200, y: -100, zoom: 1 },
      { duration: 0 },
    );
  });

  it("makes reduced-motion section fits immediate without holding the gesture lock", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn(() => ({ matches: true })),
    });
    const { setViewport } = setupXyflowRuntime(testWorkspace);

    fitWorkspaceSections(testWorkspace.host, ["nested"]);

    expect(setViewport).toHaveBeenCalledWith(
      { x: 200, y: 60, zoom: 1 },
      { duration: 0 },
    );
    expect(getWorkspaceSectionAttentionState(testWorkspace.host)).toEqual({
      isTransitioning: false,
      sectionIds: [],
    });
  });

  it("validates every requested id before replacing the highlighted set or moving the viewport", () => {
    const { setViewport } = setupXyflowRuntime(testWorkspace);
    setWorkspaceSectionAttention(testWorkspace.host, ["nested"]);

    expect(() =>
      setWorkspaceSectionAttention(testWorkspace.host, ["nested", "missing"]),
    ).toThrowError("Cannot attend unknown workspace section missing.");
    expect(() =>
      fitWorkspaceSections(testWorkspace.host, ["nested", "missing"]),
    ).toThrowError("Cannot attend unknown workspace section missing.");

    expect(getWorkspaceSectionAttentionState(testWorkspace.host)).toEqual({
      isTransitioning: false,
      sectionIds: ["nested"],
    });
    expect(setViewport).not.toHaveBeenCalled();
  });

  it("rejects hidden targets but accepts known visible attention before measurement", () => {
    setWorkspaceSectionAttention(testWorkspace.host, ["leaf"]);
    testWorkspace.document.setState({ savedViews: createSavedViews() });

    expect(() =>
      setWorkspaceSectionAttention(testWorkspace.host, ["nested"]),
    ).toThrowError("Cannot attend hidden workspace section nested.");

    testWorkspace.document.setState({ savedViews: null });
    testWorkspace.sectionRefs.setState({
      selfOnly: {
        leaf: createShell({ height: 100, width: 150, x: 600, y: 300 }),
      },
      withNested: {
        root: createShell({ height: 500, width: 700, x: 100, y: 100 }),
      },
    });
    setWorkspaceSectionAttention(testWorkspace.host, ["nested"]);
    expect(getWorkspaceSectionAttentionState(testWorkspace.host)).toEqual({
      isTransitioning: false,
      sectionIds: ["nested"],
    });

    testWorkspace.sectionRefs.setState({
      selfOnly: {
        leaf: createShell({ height: 100, width: 150, x: 600, y: 300 }),
        nested: createShell({ height: 0, width: 100, x: 300, y: 200 }),
      },
      withNested: {
        root: createShell({ height: 500, width: 700, x: 100, y: 100 }),
      },
    });
    setWorkspaceSectionAttention(testWorkspace.host, ["nested"]);
    expect(getWorkspaceSectionAttentionState(testWorkspace.host)).toEqual({
      isTransitioning: false,
      sectionIds: ["nested"],
    });
  });

  it("waits for a requested section shell to mount before fitting", async () => {
    const { setViewport } = setupXyflowRuntime(testWorkspace);
    const refs = testWorkspace.sectionRefs.getState();
    testWorkspace.sectionRefs.setState({
      selfOnly: { leaf: refs.selfOnly.leaf ?? null },
      withNested: refs.withNested,
    });

    const fit = fitWorkspaceSections(testWorkspace.host, ["nested"], {
      duration: 0,
    });
    expect(setViewport).not.toHaveBeenCalled();

    testWorkspace.sectionRefs.setState({
      selfOnly: {
        leaf: refs.selfOnly.leaf ?? null,
        nested: createShell({ height: 80, width: 100, x: 300, y: 200 }),
      },
      withNested: refs.withNested,
    });
    await fit;

    expect(setViewport).toHaveBeenCalledOnce();
  });

  it("waits for a mounted section shell to acquire positive bounds", async () => {
    let height = 0;
    let observerCreated = false;
    let notifyResize: ResizeObserverCallback = () => undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          observerCreated = true;
          notifyResize = callback;
        }
        disconnect() {}
        observe() {}
        unobserve() {}
      },
    );
    const shell = {
      get clientHeight() {
        return height;
      },
      clientWidth: 100,
      getBoundingClientRect: () => ({ x: 300, y: 200 }),
    } as unknown as HTMLElement;
    const refs = testWorkspace.sectionRefs.getState();
    testWorkspace.sectionRefs.setState({
      selfOnly: { ...refs.selfOnly, nested: shell },
      withNested: refs.withNested,
    });
    const { setViewport } = setupXyflowRuntime(testWorkspace);

    const fit = fitWorkspaceSections(testWorkspace.host, ["nested"], {
      duration: 0,
    });
    expect(setViewport).not.toHaveBeenCalled();
    height = 80;
    if (!observerCreated)
      throw new Error("Expected a section resize observer.");
    notifyResize([], {} as ResizeObserver);
    await fit;

    expect(setViewport).toHaveBeenCalledOnce();
  });

  it("waits for the canvas runtime after section projection is ready", async () => {
    const fit = fitWorkspaceSections(testWorkspace.host, ["nested"], {
      duration: 0,
    });

    const { setViewport } = setupXyflowRuntime(testWorkspace);
    await fit;

    expect(setViewport).toHaveBeenCalledOnce();
  });

  it("settles a superseded pending fit without applying it later", async () => {
    const { setViewport } = setupXyflowRuntime(testWorkspace);
    const refs = testWorkspace.sectionRefs.getState();
    testWorkspace.sectionRefs.setState({
      selfOnly: { leaf: refs.selfOnly.leaf ?? null },
      withNested: refs.withNested,
    });

    const superseded = fitWorkspaceSections(testWorkspace.host, ["nested"], {
      duration: 0,
    });
    const active = fitWorkspaceSections(testWorkspace.host, ["leaf"], {
      duration: 0,
    });
    await Promise.all([superseded, active]);
    testWorkspace.sectionRefs.setState({
      selfOnly: {
        leaf: refs.selfOnly.leaf ?? null,
        nested: createShell({ height: 80, width: 100, x: 300, y: 200 }),
      },
      withNested: refs.withNested,
    });

    expect(setViewport).toHaveBeenCalledOnce();
    expect(setViewport).toHaveBeenCalledWith(
      { x: -125, y: -50, zoom: 1 },
      { duration: 0 },
    );
  });

  it("settles pending fits when their target becomes hidden or is deleted", async () => {
    const { setViewport } = setupXyflowRuntime(testWorkspace);
    const refs = testWorkspace.sectionRefs.getState();
    testWorkspace.sectionRefs.setState({
      selfOnly: { leaf: refs.selfOnly.leaf ?? null },
      withNested: refs.withNested,
    });

    const hidden = fitWorkspaceSections(testWorkspace.host, ["nested"]);
    testWorkspace.document.setState({ savedViews: createSavedViews() });
    await hidden;

    testWorkspace.document.setState({ savedViews: null });
    const deleted = fitWorkspaceSections(testWorkspace.host, ["nested"]);
    const document = testWorkspace.document.getState();
    const sections = { ...document.sections };
    delete sections.nested;
    testWorkspace.document.setState({ sections });
    await deleted;

    expect(setViewport).not.toHaveBeenCalled();
  });

  it("releases the gesture lock when XYFlow reports the transition complete", async () => {
    const transition = createDeferredTransition();
    setupXyflowRuntime(testWorkspace, () => transition.promise);

    fitWorkspaceSections(testWorkspace.host, ["nested"]);
    expect(
      getWorkspaceSectionAttentionState(testWorkspace.host).isTransitioning,
    ).toBe(true);

    transition.resolve(true);
    await settleTransitionPromise();

    expect(
      getWorkspaceSectionAttentionState(testWorkspace.host).isTransitioning,
    ).toBe(false);
  });

  it("does not release the gesture lock on the nominal duration before XYFlow settles", async () => {
    const transition = createDeferredTransition();
    setupXyflowRuntime(testWorkspace, () => transition.promise);

    fitWorkspaceSections(testWorkspace.host, ["nested"]);
    vi.advanceTimersByTime(WORKSPACE_SECTION_FIT_DURATION * 2);

    expect(
      getWorkspaceSectionAttentionState(testWorkspace.host).isTransitioning,
    ).toBe(true);

    transition.resolve(true);
    await settleTransitionPromise();

    expect(
      getWorkspaceSectionAttentionState(testWorkspace.host).isTransitioning,
    ).toBe(false);
  });

  it("keeps the newest transition locked when an older transition is interrupted", async () => {
    const interruptedTransition = createDeferredTransition();
    const activeTransition = createDeferredTransition();
    const transitions = [interruptedTransition, activeTransition];
    setupXyflowRuntime(testWorkspace, () => {
      const transition = transitions.shift();
      if (!transition) {
        throw new Error("Missing controlled XYFlow transition.");
      }
      return transition.promise;
    });

    fitWorkspaceSections(testWorkspace.host, ["nested"]);
    fitWorkspaceSections(testWorkspace.host, ["leaf"]);

    interruptedTransition.resolve(false);
    await settleTransitionPromise();
    expect(
      getWorkspaceSectionAttentionState(testWorkspace.host).isTransitioning,
    ).toBe(true);

    activeTransition.resolve(true);
    await settleTransitionPromise();
    expect(
      getWorkspaceSectionAttentionState(testWorkspace.host).isTransitioning,
    ).toBe(false);
  });

  it("keeps a cleared highlight visible for the reference's 650ms linger", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <WorkspaceTestProvider workspace={testWorkspace}>
            {createElement(AttentionHighlightProbe, { sectionId: "nested" })}
          </WorkspaceTestProvider>,
        );
      });
      expect(latestHighlight).toBe(false);

      await act(async () => {
        setWorkspaceSectionAttention(testWorkspace.host, ["nested"]);
      });
      expect(latestHighlight).toBe(true);

      await act(async () => {
        setWorkspaceSectionAttention(testWorkspace.host, []);
      });
      expect(latestHighlight).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(WORKSPACE_SECTION_ATTENTION_LINGER_DURATION - 1);
      });
      expect(latestHighlight).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(latestHighlight).toBe(false);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("clears attention and transition ownership when a replacement document loads", async () => {
    registerSectionKinds(testWorkspace.host, {
      leaf: { renderContent: () => null },
    });
    const document = createLoadedDocument();
    loadWorkspaceDocument(testWorkspace.host, document);
    testWorkspace.sectionRefs.setState({
      selfOnly: {
        leaf: createShell({ height: 100, width: 150, x: 600, y: 300 }),
      },
      withNested: {},
    });
    const transition = createDeferredTransition();
    setupXyflowRuntime(testWorkspace, () => transition.promise);
    setWorkspaceSectionAttention(testWorkspace.host, ["leaf"]);
    fitWorkspaceSections(testWorkspace.host, ["leaf"]);

    loadWorkspaceDocument(testWorkspace.host, document);

    expect(getWorkspaceSectionAttentionState(testWorkspace.host)).toEqual({
      isTransitioning: false,
      sectionIds: [],
    });
    transition.resolve(true);
    await settleTransitionPromise();
    expect(
      getWorkspaceSectionAttentionState(testWorkspace.host).isTransitioning,
    ).toBe(false);
  });

  it("settles an unmeasured fit when a replacement document loads", async () => {
    registerSectionKinds(testWorkspace.host, {
      leaf: { renderContent: () => null },
    });
    setupXyflowRuntime(testWorkspace);
    testWorkspace.sectionRefs.setState({ selfOnly: {}, withNested: {} });
    const fit = fitWorkspaceSections(testWorkspace.host, ["leaf"]);

    loadWorkspaceDocument(testWorkspace.host, createLoadedDocument());
    await fit;

    expect(getWorkspaceSectionAttentionState(testWorkspace.host)).toEqual({
      isTransitioning: false,
      sectionIds: [],
    });
  });

  it("settles an unmeasured fit when its host is disposed", async () => {
    const workspace = createWorkspaceTestHost();
    populateWorkspace(workspace);
    workspace.sectionRefs.setState({ selfOnly: {}, withNested: {} });
    const { setViewport } = setupXyflowRuntime(workspace);
    const fit = fitWorkspaceSections(workspace.host, ["nested"]);

    workspace.host.dispose();
    await fit;

    expect(setViewport).not.toHaveBeenCalled();
  });

  it("keeps attention isolated between workspace hosts", () => {
    const secondWorkspace = createWorkspaceTestHost();
    try {
      populateWorkspace(secondWorkspace);
      setWorkspaceSectionAttention(testWorkspace.host, ["nested"]);
      setWorkspaceSectionAttention(secondWorkspace.host, ["leaf"]);

      expect(getWorkspaceSectionAttentionState(testWorkspace.host)).toEqual({
        isTransitioning: false,
        sectionIds: ["nested"],
      });
      expect(getWorkspaceSectionAttentionState(secondWorkspace.host)).toEqual({
        isTransitioning: false,
        sectionIds: ["leaf"],
      });

      setWorkspaceSectionAttention(secondWorkspace.host, []);

      expect(getWorkspaceSectionAttentionState(testWorkspace.host)).toEqual({
        isTransitioning: false,
        sectionIds: ["nested"],
      });
    } finally {
      secondWorkspace.host.dispose();
    }
  });
});
