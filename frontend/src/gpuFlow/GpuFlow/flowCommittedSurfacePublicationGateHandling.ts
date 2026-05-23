import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  applyGpuFlowProjectionDebugAttributes,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { resolveGpuFlowCommittedSurfacePublicationGate } from "./flowCommittedSurfacePublication";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowCommitPublicationToken,
  GpuFlowHoldPreviousToken,
} from "./visibleFramePublicationTokens";

type GpuFlowCommittedSurfacePublicationGate = ReturnType<
  typeof resolveGpuFlowCommittedSurfacePublicationGate
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
  onPreparedCommittedSurfaceFrameBlocked,
  onPreparedCommittedSurfaceFrameHeld,
  publishedCommittedSurfaceFrame,
}: {
  readonly gate: GpuFlowCommittedSurfacePublicationGate;
  readonly onBlockedSurfacePublication:
    | ((token: GpuFlowBlockedPublicationToken) => void)
    | undefined;
  readonly onCommittedSurfaceFramePublishable:
    | ((
        token: GpuFlowCommitPublicationToken,
        frame: GpuFlowCommittedSurfaceFrame,
      ) => void)
    | undefined;
  readonly onPreparedCommittedSurfaceFrameBlocked:
    | ((
        token: GpuFlowBlockedPublicationToken,
        frame: GpuFlowCommittedSurfaceFrame,
        options?:
          | {
              readonly preservePreparationSnapshot?: boolean | undefined;
            }
          | undefined,
      ) => void)
    | undefined;
  readonly onPreparedCommittedSurfaceFrameHeld:
    | ((
        token: GpuFlowHoldPreviousToken,
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
        onPreparedCommittedSurfaceFrameBlocked,
        publishedCommittedSurfaceFrame,
      });
      return { kind: "return", visibleProjectionState: null };
    case "held-previous":
      handleGpuFlowHeldPreviousCommittedSurfacePublicationGate({
        gate,
        onPreparedCommittedSurfaceFrameHeld,
        publishedCommittedSurfaceFrame,
      });
      return {
        kind: "return",
        visibleProjectionState: gate.visibleProjectionState,
      };
    case "publish":
      handleGpuFlowPublishCommittedSurfacePublicationGate({
        gate,
        onCommittedSurfaceFramePublishable,
        publishedCommittedSurfaceFrame,
      });
      return { kind: "continue" };
  }
}

function handleGpuFlowBlockedCommittedSurfacePublicationGate({
  gate,
  onBlockedSurfacePublication,
  onPreparedCommittedSurfaceFrameBlocked,
  publishedCommittedSurfaceFrame,
}: {
  readonly gate: Extract<
    GpuFlowCommittedSurfacePublicationGate,
    { readonly kind: "blocked" }
  >;
  readonly onBlockedSurfacePublication:
    | ((token: GpuFlowBlockedPublicationToken) => void)
    | undefined;
  readonly onPreparedCommittedSurfaceFrameBlocked:
    | ((
        token: GpuFlowBlockedPublicationToken,
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
    onPreparedCommittedSurfaceFrameBlocked?.(
      gate.token,
      publishedCommittedSurfaceFrame,
      {
        preservePreparationSnapshot:
          shouldPreservePreparedCommittedSurfaceFrameForBrowserVisualRepair(
            gate.token,
          ),
      },
    );
  }
  onBlockedSurfacePublication?.(gate.token);
}

function handleGpuFlowHeldPreviousCommittedSurfacePublicationGate({
  gate,
  onPreparedCommittedSurfaceFrameHeld,
  publishedCommittedSurfaceFrame,
}: {
  readonly gate: Extract<
    GpuFlowCommittedSurfacePublicationGate,
    { readonly kind: "held-previous" }
  >;
  readonly onPreparedCommittedSurfaceFrameHeld:
    | ((
        token: GpuFlowHoldPreviousToken,
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
    onPreparedCommittedSurfaceFrameHeld?.(
      gate.token,
      publishedCommittedSurfaceFrame,
      {
        preservePreparationSnapshot: true,
      },
    );
  }
}

function handleGpuFlowPublishCommittedSurfacePublicationGate({
  gate,
  onCommittedSurfaceFramePublishable,
  publishedCommittedSurfaceFrame,
}: {
  readonly gate: Extract<
    GpuFlowCommittedSurfacePublicationGate,
    { readonly kind: "publish" }
  >;
  readonly onCommittedSurfaceFramePublishable:
    | ((
        token: GpuFlowCommitPublicationToken,
        frame: GpuFlowCommittedSurfaceFrame,
      ) => void)
    | undefined;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): void {
  if (publishedCommittedSurfaceFrame && gate.token) {
    onCommittedSurfaceFramePublishable?.(
      gate.token,
      publishedCommittedSurfaceFrame,
    );
  }
}

export function publishGpuFlowProjectionDebugAttributesForCommittedFrame({
  runtimeCanvas,
  token,
  visibleProjectionState,
}: {
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly token: GpuFlowCommitPublicationToken | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): void {
  if (visibleProjectionState.transaction.kind === "held-previous") {
    return;
  }
  if (!token) {
    throw new Error(
      "GPU Flow committed frame debug publication requires the commit token that published the visible frame.",
    );
  }
  applyGpuFlowProjectionDebugAttributes({
    canvas: runtimeCanvas,
    debugState: visibleProjectionState.debugState,
    token,
  });
}

function shouldPreservePreparedCommittedSurfaceFrameForBrowserVisualRepair(
  token: GpuFlowBlockedPublicationToken,
): boolean {
  return token.blockedReasons.some(
    (reason) =>
      reason.family === "dom-control" ||
      reason.family === "dom-island" ||
      reason.reason === "snapshot-pending" ||
      reason.reason === "live-dom-budget" ||
      reason.reason === "visible-dom-control-not-projected",
  );
}
