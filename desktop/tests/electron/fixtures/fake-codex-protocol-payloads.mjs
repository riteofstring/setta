export function hookPayload(threadId, turnId, status) {
  const completed = status === "completed";
  return {
    run: {
      completedAt: completed ? 2 : null,
      command: "printf hook",
      displayOrder: 1,
      durationMs: completed ? 12 : null,
      entries: completed ? [{ kind: "stdout", text: "ok" }] : [],
      eventName: "pre-command",
      executionMode: "sync",
      handlerType: "command",
      id: "hook_fake",
      scope: "turn",
      source: "project",
      sourcePath: "/tmp/workspace/.codex/hooks.json",
      startedAt: 1,
      status,
      statusMessage: status,
    },
    threadId,
    turnId,
  };
}

export function autoApprovalReviewPayload(threadId, turnId, status) {
  const completed = status === "approved";
  const payload = {
    action: { command: "pwd", cwd: "/tmp/workspace", source: "agent", type: "command" },
    decisionSource: "agent",
    review: { status },
    reviewId: "review_fake",
    startedAtMs: 1,
    targetItemId: "command_item_fake",
    threadId,
    turnId,
  };
  if (completed) {
    payload.completedAtMs = 2;
  }
  return payload;
}

export function contextCompactionPayload(threadId, turnId, itemId, timing) {
  return {
    ...timing,
    item: { id: itemId, type: "contextCompaction" },
    threadId,
    turnId,
  };
}

export function emitRealtimeNotifications(notify, threadId) {
  notify("thread/realtime/started", { realtimeSessionId: "realtime_fake", threadId, version: 1 });
  notify("thread/realtime/itemAdded", { item: { id: "item_fake" }, threadId });
  notify("thread/realtime/transcript/delta", { delta: "hi", role: "user", threadId });
  notify("thread/realtime/transcript/done", { role: "user", text: "hi", threadId });
  notify("thread/realtime/outputAudio/delta", { audio: { data: "AAAA" }, threadId });
  notify("thread/realtime/sdp", { sdp: "v=0", threadId });
  notify("thread/realtime/error", { message: "disabled", threadId });
  notify("thread/realtime/closed", { reason: null, threadId });
}
