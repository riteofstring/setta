import { describe, expect, test } from "vitest";

import type {
  WorkspaceBrowserViewSnapshot,
  WorkspaceBrowserViewUpdate,
  SettaAPI,
} from "@shared/types";
import { BrowserSurfaceProxyAdapter } from "./browser-surface-proxy-adapter";
import { EmptyFrameSurfaceAdapter, FakeHeavyDomSurfaceAdapter } from "./surface-adapters";
import { createFakeHost, setFakeRect } from "./test-dom-fakes";
import type { WorkspacePane } from "./types";

describe("workspace fake surface adapters", () => {
  test("tracks fake heavy DOM freeze and resume lifecycle on the host", () => {
    const host = createFakeHost();
    const adapter = new FakeHeavyDomSurfaceAdapter(fakePane("fake-heavy-dom"));

    adapter.mount(host);
    adapter.setVisible(true);
    adapter.freeze("snapshot");

    expect(host.dataset.surfaceKind).toBe("fake-heavy-dom");
    expect(host.dataset.surfaceVisible).toBe("true");
    expect(host.dataset.surfaceFrozen).toBe("true");

    adapter.resume("visible");

    expect(host.dataset.surfaceFrozen).toBe("false");
    expect(adapter.lifecycleState).toMatchObject({
      frozen: false,
      mounted: true,
      visible: true,
    });
  });

  test("renders empty frame creation buttons with disabled limit state", () => {
    const host = createFakeHost();
    const adapter = new EmptyFrameSurfaceAdapter(fakePane("empty-frame"), () => [
      {
        label: "Browser",
        meta: "2/10 Mod+Alt+B",
        surfaceKind: "browser",
      },
      {
        disabled: true,
        label: "Settings",
        meta: "1/1 Mod+Alt+S",
        surfaceKind: "settings-dom",
      },
    ]);

    adapter.mount(host);
    adapter.setVisible(true);

    const actions = emptyFrameActions(host);
    expect(host.dataset.surfaceKind).toBe("empty-frame");
    expect(actions.map((action) => fakeTextContent(action))).toEqual([
      "Browser2/10 Mod+Alt+B",
      "Settings1/1 Mod+Alt+S",
    ]);
    expect((actions[0] as HTMLButtonElement | undefined)?.dataset.surfaceKind).toBe("browser");
    expect((actions[1] as HTMLButtonElement | undefined)?.disabled).toBe(true);
  });

  test("clips browser native bounds to the stage while keeping pane-sized content bounds", () => {
    const sent: WorkspaceBrowserViewUpdate[] = [];
    const host = createFakeHost();
    mountBrowserStage(host, { height: 360, width: 500, x: 300, y: 90 });
    const adapter = new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue(update) {
        sent.push(update);
      },
    });

    adapter.mount(host);
    adapter.resume("visible");
    adapter.setVisible(true);
    adapter.setFocused(true);
    setFakeRect(host, { height: 160, width: 200, x: 220, y: 70 });
    adapter.setViewport({ height: 160, width: 200, x: -80, y: -20 }, "frame");

    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 130, width: 120, x: 300, y: 100 },
      contentBounds: { height: 130, width: 200, x: 220, y: 100 },
      visible: true,
    });
  });

  test("keeps unfocused browser native bounds visible when clipped by the project sidebar inset", () => {
    const sent: WorkspaceBrowserViewUpdate[] = [];
    const host = createFakeHost();
    mountBrowserStage(host, { height: 500, width: 900, x: 0, y: 40 }, { nativeViewClipLeft: 280 });
    const adapter = new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue(update) {
        sent.push(update);
      },
    });

    adapter.mount(host);
    adapter.resume("visible");
    adapter.setVisible(true);
    setFakeRect(host, { height: 180, width: 260, x: 120, y: 76 });
    adapter.setViewport({ height: 180, width: 260, x: 120, y: 36 }, "frame");

    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 150, width: 100, x: 280, y: 106 },
      contentBounds: { height: 150, width: 260, x: 120, y: 106 },
      focused: false,
      visible: true,
    });
  });

  test("hides focused browser native bounds while workspace renderer overlays are active", () => {
    const sent: WorkspaceBrowserViewUpdate[] = [];
    const host = createFakeHost();
    mountBrowserStage(
      host,
      { height: 360, width: 500, x: 0, y: 40 },
      { nativeViewOverlayActive: true },
    );
    const adapter = new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue(update) {
        sent.push(update);
      },
    });

    adapter.mount(host);
    adapter.resume("visible");
    adapter.setVisible(true);
    adapter.setFocused(true);
    setFakeRect(host, { height: 160, width: 200, x: 120, y: 70 });
    adapter.setViewport({ height: 160, width: 200, x: 120, y: 30 }, "frame");

    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 1, width: 1, x: 120, y: 100 },
      contentBounds: { height: 130, width: 200, x: 120, y: 100 },
      focused: true,
      visible: false,
    });
  });

  test("positions browser native bounds from the actual pane host below shell chrome", () => {
    const sent: WorkspaceBrowserViewUpdate[] = [];
    const host = createFakeHost();
    mountBrowserStage(host, { height: 360, width: 500, x: 300, y: 40 });
    const adapter = new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue(update) {
        sent.push(update);
      },
    });

    adapter.mount(host);
    adapter.resume("visible");
    adapter.setVisible(true);
    adapter.setFocused(true);
    setFakeRect(host, { height: 160, width: 200, x: 380, y: 78 });
    adapter.setViewport({ height: 160, width: 200, x: 80, y: 0 }, "frame");

    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 130, width: 200, x: 380, y: 108 },
      contentBounds: { height: 130, width: 200, x: 380, y: 108 },
      visible: true,
    });
  });

  test("keeps settled browser native views visible when the browser pane is unfocused", () => {
    const sent: WorkspaceBrowserViewUpdate[] = [];
    const host = createFakeHost();
    mountBrowserStage(host, { height: 360, width: 500, x: 300, y: 90 });
    const adapter = new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue(update) {
        sent.push(update);
      },
    });

    adapter.mount(host);
    adapter.resume("visible");
    adapter.setVisible(true);
    setFakeRect(host, { height: 160, width: 200, x: 380, y: 110 });
    adapter.setViewport({ height: 160, width: 200, x: 80, y: 20 }, "frame");

    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 130, width: 200, x: 380, y: 140 },
      contentBounds: { height: 130, width: 200, x: 380, y: 140 },
      focused: false,
      visible: true,
    });

    adapter.setFocused(true);

    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 130, width: 200, x: 380, y: 140 },
      contentBounds: { height: 130, width: 200, x: 380, y: 140 },
      visible: true,
    });
  });

  test("renders browser snapshots from the native view bridge", () => {
    const fixture = createBrowserSnapshotFixture();

    try {
      fixture.adapter.mount(fixture.host);
      emitBrowserSnapshot(fixture.listeners, {
        capturedAt: 123,
        height: 80,
        imageDataUrl: "data:image/png;base64,AAAA",
        paneId: "other-pane",
        surfaceId: "other-surface",
        title: "Other",
        width: 100,
        workspaceId: "workspace",
      });

      const image = requireBrowserSnapshotImage(fixture.host);
      expect(image.hidden).toBe(true);

      emitBrowserSnapshot(fixture.listeners, {
        capturedAt: 456,
        height: 80,
        imageDataUrl: "data:image/png;base64,BBBB",
        paneId: "pane",
        surfaceId: "surface",
        title: "Browser",
        width: 100,
        workspaceId: "workspace",
      });

      expectRenderedBrowserSnapshot(image, fixture.host);

      fixture.adapter.unmount();

      expect(fixture.unsubscribed).toEqual([fixture.listeners[0]]);
    } finally {
      fixture.restoreSetta();
    }
  });

  test("hides stale browser snapshots when pane geometry changes", () => {
    const fixture = createBrowserSnapshotFixture();

    try {
      fixture.adapter.mount(fixture.host);
      emitBrowserSnapshot(fixture.listeners, {
        capturedAt: 456,
        height: 80,
        imageDataUrl: "data:image/png;base64,BBBB",
        paneId: "pane",
        surfaceId: "surface",
        title: "Browser",
        width: 100,
        workspaceId: "workspace",
      });

      const image = requireBrowserSnapshotImage(fixture.host);
      expectRenderedBrowserSnapshot(image, fixture.host);

      setFakeRect(fixture.host, { height: 110, width: 140, x: 0, y: 0 });
      fixture.adapter.syncFrame();

      expect(image.hidden).toBe(true);
      expect(image.parentElement?.dataset.browserSnapshotReady).toBeUndefined();
      expect(fixture.host.dataset.browserSnapshotCapturedAt).toBeUndefined();
    } finally {
      fixture.restoreSetta();
    }
  });

  test("renders native-size browser snapshots while the pane host is scaled for overview", () => {
    const fixture = createBrowserSnapshotFixture();

    try {
      fixture.adapter.mount(fixture.host);
      fixture.adapter.setViewport({ height: 160, width: 200, x: 0, y: 0 }, "frame");
      setFakeRect(fixture.host, { height: 80, width: 100, x: 0, y: 0 });
      emitBrowserSnapshot(fixture.listeners, {
        capturedAt: 456,
        height: 130,
        imageDataUrl: "data:image/png;base64,BBBB",
        paneId: "pane",
        surfaceId: "surface",
        title: "Browser",
        width: 200,
        workspaceId: "workspace",
      });

      const image = requireBrowserSnapshotImage(fixture.host);
      expect(image.hidden).toBe(false);
      expect(image.width).toBe(200);
      expect(image.height).toBe(130);
      expect(image.parentElement?.dataset.browserSnapshotReady).toBe("true");
    } finally {
      fixture.restoreSetta();
    }
  });

  test("keeps browser native views visible during active resize", () => {
    const sent: WorkspaceBrowserViewUpdate[] = [];
    const host = createFakeHost();
    mountBrowserStage(host, { height: 360, width: 500, x: 300, y: 90 });
    const adapter = new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue(update) {
        sent.push(update);
      },
    });

    adapter.mount(host);
    adapter.resume("visible");
    adapter.setVisible(true);
    adapter.setFocused(true);
    setFakeRect(host, { height: 160, width: 200, x: 380, y: 110 });
    adapter.setViewport({ height: 160, width: 200, x: 80, y: 20 }, "frame");
    setFakeRect(host, { height: 160, width: 200, x: 400, y: 120 });
    adapter.setViewport({ height: 160, width: 200, x: 100, y: 30 }, "resize-active");
    setFakeRect(host, { height: 160, width: 200, x: 420, y: 130 });
    adapter.setViewport({ height: 160, width: 200, x: 120, y: 40 }, "resize");

    expect(sent.at(-3)).toMatchObject({ visible: true });
    expect(sent.at(-2)).toMatchObject({
      bounds: { height: 130, width: 200, x: 400, y: 150 },
      contentBounds: { height: 130, width: 200, x: 400, y: 150 },
      visible: true,
    });
    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 130, width: 200, x: 420, y: 160 },
      contentBounds: { height: 130, width: 200, x: 420, y: 160 },
      visible: true,
    });
  });

  test("keeps browser native views visible during Workspace movement", () => {
    const sent: WorkspaceBrowserViewUpdate[] = [];
    const host = createFakeHost();
    mountBrowserStage(host, { height: 360, width: 500, x: 300, y: 90 });
    const adapter = new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue(update) {
        sent.push(update);
      },
    });

    adapter.mount(host);
    adapter.resume("visible");
    adapter.setVisible(true);
    adapter.setFocused(true);
    setFakeRect(host, { height: 160, width: 200, x: 380, y: 110 });
    adapter.setViewport({ height: 160, width: 200, x: 80, y: 20 }, "frame");
    setFakeRect(host, { height: 160, width: 200, x: 400, y: 120 });
    adapter.setViewport({ height: 160, width: 200, x: 100, y: 30 }, "movement-active");
    setFakeRect(host, { height: 160, width: 200, x: 420, y: 130 });
    adapter.setViewport({ height: 160, width: 200, x: 120, y: 40 }, "frame");

    expect(sent.at(-3)).toMatchObject({ visible: true });
    expect(sent.at(-2)).toMatchObject({
      bounds: { height: 130, width: 200, x: 400, y: 150 },
      contentBounds: { height: 130, width: 200, x: 400, y: 150 },
      visible: true,
    });
    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 130, width: 200, x: 420, y: 160 },
      contentBounds: { height: 130, width: 200, x: 420, y: 160 },
      visible: true,
    });
  });

  test("keeps thinly clipped browser native views interactive at the stage boundary", () => {
    const sent: WorkspaceBrowserViewUpdate[] = [];
    const host = createFakeHost();
    mountBrowserStage(host, { height: 360, width: 500, x: 300, y: 90 });
    const adapter = new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue(update) {
        sent.push(update);
      },
    });

    adapter.mount(host);
    adapter.resume("visible");
    adapter.setVisible(true);
    adapter.setFocused(true);
    setFakeRect(host, { height: 160, width: 200, x: 180, y: 70 });
    adapter.setViewport({ height: 160, width: 200, x: -120, y: -20 }, "frame");

    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 130, width: 80, x: 300, y: 100 },
      contentBounds: { height: 130, width: 200, x: 180, y: 100 },
      visible: true,
    });
  });

  test("hides fully clipped browser native views at the stage boundary", () => {
    const sent: WorkspaceBrowserViewUpdate[] = [];
    const host = createFakeHost();
    mountBrowserStage(host, { height: 360, width: 500, x: 300, y: 90 });
    const adapter = new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue(update) {
        sent.push(update);
      },
    });

    adapter.mount(host);
    adapter.resume("visible");
    adapter.setVisible(true);
    adapter.setFocused(true);
    setFakeRect(host, { height: 120, width: 100, x: 40, y: 110 });
    adapter.setViewport({ height: 120, width: 100, x: -260, y: 20 }, "frame");

    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 1, width: 1, x: 40, y: 140 },
      contentBounds: { height: 90, width: 100, x: 40, y: 140 },
      visible: false,
    });
  });
});

