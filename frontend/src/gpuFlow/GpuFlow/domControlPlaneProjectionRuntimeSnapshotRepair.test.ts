/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";

import type { CommittedHtmlSurfaceTextureSnapshot } from "../htmlSurfaces/textures";
import { createGpuFlowViewportStore } from "../viewportStore";
import { createGpuFlowBrowserVisualActorRuntime } from "./browserVisualActorRuntime";
import {
  committedSnapshotTexture,
  createMockViewportRuntime,
  domControl,
  domControlCoverageState,
  domControlReadinessResourceHandles,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  stageBrowserVisualCandidate,
} from "./domControlPlaneProjectionRuntimeTestUtils";
import { getGpuRetainedDomControlSnapshotSurfaceId } from "./retainedDomControlSources";

describe("GPU flow DOM control projection runtime snapshot repair", () => {
  afterEach(() => {
    delete (
      window as Window & {
        __SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__?: unknown;
      }
    ).__SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__;
    document.body.replaceChildren();
  });

  it("repairs blocked browser-visual controls through staged exact snapshots", () => {
    const blockedControl = domControl({
      index: 0,
      value: "blocked visual value",
      visualPolicy: "blocked-awaiting-browser-visual",
    });
    const runtimeFrame = retainedRuntimeFrame([blockedControl]);
    const browserVisualRuntime = createGpuFlowBrowserVisualActorRuntime();
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 3_000,
      transform: [0, 0, 1],
      width: 400,
    });
    const committedTextureBySurfaceId = new Map<
      string,
      CommittedHtmlSurfaceTextureSnapshot
    >();
    browserVisualRuntime.setDomControlProjectionEnvironment({
      getRetainedScrollOffset: undefined,
      viewportRuntime,
      viewportStore,
    });
    browserVisualRuntime.setDomControlSnapshotTextureManager({
      getCommittedSurfaceTexture: (surfaceId) =>
        committedTextureBySurfaceId.get(surfaceId),
    });

    const firstReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 1,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });
    stageBrowserVisualCandidate({
      browserVisualRuntime,
      candidate: firstReadiness,
    });

    const blockedSnapshotSurfaceId =
      getGpuRetainedDomControlSnapshotSurfaceId(blockedControl);
    expect(domControlCoverageState(firstReadiness, blockedControl)).toBe(
      "blocked-awaiting-snapshot",
    );
    expect(
      browserVisualRuntime
        .getPreparationSnapshot()
        .domControls.snapshotControls.map((control) => control.sourceId),
    ).toContain(blockedControl.sourceId);

    const element = document.body.appendChild(document.createElement("div"));
    browserVisualRuntime.setDomControlSnapshotElement({
      element,
      surfaceId: blockedSnapshotSurfaceId,
    });
    committedTextureBySurfaceId.set(
      blockedSnapshotSurfaceId,
      committedSnapshotTexture({
        textureContentKey: blockedControl.snapshotCacheKeyRevision,
      }),
    );

    const readyReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 2,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });

    expect(domControlCoverageState(readyReadiness, blockedControl)).toBe(
      "exact-snapshot-ready",
    );
    expect(
      domControlReadinessResourceHandles(readyReadiness, blockedControl),
    ).toEqual([
      expect.objectContaining({
        actorId: blockedControl.sourceId,
        contentGenerationId: blockedControl.snapshotCacheKeyRevision,
        id: blockedSnapshotSurfaceId,
        kind: "texture",
        projectionGenerationId: expect.any(String),
        resourceGenerationId: expect.any(String),
      }),
    ]);
  });

  it("withholds targeted DOM-control readiness through the dev/test browser-visual fault hook", () => {
    const control = domControl({
      index: 0,
      value: "snapshot visual value",
      visualPolicy: "blocked-awaiting-browser-visual",
    });
    const runtimeFrame = retainedRuntimeFrame([control]);
    const browserVisualRuntime = createGpuFlowBrowserVisualActorRuntime();
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 3_000,
      transform: [0, 0, 1],
      width: 400,
    });
    const committedTextureBySurfaceId = new Map<
      string,
      CommittedHtmlSurfaceTextureSnapshot
    >();
    browserVisualRuntime.setDomControlProjectionEnvironment({
      getRetainedScrollOffset: undefined,
      viewportRuntime,
      viewportStore,
    });
    browserVisualRuntime.setDomControlSnapshotTextureManager({
      getCommittedSurfaceTexture: (surfaceId) =>
        committedTextureBySurfaceId.get(surfaceId),
    });
    const snapshotSurfaceId =
      getGpuRetainedDomControlSnapshotSurfaceId(control);
    const snapshotElement = document.body.appendChild(
      document.createElement("div"),
    );
    browserVisualRuntime.setDomControlSnapshotElement({
      element: snapshotElement,
      surfaceId: snapshotSurfaceId,
    });
    committedTextureBySurfaceId.set(
      snapshotSurfaceId,
      committedSnapshotTexture({
        textureContentKey: control.snapshotCacheKeyRevision,
      }),
    );
    const readyCandidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 1,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });
    expect(domControlCoverageState(readyCandidate, control)).toBe(
      "exact-snapshot-ready",
    );

    (
      window as Window & {
        __SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__?: unknown;
      }
    ).__SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__ = {
      domControlReadiness: "blocked-awaiting-snapshot",
      withholdDomControlActorIds: [control.sourceId],
    };
    const blockedCandidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 2,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });

    expect(domControlCoverageState(blockedCandidate, control)).toBe(
      "blocked-awaiting-snapshot",
    );
  });
});
