import type { ChatMessage, TranscriptBlock } from "@generated/backend";

import {
  deriveTranscriptActivityGroups,
  type TranscriptActivityGroup,
} from "./chat-transcript-blocks";

// The transcript renders a flat list of virtual rows over react-virtuoso. The
// backend owns run chronology as ordered transcript blocks; this module turns
// that ordered block list into the renderer's row model without inspecting raw
// run items. Adjacent activity_item blocks collapse under one slim derived group
// header by default. Member rows are emitted only when the user expands that
// group or when focus/search targets a hidden member.
//
// Three message sources are not transcript blocks and are merged in here:
// standalone messages that do not belong to a run (command results, system
// notices) sort by their conversation message ordinal among the runs, pending
// steering messages wait behind provider-owned run chronology until Codex commits
// them, and queued messages wait at the tail. Messages never drive block content;
// they only contribute these non-block rows and the conversation ordinal used to
// place standalone rows.

export type TranscriptRenderRow =
  | {
      kind: "block";
      key: string;
      index: number;
      block: TranscriptBlock;
      showTimestamp: boolean;
    }
  | {
      kind: "activity-group";
      key: string;
      index: number;
      expanded: boolean;
      group: TranscriptActivityGroup;
      members: TranscriptBlock[];
    }
  | {
      kind: "activity-item";
      key: string;
      index: number;
      block: TranscriptBlock;
      group: TranscriptActivityGroup;
    }
  | {
      kind: "message";
      key: string;
      index: number;
      message: ChatMessage;
      showTimestamp: boolean;
    }
  | {
      kind: "queued";
      key: string;
      index: number;
      message: ChatMessage;
    };

type TranscriptRenderEntry =
  | Omit<Extract<TranscriptRenderRow, { kind: "block" }>, "index">
  | Omit<Extract<TranscriptRenderRow, { kind: "activity-group" }>, "index">
  | Omit<Extract<TranscriptRenderRow, { kind: "activity-item" }>, "index">
  | Omit<Extract<TranscriptRenderRow, { kind: "message" }>, "index">
  | Omit<Extract<TranscriptRenderRow, { kind: "queued" }>, "index">;

export interface TranscriptRenderSource {
  blocks: TranscriptBlock[];
  expandedActivityGroupIds?: ReadonlySet<string>;
  forceExpandedActivityBlockIds?: ReadonlySet<string>;
  forceExpandedActivitySourceRunItemIds?: ReadonlySet<string>;
  messages: ChatMessage[];
  queuedMessages: ChatMessage[];
}

type OrderedTranscriptItem =
  | { type: "block"; block: TranscriptBlock }
  | { type: "message"; message: ChatMessage };

export function transcriptRenderRows(source: TranscriptRenderSource): TranscriptRenderRow[] {
  const ordered = mergeTranscriptItems(source.blocks, source.messages);
  const orderedBlocks = ordered.flatMap((item) => (item.type === "block" ? [item.block] : []));
  const context: RenderEntryContext = {
    groups: indexActivityGroups(deriveTranscriptActivityGroups(orderedBlocks)),
    blockById: new Map(orderedBlocks.map((block) => [block.id, block])),
    expandedActivityGroupIds: source.expandedActivityGroupIds ?? emptySet,
    forceExpandedActivityBlockIds: source.forceExpandedActivityBlockIds ?? emptySet,
    forceExpandedActivitySourceRunItemIds: source.forceExpandedActivitySourceRunItemIds ?? emptySet,
    timestampIds: timestampRowIds(ordered),
  };
  const entries: TranscriptRenderEntry[] = [];
  for (const item of ordered) {
    appendOrderedItemEntries(entries, item, context);
  }
  for (const message of pendingSteeringMessages(source.messages)) {
    entries.push({
      kind: "message",
      key: `message:${message.id}`,
      message,
      showTimestamp: true,
    });
  }
  for (const message of source.queuedMessages) {
    if (message.delivery !== "goal") {
      entries.push({ kind: "queued", key: `queued:${message.id}`, message });
    }
  }
  return entries.map((entry, index) => ({ ...entry, index }) as TranscriptRenderRow);
}

