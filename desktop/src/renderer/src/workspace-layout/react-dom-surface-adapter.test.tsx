import { isValidElement, type ReactNode } from "react";
import { describe, expect, test } from "vitest";

import {
  createReactDomSurfaceAdapter,
  ReactDomSurfaceAdapter,
  type ReactSurfaceRoot,
  type ReactSurfaceRootFactory,
} from "./react-dom-surface-adapter";
import { createFakeHost } from "./test-dom-fakes";
import type { WorkspacePane } from "./types";

describe("workspace React DOM surface adapter", () => {
  test("parks React root across host unmounts and tears it down on destroy", async () => {
    const events: string[] = [];
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot(container) {
        events.push(`create:${container.className}`);
        return new RecordingRoot(events);
      },
    };
    const host = createFakeHost();
    const adapter = new ReactDomSurfaceAdapter(
      fakePane("fake-long-chat"),
      () => "long chat surface",
      rootFactory,
    );

    adapter.mount(host);
    const container = requireFakeChild(fakeChildrenOf(host), 0);
    adapter.setViewport({ height: 120, width: 180, x: 0, y: 0 }, "mount");
    adapter.setVisible(true);
    adapter.setFocused(true);
    adapter.freeze("snapshot");
    adapter.resume("focused");

    expect(events).toEqual(["create:workspace-react-dom-surface", "render", "render"]);
    expect(host.dataset.surfaceKind).toBe("fake-long-chat");
    expect(host.dataset.surfaceViewport).toBe("180x120");
    expect(host.dataset.surfaceFocused).toBe("true");
    expect(host.dataset.surfaceFrozen).toBe("false");
    expect(host.dataset.surfaceVisible).toBe("true");
    expect(container.dataset.scrollbarsSuppressed).toBe("true");
    expect(adapter.lifecycleState).toMatchObject({
      activated: true,
      focused: true,
      frozen: false,
      mounted: true,
      visible: true,
    });

    adapter.unmount();
    await waitForMicrotask();

    expect(events).toEqual(["create:workspace-react-dom-surface", "render", "render"]);
    expect(adapter.lifecycleState.mounted).toBe(false);

    adapter.mount(host);

    expect(events).toEqual(["create:workspace-react-dom-surface", "render", "render"]);
    expect(adapter.lifecycleState.mounted).toBe(true);

    adapter.destroy();
    await waitForMicrotask();

    expect(events).toEqual(["create:workspace-react-dom-surface", "render", "render", "unmount"]);
    expect(adapter.lifecycleState.mounted).toBe(false);
  });

  test("restores parked DOM scroller offsets when remounting React surfaces", () => {
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot() {
        return new RecordingRoot([]);
      },
    };
    const host = createFakeHost();
    const adapter = new ReactDomSurfaceAdapter(
      fakePane("chat-dom"),
      () => "chat surface",
      rootFactory,
    );

    adapter.mount(host);
    const container = requireFakeChild(fakeChildrenOf(host), 0);
    const scroller = host.ownerDocument.createElement("div");
    scroller.scrollTop = 240;
    container.append(scroller as unknown as FakeChildNode);

    adapter.unmount();
    scroller.scrollTop = 0;
    adapter.mount(host);

    expect(scroller.dataset.snapshotScrollTop).toBe("240");
    expect(scroller.scrollTop).toBe(240);
  });

  test("restores parked scroll offsets onto recreated scroller nodes", () => {
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot() {
        return new RecordingRoot([]);
      },
    };
    const host = createFakeHost();
    const adapter = new ReactDomSurfaceAdapter(
      fakePane("chat-dom"),
      () => "chat surface",
      rootFactory,
    );

    adapter.mount(host);
    const container = requireFakeChild(fakeChildrenOf(host), 0);
    const parkedScroller = host.ownerDocument.createElement("div");
    parkedScroller.dataset.testid = "chat-transcript-scroller";
    parkedScroller.scrollTop = 240;
    container.append(parkedScroller as unknown as FakeChildNode);

    adapter.unmount();
    const recreatedScroller = host.ownerDocument.createElement("div");
    recreatedScroller.dataset.testid = "chat-transcript-scroller";
    recreatedScroller.scrollTop = 0;
    container.replaceChildren(recreatedScroller as unknown as FakeChildNode);
    adapter.mount(host);

    expect(recreatedScroller.dataset.snapshotScrollTop).toBeUndefined();
    expect(recreatedScroller.scrollTop).toBe(240);
  });

  test("rerenders React DOM surfaces when focus changes", () => {
    const surfaceStates: Array<{ activated: boolean; focused: boolean }> = [];
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot() {
        return new RecordingRoot([]);
      },
    };
    const host = createFakeHost();
    const adapter = new ReactDomSurfaceAdapter(
      fakePane("settings-dom"),
      ({ activated, focused }) => {
        surfaceStates.push({ activated, focused });
        return focused ? "active settings" : "inactive settings";
      },
      rootFactory,
    );

    adapter.mount(host);
    adapter.setFocused(true);
    adapter.setFocused(true);
    adapter.setFocused(false);

    expect(surfaceStates).toEqual([
      { activated: false, focused: false },
      { activated: true, focused: true },
      { activated: true, focused: false },
    ]);
  });

  test("mounts workflow graph as a React surface with canvas runtime stats", () => {
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot() {
        return new RecordingRoot([]);
      },
    };
    const host = createFakeHost();
    const adapter = createReactDomSurfaceAdapter(fakePane("workflow-graph"), rootFactory);

    adapter.mount(host);
    adapter.setVisible(true);

    expect(host.dataset.surfaceKind).toBe("workflow-graph");
    expect(adapter.getCanvasStats()).toMatchObject({
      liveCanvasPaneCount: 1,
      renderedFrames: 0,
    });

    adapter.setVisible(false);

    expect(adapter.getCanvasStats().liveCanvasPaneCount).toBe(0);
  });

  test("passes synthetic graph fallback to workflow graph surfaces", () => {
    const root = new RecordingRoot([]);
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot() {
        return root;
      },
    };
    const host = createFakeHost();
    const adapter = createReactDomSurfaceAdapter(fakePane("workflow-graph"), rootFactory, {
      workflowGraphSyntheticGraphFallback: {
        edgesPerNode: 2,
        nodeCount: 500,
      },
    });

    adapter.mount(host);
    const renderedNode = root.renderedNodes.at(-1);
    if (
      !isValidElement<{
        syntheticGraphFallback?: unknown;
        surfaceId?: string;
      }>(renderedNode)
    ) {
      throw new Error("workflow graph surface did not render a React element");
    }

    expect(renderedNode.props.surfaceId).toBe("surface");
    expect(renderedNode.props.syntheticGraphFallback).toStrictEqual({
      edgesPerNode: 2,
      nodeCount: 500,
    });
  });
});