function installBrowserSnapshotBridge(
  onBrowserViewSnapshot: (listener: (snapshot: WorkspaceBrowserViewSnapshot) => void) => () => void,
): () => void {
  const target = globalThis as typeof globalThis & { window?: Window };
  const previousWindow = target.window;
  const previousSetta = previousWindow?.setta;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      ...previousWindow,
      setta: {
        ...previousSetta,
        workspaceNativeViews: {
          batchBrowserViewUpdates() {},
          onBrowserViewKey: () => () => {},
          onBrowserViewSnapshot,
          readBrowserViewStats: async () => ({
            boundsBatchCount: 0,
            boundsUpdateCount: 0,
            contentLoaded: 0,
            destroyed: 0,
            focusedSurfaceId: null,
            hidden: 0,
            live: 0,
            loading: 0,
            registered: 0,
            snapshotCaptureLastError: null,
            snapshotCapturesFailed: 0,
            snapshotCapturesStarted: 0,
            snapshotCapturesSucceeded: 0,
            snapshotsInFlight: 0,
            teardownCount: 0,
            totalBrowserPanes: 0,
            visibleBrowserPanes: 0,
            workspaceId: null,
          }),
          teardownBrowserViews: async () => ({
            boundsBatchCount: 0,
            boundsUpdateCount: 0,
            contentLoaded: 0,
            destroyed: 0,
            focusedSurfaceId: null,
            hidden: 0,
            live: 0,
            loading: 0,
            registered: 0,
            snapshotCaptureLastError: null,
            snapshotCapturesFailed: 0,
            snapshotCapturesStarted: 0,
            snapshotCapturesSucceeded: 0,
            snapshotsInFlight: 0,
            teardownCount: 0,
            totalBrowserPanes: 0,
            visibleBrowserPanes: 0,
            workspaceId: null,
          }),
        },
      } satisfies Partial<SettaAPI>,
    },
  });
  return () => {
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
      return;
    }
    Reflect.deleteProperty(target, "window");
  };
}

