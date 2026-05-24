import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import { startGpuFlowPerformanceMeasure } from "../gpuFlowPerformanceMarks";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import {
  createGpuFlowPreparedContentFrame,
  createGpuFlowStartupPreparedContentFrame,
  type GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import { createGpuFlowPresentedSurfaceRuntime } from "../presentedSurfaceRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { BrowserVisualActorRepresentationReadiness } from "../surfaceCompositor/browserVisualActorAdapter";
import type { SurfaceResourceHandle } from "../surfaceCompositor/surfaceCoverage";
import type { GpuViewportInput } from "../viewportMath";
import {
  getGpuFlowBrowserVisualActorRuntimeForPresentedSurface,
  type GpuFlowBrowserVisualActorCandidate,
} from "./browserVisualActorRuntime";
import { areBrowserVisualActorRuntimeSnapshotsEqual } from "./browserVisualActorRuntimeHelpers";
import {
  createGpuFlowVisibleFrameSelectedResourceWorkKeys,
  type GpuFlowVisibleFrameBudgetBrokerDecision,
} from "./visibleFrameBudgetBroker";
import {
  assertGpuFlowPreparedCandidateAbortToken,
  type GpuFlowBlockedPresentationToken,
  type GpuFlowHoldPreviousToken,
  type GpuFlowVisibleFramePresentationToken,
} from "./visibleFramePresentationProofs";
import { createGpuFlowVisibleFrameResourceGraph } from "./visibleFrameResourceGraph";

type GpuFlowPreparedContentFrameReuseEntry = {
  readonly browserVisualCandidate: GpuFlowBrowserVisualActorCandidate;
  readonly frame: GpuFlowPreparedContentFrame;
  readonly gpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
};

type GpuFlowBrowserVisualCompatibilityProof =
  BrowserVisualActorRepresentationReadiness & {
    readonly coverageState: "compatible-previous-ready";
  };

const GPU_FLOW_BROWSER_VISUAL_COMPATIBILITY_PROOF_IDENTITY_KEYS = [
  "activationPolicy",
  "actorId",
  "canonicalActorId",
  "clipChainRevision",
  "controlKind",
  "displayRevision",
  "focusState",
  "hitTargetId",
  "reasonCode",
  "retainedScrollCompatible",
  "retainedSurfaceId",
  "semanticGenerationId",
  "visualGenerationId",
] as const satisfies readonly (keyof GpuFlowBrowserVisualCompatibilityProof["compatibilityProof"])[];

export function useGpuFlowPresentedSurfaceFrameState({
  initialRetainedRuntimeFrame,
}: {
  readonly initialRetainedRuntimeFrame: GpuRetainedRuntimeFrame;
}) {
  const presentedContentFrameRef = useRef<GpuFlowPreparedContentFrame | null>(
    null,
  );
  const startupPresentedContentFrame = useMemo(
    () =>
      createGpuFlowStartupPreparedContentFrame({
        retainedRuntimeFrame: initialRetainedRuntimeFrame,
      }),
    [initialRetainedRuntimeFrame],
  );
  const presentedSurfaceRuntimeRef = useRef(
    createGpuFlowPresentedSurfaceRuntime(startupPresentedContentFrame),
  );
  const visibleFrameResourceGraphRef = useRef(
    createGpuFlowVisibleFrameResourceGraph(),
  );
  const preparedContentFrameReuseRef =
    useRef<GpuFlowPreparedContentFrameReuseEntry | null>(null);
  const semanticSnapshot = useSyncExternalStore(
    presentedSurfaceRuntimeRef.current.subscribeReactSemanticSnapshot.bind(
      presentedSurfaceRuntimeRef.current,
    ),
    presentedSurfaceRuntimeRef.current.getReactSemanticSnapshot.bind(
      presentedSurfaceRuntimeRef.current,
    ),
    presentedSurfaceRuntimeRef.current.getReactSemanticSnapshot.bind(
      presentedSurfaceRuntimeRef.current,
    ),
  );
  const visiblePresentedContentFrame = semanticSnapshot.frame;
  presentedContentFrameRef.current =
    presentedSurfaceRuntimeRef.current.getPresentedContentFrame();

  const prepareContentFrame = useCallback(
    (
      nextRetainedDisplayFrame: RetainedDisplayFrame,
      options?:
        | {
            readonly gpuNativeVisuals:
              | readonly HtmlSurfaceSolidRoundedRectVisual[]
              | undefined;
            readonly viewport?: GpuViewportInput | undefined;
          }
        | undefined,
    ): GpuFlowPreparedContentFrame => {
      const previousPreparedContentFrame =
        presentedSurfaceRuntimeRef.current.getPresentedContentFrame();
      const browserVisualRuntime =
        getGpuFlowBrowserVisualActorRuntimeForPresentedSurface(
          presentedSurfaceRuntimeRef.current,
        );
      const finishBrowserVisualCandidateMeasure =
        startGpuFlowPerformanceMeasure(
          "prepared-content-browser-visual-candidate",
          {
            domControlCount:
              nextRetainedDisplayFrame.retainedRuntimeFrame.descriptors
                .domControlSources.length,
            frame: nextRetainedDisplayFrame.id,
          },
        );
      const browserVisualCandidate = browserVisualRuntime.prepareContentFrame({
        retainedDisplayFrame: nextRetainedDisplayFrame,
        viewport: options?.viewport,
      });
      finishBrowserVisualCandidateMeasure();
      const reusablePreparedContentFrame =
        selectReusableGpuFlowPreparedContentFrame({
          browserVisualCandidate,
          cacheEntry: preparedContentFrameReuseRef.current,
          gpuNativeVisuals: options?.gpuNativeVisuals,
          previousPreparedContentFrame,
          retainedDisplayFrame: nextRetainedDisplayFrame,
        });
      if (reusablePreparedContentFrame) {
        const finishPreparedContentBuildMeasure =
          startGpuFlowPerformanceMeasure("prepared-content-build", {
            cacheHit: true,
            domControlCount:
              nextRetainedDisplayFrame.retainedRuntimeFrame.descriptors
                .domControlSources.length,
            frame: nextRetainedDisplayFrame.id,
          });
        finishPreparedContentBuildMeasure();
        registerGpuFlowPreparedContentFrameCandidate({
          browserVisualCandidate,
          frame: reusablePreparedContentFrame,
          visibleFrameResourceGraph: visibleFrameResourceGraphRef.current,
        });
        preparedContentFrameReuseRef.current = {
          browserVisualCandidate,
          frame: reusablePreparedContentFrame,
          gpuNativeVisuals: options?.gpuNativeVisuals,
          retainedDisplayFrame: nextRetainedDisplayFrame,
        };
        return reusablePreparedContentFrame;
      }
      const finishPreparedContentBuildMeasure = startGpuFlowPerformanceMeasure(
        "prepared-content-build",
        {
          cacheHit: false,
          domControlCount:
            nextRetainedDisplayFrame.retainedRuntimeFrame.descriptors
              .domControlSources.length,
          frame: nextRetainedDisplayFrame.id,
        },
      );
      const nextPreparedContentFrame = createGpuFlowPreparedContentFrame({
        browserVisualReadiness: browserVisualCandidate.readiness,
        domPresentationEvidence: browserVisualCandidate.presentationEvidence,
        gpuNativeVisuals: options?.gpuNativeVisuals,
        previousPreparedContentFrame,
        retainedDisplayFrame: nextRetainedDisplayFrame,
      });
      finishPreparedContentBuildMeasure();
      registerGpuFlowPreparedContentFrameCandidate({
        browserVisualCandidate,
        frame: nextPreparedContentFrame,
        visibleFrameResourceGraph: visibleFrameResourceGraphRef.current,
      });
      preparedContentFrameReuseRef.current = {
        browserVisualCandidate,
        frame: nextPreparedContentFrame,
        gpuNativeVisuals: options?.gpuNativeVisuals,
        retainedDisplayFrame: nextRetainedDisplayFrame,
      };
      return nextPreparedContentFrame;
    },
    [],
  );
  const presentPreparedContentFrame = useCallback(
    (
      token: GpuFlowVisibleFramePresentationToken,
      frame: GpuFlowPreparedContentFrame,
    ): boolean => {
      const result =
        visibleFrameResourceGraphRef.current.presentPreparedContentFrame({
          presentBrowserVisualCandidate: ({ candidate, token }) =>
            getGpuFlowBrowserVisualActorRuntimeForPresentedSurface(
              presentedSurfaceRuntimeRef.current,
            ).presentPreparedBrowserVisualActors({
              candidate,
              token,
            }),
          frame,
          presentContentFrame: ({ frame, token }) =>
            presentedSurfaceRuntimeRef.current.presentContentFrame(
              token,
              frame,
            ),
          token,
        });
      presentedContentFrameRef.current = frame;
      return result.presented;
    },
    [],
  );
  const validatePreparedContentFrame = useCallback(
    (
      token: GpuFlowVisibleFramePresentationToken,
      frame: GpuFlowPreparedContentFrame,
    ) =>
      visibleFrameResourceGraphRef.current.validatePreparedContentFrame({
        frame,
        token,
      }),
    [],
  );
  const projectPresentedBrowserVisualActors = useCallback(
    (
      token: GpuFlowVisibleFramePresentationToken,
      viewport?: GpuViewportInput | undefined,
    ): void => {
      const browserVisualRuntime =
        getGpuFlowBrowserVisualActorRuntimeForPresentedSurface(
          presentedSurfaceRuntimeRef.current,
        );
      browserVisualRuntime.projectDomControls({ token, viewport });
      browserVisualRuntime.projectDomIslands({ token, viewport });
      presentedSurfaceRuntimeRef.current.presentProjectionIdentity(token);
    },
    [],
  );
  const abortPreparedContentFrame = useCallback(
    (
      token: GpuFlowBlockedPresentationToken | GpuFlowHoldPreviousToken,
      frame: GpuFlowPreparedContentFrame,
      options?:
        | {
            readonly browserVisualPreparationResourceKeys?:
              | readonly string[]
              | undefined;
            readonly preservePreparationSnapshot?: boolean | undefined;
          }
        | undefined,
    ): void => {
      assertGpuFlowPreparedCandidateAbortToken({ token });
      const browserVisualRuntime =
        getGpuFlowBrowserVisualActorRuntimeForPresentedSurface(
          presentedSurfaceRuntimeRef.current,
        );
      visibleFrameResourceGraphRef.current.abortPreparedContentFrame({
        abortBrowserVisualCandidate: ({ candidate, token }) =>
          browserVisualRuntime.abortPreparedBrowserVisualActors({
            candidate,
            token,
          }),
        browserVisualPreparationResourceKeys:
          options?.browserVisualPreparationResourceKeys,
        frame,
        preservePreparationSnapshot:
          options?.preservePreparationSnapshot === true,
        stageBrowserVisualCandidate: ({
          candidate,
          selectedResourceKeys,
          token,
        }) =>
          browserVisualRuntime.stagePreparedBrowserVisualActors({
            candidate,
            selectedResourceKeys,
            token,
          }),
        token,
      });
    },
    [],
  );
  const getVisibleFrameResourceGraphSnapshot = useCallback(
    () => visibleFrameResourceGraphRef.current.getSnapshot(),
    [],
  );
  const prepareVisibleFrameResourcesForBudget = useCallback(
    (budgetDecision: GpuFlowVisibleFrameBudgetBrokerDecision) => {
      const browserVisualRuntime =
        getGpuFlowBrowserVisualActorRuntimeForPresentedSurface(
          presentedSurfaceRuntimeRef.current,
        );
      return visibleFrameResourceGraphRef.current.advanceVisibleFrameResourceWork(
        {
          resourceKeys: createGpuFlowVisibleFrameSelectedResourceWorkKeys({
            budgetDecision,
            resourceGraphSnapshot:
              visibleFrameResourceGraphRef.current.getSnapshot(),
          }),
          stageBrowserVisualCandidate: ({
            candidate,
            selectedResourceKeys,
            token,
          }) =>
            browserVisualRuntime.stagePreparedBrowserVisualActors({
              candidate,
              selectedResourceKeys,
              token,
            }),
        },
      );
    },
    [],
  );

  return {
    abortPreparedContentFrame,
    presentPreparedContentFrame,
    presentedContentFrameRef,
    presentedSurfaceRuntime: presentedSurfaceRuntimeRef.current,
    getVisibleFrameResourceGraphSnapshot,
    prepareContentFrame,
    prepareVisibleFrameResourcesForBudget,
    projectPresentedBrowserVisualActors,
    validatePreparedContentFrame,
    visiblePresentedContentFrame,
  };
}

function selectReusableGpuFlowPreparedContentFrame({
  browserVisualCandidate,
  cacheEntry,
  gpuNativeVisuals,
  previousPreparedContentFrame,
  retainedDisplayFrame,
}: {
  readonly browserVisualCandidate: GpuFlowBrowserVisualActorCandidate;
  readonly cacheEntry: GpuFlowPreparedContentFrameReuseEntry | null;
  readonly gpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly previousPreparedContentFrame: GpuFlowPreparedContentFrame;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
}): GpuFlowPreparedContentFrame | null {
  if (
    cacheEntry === null ||
    cacheEntry.frame !== previousPreparedContentFrame ||
    cacheEntry.retainedDisplayFrame !== retainedDisplayFrame ||
    cacheEntry.gpuNativeVisuals !== gpuNativeVisuals
  ) {
    return null;
  }
  if (
    !areBrowserVisualActorRuntimeSnapshotsEqual(
      cacheEntry.browserVisualCandidate.snapshot,
      browserVisualCandidate.snapshot,
    )
  ) {
    return null;
  }
  if (
    !areGpuFlowBrowserVisualReadinessMapsEqual(
      cacheEntry.browserVisualCandidate.readiness.domControlReadinessByActorId,
      browserVisualCandidate.readiness.domControlReadinessByActorId,
    ) ||
    !areGpuFlowBrowserVisualReadinessMapsEqual(
      cacheEntry.browserVisualCandidate.readiness.domIslandReadinessByActorId,
      browserVisualCandidate.readiness.domIslandReadinessByActorId,
    )
  ) {
    return null;
  }
  return cacheEntry.frame;
}

function registerGpuFlowPreparedContentFrameCandidate({
  browserVisualCandidate,
  frame,
  visibleFrameResourceGraph,
}: {
  readonly browserVisualCandidate: GpuFlowBrowserVisualActorCandidate;
  readonly frame: GpuFlowPreparedContentFrame;
  readonly visibleFrameResourceGraph: ReturnType<
    typeof createGpuFlowVisibleFrameResourceGraph
  >;
}): void {
  const finishResourceGraphMeasure = startGpuFlowPerformanceMeasure(
    "prepared-content-resource-graph-register",
    {
      actorCount: frame.actorGenerations.length,
      frame: frame.displayFrameId,
    },
  );
  visibleFrameResourceGraph.registerPreparedContentFrame({
    browserVisualCandidate,
    frame,
  });
  finishResourceGraphMeasure();
}

function areGpuFlowBrowserVisualReadinessMapsEqual(
  left: ReadonlyMap<string, BrowserVisualActorRepresentationReadiness>,
  right: ReadonlyMap<string, BrowserVisualActorRepresentationReadiness>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [actorId, leftReadiness] of left) {
    const rightReadiness = right.get(actorId);
    if (
      rightReadiness === undefined ||
      !areGpuFlowBrowserVisualReadinessEqual(leftReadiness, rightReadiness)
    ) {
      return false;
    }
  }
  return true;
}

