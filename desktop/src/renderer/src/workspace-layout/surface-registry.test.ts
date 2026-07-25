import { describe, expect, test, vi } from "vitest";

import { conversationPaletteCatalog, type ConversationPaletteID } from "@generated/backend";
import type { SettaAPI } from "@shared/types";

import { claimConversationPaletteIdentity } from "../features/easy-button/conversation-palette-identity";
import { SurfaceRegistry } from "./surface-registry";
import { createFakeHost, setFakeRect } from "./test-dom-fakes";
import type {
  FreezeReason,
  EasyButtonWorkspacePane,
  WorkspacePane,
  NonEasyButtonSurfaceKind,
  PaneRenderItem,
  Rect,
  ResumeReason,
  SurfaceAdapter,
  SurfaceKind,
  SurfaceSnapshotFreshness,
  SurfaceSnapshotMetricsSink,
  ViewportChangeReason,
} from "./types";

describe("workspace surface registry", () => {
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

  test("keeps browser adapters mounted for snapshot runtime handoff", () => {
    const pane = fakePane("browser");
    const recordingAdapter = new RecordingSurfaceAdapter(pane);
    const registry = new SurfaceRegistry([pane], () => recordingAdapter);
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
    registry.syncHost(host, renderItem(pane, "snapshot"), { resizePhase: "idle" });

    expect(recordingAdapter.events).toContain("freeze:snapshot");
    expect(recordingAdapter.events).not.toContain("unmount");
    expect(recordingAdapter.events).not.toContain("mount:snapshot");
    expect(host.dataset.surfaceKind).toBe("browser");
  });

  test.each(["easy-button", "empty-frame", "fake-dom", "fake-heavy-dom"] satisfies SurfaceKind[])(
    "keeps %s adapters mounted for frozen runtime handoff",
    (surfaceKind) => {
      const pane = fakePane(surfaceKind);
      const recordingAdapter = new RecordingSurfaceAdapter(pane);
      const registry = new SurfaceRegistry([pane], () => recordingAdapter);
      const host = createFakeHost();

      registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
      registry.syncHost(host, renderItem(pane, "live-throttled"), { resizePhase: "idle" });

      expect(recordingAdapter.events.filter((event) => event === "mount:surface")).toHaveLength(1);
      expect(recordingAdapter.events).toContain("freeze:runtime-policy");
      expect(recordingAdapter.events).not.toContain("unmount");
      expect(recordingAdapter.events).not.toContain("mount:snapshot");
      expect(host.dataset.surfaceKind).toBe(surfaceKind);
    },
  );

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
    const pane = fakePane("fake-heavy-dom");
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
    });
    expect(settledStats).toMatchObject({
      deferredHeavyViewportWrites: 0,
      heavyViewportWrites: 1,
    });
    expect(recordingAdapter.events).toContain("viewport:mount:160x120");
    expect(recordingAdapter.events).not.toContain("viewport:frame:220x180");
    expect(recordingAdapter.events).toContain("viewport:resize:260x210");
  });

  test("keeps lightweight DOM viewport current during active resize", () => {
    const pane = fakePane("fake-dom");
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

  test("keeps browser native viewport current during active resize", () => {
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
      browserViewportWrites: 1,
      deferredHeavyViewportWrites: 0,
    });
    expect(skippedStats).toMatchObject({
      browserViewportWrites: 1,
      deferredHeavyViewportWrites: 0,
    });
    expect(settledStats).toMatchObject({
      browserViewportWrites: 1,
      deferredHeavyViewportWrites: 0,
    });
    expect(recordingAdapter.events).toContain("viewport:resize-active:220x180");
    expect(recordingAdapter.events).toContain("viewport:resize-active:230x190");
    expect(recordingAdapter.events).toContain("viewport:resize-active:240x200");
    expect(recordingAdapter.events).toContain("viewport:resize:260x210");
  });

  test("keeps browser native viewport current during Workspace movement", () => {
    const pane = fakePane("browser");
    const recordingAdapter = new RecordingSurfaceAdapter(pane);
    const registry = new SurfaceRegistry([pane], () => recordingAdapter);
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
    const movingStats = registry.syncHost(
      host,
      { ...renderItem(pane, "live", 220, 180), moving: true },
      { resizePhase: "idle" },
    );
    const throttledMovingStats = registry.syncHost(
      host,
      { ...renderItem(pane, "live", 230, 190), moving: true },
      { resizePhase: "idle" },
    );
    const settledStats = registry.syncHost(host, renderItem(pane, "live", 260, 210), {
      resizePhase: "idle",
    });

    expect(movingStats).toMatchObject({
      browserViewportWrites: 1,
      deferredHeavyViewportWrites: 0,
      heavyViewportWrites: 0,
    });
    expect(throttledMovingStats).toMatchObject({
      browserViewportWrites: 1,
      deferredHeavyViewportWrites: 0,
    });
    expect(settledStats).toMatchObject({
      browserViewportWrites: 1,
      deferredHeavyViewportWrites: 0,
    });
    expect(recordingAdapter.events).toContain("viewport:movement-active:220x180");
    expect(recordingAdapter.events).toContain("viewport:movement-active:230x190");
    expect(recordingAdapter.events).toContain("viewport:frame:260x210");
  });

  test("does not rewrite unchanged browser viewport after movement", () => {
    const pane = fakePane("browser");
    const recordingAdapter = new RecordingSurfaceAdapter(pane);
    const registry = new SurfaceRegistry([pane], () => recordingAdapter);
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
    registry.syncHost(host, { ...renderItem(pane, "live"), moving: true }, { resizePhase: "idle" });
    const settledStats = registry.syncHost(host, renderItem(pane, "live"), {
      resizePhase: "idle",
    });

    expect(settledStats).toMatchObject({
      browserViewportWrites: 0,
      surfaceViewportWrites: 0,
    });
    expect(recordingAdapter.events.filter((event) => event.startsWith("viewport:"))).toEqual([
      "viewport:mount:160x120",
    ]);
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

  test("captures live host content into the snapshot adapter for non-transition handoff", () => {
    const pane = fakePane("fake-dom");
    const adapter = new TexturedSurfaceAdapter(pane);
    const registry = new SurfaceRegistry([pane], () => adapter);
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
    registry.syncHost(host, renderItem(pane, "snapshot"), { resizePhase: "idle" });

    const snapshotContent = requireFakeChild(fakeChildrenOf(host), 0);
    const texture = requireFakeChild(snapshotContent.children, 0);
    const capturedPane = requireFakeChild(texture.children, 0);

    expect(host.dataset.surfaceKind).toBe("snapshot");
    expect(snapshotContent.className).toBe(
      "workspace-pane-content workspace-snapshot-surface workspace-snapshot-surface-has-texture",
    );
    expect(texture.className).toBe("workspace-snapshot-texture");
    expect(capturedPane.className).toBe("workspace-textured-source");
    expect(capturedPane.textContent).toBe("live pane texture");
  });

  test("keeps conversation palette identity on snapshot handoff", () => {
    const pane = {
      ...fakePane("easy-button"),
      easyButtonConfig: { conversationId: "conversation_alpha" },
    };
    const adapter = new ConversationTexturedSurfaceAdapter(pane);
    const registry = new SurfaceRegistry([pane], () => adapter);
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
    registry.syncHost(host, renderItem(pane, "snapshot"), { resizePhase: "idle" });

    expect(host.dataset.conversationId).toBe("conversation_alpha");
    expect(host.dataset.conversationPalette).toBe("sky");
    expect(host.classList.contains("conversation-presentation-identity")).toBe(true);
    expect(host.style.getPropertyValue("--conversation-accent-dark")).toBe(
      conversationPaletteCatalog.sky.dark.conversationAccent,
    );

    registry.releaseHost(host);

    expect(host.dataset.conversationId).toBeUndefined();
    expect(host.dataset.conversationPalette).toBeUndefined();
    expect(host.classList.contains("conversation-presentation-identity")).toBe(false);
    expect(host.style.getPropertyValue("--conversation-accent-dark")).toBe("");
  });

  test("clears a stale conversation palette during snapshot handoff", () => {
    const pane = {
      ...fakePane("easy-button"),
      easyButtonConfig: { conversationId: "conversation_alpha" },
    };
    const adapter = new ConversationTexturedSurfaceAdapter(pane);
    const registry = new SurfaceRegistry([pane], () => adapter);
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
    const releaseClearedIdentity = claimConversationPaletteIdentity(host, null);
    registry.syncHost(host, renderItem(pane, "snapshot"), { resizePhase: "idle" });

    expect(host.dataset.conversationId).toBeUndefined();
    expect(host.dataset.conversationPalette).toBeUndefined();
    expect(host.classList.contains("conversation-presentation-identity")).toBe(false);
    expect(host.style.getPropertyValue("--conversation-accent-dark")).toBe("");

    releaseClearedIdentity();
  });

  test("does not copy another conversation identity from a recycled snapshot host", () => {
    const alpha = {
      ...fakePane("easy-button"),
      easyButtonConfig: { conversationId: "conversation_alpha" },
      title: "Alpha pane",
    };
    const beta = {
      ...fakePane("easy-button", 1),
      easyButtonConfig: { conversationId: "conversation_beta" },
      title: "Beta pane",
    };
    const alphaAdapter = new ConversationTexturedSurfaceAdapter(alpha, "conversation_alpha", "sky");
    const betaAdapter = new ConversationTexturedSurfaceAdapter(beta, "conversation_beta", "blue");
    const adapters = new Map([
      [alpha.surfaceId, alphaAdapter],
      [beta.surfaceId, betaAdapter],
    ]);
    const registry = new SurfaceRegistry(
      [alpha, beta],
      (pane) => adapters.get(pane.surfaceId) ?? new RecordingSurfaceAdapter(pane),
    );
    const betaHost = createFakeHost();
    const recycledHost = createFakeHost();

    registry.syncHost(betaHost, renderItem(beta, "live"), { resizePhase: "idle" });
    registry.releaseHost(betaHost);
    registry.syncHost(recycledHost, renderItem(alpha, "live"), { resizePhase: "idle" });
    registry.syncHost(recycledHost, renderItem(beta, "snapshot"), { resizePhase: "idle" });

    expect(recycledHost.dataset.conversationId).toBe("conversation_beta");
    expect(recycledHost.dataset.conversationPalette).toBe("blue");
    expect(recycledHost.style.getPropertyValue("--conversation-accent-dark")).toBe(
      conversationPaletteCatalog.blue.dark.conversationAccent,
    );
    const snapshotContent = requireFakeChild(fakeChildrenOf(recycledHost), 0);
    const snapshotLabel = requireFakeChild(snapshotContent.children, 0);
    expect(snapshotContent.className).toBe("workspace-pane-content workspace-snapshot-surface");
    expect(snapshotLabel.textContent).toBe("Beta pane");
  });

  test("preserves nested scroller offsets in DOM pane snapshots", () => {
    const pane = fakePane("fake-heavy-dom");
    const adapter = new ScrollableTexturedSurfaceAdapter(pane);
    const registry = new SurfaceRegistry([pane], () => adapter);
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
    registry.syncHost(host, renderItem(pane, "snapshot"), { resizePhase: "idle" });

    const snapshotContent = requireFakeChild(fakeChildrenOf(host), 0);
    const texture = requireFakeChild(snapshotContent.children, 0);
    const capturedPane = requireFakeChild(texture.children, 0);
    const capturedScroller = requireFakeChild(capturedPane.children, 0);

    expect(snapshotContent.className).toBe(
      "workspace-pane-content workspace-snapshot-surface workspace-snapshot-surface-has-texture",
    );
    expect(capturedScroller.dataset.snapshotScrollTop).toBe("84");
    expect(capturedScroller.dataset.snapshotScrollLeft).toBe("13");
    expect(capturedScroller.dataset.snapshotScroller).toBe("true");
    expect(capturedScroller.scrollTop).toBe(84);
    expect(capturedScroller.scrollLeft).toBe(13);
    expect(capturedScroller.textContent).toBe("visible pane window");
    expect(capturedPane.dataset.snapshotWidth).toBe("640");
    expect(capturedPane.dataset.snapshotHeight).toBe("480");
    expect(capturedPane.style.getPropertyValue("width")).toBe("640px");
    expect(capturedPane.style.getPropertyValue("height")).toBe("480px");
    expect(capturedPane.style.getPropertyValue("overflow")).toBe("hidden");
  });

  test("does not start texture capture during overview handoff", () => {
    const pane = fakePane("fake-heavy-dom");
    const adapter = new ScrollableTexturedSurfaceAdapter(pane);
    const metrics = new RecordingSnapshotMetrics();
    const registry = new SurfaceRegistry([pane], () => adapter, { metrics });
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
    registry.syncHost(
      host,
      { ...renderItem(pane, "snapshot"), presentationMode: "overview" },
      {
        resizePhase: "idle",
      },
    );

    expect(metrics.captureRequests).toEqual([]);
    expect(metrics.textureUses).toEqual(["missing"]);
  });

  test("freezes live DOM panes during overview without mounting snapshot content", () => {
    const pane = fakePane("fake-heavy-dom");
    const adapter = new ScrollableTexturedSurfaceAdapter(pane);
    const metrics = new RecordingSnapshotMetrics();
    const registry = new SurfaceRegistry([pane], () => adapter, { metrics });
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
    registry.syncHost(
      host,
      { ...renderItem(pane, "live-throttled"), presentationMode: "overview" },
      {
        resizePhase: "idle",
      },
    );

    const liveSurface = requireFakeChild(fakeChildrenOf(host), 0);

    expect(adapter.events.filter((event) => event === "mount:surface")).toHaveLength(1);
    expect(adapter.events).toContain("freeze:runtime-policy");
    expect(adapter.events).not.toContain("unmount");
    expect(host.dataset.surfaceKind).toBe("fake-heavy-dom");
    expect(liveSurface.className).toBe("workspace-react-dom-surface");
    expect(metrics.captureRequests).toEqual([]);
    expect(metrics.textureUses).toEqual([]);
  });

  test("keeps the prior snapshot texture during overview handoff without recapturing", () => {
    const pane = fakePane("fake-heavy-dom");
    const adapter = new ScrollableTexturedSurfaceAdapter(pane);
    const registry = new SurfaceRegistry([pane], () => adapter);
    const host = createFakeHost();

    registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
    registry.syncHost(host, renderItem(pane, "snapshot"), { resizePhase: "idle" });
    host.dataset.presentationMode = "overview";
    registry.syncHost(
      host,
      { ...renderItem(pane, "live", 300, 480), presentationMode: "overview" },
      {
        resizePhase: "idle",
      },
    );
    const liveSurface = requireFakeChild(fakeChildrenOf(host), 0);
    setFakeRect(liveSurface as unknown as HTMLElement, { height: 480, width: 300, x: 0, y: 0 });
    registry.syncHost(
      host,
      { ...renderItem(pane, "snapshot", 300, 480), presentationMode: "overview" },
      {
        resizePhase: "idle",
      },
    );

    const snapshotContent = requireFakeChild(fakeChildrenOf(host), 0);
    const texture = requireFakeChild(snapshotContent.children, 0);
    const capturedPane = requireFakeChild(texture.children, 0);

    expect(texture.className).toBe("workspace-snapshot-texture");
    expect(capturedPane.className).toBe("workspace-react-dom-surface");
    expect(capturedPane.dataset.snapshotWidth).toBe("640");
    expect(capturedPane.dataset.snapshotHeight).toBe("480");
  });

  test("uses warmed bitmap snapshots when the live host releases before handoff", async () => {
    const captureRendererRegion = vi.fn().mockResolvedValue({
      capturedAt: 123,
      height: 480,
      imageDataUrl: "data:image/png;base64,AAAA",
      width: 640,
    });
    vi.stubGlobal("window", {
      setta: {
        app: {
          captureRendererRegion,
        },
      },
    });
    try {
      const pane = fakePane("fake-heavy-dom");
      const adapter = new ScrollableTexturedSurfaceAdapter(pane);
      const registry = new SurfaceRegistry([pane], () => adapter);
      const host = createFakeHost();

      registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
      await Promise.resolve();
      registry.releaseHost(host);

      const snapshotHost = createFakeHost();
      registry.syncHost(
        snapshotHost,
        { ...renderItem(pane, "snapshot"), presentationMode: "overview" },
        {
          resizePhase: "idle",
        },
      );

      const snapshotContent = requireFakeChild(fakeChildrenOf(snapshotHost), 0);
      const texture = requireFakeChild(snapshotContent.children, 0);
      const image = requireFakeChild(texture.children, 0);

      expect(captureRendererRegion).toHaveBeenCalledWith({
        height: 480,
        width: 640,
        x: 0,
        y: 0,
      });
      expect(texture.className).toBe(
        "workspace-snapshot-texture workspace-snapshot-bitmap-texture",
      );
      expect(image.className).toBe("workspace-snapshot-bitmap");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("records idle bitmap warmup as a background snapshot capture", () => {
    const captureRendererRegion = vi.fn().mockResolvedValue({
      capturedAt: 123,
      height: 480,
      imageDataUrl: "data:image/png;base64,AAAA",
      width: 640,
    });
    vi.stubGlobal("window", {
      setta: {
        app: {
          captureRendererRegion,
        },
      },
    });
    try {
      const pane = fakePane("fake-heavy-dom");
      const adapter = new ScrollableTexturedSurfaceAdapter(pane);
      const metrics = new RecordingSnapshotMetrics();
      const registry = new SurfaceRegistry([pane], () => adapter, { metrics });
      const host = createFakeHost();

      registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });

      expect(captureRendererRegion).toHaveBeenCalledOnce();
      expect(metrics.captureRequests).toEqual([{ duringTransition: false, kind: "bitmap" }]);
      expect(metrics.textureUses).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test.each(["easy-button", "fake-heavy-dom"] satisfies SurfaceKind[])(
    "prewarms bitmap snapshots for %s panes while idle",
    (surfaceKind) => {
      const captureRendererRegion = vi.fn().mockResolvedValue({
        capturedAt: 123,
        height: 480,
        imageDataUrl: "data:image/png;base64,AAAA",
        width: 640,
      });
      vi.stubGlobal("window", {
        setta: {
          app: {
            captureRendererRegion,
          },
        },
      });
      try {
        const pane = fakePane(surfaceKind);
        const adapter = new ScrollableTexturedSurfaceAdapter(pane);
        const metrics = new RecordingSnapshotMetrics();
        const registry = new SurfaceRegistry([pane], () => adapter, { metrics });
        const host = createFakeHost();

        registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });

        expect(captureRendererRegion).toHaveBeenCalledWith({
          height: 480,
          width: 640,
          x: 0,
          y: 0,
        });
        expect(metrics.captureRequests).toEqual([{ duringTransition: false, kind: "bitmap" }]);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  test("does not start bitmap warmup while already in overview", () => {
    const captureRendererRegion = vi.fn().mockResolvedValue({
      capturedAt: 123,
      height: 480,
      imageDataUrl: "data:image/png;base64,AAAA",
      width: 640,
    });
    vi.stubGlobal("window", {
      setta: {
        app: {
          captureRendererRegion,
        },
      },
    });
    try {
      const pane = fakePane("fake-heavy-dom");
      const adapter = new ScrollableTexturedSurfaceAdapter(pane);
      const metrics = new RecordingSnapshotMetrics();
      const registry = new SurfaceRegistry([pane], () => adapter, { metrics });
      const host = createFakeHost();

      registry.syncHost(
        host,
        { ...renderItem(pane, "live"), presentationMode: "overview" },
        { resizePhase: "idle" },
      );

      expect(captureRendererRegion).not.toHaveBeenCalled();
      expect(metrics.captureRequests).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("does not start bitmap warmup while a pane drag source is active", () => {
    const captureRendererRegion = vi.fn().mockResolvedValue({
      capturedAt: 123,
      height: 480,
      imageDataUrl: "data:image/png;base64,AAAA",
      width: 640,
    });
    vi.stubGlobal("window", {
      setta: {
        app: {
          captureRendererRegion,
        },
      },
    });
    try {
      const pane = fakePane("fake-heavy-dom");
      const adapter = new ScrollableTexturedSurfaceAdapter(pane);
      const metrics = new RecordingSnapshotMetrics();
      const registry = new SurfaceRegistry([pane], () => adapter, { metrics });
      const root = createFakeHost();
      const activeDragSource = createFakeHost();
      const host = createFakeHost();
      root.setAttribute("data-testid", "workspace-layout-area");
      activeDragSource.setAttribute("data-drag-source", "true");
      root.append(activeDragSource, host);

      registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });

      expect(captureRendererRegion).not.toHaveBeenCalled();
      expect(metrics.captureRequests).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("uses the warmed bitmap during overview handoff instead of cloning", async () => {
    const captureRendererRegion = vi.fn().mockResolvedValue({
      capturedAt: 123,
      height: 480,
      imageDataUrl: "data:image/png;base64,AAAA",
      width: 640,
    });
    vi.stubGlobal("window", {
      setta: {
        app: {
          captureRendererRegion,
        },
      },
    });
    try {
      const pane = fakePane("fake-heavy-dom");
      const adapter = new ScrollableTexturedSurfaceAdapter(pane);
      const registry = new SurfaceRegistry([pane], () => adapter);
      const host = createFakeHost();

      registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
      await Promise.resolve();
      registry.syncHost(
        host,
        { ...renderItem(pane, "snapshot"), presentationMode: "overview" },
        {
          resizePhase: "idle",
        },
      );

      const snapshotContent = requireFakeChild(fakeChildrenOf(host), 0);
      const texture = requireFakeChild(snapshotContent.children, 0);
      const image = requireFakeChild(texture.children, 0);

      expect(texture.className).toBe(
        "workspace-snapshot-texture workspace-snapshot-bitmap-texture",
      );
      expect(image.className).toBe("workspace-snapshot-bitmap");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("does not replace a missing overview handoff when pending bitmap resolves late", async () => {
    type CaptureSnapshot = Awaited<ReturnType<SettaAPI["app"]["captureRendererRegion"]>>;
    let resolveCapture: (snapshot: CaptureSnapshot) => void = () => {
      throw new Error("capture promise was not created");
    };
    const captureRendererRegion = vi.fn(
      () =>
        new Promise<CaptureSnapshot>((resolve) => {
          resolveCapture = resolve;
        }),
    );
    vi.stubGlobal("window", {
      setta: {
        app: {
          captureRendererRegion,
        },
      },
    });
    try {
      const pane = fakePane("fake-heavy-dom");
      const adapter = new ScrollableTexturedSurfaceAdapter(pane);
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

      const snapshotContent = requireFakeChild(fakeChildrenOf(host), 0);

      expect(snapshotContent.className).toBe("workspace-pane-content workspace-snapshot-surface");

      resolveCapture({
        capturedAt: 123,
        height: 480,
        imageDataUrl: "data:image/png;base64,AAAA",
        width: 640,
      });
      await Promise.resolve();

      const settledSnapshotContent = requireFakeChild(fakeChildrenOf(host), 0);

      expect(settledSnapshotContent.className).toBe(
        "workspace-pane-content workspace-snapshot-surface",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("rejects warmed bitmap captures when source geometry changes before resolution", async () => {
    type CaptureSnapshot = Awaited<ReturnType<SettaAPI["app"]["captureRendererRegion"]>>;
    let resolveCapture: (snapshot: CaptureSnapshot) => void = () => {
      throw new Error("capture promise was not created");
    };
    const captureRendererRegion = vi.fn(
      () =>
        new Promise<CaptureSnapshot>((resolve) => {
          resolveCapture = resolve;
        }),
    );
    vi.stubGlobal("window", {
      setta: {
        app: {
          captureRendererRegion,
        },
      },
    });
    try {
      const pane = fakePane("fake-heavy-dom");
      const adapter = new ScrollableTexturedSurfaceAdapter(pane);
      const registry = new SurfaceRegistry([pane], () => adapter);
      const host = createFakeHost();

      registry.syncHost(host, renderItem(pane, "live"), { resizePhase: "idle" });
      const surface = requireFakeChild(fakeChildrenOf(host), 0);
      setFakeRect(surface as unknown as HTMLElement, { height: 96, width: 140, x: 12, y: 18 });
      resolveCapture({
        capturedAt: 123,
        height: 480,
        imageDataUrl: "data:image/png;base64,AAAA",
        width: 640,
      });
      await Promise.resolve();
      setFakeRect(surface as unknown as HTMLElement, { height: 480, width: 640, x: 0, y: 0 });

      registry.syncHost(
        host,
        { ...renderItem(pane, "snapshot"), presentationMode: "overview" },
        {
          resizePhase: "idle",
        },
      );

      const snapshotContent = requireFakeChild(fakeChildrenOf(host), 0);

      expect(snapshotContent.className).toBe("workspace-pane-content workspace-snapshot-surface");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

class RecordingSurfaceAdapter implements SurfaceAdapter {
  events: string[] = [];
  readonly kind: SurfaceKind;
  readonly surfaceId: string;

  constructor(pane: WorkspacePane) {
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

class RecordingSnapshotMetrics implements SurfaceSnapshotMetricsSink {
  captureRequests: Array<{ duringTransition: boolean; kind: "bitmap" | "texture" }> = [];
  textureUses: SurfaceSnapshotFreshness[] = [];

  recordSnapshotCaptureRequest(input: {
    duringTransition: boolean;
    kind: "bitmap" | "texture";
  }): void {
    this.captureRequests.push(input);
  }

  recordSnapshotTextureUse(freshness: SurfaceSnapshotFreshness): void {
    this.textureUses.push(freshness);
  }
}

class TexturedSurfaceAdapter extends RecordingSurfaceAdapter {
  override mount(host: HTMLElement): void {
    super.mount(host);
    const texture = host.ownerDocument.createElement("div");
    texture.className = "workspace-textured-source";
    texture.textContent = "live pane texture";
    host.append(texture);
  }
}

class ConversationTexturedSurfaceAdapter extends TexturedSurfaceAdapter {
  private releasePresentationIdentity: (() => void) | null = null;

  constructor(
    pane: WorkspacePane,
    private readonly conversationId = "conversation_alpha",
    private readonly paletteId: ConversationPaletteID = "sky",
  ) {
    super(pane);
  }

  override mount(host: HTMLElement): void {
    super.mount(host);
    host.dataset.surfaceId = this.surfaceId;
    this.releasePresentationIdentity = claimConversationPaletteIdentity(host, {
      conversationId: this.conversationId,
      paletteId: this.paletteId,
    });
  }

  override unmount(): void {
    this.releasePresentationIdentity?.();
    this.releasePresentationIdentity = null;
    super.unmount();
  }
}

class ScrollableTexturedSurfaceAdapter extends RecordingSurfaceAdapter {
  override mount(host: HTMLElement): void {
    super.mount(host);
    const surface = host.ownerDocument.createElement("div");
    surface.className = "workspace-react-dom-surface";
    setFakeRect(surface as unknown as HTMLElement, { height: 480, width: 640, x: 0, y: 0 });
    const scroller = host.ownerDocument.createElement("div");
    scroller.className = "workspace-test-scroller";
    scroller.scrollLeft = 13;
    scroller.scrollTop = 84;
    scroller.textContent = "visible pane window";
    surface.append(scroller);
    host.append(surface);
  }
}

interface FakeChildNode {
  children: FakeChildNode[];
  className: string;
  dataset: Record<string, string>;
  scrollLeft: number;
  scrollTop: number;
  style: {
    getPropertyValue(name: string): string;
  };
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

function fakePane(surfaceKind: "easy-button", sequence?: number): EasyButtonWorkspacePane;
function fakePane(
  surfaceKind: NonEasyButtonSurfaceKind,
  sequence?: number,
): Exclude<WorkspacePane, { surfaceKind: "easy-button" }>;
function fakePane(surfaceKind: SurfaceKind, sequence?: number): WorkspacePane;
function fakePane(surfaceKind: SurfaceKind, sequence = 0): WorkspacePane {
  const suffix = sequence === 0 ? "" : `-${sequence}`;
  const fields = {
    columnId: `column${suffix}`,
    heat: 42,
    paneId: `pane${suffix}`,
    sequence,
    subtitle: "test",
    surfaceId: `surface${suffix}`,
    title: "Pane",
    tone: "cyan" as const,
    weight: 1,
  };
  return surfaceKind === "easy-button"
    ? {
        ...fields,
        easyButtonConfig: { conversationId: `conversation${suffix || "_test"}` },
        surfaceKind,
      }
    : { ...fields, surfaceKind };
}

function renderItem(
  pane: WorkspacePane,
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
