import { describe, expect, test } from "vitest";

import { SurfaceRegistry } from "./surface-registry";
import { createFakeHost } from "./test-dom-fakes";
import type {
  FreezeReason,
  NiriPane,
  PaneRenderItem,
  Rect,
  ResumeReason,
  SurfaceAdapter,
  SurfaceKind,
  TerminalSurfaceStats,
  ViewportChangeReason,
} from "./types";

describe("niri surface registry", () => {
  test("mounts, snapshots, freezes, resumes, and releases surface adapters", () => {
    const pane = fakePane("fake-heavy-dom");
    const recordingAdapter = new RecordingSurfaceAdapter(pane);
    const registry = new SurfaceRegistry([pane], () => recordingAdapter);
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });

    expect(recordingAdapter.events).toEqual([
      "mount:surface",
      "resume:visible",
      "visible:true",
      "focused:false",
      "viewport:mount:160x120",
    ]);
    expect(host.dataset.surfaceKind).toBe("fake-heavy-dom");

    registry.syncHost(host, renderItem(pane, "snapshot"), { resizePhase: "idle" });

    expect(recordingAdapter.events).toContain("freeze:snapshot");
    expect(recordingAdapter.events).toContain("visible:false");
    expect(host.dataset.surfaceKind).toBe("snapshot");

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });

    expect(recordingAdapter.events.filter((event) => event === "mount:surface")).toHaveLength(2);
    expect(recordingAdapter.events).toContain("resume:visible");
    expect(host.dataset.surfaceKind).toBe("fake-heavy-dom");

    registry.releaseHost(host);

    expect(recordingAdapter.events.at(-3)).toBe("visible:false");
    expect(recordingAdapter.events.at(-2)).toBe("freeze:hidden");
    expect(recordingAdapter.events.at(-1)).toBe("unmount");
  });

  test("keeps adapter records reusable after teardown releases mounted hosts", () => {
    const pane = fakePane("fake-dom");
    const recordingAdapter = new RecordingSurfaceAdapter(pane);
    const registry = new SurfaceRegistry([pane], () => recordingAdapter);
    const firstHost = createFakeHost();
    const secondHost = createFakeHost();

    registry.syncHost(firstHost, renderItem(pane, "live"), { resizePhase: "idle" });
    registry.teardown();
    registry.syncHost(secondHost, renderItem(pane, "live"), { resizePhase: "idle" });

    expect(recordingAdapter.events.filter((event) => event === "mount:surface")).toHaveLength(2);
    expect(recordingAdapter.events).toContain("freeze:teardown");
    expect(secondHost.dataset.surfaceKind).toBe("fake-dom");
  });

  test("defers heavy adapter viewport updates during active resize and commits final bounds", () => {
    const pane = fakePane("terminal");
    const recordingAdapter = new RecordingSurfaceAdapter(pane);
    const registry = new SurfaceRegistry([pane], () => recordingAdapter);
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
    const activeStats = registry.syncHost(host, renderItem(pane, "live", 220, 180), {
      resizePhase: "active",
    });
    const settledStats = registry.syncHost(host, renderItem(pane, "live", 260, 210), {
      resizePhase: "settled",
    });

    expect(activeStats).toMatchObject({
      deferredHeavyViewportWrites: 1,
      terminalViewportWrites: 0,
    });
    expect(settledStats).toMatchObject({
      deferredHeavyViewportWrites: 0,
      heavyViewportWrites: 1,
      terminalViewportWrites: 1,
    });
    expect(recordingAdapter.events).toContain("viewport:mount:160x120");
    expect(recordingAdapter.events).not.toContain("viewport:frame:220x180");
    expect(recordingAdapter.events).toContain("viewport:resize:260x210");
  });

  test("keeps real chat viewport current during active resize", () => {
    const pane = fakePane("chat-dom");
    const recordingAdapter = new RecordingSurfaceAdapter(pane);
    const registry = new SurfaceRegistry([pane], () => recordingAdapter);
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
    const activeStats = registry.syncHost(host, renderItem(pane, "live", 220, 180), {
      resizePhase: "active",
    });

    expect(activeStats).toMatchObject({
      deferredHeavyViewportWrites: 0,
      heavyViewportWrites: 0,
      surfaceViewportWrites: 1,
    });
    expect(recordingAdapter.events).toContain("viewport:frame:220x180");
  });

  test("hides browser native viewport during active resize and commits final bounds", () => {
    const pane = fakePane("browser");
    const recordingAdapter = new RecordingSurfaceAdapter(pane);
    const registry = new SurfaceRegistry([pane], () => recordingAdapter);
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
    const activeStats = registry.syncHost(host, renderItem(pane, "live", 220, 180), {
      resizePhase: "active",
    });
    const throttledStats = registry.syncHost(host, renderItem(pane, "live", 230, 190), {
      resizePhase: "active",
    });
    const skippedStats = registry.syncHost(host, renderItem(pane, "live", 240, 200), {
      resizePhase: "active",
    });
    const settledStats = registry.syncHost(host, renderItem(pane, "live", 260, 210), {
      resizePhase: "settled",
    });

    expect(activeStats).toMatchObject({
      browserViewportWrites: 1,
      deferredHeavyViewportWrites: 0,
      heavyViewportWrites: 0,
    });
    expect(throttledStats).toMatchObject({
      browserViewportWrites: 0,
      deferredHeavyViewportWrites: 0,
    });
    expect(skippedStats).toMatchObject({
      browserViewportWrites: 0,
      deferredHeavyViewportWrites: 0,
    });
    expect(settledStats).toMatchObject({
      browserViewportWrites: 1,
      deferredHeavyViewportWrites: 0,
    });
    expect(recordingAdapter.events).toContain("viewport:resize-active:220x180");
    expect(recordingAdapter.events).not.toContain("viewport:frame:230x190");
    expect(recordingAdapter.events).not.toContain("viewport:frame:240x200");
    expect(recordingAdapter.events).toContain("viewport:resize:260x210");
  });

  test("does not rewrite unchanged browser viewport bounds on idle frames", () => {
    const pane = fakePane("browser");
    const recordingAdapter = new RecordingSurfaceAdapter(pane);
    const registry = new SurfaceRegistry([pane], () => recordingAdapter);
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
    const unchangedStats = registry.syncHost(host, renderItem(pane, "live"), {
      resizePhase: "idle",
    });

    expect(unchangedStats).toMatchObject({
      browserViewportWrites: 0,
      surfaceViewportWrites: 0,
    });
    expect(recordingAdapter.events.filter((event) => event.startsWith("viewport:"))).toEqual([
      "viewport:mount:160x120",
    ]);
  });

  test("rehomes a live adapter without hiding the newly mounted host", () => {
    const browserPane = fakePane("browser");
    const fakeDomPane = fakePane("fake-dom", 1);
    const browserAdapter = new RecordingSurfaceAdapter(browserPane);
    const fakeDomAdapter = new RecordingSurfaceAdapter(fakeDomPane);
    const adapters = new Map([
      [browserPane.surfaceId, browserAdapter],
      [fakeDomPane.surfaceId, fakeDomAdapter],
    ]);
    const registry = new SurfaceRegistry(
      [browserPane, fakeDomPane],
      (pane) => adapters.get(pane.surfaceId) ?? new RecordingSurfaceAdapter(pane),
    );
    const firstHost = createFakeHost();
    const secondHost = createFakeHost();

    registry.syncHost(firstHost, renderItem(browserPane, "live"), { resizePhase: "idle" });
    registry.syncHost(secondHost, renderItem(browserPane, "live", 240, 120), {
      resizePhase: "idle",
    });
    registry.syncHost(firstHost, renderItem(fakeDomPane, "live"), { resizePhase: "idle" });

    expect(browserAdapter.events.filter((event) => event === "mount:surface")).toHaveLength(2);
    expect(browserAdapter.events).not.toContain("visible:false");
    expect(browserAdapter.events).not.toContain("unmount");
    expect(browserAdapter.events).not.toContain("freeze:hidden");
    expect(browserAdapter.events).toContain("viewport:mount:240x120");
  });

  test("does not rescan released adapters for cached activity metrics", () => {
    const terminalPane = fakePane("terminal");
    const fakeDomPane = fakePane("fake-dom", 1);
    const terminalAdapter = new RecordingSurfaceAdapter(
      terminalPane,
      fakeTerminalStats({ dirtyRows: 7, liveTerminalRendererCount: 1 }),
    );
    const fakeDomAdapter = new RecordingSurfaceAdapter(fakeDomPane);
    const adapters = new Map([
      [terminalPane.surfaceId, terminalAdapter],
      [fakeDomPane.surfaceId, fakeDomAdapter],
    ]);
    const registry = new SurfaceRegistry(
      [terminalPane, fakeDomPane],
      (pane) => adapters.get(pane.surfaceId) ?? new RecordingSurfaceAdapter(pane),
    );
    const host = createFakeHost();

    registry.syncHost(host, renderItem(terminalPane, "live"), { resizePhase: "idle" });
    expect(registry.terminalStats()).toMatchObject({
      dirtyRows: 7,
      liveTerminalRendererCount: 1,
    });
    expect(terminalAdapter.statsReadCount).toBe(1);

    registry.syncHost(host, renderItem(fakeDomPane, "live"), { resizePhase: "idle" });

    expect(registry.terminalStats()).toMatchObject({
      dirtyRows: 7,
      liveTerminalRendererCount: 0,
    });
    expect(terminalAdapter.statsReadCount).toBe(1);
  });

  test("captures live host content into the snapshot adapter before overview handoff", () => {
    const pane = fakePane("fake-dom");
    const adapter = new TexturedSurfaceAdapter(pane);
    const registry = new SurfaceRegistry([pane], () => adapter);
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
    registry.syncHost(
      host,
      { ...renderItem(pane, "snapshot"), presentationMode: "overview" },
      {
        resizePhase: "idle",
      },
    );

    const snapshotContent = fakeChildrenOf(host)[0];
    const texture = snapshotContent?.children[0];
    const capturedPane = texture?.children[0];

    expect(host.dataset.surfaceKind).toBe("snapshot");
    expect(snapshotContent?.className).toBe("niri-pane-content niri-snapshot-surface");
    expect(texture?.className).toBe("niri-snapshot-texture");
    expect(capturedPane?.className).toBe("niri-textured-source");
    expect(capturedPane?.textContent).toBe("live pane texture");
  });
});