interface BrowserSnapshotFixture {
  adapter: BrowserSurfaceProxyAdapter;
  host: HTMLElement;
  listeners: Array<(snapshot: WorkspaceBrowserViewSnapshot) => void>;
  restoreSetta: () => void;
  unsubscribed: Array<(snapshot: WorkspaceBrowserViewSnapshot) => void>;
}

function createBrowserSnapshotFixture(): BrowserSnapshotFixture {
  const listeners: Array<(snapshot: WorkspaceBrowserViewSnapshot) => void> = [];
  const unsubscribed: Array<(snapshot: WorkspaceBrowserViewSnapshot) => void> = [];
  const restoreSetta = installBrowserSnapshotBridge((listener) => {
    listeners.push(listener);
    return () => {
      unsubscribed.push(listener);
    };
  });
  const host = createFakeHost();
  setFakeRect(host, { height: 110, width: 100, x: 0, y: 0 });
  return {
    adapter: new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue() {},
    }),
    host,
    listeners,
    restoreSetta,
    unsubscribed,
  };
}

function emitBrowserSnapshot(
  listeners: Array<(snapshot: WorkspaceBrowserViewSnapshot) => void>,
  snapshot: WorkspaceBrowserViewSnapshot,
): void {
  const listener = listeners[0];
  if (!listener) {
    throw new Error("browser snapshot bridge listener was not registered");
  }
  listener(snapshot);
}

