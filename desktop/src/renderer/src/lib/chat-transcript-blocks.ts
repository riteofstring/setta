import type { RunItemStatus, RunItemType, TranscriptBlock } from "@generated/backend";

// Chronological transcript ordering and derived grouping.
//
// Chronology is owned by the backend: every visible run block receives a
// run-local ordinal when created and never moves once a later block exists
// beneath it. The renderer reproduces the backend's conversation order without
// inspecting raw run items, provider item IDs, provider text, or keyword
// heuristics: runs are ordered by the order they first appear in the
// backend-ordered stream, and blocks within a run by their run-local ordinal.

// orderTranscriptBlocks returns the blocks in stable conversation order.
//
// A run's blocks are contiguous in the backend stream, so the order a run first
// appears in the input is its conversation-anchored position. Backend pages
// arrive already in this order, loadOlder prepends strictly older runs, and
// streamed created blocks only ever extend the latest run, so first-appearance
// order matches the backend's (run anchor ordinal, run-local ordinal) key
// without the renderer re-deriving anchors from messages. Within a run, the
// run-local ordinal is authoritative; ties (only possible across distinct runs
// that share an appearance index, which cannot happen) fall back to block ID.
export function orderTranscriptBlocks(blocks: TranscriptBlock[]): TranscriptBlock[] {
  const runOrder = new Map<string, number>();
  for (const block of blocks) {
    if (!runOrder.has(block.runId)) {
      runOrder.set(block.runId, runOrder.size);
    }
  }
  return blocks.toSorted((left, right) => {
    const runDelta = (runOrder.get(left.runId) ?? 0) - (runOrder.get(right.runId) ?? 0);
    if (runDelta !== 0) {
      return runDelta;
    }
    if (left.ordinal !== right.ordinal) {
      return left.ordinal - right.ordinal;
    }
    return left.id.localeCompare(right.id);
  });
}

// A derived, render-only grouping of adjacent activity_item blocks. The group is
// not a persisted backend block: the renderer reserves a slim label/control slot
// above the first activity row of every adjacent activity sequence (including a
// single row) so later rows mutate the slot in place instead of inserting a new
// label above already-visible rows.
type TranscriptActivityCategory = "commands" | "tools" | "actions";

export interface TranscriptActivityGroup {
  // Stable group ID derived from the first member block ID, so the slot keeps a
  // stable identity as later adjacent rows extend the group.
  id: string;
  category: TranscriptActivityCategory;
  count: number;
  memberBlockIds: string[];
  status: RunItemStatus;
}

// deriveTranscriptActivityGroups collapses each maximal run of adjacent
// activity_item blocks in the already-ordered block list into one group
// descriptor. Any non-activity block (assistant text, reasoning, user message,
// run status) ends the current run of activity rows. Only typed transcript block
// fields are inspected.
export function deriveTranscriptActivityGroups(
  blocks: TranscriptBlock[],
): TranscriptActivityGroup[] {
  const groups: TranscriptActivityGroup[] = [];
  let current: TranscriptBlock[] = [];
  const flush = () => {
    if (current.length > 0) {
      groups.push(activityGroupFromMembers(current));
      current = [];
    }
  };
  for (const block of blocks) {
    if (block.kind === "activity_item" && block.activity) {
      current.push(block);
      continue;
    }
    flush();
  }
  flush();
  return groups;
}

function activityGroupFromMembers(members: TranscriptBlock[]): TranscriptActivityGroup {
  const first = members[0];
  if (!first) {
    throw new Error("transcript activity group requires at least one member block");
  }
  return {
    id: `activity_group_${first.id}`,
    category: aggregateActivityCategory(members),
    count: members.length,
    memberBlockIds: members.map((block) => block.id),
    status: aggregateActivityStatus(members),
  };
}

// The group's primary type is the shared category of its members, or the generic
// "actions" when members span more than one category.
function aggregateActivityCategory(members: TranscriptBlock[]): TranscriptActivityCategory {
  let category: TranscriptActivityCategory | null = null;
  for (const block of members) {
    const memberCategory = activityCategory(block.activity?.type);
    if (category === null) {
      category = memberCategory;
      continue;
    }
    if (category !== memberCategory) {
      return "actions";
    }
  }
  return category ?? "actions";
}

function activityCategory(type: RunItemType | undefined): TranscriptActivityCategory {
  switch (type) {
    case "command_execution":
    case "terminal_interaction":
      return "commands";
    case "mcp_tool_call":
    case "dynamic_tool_call":
    case "collab_agent_tool_call":
    case "web_search":
      return "tools";
    default:
      return "actions";
  }
}

// The group surfaces the most active member status: a live row keeps the group
// spinning; otherwise the worst terminal outcome wins so a failed row stays
// visible in the slim slot.
function aggregateActivityStatus(members: TranscriptBlock[]): RunItemStatus {
  const statuses = members.map((block) => block.activity?.status);
  if (statuses.some((status) => status === "running" || status === "pending")) {
    return "running";
  }
  if (statuses.some((status) => status === "failed")) {
    return "failed";
  }
  if (statuses.some((status) => status === "cancelled")) {
    return "cancelled";
  }
  return "completed";
}
