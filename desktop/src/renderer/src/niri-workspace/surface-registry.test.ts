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

  test("keeps browser viewport updates live but throttled during active resize", () => {
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
    const resumedStats = registry.syncHost(host, renderItem(pane, "live", 240, 200), {
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
    expect(resumedStats).toMatchObject({
      browserViewportWrites: 1,
      deferredHeavyViewportWrites: 0,
    });
    expect(settledStats).toMatchObject({
      browserViewportWrites: 1,
      deferredHeavyViewportWrites: 0,
    });
    expect(recordingAdapter.events).toContain("viewport:frame:220x180");
    expect(recordingAdapter.events).not.toContain("viewport:frame:230x190");
    expect(recordingAdapter.events).toContain("viewport:frame:240x200");
    expect(recordingAdapter.events).toContain("viewport:resize:260x210");
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
});

class RecordingSurfaceAdapter implements SurfaceAdapter {
  events: string[] = [];
  readonly kind: SurfaceKind;
  readonly surfaceId: string;

  constructor(pane: NiriPane) {
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

  destroy(): void {
    this.events.push("destroy");
  }
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
    moving: false,
    opacity: 1,
    paneId: pane.paneId,
    resizing: false,
    runtimeState,
    surfaceId: pane.surfaceId,
    surfaceKind: pane.surfaceKind,
    visible: true,
    width,
    x: 0,
    y: 0,
    z: 1,
  };
}
