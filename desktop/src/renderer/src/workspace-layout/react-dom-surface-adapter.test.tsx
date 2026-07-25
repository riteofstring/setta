import type { ConversationSnapshot } from "@generated/backend";
import { isValidElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EasyButtonSurface } from "../features/easy-button/easy-button-conversation-surface";
import type { AppShellMasterController } from "../features/global-master/app-shell-master-controller";
import { AppShellMasterPaneSurface } from "../features/global-master/app-shell-master-pane-surface";
import type { GlobalSpeechPresentationSource } from "../features/global-speech/global-speech-presentation";
import { useWorkspaceStore } from "../stores/workspace-store";
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
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

describe("workspace React DOM surface adapter", () => {
  test("parks React root across host unmounts and tears it down synchronously on destroy", async () => {
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
      fakePane("conversation"),
      () => "conversation surface",
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

  test("unmounts React content before detaching the final host on destroy", () => {
    const host = createFakeHost();
    const unmountObservations: number[] = [];
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot() {
        return {
          render() {},
          unmount() {
            unmountObservations.push(fakeChildrenOf(host).length);
          },
        };
      },
    };
    const adapter = new ReactDomSurfaceAdapter(
      fakePane("conversation"),
      () => "conversation surface",
      rootFactory,
    );

    adapter.mount(host);
    adapter.destroy();

    expect(unmountObservations).toEqual([1]);
    expect(fakeChildrenOf(host)).toHaveLength(0);
  });

  test("restores parked DOM scroller offsets when remounting React surfaces", () => {
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot() {
        return new RecordingRoot([]);
      },
    };
    const host = createFakeHost();
    const adapter = new ReactDomSurfaceAdapter(
      fakePane("conversation"),
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
      fakePane("conversation"),
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
      fakePane("fake-dom"),
      ({ activated, focused }) => {
        surfaceStates.push({ activated, focused });
        return activated ? "loaded surface" : "unloaded surface";
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
      fakePane("fake-dom"),
      ({ activated, focused }) => {
        surfaceStates.push({ activated, focused });
        return focused ? "active surface" : "inactive surface";
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

  test("mounts the conversation pane as an idle React DOM surface", () => {
    const root = new RecordingRoot([]);
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot() {
        return root;
      },
    };
    const host = createFakeHost();
    const speechCapture = { start: vi.fn(async () => {}) };
    const speechPresentation = {} as GlobalSpeechPresentationSource;
    const adapter = createReactDomSurfaceAdapter(fakePane("conversation"), rootFactory, {
      speechCapture,
      speechPresentation,
      workspaceId: "workspace_test",
    });

    adapter.mount(host);

    const renderedNode = root.renderedNodes.at(-1);
    if (
      !isValidElement<{
        conversationId: string;
        paneId: string;
        speechCapture: typeof speechCapture;
        speechPresentation: GlobalSpeechPresentationSource;
        workspaceId: string;
      }>(renderedNode)
    ) {
      throw new Error("conversation surface did not render a React element");
    }
    expect(host.dataset.surfaceKind).toBe("conversation");
    expect(renderedNode.type).toBe(EasyButtonSurface);
    expect(renderedNode.props.conversationId).toBe("conversation_test");
    expect(renderedNode.props.paneId).toBe("pane");
    expect(renderedNode.props.speechCapture).toBe(speechCapture);
    expect(renderedNode.props.speechPresentation).toBe(speechPresentation);
    expect(renderedNode.props.workspaceId).toBe("workspace_test");
  });

  test("keeps explicitly folderless conversation panes folderless in a selected workspace", () => {
    const root = new RecordingRoot([]);
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot() {
        return root;
      },
    };
    const host = createFakeHost();
    const adapter = createReactDomSurfaceAdapter(
      fakeConversationPane({ resourceBindings: [] }),
      rootFactory,
      { workspaceId: "workspace_selected" },
    );

    adapter.mount(host);

    const renderedNode = root.renderedNodes.at(-1);
    if (
      !isValidElement<{
        resourceBindings: [];
        workspaceId: string | null;
      }>(renderedNode)
    ) {
      throw new Error("conversation surface did not render a React element");
    }
    expect(renderedNode.type).toBe(EasyButtonSurface);
    expect(renderedNode.props.resourceBindings).toEqual([]);
    expect(renderedNode.props.workspaceId).toBe("workspace_selected");
  });

  test("keeps minimal live conversation panes bound to the selected workspace", () => {
    const root = new RecordingRoot([]);
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot() {
        return root;
      },
    };
    const host = createFakeHost();
    const adapter = createReactDomSurfaceAdapter(fakeConversationPane(), rootFactory, {
      workspaceId: "workspace_selected",
    });

    adapter.mount(host);

    const renderedNode = root.renderedNodes.at(-1);
    if (
      !isValidElement<{
        resourceBindings?: unknown;
        workspaceId: string | null;
      }>(renderedNode)
    ) {
      throw new Error("conversation surface did not render a React element");
    }
    expect(renderedNode.type).toBe(EasyButtonSurface);
    expect(renderedNode.props.resourceBindings).toBeUndefined();
    expect(renderedNode.props.workspaceId).toBe("workspace_selected");
  });

  test("closes resource-bound conversation panes through the matching active workspace", async () => {
    const read = vi.fn(async () => conversationSnapshot("conversation_test", "workspace_bound"));
    vi.stubGlobal("window", { setta: { conversations: { read } } });
    useWorkspaceStore.setState({
      session: {
        activeWorkspaces: [
          {
            displayName: "bound",
            id: "workspace_bound",
            lastOpenedAt: timestamp,
            rootPath: "/tmp/bound",
          },
        ],
        recentWorkspaces: [],
        selectedWorkspaceId: "workspace_mounted",
        workspaceAvailabilities: [
          { available: true, unavailableReason: "", workspaceId: "workspace_bound" },
        ],
      },
    });
    const adapter = createReactDomSurfaceAdapter(
      fakeConversationPane({
        resourceBindings: [{ folder: { rootPath: "/tmp/bound" }, kind: "folder" }],
      }),
      undefined,
      { workspaceId: "workspace_mounted" },
    );

    await expect(adapter.requestPaneClose({ confirm: () => true })).resolves.toEqual({
      removePane: true,
    });

    expect(read).toHaveBeenCalledWith({
      conversationId: "conversation_test",
      workspaceId: "workspace_bound",
    });
  });

  test("closes explicitly folderless conversation panes as view-only panes", async () => {
    const read = vi.fn();
    vi.stubGlobal("window", { setta: { conversations: { read } } });
    const adapter = createReactDomSurfaceAdapter(
      fakeConversationPane({ resourceBindings: [] }),
      undefined,
      { workspaceId: "workspace_selected" },
    );

    await expect(adapter.requestPaneClose({ confirm: () => true })).resolves.toEqual({
      removePane: true,
    });

    expect(read).not.toHaveBeenCalled();
  });

  test("mounts the master pane as a focused React DOM surface that cannot be removed", async () => {
    const root = new RecordingRoot([]);
    const rootFactory: ReactSurfaceRootFactory = {
      createRoot() {
        return root;
      },
    };
    const host = createFakeHost();
    const masterController = {} as AppShellMasterController;
    const adapter = createReactDomSurfaceAdapter(fakePane("master"), rootFactory, {
      masterController,
      platform: "linux",
    });

    adapter.mount(host);
    adapter.setFocused(true);
    const closeResult = await adapter.requestPaneClose({ confirm: () => true });

    const renderedNode = root.renderedNodes.at(-1);
    if (
      !isValidElement<{
        controller: AppShellMasterController;
        focused: boolean;
      }>(renderedNode)
    ) {
      throw new Error("master surface did not render a React element");
    }
    expect(host.dataset.surfaceKind).toBe("master");
    expect(renderedNode.type).toBe(AppShellMasterPaneSurface);
    expect(renderedNode.props.controller).toBe(masterController);
    expect(renderedNode.props.focused).toBe(true);
    expect(closeResult).toEqual({ removePane: false });
  });
});

const timestamp = "2026-07-22T20:00:00Z";

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

function conversationSnapshot(
  conversationId: string,
  workspaceId: string | null,
): ConversationSnapshot {
  return {
    artifacts: { artifacts: [], hasEarlier: false },
    branch: null,
    conversation: {
      archivedAt: null,
      createdAt: timestamp,
      id: conversationId,
      lastTrajectorySequence: 1,
      status: "working",
      title: conversationId,
      topicDescriptor: `${conversationId} descriptor`,
      updatedAt: timestamp,
      workspaceId,
    },
    eventCursor: { sequence: 0, streamId: `stream_${conversationId}` },
    narration: { events: [], hasEarlier: false },
    narratorState: {
      checkpointText: "",
      checkpointThroughSequence: 0,
      conversationId,
      currentFocus: "",
      currentFocusRevision: 0,
      currentFocusSourceSequence: 0,
      degradation: null,
      lastInvocationAt: null,
      observedThroughSequence: 0,
      status: "ready",
      topicDescriptor: `${conversationId} descriptor`,
      updatedAt: timestamp,
    },
    presentationProfile: {
      conversationId,
      narratorSpeechEnabled: false,
      narratorVoiceReuse: null,
      narratorVoiceSelection: "auto_distinct",
      paletteReuse: null,
      paletteSelection: "auto_distinct",
      requestedNarratorVoiceId: null,
      requestedPaletteId: null,
      resolvedNarratorVoiceId: null,
      resolvedPaletteId: "sky",
      updatedAt: timestamp,
    },
    queue: [],
    roleProfileOverrides: [],
    schemaVersion: 1,
    sideConversations: [],
    sideEvents: { events: [], hasEarlier: false, limit: 200 },
    threadBinding: null,
    trajectory: { events: [], hasEarlier: false },
    turns: { hasEarlier: false, turns: [] },
  } as ConversationSnapshot;
}

function waitForMicrotask(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve);
  });
}

function fakePane(surfaceKind: WorkspacePane["surfaceKind"]): WorkspacePane {
  if (surfaceKind === "conversation") {
    return fakeConversationPane();
  }
  const fields = {
    columnId: "column",
    heat: 42,
    paneId: "pane",
    sequence: 0,
    subtitle: "test",
    surfaceId: "surface",
    title: "Pane",
    tone: "cyan" as const,
    weight: 1,
  };
  return { ...fields, surfaceKind };
}

function fakeConversationPane(
  options: {
    resourceBindings?: Extract<
      WorkspacePane,
      { surfaceKind: "conversation" }
    >["conversationConfig"]["resourceBindings"];
  } = {},
): Extract<WorkspacePane, { surfaceKind: "conversation" }> {
  return {
    columnId: "column",
    conversationConfig: {
      conversationId: "conversation_test",
      ...(options.resourceBindings === undefined
        ? {}
        : { resourceBindings: options.resourceBindings }),
    },
    heat: 42,
    paneId: "pane",
    sequence: 0,
    subtitle: "test",
    surfaceId: "surface",
    surfaceKind: "conversation",
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