interface ActivityGroupIndex {
  byFirstMemberId: Map<string, TranscriptActivityGroup>;
  byMemberId: Map<string, TranscriptActivityGroup>;
}

interface RenderEntryContext {
  groups: ActivityGroupIndex;
  blockById: Map<string, TranscriptBlock>;
  expandedActivityGroupIds: ReadonlySet<string>;
  forceExpandedActivityBlockIds: ReadonlySet<string>;
  forceExpandedActivitySourceRunItemIds: ReadonlySet<string>;
  timestampIds: Set<string>;
}

const emptySet: ReadonlySet<string> = new Set();

function indexActivityGroups(groups: TranscriptActivityGroup[]): ActivityGroupIndex {
  const byFirstMemberId = new Map<string, TranscriptActivityGroup>();
  const byMemberId = new Map<string, TranscriptActivityGroup>();
  for (const group of groups) {
    const first = group.memberBlockIds[0];
    if (first !== undefined) {
      byFirstMemberId.set(first, group);
    }
    for (const memberId of group.memberBlockIds) {
      byMemberId.set(memberId, group);
    }
  }
  return { byFirstMemberId, byMemberId };
}

function appendOrderedItemEntries(
  entries: TranscriptRenderEntry[],
  item: OrderedTranscriptItem,
  context: RenderEntryContext,
) {
  if (item.type === "message") {
    entries.push({
      kind: "message",
      key: `message:${item.message.id}`,
      message: item.message,
      showTimestamp: context.timestampIds.has(item.message.id),
    });
    return;
  }
  const block = item.block;
  if (block.kind !== "activity_item" || !block.activity) {
    entries.push({
      kind: "block",
      key: `block:${block.id}`,
      block,
      showTimestamp: context.timestampIds.has(block.id),
    });
    return;
  }
  const group = context.groups.byMemberId.get(block.id);
  if (!group) {
    return;
  }
  const members = resolveGroupMembers(group, context.blockById);
  const expanded = activityGroupExpanded(group, members, context);
  // The slim group header is the only default visible row for an activity sequence.
  // Later adjacent activity rows mutate the header count/status/preview while the
  // collapsed virtual row list stays stable.
  if (context.groups.byFirstMemberId.get(block.id) === group) {
    entries.push({
      kind: "activity-group",
      key: `activity-group:${group.id}`,
      expanded,
      group,
      members,
    });
  }
  if (expanded) {
    entries.push({ kind: "activity-item", key: `block:${block.id}`, block, group });
  }
}

function activityGroupExpanded(
  group: TranscriptActivityGroup,
  members: TranscriptBlock[],
  context: RenderEntryContext,
) {
  if (context.expandedActivityGroupIds.has(group.id)) {
    return true;
  }
  return members.some((member) => {
    if (context.forceExpandedActivityBlockIds.has(member.id)) {
      return true;
    }
    const sourceRunItemId = member.activity?.sourceRunItemId;
    return (
      sourceRunItemId !== undefined &&
      sourceRunItemId !== "" &&
      context.forceExpandedActivitySourceRunItemIds.has(sourceRunItemId)
    );
  });
}

// mergeTranscriptItems interleaves run blocks with standalone (run-less) messages
// by conversation order. Run blocks already arrive in conversation order from the
// backend stream; each run is anchored at its trigger user_message block's
// conversation ordinal (carried on the block projection, so it does not depend on
// the latest message window after older-block pagination), and a standalone
// message is emitted just before the first run whose anchor ordinal exceeds it.
// Goal-delivery blocks/messages are internal triggers and never render.
function mergeTranscriptItems(
  blocks: TranscriptBlock[],
  messages: ChatMessage[],
): OrderedTranscriptItem[] {
  const anchors = runAnchorOrdinals(blocks);
  const { runOrder, blocksByRun } = groupVisibleBlocksByRun(blocks);
  const standalone = messages
    .filter(isStandaloneTranscriptMessage)
    .toSorted((left, right) => left.ordinal - right.ordinal);
  const ordered: OrderedTranscriptItem[] = [];
  let standaloneIndex = 0;
  for (const runId of runOrder) {
    const anchor = anchors.get(runId) ?? Number.MAX_SAFE_INTEGER;
    standaloneIndex = pushStandaloneBefore(ordered, standalone, standaloneIndex, anchor);
    for (const block of blocksByRun.get(runId) ?? []) {
      ordered.push({ type: "block", block });
    }
  }
  pushStandaloneBefore(ordered, standalone, standaloneIndex, Number.MAX_SAFE_INTEGER);
  return ordered;
}

