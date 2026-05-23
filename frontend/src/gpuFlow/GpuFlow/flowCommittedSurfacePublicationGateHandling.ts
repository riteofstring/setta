import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { resolveGpuFlowCommittedSurfacePublicationGate } from "./flowCommittedSurfacePublication";

type GpuFlowCommittedSurfacePublicationGate = ReturnType<
  typeof resolveGpuFlowCommittedSurfacePublicationGate
>;

export type GpuFlowBlockedCommittedSurfacePublication = Extract<
  GpuFlowCommittedSurfacePublicationGate,
  { readonly kind: "blocked" }
>;

type GpuFlowCommittedSurfacePublicationGateAction =
  | {
      readonly kind: "continue";
    }
  | {
      readonly kind: "return";
      readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
    };

export function handleGpuFlowCommittedSurfacePublicationGate({
  gate,
  onBlockedSurfacePublication,
  onCommittedSurfaceFramePublishable,
  onPreparedCommittedSurfaceFrameHeld,
  publishedCommittedSurfaceFrame,
}: {
  readonly gate: GpuFlowCommittedSurfacePublicationGate;
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
}): GpuFlowCommittedSurfacePublicationGateAction {
  switch (gate.kind) {
    case "blocked":
      handleGpuFlowBlockedCommittedSurfacePublicationGate({
        gate,
        onBlockedSurfacePublication,
      });
      return { kind: "return", visibleProjectionState: null };
    case "held-previous":
      handleGpuFlowHeldPreviousCommittedSurfacePublicationGate({
        onPreparedCommittedSurfaceFrameHeld,
        publishedCommittedSurfaceFrame,
      });
      return {
        kind: "return",
        visibleProjectionState: gate.visibleProjectionState,
      };
    case "publish":
      handleGpuFlowPublishCommittedSurfacePublicationGate({
        onCommittedSurfaceFramePublishable,
        publishedCommittedSurfaceFrame,
      });
      return { kind: "continue" };
  }
}

function handleGpuFlowBlockedCommittedSurfacePublicationGate({
  gate,
  onBlockedSurfacePublication,
}: {
  readonly gate: Extract<
    GpuFlowCommittedSurfacePublicationGate,
    { readonly kind: "blocked" }
  >;
  readonly onBlockedSurfacePublication:
    | ((publication: GpuFlowBlockedCommittedSurfacePublication) => void)
    | undefined;
}): void {
  onBlockedSurfacePublication?.(gate);
}

function handleGpuFlowHeldPreviousCommittedSurfacePublicationGate({
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

function handleGpuFlowPublishCommittedSurfacePublicationGate({
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
