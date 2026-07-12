import {
  assertCancelledMasterInputState,
  assertMasterProviderTurnInterrupted,
  exerciseMasterCancellation,
} from "./topic-conversation-master-overlay-assertions.mjs";

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
  return result;
}

export async function assertPersistedMasterCancellation(backend, cancellation) {
  const inputId = cancellation.recorded.accepted.input.id;
  const restored = await backend.post("/master/inputs/state/read", { inputId });
  assertCancelledMasterInputState(restored, inputId);
}