class RecordingSurfaceAdapter implements SurfaceAdapter {
  events: string[] = [];
  readonly kind: SurfaceKind;
  readonly surfaceId: string;
  statsReadCount = 0;

  constructor(
    pane: NiriPane,
    private readonly terminalStats: TerminalSurfaceStats | null = null,
  ) {
    this.kind = pane.surfaceKind;
    this.surfaceId = pane.surfaceId;
  }

  mount(host: HTMLElement): void {
    host.dataset.surfaceKind = this.kind;
    this.events.push(`mount:${this.surfaceId}`);
  }

  unmount(): void {
    this.events.push("unmount");
  }

  setVisible(visible: boolean): void {
    this.events.push(`visible:${visible}`);
  }

  setFocused(focused: boolean): void {
    this.events.push(`focused:${focused}`);
  }

  setViewport(rect: Rect, reason: ViewportChangeReason): void {
    this.events.push(`viewport:${reason}:${rect.width}x${rect.height}`);
  }

  freeze(reason: FreezeReason): void {
    this.events.push(`freeze:${reason}`);
  }

  resume(reason: ResumeReason): void {
    this.events.push(`resume:${reason}`);
  }

  getTerminalStats(): TerminalSurfaceStats {
    this.statsReadCount += 1;
    return this.terminalStats ?? fakeTerminalStats();
  }