function areGpuFlowBrowserVisualReadinessEqual(
  left: BrowserVisualActorRepresentationReadiness,
  right: BrowserVisualActorRepresentationReadiness,
): boolean {
  return (
    left.coverageState === right.coverageState &&
    left.projectionCoverageRequired === right.projectionCoverageRequired &&
    areGpuFlowBrowserVisualResourceHandlesEqual(
      left.resourceHandles,
      right.resourceHandles,
    ) &&
    areGpuFlowBrowserVisualCompatibilityProofsEqual(left, right)
  );
}

function areGpuFlowBrowserVisualResourceHandlesEqual(
  left: readonly SurfaceResourceHandle[] | undefined,
  right: readonly SurfaceResourceHandle[] | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  return left.every(
    (handle, index) =>
      handle.id === right[index]?.id && handle.kind === right[index]?.kind,
  );
}

function areGpuFlowBrowserVisualCompatibilityProofsEqual(
  left: BrowserVisualActorRepresentationReadiness,
  right: BrowserVisualActorRepresentationReadiness,
): boolean {
  if (
    left.coverageState !== "compatible-previous-ready" ||
    right.coverageState !== "compatible-previous-ready"
  ) {
    return left.coverageState === right.coverageState;
  }
  const leftProof = left.compatibilityProof;
  const rightProof = right.compatibilityProof;
  return (
    GPU_FLOW_BROWSER_VISUAL_COMPATIBILITY_PROOF_IDENTITY_KEYS.every(
      (key) => leftProof[key] === rightProof[key],
    ) && areGpuFlowRectsEqual(leftProof.flowRect, rightProof.flowRect)
  );
}

function areGpuFlowRectsEqual(
  left: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  },
  right: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  },
): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}
