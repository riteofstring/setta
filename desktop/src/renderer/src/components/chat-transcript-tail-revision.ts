import type {
  ApprovalQuestion,
  ChatMessage,
  MessagePart,
  Run,
  RunItemOutput,
  StructuredInputRequest,
  TranscriptBlock,
} from "@generated/backend";

import type { RunItemOutputPageState } from "../stores/chat-store";
import type { TranscriptRenderRow } from "../lib/chat-transcript-render-rows";

const tailRevisionRowCount = 24;

export function transcriptTailRevision({
  activeRun,
  rows,
  runItemOutputIdsByRunItemId,
  runItemOutputPagesByRunItemId,
  runItemOutputsById,
}: {
  activeRun: Run | null;
  rows: TranscriptRenderRow[];
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputsById: Record<string, RunItemOutput>;
}) {
  const tailRows = rows.slice(-tailRevisionRowCount);
  return [
    `rows:${rows.length}:${rows.at(-1)?.key ?? ""}`,
    `active:${activeRunRevisionPart(activeRun)}`,
    `tail:${tailRows.map(transcriptRenderRowRevisionPart).join("|")}`,
    `outputs:${runItemOutputsRevisionPart(runItemOutputIdsByRunItemId, runItemOutputsById)}`,
    `outputPages:${runItemOutputPagesRevisionPart(runItemOutputPagesByRunItemId)}`,
  ].join("\n");
}

function activeRunRevisionPart(run: Run | null) {
  if (run === null) {
    return "none";
  }
  return [
    run.id,
    run.status,
    run.completedAt,
    run.error,
    approvalRevisionPart(run.pendingApproval),
  ].join(":");
}

function approvalRevisionPart(approval: Run["pendingApproval"]) {
  if (approval === null) {
    return "none";
  }
  return (
    JSON.stringify([
      approval.id,
      approval.runItemId,
      approval.providerItemId,
      approval.kind,
      approval.status,
      approval.title,
      approval.body,
      approval.command,
      approval.filePath,
      approval.permission,
      approval.question,
      approval.options,
      approval.questions.map(approvalQuestionRevisionPart),
      structuredInputRevisionPart(approval.structuredInput),
    ]) ?? ""
  );
}

function approvalQuestionRevisionPart(question: ApprovalQuestion) {
  return [
    question.id,
    question.header,
    question.question,
    question.options,
    question.isOther,
    question.isSecret,
  ];
}

function structuredInputRevisionPart(input: StructuredInputRequest | null) {
  if (input === null) {
    return null;
  }
  return [
    input.providerRequestId,
    input.threadId,
    input.turnId,
    input.serverName,
    input.mode,
    input.message,
    input.schema,
    input.url,
    input.elicitationId,
    input.meta,
  ];
}

function transcriptRenderRowRevisionPart(row: TranscriptRenderRow) {
  switch (row.kind) {
    case "activity-group":
      return [
        row.key,
        row.kind,
        row.expanded ? "expanded" : "collapsed",
        row.group.id,
        row.group.memberBlockIds.join(","),
        row.members.map(transcriptBlockRevisionPart).join(","),
      ].join(":");
    case "activity-item":
      return [row.key, row.kind, row.group.id, transcriptBlockRevisionPart(row.block)].join(":");
    case "block":
      return [
        row.key,
        row.kind,
        row.showTimestamp ? "timestamp" : "no-timestamp",
        transcriptBlockRevisionPart(row.block),
      ].join(":");
    case "message":
      return [
        row.key,
        row.kind,
        row.showTimestamp ? "timestamp" : "no-timestamp",
        chatMessageRevisionPart(row.message),
      ].join(":");
    case "queued":
      return [row.key, row.kind, chatMessageRevisionPart(row.message)].join(":");
  }
}

function transcriptBlockRevisionPart(block: TranscriptBlock) {
  return [
    block.id,
    block.kind,
    block.ordinal,
    block.status,
    block.updatedAt,
    assistantTextRevisionPart(block.assistantText),
    userMessageRevisionPart(block.userMessage),
    reasoningRevisionPart(block.reasoning),
    activityRevisionPart(block.activity),
    runStatusRevisionPart(block.runStatus),
    backgroundTerminalRevisionPart(block.backgroundTerminal),
  ].join(":");
}

function assistantTextRevisionPart(assistantText: TranscriptBlock["assistantText"]) {
  return assistantText?.text.length ?? 0;
}

function userMessageRevisionPart(userMessage: TranscriptBlock["userMessage"]) {
  return userMessage ? messagePartsRevisionPart(userMessage.parts) : "";
}

function reasoningRevisionPart(reasoning: TranscriptBlock["reasoning"]) {
  return [reasoning?.headline ?? "", reasoning?.summary.length ?? 0].join(":");
}

function activityRevisionPart(activity: TranscriptBlock["activity"]) {
  if (!activity) {
    return ":::no-output";
  }
  return [
    activity.sourceRunItemId,
    activity.status,
    activity.title,
    activity.hasOutput ? "output" : "no-output",
  ].join(":");
}

function runStatusRevisionPart(runStatus: TranscriptBlock["runStatus"]) {
  return [runStatus?.mode ?? "", runStatus?.label ?? "", runStatus?.error ?? ""].join(":");
}

function backgroundTerminalRevisionPart(backgroundTerminal: TranscriptBlock["backgroundTerminal"]) {
  return [backgroundTerminal?.processId ?? "", backgroundTerminal?.label ?? ""].join(":");
}

function chatMessageRevisionPart(message: ChatMessage) {
  return [
    message.id,
    message.role,
    message.delivery,
    message.ordinal,
    message.status,
    message.updatedAt,
    messagePartsRevisionPart(message.parts),
  ].join(":");
}

function messagePartsRevisionPart(parts: MessagePart[]) {
  return parts.map(messagePartRevisionPart).join(",");
}

function messagePartRevisionPart(part: MessagePart) {
  switch (part.type) {
    case "text":
      return textMessagePartRevisionPart(part);
    case "image":
      return imageMessagePartRevisionPart(part);
  }
  return `${part.id}:${part.type}`;
}

function textMessagePartRevisionPart(part: MessagePart) {
  return `${part.id}:text:${part.text?.text.length ?? 0}:${part.text?.format ?? ""}`;
}

function imageMessagePartRevisionPart(part: MessagePart) {
  return [
    part.id,
    "image",
    part.image?.attachmentId ?? "",
    part.image?.fileName ?? "",
    part.image?.variants.length ?? 0,
  ].join(":");
}

function runItemOutputsRevisionPart(
  runItemOutputIdsByRunItemId: Record<string, string[]>,
  runItemOutputsById: Record<string, RunItemOutput>,
) {
  return Object.entries(runItemOutputIdsByRunItemId)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([runItemId, outputIds]) => {
      const lastOutputID = outputIds.at(-1) ?? "";
      const lastOutput = runItemOutputsById[lastOutputID];
      return [
        runItemId,
        outputIds.length,
        lastOutput?.id ?? "",
        lastOutput?.ordinal ?? 0,
        lastOutput?.text.length ?? 0,
      ].join(":");
    })
    .join("|");
}

function runItemOutputPagesRevisionPart(
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>,
) {
  return Object.entries(runItemOutputPagesByRunItemId)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([runItemId, page]) =>
      [
        runItemId,
        page.loading ? "loading" : "idle",
        page.hasMore ? "more" : "done",
        page.error ?? "",
      ].join(":"),
    )
    .join("|");
}