function groupVisibleBlocksByRun(blocks: TranscriptBlock[]) {
  const runOrder: string[] = [];
  const blocksByRun = new Map<string, TranscriptBlock[]>();
  for (const block of blocks) {
    if (!isVisibleTranscriptBlock(block)) {
      continue;
    }
    let group = blocksByRun.get(block.runId);
    if (!group) {
      group = [];
      blocksByRun.set(block.runId, group);
      runOrder.push(block.runId);
    }
    group.push(block);
  }
  return { runOrder, blocksByRun };
}

function pushStandaloneBefore(
  ordered: OrderedTranscriptItem[],
  standalone: ChatMessage[],
  index: number,
  anchor: number,
) {
  let next = index;
  while (next < standalone.length && standalone[next]!.ordinal < anchor) {
    ordered.push({ type: "message", message: standalone[next]! });
    next += 1;
  }
  return next;
}

// Every block of a run carries the same runAnchorOrdinal (the trigger message's
// conversation ordinal), so the anchor is read from any block. This keeps the run
// anchored correctly even when a page starts mid-run without the trigger
// user_message block.
function runAnchorOrdinals(blocks: TranscriptBlock[]) {
  const anchors = new Map<string, number>();
  for (const block of blocks) {
    if (block.runAnchorOrdinal <= 0) {
      continue;
    }
    const current = anchors.get(block.runId);
    if (current === undefined || block.runAnchorOrdinal < current) {
      anchors.set(block.runId, block.runAnchorOrdinal);
    }
  }
  return anchors;
}

function resolveGroupMembers(
  group: TranscriptActivityGroup,
  blockById: Map<string, TranscriptBlock>,
): TranscriptBlock[] {
  const members: TranscriptBlock[] = [];
  for (const memberId of group.memberBlockIds) {
    const block = blockById.get(memberId);
    if (block) {
      members.push(block);
    }
  }
  return members;
}

// timestampRowIds marks the last message-bearing row of each contiguous
// user/assistant run so a timestamp prints once per visual cluster, mirroring the
// per-turn timestamp grouping the message transcript used before blocks.
function timestampRowIds(ordered: OrderedTranscriptItem[]): Set<string> {
  const rows = ordered
    .map(timestampRow)
    .filter((row): row is { id: string; side: string } => row !== null);
  const ids = new Set<string>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const next = rows[index + 1] ?? null;
    if (!next || row.side !== next.side) {
      ids.add(row.id);
    }
  }
  return ids;
}

function timestampRow(item: OrderedTranscriptItem) {
  if (item.type === "message") {
    return { id: item.message.id, side: item.message.role === "user" ? "user" : "ai" };
  }
  const block = item.block;
  if (block.kind === "user_message") {
    return { id: block.id, side: block.userMessage?.role === "user" ? "user" : "ai" };
  }
  if (block.kind === "assistant_text") {
    return { id: block.id, side: "ai" };
  }
  return null;
}

// Goal-delivery user messages are internal goal triggers, not user-visible turns; the transcript
// hides them just as the message timeline did, so a goal-driven run shows only its assistant output.
function isVisibleTranscriptBlock(block: TranscriptBlock) {
  return !(block.kind === "user_message" && block.userMessage?.delivery === "goal");
}

function isStandaloneTranscriptMessage(message: ChatMessage) {
  return message.runId === "" && message.delivery !== "goal";
}

function pendingSteeringMessages(messages: ChatMessage[]) {
  return messages
    .filter(
      (message) =>
        message.runId !== "" && message.delivery === "steering" && message.status === "pending",
    )
    .toSorted((left, right) => left.ordinal - right.ordinal);
}
