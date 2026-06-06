import type { NiriMetricsCollector } from "./metrics";
import type { NiriPane, PaneRenderItem } from "./types";

interface PaneHostBinding {
  contentPaneId: string | null;
  host: HTMLElement;
  lastFocused: boolean;
  lastHeight: number;
  lastMoving: boolean;
  lastOpacity: number;
  lastTransform: string;
  lastVisible: boolean;
  lastWidth: number;
  lastZ: number;
}

export class PresentationEngine {
  private bindings: PaneHostBinding[] = [];
  private debugOverlay: HTMLElement | null = null;
  private paneById = new Map<string, NiriPane>();

  constructor(
    panes: readonly NiriPane[],
    private readonly metrics: NiriMetricsCollector,
  ) {
    for (const pane of panes) {
      this.paneById.set(pane.paneId, pane);
    }
  }

  apply(items: PaneRenderItem[]): { nativeBoundsUpdates: number; transformWrites: number } {
    let transformWrites = 0;

    for (let index = 0; index < this.bindings.length; index += 1) {
      const binding = this.bindings[index];
      if (!binding) {
        continue;
      }
      const item = items[index];
      if (!item) {
        this.hideBinding(binding);
        continue;
      }
      this.syncContent(binding, item);
      transformWrites += this.syncFrame(binding, item);
    }

    return { nativeBoundsUpdates: 0, transformWrites };
  }

  mount(hosts: readonly HTMLElement[], debugOverlay: HTMLElement | null): void {
    this.bindings = hosts.map((host) => ({
      contentPaneId: null,
      host,
      lastFocused: false,
      lastHeight: -1,
      lastMoving: false,
      lastOpacity: -1,
      lastTransform: "",
      lastVisible: false,
      lastWidth: -1,
      lastZ: -1,
    }));
    this.debugOverlay = debugOverlay;
  }

  teardown(): void {
    for (const binding of this.bindings) {
      binding.host.removeAttribute("data-focused");
      binding.host.removeAttribute("data-moving");
      binding.host.removeAttribute("data-pane-id");
      binding.host.removeAttribute("data-visible");
      binding.host.style.cssText = "";
    }
    if (this.debugOverlay) {
      this.debugOverlay.textContent = "";
    }
    this.bindings = [];
    this.debugOverlay = null;
  }

  updateDebugOverlay(): void {
    if (!this.debugOverlay) {
      return;
    }
    const snapshot = this.metrics.snapshot();
    this.debugOverlay.textContent = [
      `frame ${snapshot.frameTime.toFixed(2)}ms`,
      `p95 ${snapshot.p95FrameTime.toFixed(2)}ms`,
      `p99 ${snapshot.p99FrameTime.toFixed(2)}ms`,
      `visible ${snapshot.visiblePaneCount}`,
      `writes ${snapshot.transformWrites}`,
      `long ${snapshot.longTasks}`,
      `react ${snapshot.reactCommitsDuringMovement}`,
    ].join(" | ");
  }

  private hideBinding(binding: PaneHostBinding): void {
    if (!binding.lastVisible) {
      return;
    }
    binding.host.style.opacity = "0";
    binding.host.style.pointerEvents = "none";
    binding.host.dataset.visible = "false";
    binding.lastVisible = false;
  }

  private syncContent(binding: PaneHostBinding, item: PaneRenderItem): void {
    if (binding.contentPaneId === item.paneId) {
      return;
    }
    const pane = this.paneById.get(item.paneId);
    if (!pane) {
      throw new Error(`missing fake pane metadata for ${item.paneId}`);
    }
    binding.contentPaneId = item.paneId;
    binding.host.dataset.paneId = item.paneId;
    binding.host.dataset.surfaceKind = item.surfaceKind;
    binding.host.dataset.tone = pane.tone;
    setText(binding.host, "[data-niri-pane-title]", pane.title);
    setText(binding.host, "[data-niri-pane-subtitle]", pane.subtitle);
    setText(binding.host, "[data-niri-pane-index]", String(pane.sequence + 1));
    setText(binding.host, "[data-niri-pane-heat]", `${pane.heat}%`);
  }

  private syncFrame(binding: PaneHostBinding, item: PaneRenderItem): number {
    const transformWrites = this.syncTransform(binding, item);
    this.syncBox(binding, item);
    this.syncLayer(binding, item);
    this.syncState(binding, item);
    return transformWrites;
  }

  private syncBox(binding: PaneHostBinding, item: PaneRenderItem): void {
    if (binding.lastWidth !== item.width) {
      binding.host.style.width = `${item.width.toFixed(2)}px`;
      binding.lastWidth = item.width;
    }
    if (binding.lastHeight !== item.height) {
      binding.host.style.height = `${item.height.toFixed(2)}px`;
      binding.lastHeight = item.height;
    }
  }

  private syncLayer(binding: PaneHostBinding, item: PaneRenderItem): void {
    if (binding.lastOpacity !== item.opacity) {
      binding.host.style.opacity = item.opacity.toFixed(3);
      binding.lastOpacity = item.opacity;
    }
    if (binding.lastZ !== item.z) {
      binding.host.style.zIndex = String(item.z);
      binding.lastZ = item.z;
    }
  }

  private syncState(binding: PaneHostBinding, item: PaneRenderItem): void {
    if (binding.lastFocused !== item.focused) {
      binding.host.dataset.focused = String(item.focused);
      binding.lastFocused = item.focused;
    }
    if (binding.lastMoving !== item.moving) {
      binding.host.dataset.moving = String(item.moving);
      binding.lastMoving = item.moving;
    }
    if (binding.lastVisible !== item.visible) {
      binding.host.dataset.visible = String(item.visible);
      binding.host.style.pointerEvents = item.visible ? "auto" : "none";
      binding.lastVisible = item.visible;
    }
  }

  private syncTransform(binding: PaneHostBinding, item: PaneRenderItem): number {
    const transform = `translate3d(${item.x.toFixed(2)}px, ${item.y.toFixed(2)}px, 0)`;
    if (binding.lastTransform !== transform) {
      binding.host.style.transform = transform;
      binding.lastTransform = transform;
      return 1;
    }
    return 0;
  }
}

function setText(host: HTMLElement, selector: string, value: string): void {
  const target = host.querySelector(selector);
  if (target) {
    target.textContent = value;
  }
}
