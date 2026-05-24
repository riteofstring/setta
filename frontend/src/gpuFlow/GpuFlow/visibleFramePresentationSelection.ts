import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowVisibleFramePresentationFrameContext } from "./visibleFrameCoordinator";

export type GpuFlowBlockedSurfaceVisibleProjectionPresentation = {
  readonly blockedErrorMessage: string | null;
  readonly frame: GpuFlowPreparedContentFrame | null;
};

type GpuFlowSelectedSurfaceVisibleProjectionContent = {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
};

export function getGpuFlowBrowserVisualPreparationResourceKeys(
  presentationFrameContext: GpuFlowVisibleFramePresentationFrameContext,
): readonly string[] {
  return presentationFrameContext.budgetDecision.preparationBudget
    .selectedResourceDebtIds;
}

export function isGpuFlowBrowserVisualRepairSelected(
  presentationFrameContext: GpuFlowVisibleFramePresentationFrameContext,
): boolean {
  return (
    presentationFrameContext.budgetDecision.browserVisualRepair?.eligible ===
    true
  );
}

export function hasGpuFlowActiveEditorActivationPendingPresentationFrame({
  blockedPreparedContentFrame,
  heldPreparedContentFrame,
  preparedContentFrame,
  presentationFrameContext,
  selectedVisibleProjectionState,
}: {
  readonly blockedPreparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly heldPreparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly presentationFrameContext: GpuFlowVisibleFramePresentationFrameContext;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): boolean {
  if (presentationFrameContext.activeEditorPins.length > 0) {
    return true;
  }
  return hasGpuFlowActiveEditorActivationPendingFrame([
    blockedPreparedContentFrame,
    preparedContentFrame,
    heldPreparedContentFrame,
    selectedVisibleProjectionState?.preparedContentFrame ?? null,
  ]);
}

export function selectGpuFlowVisibleProjectionStateForReport({
  heldPreviousVisibleProjectionState,
  selectedVisibleProjectionState,
}: {
  readonly heldPreviousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleProjectionState | null {
  return selectedVisibleProjectionState ?? heldPreviousVisibleProjectionState;
}

export function throwGpuFlowBlockedVisibleFramePresentationError(
  blockedVisibleFramePresentation: GpuFlowBlockedSurfaceVisibleProjectionPresentation | null,
): void {
  const blockedErrorMessage =
    blockedVisibleFramePresentation?.blockedErrorMessage ?? null;
  if (blockedErrorMessage !== null) {
    throw new Error(blockedErrorMessage);
  }
}

export function selectGpuFlowSurfaceVisibleProjectionContent({
  preparedContentFrame,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  selectedVisibleProjectionState,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowSelectedSurfaceVisibleProjectionContent {
  if (selectedVisibleProjectionState.transaction.kind !== "prepared-content") {
    return {
      preparedContentFrame: null,
      retainedDisplayFrame: null,
      retainedRuntimeFrame: null,
    };
  }
  if (!preparedContentFrame) {
    throw new Error(
      "GPU Flow content presentation requires the prepared content frame.",
    );
  }
  return {
    preparedContentFrame,
    retainedDisplayFrame,
    retainedRuntimeFrame,
  };
}

function hasGpuFlowActiveEditorActivationPendingFrame(
  frames: readonly (GpuFlowPreparedContentFrame | null)[],
): boolean {
  return frames.some((frame) =>
    frame?.actorGenerations.some((actor) =>
      Boolean(
        actor.active ||
          actor.browserVisual?.representationKind === "active-editor" ||
          actor.textCoverageProof?.pointerSemantics === "active-browser-editor",
      ),
    ),
  );
}
