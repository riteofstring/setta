import {
  assertCancelledMasterInputState,
  assertMasterProviderTurnInterrupted,
  exerciseMasterCancellation,
} from "./topic-conversation-master-overlay-assertions.mjs";
import { assertRecordedMasterRouteCancellation } from "./topic-conversation-routing-observability.mjs";

export async function exerciseVerifiedMasterCancellation({
  artifactDirectory,
  backend,
  client,
  providerStatePath,
  text,
  timeoutMs,
  workspaceId,
}) {
  const result = await exerciseMasterCancellation({
    artifactDirectory,
    backend,
    client,
    providerStatePath,
    text,
    timeoutMs,
    workspaceId,
  });
  await assertMasterProviderTurnInterrupted(
    providerStatePath,
    result.activeProviderTurnId,
    timeoutMs,
  );
  await assertRecordedMasterRouteCancellation({
    artifactDirectory,
    inputIdentity: result.recorded.accepted.input,
    inputText: text,
    state: result.cancelled,
    timeoutMs,
  });
  return result;
}

export async function assertPersistedMasterCancellation(backend, cancellation) {
  const inputId = cancellation.recorded.accepted.input.id;
  const restored = await backend.post("/master/inputs/state/read", { inputId });
  assertCancelledMasterInputState(restored, inputId);
}