function requireBrowserSnapshotImage(host: HTMLElement): HTMLImageElement {
  const image = host.querySelector<HTMLImageElement>("[data-workspace-browser-snapshot]");
  if (!image) {
    throw new Error("browser snapshot image was not rendered");
  }
  return image;
}

function expectRenderedBrowserSnapshot(image: HTMLImageElement, host: HTMLElement): void {
  expect(image.hidden).toBe(false);
  expect(image.src).toBe("data:image/png;base64,BBBB");
  expect(image.width).toBe(100);
  expect(image.height).toBe(80);
  expect(image.parentElement?.dataset).toMatchObject({
    browserSnapshotReady: "true",
  });
  expect(host.dataset.browserSnapshotCapturedAt).toBe("456");
}

function emptyFrameActions(host: HTMLElement): HTMLButtonElement[] {
  const content = host.children[0];
  const actions = content?.children[1];
  return Array.from(actions?.children ?? []) as HTMLButtonElement[];
}

function fakeTextContent(element: Element): string {
  return [
    element.textContent ?? "",
    ...Array.from(element.children).map((child) => fakeTextContent(child)),
  ].join("");
}

function mountBrowserStage(
  host: HTMLElement,
  rect: { height: number; width: number; x: number; y: number },
  options: { nativeViewClipLeft?: number; nativeViewOverlayActive?: boolean } = {},
): HTMLElement {
  const workspace = host.ownerDocument.createElement("section");
  workspace.dataset.testid = "workspace-layout-area";
  if (options.nativeViewClipLeft !== undefined) {
    workspace.dataset.nativeViewClipLeft = String(options.nativeViewClipLeft);
  }
  if (options.nativeViewOverlayActive !== undefined) {
    workspace.dataset.nativeViewOverlayActive = String(options.nativeViewOverlayActive);
  }
  const stage = host.ownerDocument.createElement("div");
  stage.dataset.testid = "workspace-presentation-engine";
  setFakeRect(stage, rect);
  stage.append(host);
  workspace.append(stage);
  return stage as unknown as HTMLElement;
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
