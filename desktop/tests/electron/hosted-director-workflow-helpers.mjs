import {
  conversationID,
  requiredString,
  waitForConversationSnapshot,
} from "./director-command-center-workflow-helpers.mjs";
import { waitForBackendState } from "./electron-workflow-harness.mjs";

const defaultWorkflowTimeoutMs = 60_000;

export function submitDirector(client, text, timeoutMs) {
  return client.evaluate(
    `window.setta.director.dispatch(${JSON.stringify({
      kind: "submit",
      submit: { modality: "text", text },
    })})`,
    timeoutMs,
  );
}

export function waitForDirectorSnapshot(client, ready, timeoutMs = defaultWorkflowTimeoutMs) {
  return waitForBackendState(
    () => client.evaluate("window.setta.director.readSnapshot()"),
    ready,
    timeoutMs,
  );
}

export async function createDeterministicHostedWorkstream(
  client,
  workspaceId,
  timeoutMs = defaultWorkflowTimeoutMs,
) {
  await submitDirector(client, "Director create workspace workstream.");
  const snapshot = await waitForDirectorSnapshot(
    client,
    (candidate) =>
      candidate.selectedWorkstreamId !== null &&
      candidate.workstreams.some((entry) => {
        const workstream = entry.workstream;
        return (
          workstream.id === candidate.selectedWorkstreamId &&
          workstream.resourceScope.kind === "folder" &&
          workstream.resourceScope.folder?.workspaceId === workspaceId &&
          workstream.status === "idle"
        );
      }),
    timeoutMs,
  );
  const workstreamId = requiredString(snapshot.selectedWorkstreamId, "hosted Director workstream");
  return {
    conversationId: conversationID(workstreamId),
    workstreamId,
  };
}

export async function exerciseDeterministicHostedDirector({
  backend,
  client,
  conversationId,
  workspaceId,
  workstreamId,
  timeoutMs = defaultWorkflowTimeoutMs,
}) {
  await submitDirector(client, "Director send hold.");
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) => snapshot.turns.turns.at(-1)?.status === "running",
    timeoutMs,
  );
  await submitDirector(client, "Director queue next.");
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) => snapshot.queue.length === 1,
    timeoutMs,
  );
  await submitDirector(client, "Director steer now.");
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) =>
      snapshot.queue.length === 0 &&
      snapshot.turns.turns.length >= 2 &&
      snapshot.turns.turns.slice(-2).every((turn) => turn.status === "completed"),
    timeoutMs,
  );

  await submitDirector(client, "Director request command approval.");
  const approvalSnapshot = await waitForDirectorSnapshot(
    client,
    (snapshot) =>
      snapshot.unresolvedApprovals.length === 1 &&
      snapshot.unresolvedApprovals[0]?.workstreamId === workstreamId &&
      snapshot.unresolvedApprovals[0]?.secret === false,
    timeoutMs,
  );
  const approvalId = requiredString(
    approvalSnapshot.unresolvedApprovals[0]?.id,
    "hosted Director approval",
  );
  await submitDirector(client, "Director deny command approval.");
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) =>
      snapshot.trajectory.events.some(
        (event) =>
          event.kind === "approval_resolved" &&
          event.approvalResolved?.resolution.approvalId === approvalId &&
          event.approvalResolved?.resolution.decision === "denied",
      ) && snapshot.turns.turns.at(-1)?.status === "completed",
    timeoutMs,
  );

  await submitDirector(client, "Director send cancel hold.");
  const runningBeforeCancel = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) => snapshot.turns.turns.at(-1)?.status === "running",
    timeoutMs,
  );
  const cancelledRunId = requiredString(
    runningBeforeCancel.turns.turns.at(-1)?.id,
    "hosted Director cancellable run",
  );
  await submitDirector(client, "Director cancel.");
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) =>
      snapshot.turns.turns.some(
        (turn) => turn.id === cancelledRunId && turn.status === "cancelled",
      ),
    timeoutMs,
  );

  await submitDirector(client, "Director fail.");
  const failed = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) => snapshot.turns.turns.at(-1)?.status === "failed",
    timeoutMs,
  );
  const failedRunId = requiredString(failed.turns.turns.at(-1)?.id, "hosted Director failed run");
  await submitDirector(client, "Director recover.");
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) =>
      snapshot.turns.turns.filter((turn) => turn.authoredInput.text === "director fail").length ===
        2 &&
      snapshot.turns.turns.at(-1)?.id !== failedRunId &&
      snapshot.turns.turns.at(-1)?.status === "completed",
    timeoutMs,
  );

  await submitDirector(client, "Director artifact.");
  const terminal = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) =>
      snapshot.queue.length === 0 &&
      snapshot.turns.turns.at(-1)?.status === "completed" &&
      snapshot.artifacts.artifacts.length === 1,
    timeoutMs,
  );
  await waitForDirectorSnapshot(
    client,
    (snapshot) =>
      snapshot.unresolvedApprovals.length === 0 &&
      snapshot.workstreams.some(
        (entry) =>
          entry.workstream.id === workstreamId &&
          entry.workstream.activeRunId === null &&
          entry.workstream.queuedRunCount === 0,
      ) &&
      snapshot.artifacts.some((artifact) => artifact.conversationId === conversationId),
    timeoutMs,
  );
  return terminal;
}

export function waitForRestoredHostedDirector({
  backend,
  client,
  conversationId,
  workspaceId,
  workstreamId,
  timeoutMs = defaultWorkflowTimeoutMs,
}) {
  return Promise.all([
    waitForConversationSnapshot(
      backend,
      workspaceId,
      conversationId,
      (snapshot) =>
        snapshot.queue.length === 0 &&
        snapshot.turns.turns.at(-1)?.status === "completed" &&
        snapshot.artifacts.artifacts.length === 1,
      timeoutMs,
    ),
    waitForDirectorSnapshot(
      client,
      (snapshot) =>
        snapshot.workstreams.some(
          (entry) => entry.workstream.id === workstreamId && entry.workstream.activeRunId === null,
        ) && snapshot.artifacts.some((artifact) => artifact.conversationId === conversationId),
      timeoutMs,
    ),
  ]);
}
