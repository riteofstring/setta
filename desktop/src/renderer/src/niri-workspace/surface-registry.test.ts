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

    registry.syncHost(host, renderItem(pane, "live"));

    expect(recordingAdapter.events).toEqual([
      "mount:surface",
      "visible:true",
      "resume:visible",
      "visible:true",
      "focused:false",
      "viewport:mount:160x120",
    ]);
    expect(host.dataset.surfaceKind).toBe("fake-heavy-dom");

    registry.syncHost(host, renderItem(pane, "snapshot"));

    expect(recordingAdapter.events).toContain("freeze:snapshot");
    expect(recordingAdapter.events).toContain("visible:false");
    expect(host.dataset.surfaceKind).toBe("snapshot");

    registry.syncHost(host, renderItem(pane, "live"));

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

    registry.syncHost(firstHost, renderItem(pane, "live"));
    registry.teardown();
    registry.syncHost(secondHost, renderItem(pane, "live"));

    expect(recordingAdapter.events.filter((event) => event === "mount:surface")).toHaveLength(2);
    expect(recordingAdapter.events).toContain("freeze:teardown");
    expect(secondHost.dataset.surfaceKind).toBe("fake-dom");
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

function fakePane(surfaceKind: SurfaceKind): NiriPane {
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

function renderItem(pane: NiriPane, runtimeState: PaneRenderItem["runtimeState"]): PaneRenderItem {
  return {
    focused: false,
    height: 120,
    moving: false,
    opacity: 1,
    paneId: pane.paneId,
    resizing: false,
    runtimeState,
    surfaceId: pane.surfaceId,
    surfaceKind: pane.surfaceKind,
    visible: true,
    width: 160,
    x: 0,
    y: 0,
    z: 1,
  };
}