  destroy(): void {
    this.events.push("destroy");
  }
}

class TexturedSurfaceAdapter extends RecordingSurfaceAdapter {
  override mount(host: HTMLElement): void {
    super.mount(host);
    const texture = host.ownerDocument.createElement("div");
    texture.className = "niri-textured-source";
    texture.textContent = "live pane texture";
    host.append(texture);
  }
}

interface FakeChildNode {
  children: FakeChildNode[];
  className: string;
  textContent: string;
}

function fakeChildrenOf(host: HTMLElement): FakeChildNode[] {
  return (host as unknown as { children: FakeChildNode[] }).children;
}

function fakeTerminalStats(overrides: Partial<TerminalSurfaceStats> = {}): TerminalSurfaceStats {
  return {
    dirtyRows: 0,
    droppedOutputChunks: 0,
    liveTerminalRendererCount: 0,
    pendingOutputChunks: 0,
    renderedRows: 0,
    scrollbackRows: 0,
    ...overrides,
  };
}

function fakePane(surfaceKind: SurfaceKind, sequence = 0): NiriPane {
  const suffix = sequence === 0 ? "" : `-${sequence}`;
  return {
    columnId: `column${suffix}`,
    heat: 42,
    paneId: `pane${suffix}`,
    sequence,
    subtitle: "test",
    surfaceId: `surface${suffix}`,
    surfaceKind,
    title: "Pane",
    tone: "cyan",
    weight: 1,
  };
}

function renderItem(
  pane: NiriPane,
  runtimeState: PaneRenderItem["runtimeState"],
  width = 160,
  height = 120,
): PaneRenderItem {
  return {
    focused: false,
    height,
    maximized: false,
    moving: false,
    opacity: 1,
    paneId: pane.paneId,
    presentationMode: "normal",
    resizing: false,
    runtimeState,
    scale: 1,
    surfaceId: pane.surfaceId,
    surfaceKind: pane.surfaceKind,
    visible: true,
    width,
    x: 0,
    y: 0,
    z: 1,
  };
}
