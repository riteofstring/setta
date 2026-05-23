import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { prepareGpuFlowCommittedSurfacePublicationCandidate } from "./visibleFramePublicationKernel";

type GpuFlowCommittedSurfacePublicationCandidate = ReturnType<
  typeof prepareGpuFlowCommittedSurfacePublicationCandidate
>;

export type GpuFlowBlockedCommittedSurfacePublication = Extract<
  GpuFlowCommittedSurfacePublicationCandidate,
  { readonly kind: "blocked" }
>;

type GpuFlowCommittedSurfacePublicationCandidateAction =
  | {
      readonly kind: "continue";
    }
  | {
      readonly kind: "return";
      readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
    };

export function handleGpuFlowCommittedSurfacePublicationCandidate({
  candidate,
  onBlockedSurfacePublication,
  onCommittedSurfaceFramePublishable,
  onPreparedCommittedSurfaceFrameHeld,
  publishedCommittedSurfaceFrame,
}: {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly onBlockedSurfacePublication:
    | ((publication: GpuFlowBlockedCommittedSurfacePublication) => void)
    | undefined;
  readonly onCommittedSurfaceFramePublishable:
    | ((frame: GpuFlowCommittedSurfaceFrame) => void)
    | undefined;
  readonly onPreparedCommittedSurfaceFrameHeld:
    | ((
        frame: GpuFlowCommittedSurfaceFrame,
        options?:
          | {
              readonly preservePreparationSnapshot?: boolean | undefined;
            }
          | undefined,
      ) => void)
    | undefined;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowCommittedSurfacePublicationCandidateAction {
  switch (candidate.kind) {
    case "blocked":
      handleGpuFlowBlockedCommittedSurfacePublicationCandidate({
        candidate,
        onBlockedSurfacePublication,
      });
      return { kind: "return", visibleProjectionState: null };
    case "held-previous":
      handleGpuFlowHeldPreviousCommittedSurfacePublicationCandidate({
        onPreparedCommittedSurfaceFrameHeld,
        publishedCommittedSurfaceFrame,
      });
      return {
        kind: "return",
        visibleProjectionState: candidate.visibleProjectionState,
      };
    case "publish":
      handleGpuFlowPublishCommittedSurfacePublicationCandidate({
        onCommittedSurfaceFramePublishable,
        publishedCommittedSurfaceFrame,
      });
      return { kind: "continue" };
  }
}

function handleGpuFlowBlockedCommittedSurfacePublicationCandidate({
  candidate,
  onBlockedSurfacePublication,
}: {
  readonly candidate: Extract<
    GpuFlowCommittedSurfacePublicationCandidate,
    { readonly kind: "blocked" }
  >;
  readonly onBlockedSurfacePublication:
    | ((publication: GpuFlowBlockedCommittedSurfacePublication) => void)
    | undefined;
}): void {
  onBlockedSurfacePublication?.(candidate);
}

function handleGpuFlowHeldPreviousCommittedSurfacePublicationCandidate({
  onPreparedCommittedSurfaceFrameHeld,
  publishedCommittedSurfaceFrame,
}: {
  readonly onPreparedCommittedSurfaceFrameHeld:
    | ((
        frame: GpuFlowCommittedSurfaceFrame,
        options?:
          | {
              readonly preservePreparationSnapshot?: boolean | undefined;
            }
          | undefined,
      ) => void)
    | undefined;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): void {
  if (publishedCommittedSurfaceFrame) {
    onPreparedCommittedSurfaceFrameHeld?.(publishedCommittedSurfaceFrame, {
      preservePreparationSnapshot: true,
    });
  }
}

function handleGpuFlowPublishCommittedSurfacePublicationCandidate({
  onCommittedSurfaceFramePublishable,
  publishedCommittedSurfaceFrame,
}: {
  readonly onCommittedSurfaceFramePublishable:
    | ((frame: GpuFlowCommittedSurfaceFrame) => void)
    | undefined;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): void {
  if (publishedCommittedSurfaceFrame) {
    onCommittedSurfaceFramePublishable?.(publishedCommittedSurfaceFrame);
  }
}
