import { isValidElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EasyButtonSurface } from "../features/easy-button/easy-button-surface";
import type { GlobalSpeechPresentationSource } from "../features/global-speech/global-speech-presentation";
import { reactDomSurfaceHostChangedEvent } from "./react-dom-surface-events";
import {
  createReactDomSurfaceAdapter,
  ReactDomSurfaceAdapter,
  type ReactSurfaceRoot,
  type ReactSurfaceRootFactory,
} from "./react-dom-surface-adapter";
import { createFakeHost } from "./test-dom-fakes";
import type { WorkspacePane } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
      fakePane("fake-heavy-dom"),
      () => "heavy DOM surface",
      rootFactory,
    );

    adapter.mount(host);
    const container = requireFakeChild(fakeChildrenOf(host), 0);
    adapter.setViewport({ height: 120, width: 180, x: 0, y: 0 }, "mount");
    adapter.setVisible(true);
    adapter.setFocused(true);
    adapter.freeze("snapshot");
    adapter.resume("focused");

    expect(events).toEqual(["create:workspace-react-dom-surface", "render", "render", "render"]);
    expect(host.dataset.surfaceKind).toBe("fake-heavy-dom");
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

    expect(events).toEqual(["create:workspace-react-dom-surface", "render", "render", "render"]);
    expect(adapter.lifecycleState.mounted).toBe(false);

    adapter.mount(host);

    expect(events).toEqual(["create:workspace-react-dom-surface", "render", "render", "render"]);
    expect(adapter.lifecycleState.mounted).toBe(true);

    adapter.destroy();
    await waitForMicrotask();

    expect(events).toEqual([
      "create:workspace-react-dom-surface",
      "render",
      "render",
      "render",
      "unmount",
    ]);
    expect(adapter.lifecycleState.mounted).toBe(false);
  });

  test("notifies parked React content when its pane host changes", () => {
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot() {
        return new RecordingRoot([]);
      },
    };
    const firstHost = createFakeHost();
    const secondHost = createFakeHost();
    const adapter = new ReactDomSurfaceAdapter(
      fakePane("easy-button"),
      () => "easy button surface",
      rootFactory,
    );

    adapter.mount(firstHost);
    const container = requireFakeChild(fakeChildrenOf(firstHost), 0);
    const containerElement = container as unknown as HTMLElement;
    const hostChanges: Array<HTMLElement | null> = [];
    containerElement.addEventListener(reactDomSurfaceHostChangedEvent, () => {
      hostChanges.push(containerElement.parentElement);
    });

    adapter.mount(secondHost);

    expect(hostChanges).toEqual([null, secondHost]);
    expect(fakeChildrenOf(firstHost)).toHaveLength(0);
    expect(fakeChildrenOf(secondHost)).toEqual([container]);
  });

  test("restores parked DOM scroller offsets when remounting React surfaces", () => {
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot() {
        return new RecordingRoot([]);
      },
    };
    const host = createFakeHost();
    const adapter = new ReactDomSurfaceAdapter(
      fakePane("easy-button"),
      () => "conversation surface",
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

  test("freezes React DOM surfaces behind a static visual while hiding live content", () => {
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot() {
        return new RecordingRoot([]);
      },
    };
    const host = createFakeHost();
    const adapter = new ReactDomSurfaceAdapter(
      fakePane("easy-button"),
      () => "conversation surface",
      rootFactory,
    );

    adapter.mount(host);
    const container = requireFakeChild(fakeChildrenOf(host), 0);
    const message = host.ownerDocument.createElement("article");
    message.textContent = "Visible frozen conversation projection";
    container.append(message as unknown as FakeChildNode);

    adapter.freeze("runtime-policy");

    const frozenVisual = requireFakeChild(fakeChildrenOf(host), 1);
    expect(container.dataset.liveFrozenHidden).toBe("true");
    expect(frozenVisual.className).toBe("workspace-frozen-dom-visual");
    expect(frozenVisual.children[0]?.children[0]?.textContent).toBe(
      "Visible frozen conversation projection",
    );

    adapter.resume("visible");

    expect(container.dataset.liveFrozenHidden).toBeUndefined();
    expect(fakeChildrenOf(host)).toHaveLength(1);
  });

  test("activates React DOM surfaces when visible without pane focus", () => {
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
        return activated ? "loaded settings" : "unloaded settings";
      },
      rootFactory,
    );

    adapter.mount(host);
    adapter.setVisible(true);

    expect(surfaceStates).toEqual([
      { activated: false, focused: false },
      { activated: true, focused: false },
    ]);
    expect(host.dataset.surfaceFocused).toBe("false");
    expect(host.dataset.surfaceVisible).toBe("true");
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

  test("mounts the easy button as an idle React DOM surface", () => {
    const root = new RecordingRoot([]);
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot() {
        return root;
      },
    };
    const host = createFakeHost();
    const speechCapture = { start: vi.fn(async () => {}) };
    const speechPresentation = {} as GlobalSpeechPresentationSource;
    const adapter = createReactDomSurfaceAdapter(fakePane("easy-button"), rootFactory, {
      speechCapture,
      speechPresentation,
      workspaceId: "workspace_test",
    });

    adapter.mount(host);

    const renderedNode = root.renderedNodes.at(-1);
    if (
      !isValidElement<{
        conversationId: string | null;
        paneId: string;
        speechCapture: typeof speechCapture;
        speechPresentation: GlobalSpeechPresentationSource;
        workspaceId: string;
      }>(renderedNode)
    ) {
      throw new Error("easy button surface did not render a React element");
    }
    expect(host.dataset.surfaceKind).toBe("easy-button");
    expect(renderedNode.type).toBe(EasyButtonSurface);
    expect(renderedNode.props.conversationId).toBe("conversation_test");
    expect(renderedNode.props.paneId).toBe("pane");
    expect(renderedNode.props.speechCapture).toBe(speechCapture);
    expect(renderedNode.props.speechPresentation).toBe(speechPresentation);
    expect(renderedNode.props.workspaceId).toBe("workspace_test");
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
    easyButtonConfig:
      surfaceKind === "easy-button" ? { conversationId: "conversation_test" } : undefined,
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
  className: string;
  dataset: Record<string, string>;
  scrollTop: number;
  textContent: string;
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
