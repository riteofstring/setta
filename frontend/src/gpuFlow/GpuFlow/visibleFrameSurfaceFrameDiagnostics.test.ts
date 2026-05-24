import { afterEach, describe, expect, it } from "vitest";

import type {
  GpuFlowPreparedContentActorGeneration,
  GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import { createGpuFlowContentPreparationFrameResult } from "./visibleFrameContentPlan";
import { recordGpuFlowSurfacePresentationFrameOutcomeDiagnostic } from "./visibleFrameSurfaceFrameDiagnostics";

describe("GPU Flow visible frame surface diagnostics", () => {
  afterEach(() => {
    delete (
      globalThis as typeof globalThis & {
        __SETTA_GPU_FLOW_PRESENTATION_DEBT_FRAME_REQUESTS__?: unknown[];
      }
    ).__SETTA_GPU_FLOW_PRESENTATION_DEBT_FRAME_REQUESTS__;
  });

  it("records selected actor manifest counts and classified debt age", () => {
    const frame = preparedContentFrame();

    recordGpuFlowSurfacePresentationFrameOutcomeDiagnostic({
      coordinatorResult: {
        outcome: {
          kind: "present",
          token: {
            transactionId: "presentation:surface-frame",
          },
        },
        preparedFrame: {
          contentPreparationFrame: createGpuFlowContentPreparationFrameResult({
            preparedContentFrame: frame,
            rendered: true,
          }),
          transactionProof: null,
        },
        presentationFrameContext: {
          activeEditorPins: ["editor-a"],
          budgetDecision: {
            browserVisualRepair: null,
            preparationBudget: {
              deferredDebtByLane: {},
              deferredDebtIds: [],
              overBudgetDebtIds: [],
              selectedDebtByLane: {},
              selectedDebtIds: [],
              selectedResourceDebtIds: [],
              selectedVisibleDebtIds: [],
              selectedVisibleResourceDebtIds: [],
              usedMs: 0,
            },
            resolutionUpdates: { deferred: false },
          },
          frameRequest: {
            classifiedDebt: {
              continuity: { active: true, ageFrames: 3, ageMs: 48 },
              quality: { active: false, ageFrames: 0, ageMs: 0 },
              safety: { active: false, ageFrames: 0, ageMs: 0 },
            },
            contentDebt: true,
            contentRetryDeferred: false,
            criticalContentDebt: false,
            maintenanceDebt: false,
            motionDebt: false,
            motionRetryDeferred: false,
            rawReasons: ["retained-scroll", "manual"],
            reducerState: "motion-active",
            retainedScrollInteractionActive: true,
            viewportInteractionActive: true,
          },
        },
        reducerDecision: {
          lane: "content",
          reducerState: "motion-active",
          sample: {
            id: 7,
            retainedScrollRevision: 12,
          },
        },
      },
      frame: 7,
      frameReasons: ["retained-scroll", "manual"],
      postFrameResourceGraphSnapshot: {
        activeEditorPins: ["editor-a"],
        candidateResourceKeys: [],
        pendingCandidateFrameIds: [],
        presentedFrameId: 7,
        presentedResourceKeys: [],
        queuedResourceKeys: [],
        resourceDebtByState: {
          absent: 0,
          preparing: 0,
          presented: 0,
          ready: 0,
          requested: 0,
          retired: 0,
        },
        resourceStates: [],
      },
      reducerCompletion: {
        completion: {
          debt: { content: true, maintenance: false, motion: false },
          outcome: "present",
        },
        debtFrameRequest: null,
      },
    } as Parameters<
      typeof recordGpuFlowSurfacePresentationFrameOutcomeDiagnostic
    >[0]);

    const requests = (
      globalThis as typeof globalThis & {
        __SETTA_GPU_FLOW_PRESENTATION_DEBT_FRAME_REQUESTS__?: readonly {
          readonly actorManifest: {
            readonly requiredActorsByFamily: Record<string, number>;
            readonly scrollHorizonCoverage: {
              readonly retainedScrollSurfaceCount: number;
            };
          };
          readonly frameRequest: {
            readonly classifiedDebt: unknown;
            readonly retainedScrollInteractionActive: boolean;
          };
        }[];
      }
    ).__SETTA_GPU_FLOW_PRESENTATION_DEBT_FRAME_REQUESTS__;

    expect(requests).toHaveLength(1);
    expect(requests?.[0]?.frameRequest).toEqual(
      expect.objectContaining({
        classifiedDebt: {
          continuity: { active: true, ageFrames: 3, ageMs: 48 },
          quality: { active: false, ageFrames: 0, ageMs: 0 },
          safety: { active: false, ageFrames: 0, ageMs: 0 },
        },
        retainedScrollInteractionActive: true,
      }),
    );
    expect(requests?.[0]?.actorManifest).toEqual(
      expect.objectContaining({
        requiredActorsByFamily: expect.objectContaining({
          "section-header": 1,
        }),
        scrollHorizonCoverage: expect.objectContaining({
          retainedScrollSurfaceCount: 1,
        }),
      }),
    );
  });
});

function preparedContentFrame(): GpuFlowPreparedContentFrame {
  return {
    actorGenerations: [
      sectionActor({
        actorFamily: "section-header",
        actorId: "section-a:section-header",
      }),
    ],
    displayFrameId: 7,
    projectionHorizon: {
      retainedScrollSurfaces: [
        {
          actorCount: 1,
          preparedScrollOffset: { x: 0, y: 32 },
          preparedScrollRange: {
            x: { max: 720, min: 0 },
            y: { max: 752, min: 0 },
          },
          surfaceId: "section-a",
          textActorCount: 1,
          visibleNonemptyTextActorCount: 1,
        },
      ],
    },
  } as unknown as GpuFlowPreparedContentFrame;
}

function sectionActor({
  actorFamily,
  actorId,
}: {
  readonly actorFamily: "section-header";
  readonly actorId: string;
}): GpuFlowPreparedContentActorGeneration {
  const rect = { height: 32, width: 320, x: 0, y: 0 };
  return {
    actorFamily,
    actorId,
    clipChainRevision: "clip",
    clipRect: rect,
    contentGenerationId: "content",
    flowRect: rect,
    generationId: "generation",
    kind: "gpu-native-visual",
    layoutProjectionGenerationId: "projection",
    mountReadiness: "ready",
    readinessGenerationId: "ready",
    sourceRect: rect,
    visibleNonempty: true,
    zOrder: 1,
  } as unknown as GpuFlowPreparedContentActorGeneration;
}