class RecordingRoot implements ReactSurfaceRoot {
  readonly renderedNodes: ReactNode[] = [];

  constructor(private readonly events: string[]) {}

  render(node: ReactNode): void {
    this.events.push("render");
    this.renderedNodes.push(node);
  }

  unmount(): void {
    this.events.push("unmount");
  }
}

function waitForMicrotask(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve);
  });
}

function fakePane(surfaceKind: WorkspacePane["surfaceKind"]): WorkspacePane {
  return {
    columnId: "column",
    heat: 42,
    paneId: "pane",
    sequence: 0,
    subtitle: "test",
    surfaceId: "surface",
    surfaceKind,
    title: "Pane",
    tone: "cyan",
    weight: 1,
  };
}

interface FakeChildNode {
  append(...nodes: FakeChildNode[]): void;
  children: FakeChildNode[];
  dataset: Record<string, string>;
  replaceChildren(...nodes: FakeChildNode[]): void;
  scrollTop: number;
}

function fakeChildrenOf(host: HTMLElement): FakeChildNode[] {
  return (host as unknown as { children: FakeChildNode[] }).children;
}

function requireFakeChild(children: FakeChildNode[], index: number): FakeChildNode {
  const child = children[index];
  if (!child) {
    throw new Error(`missing fake child at index ${index}`);
  }
  return child;
}
