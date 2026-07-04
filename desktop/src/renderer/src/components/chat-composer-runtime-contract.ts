import type { ActiveRunPresentation } from "../lib/chat-run-liveness";
import type { ComposerActions } from "./chat-composer-contract";

export async function missingComposerStopAction() {
  throw new Error("Composer action stopActiveRun is required to stop an active run.");
}

export function validateComposerActionContract(
  actions: ComposerActions,
  runPresentation: ActiveRunPresentation,
) {
  if (runPresentation.canSteer && actions.steerMessage === undefined) {
    throw new Error("Composer action steerMessage is required by steerable run presentation.");
  }
  if (runPresentation.canStop && actions.stopActiveRun === undefined) {
    throw new Error("Composer action stopActiveRun is required by stoppable run presentation.");
  }
  if (runPresentation.canRetry && actions.retryActiveRunLiveness === undefined) {
    throw new Error(
      "Composer action retryActiveRunLiveness is required by retryable run presentation.",
    );
  }
}
