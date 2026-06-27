import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Phase 5 of docs/plans/chronological_chat_transcript_plan.md. The provider emits assistant text
// interleaved with commands and reasoning, and the transcript now renders those typed blocks in
// provider chronology: assistant text splits around the commands, reasoning is its own block, and
// there is no outer Activity accordion. This summary mirrors the Go fixture
// scriptedChronologicalTranscriptTurn; the authoritative, full raw stream (output chunks,
// running/completed upserts, hidden reasoning) is frozen by the Go TestChronologicalFixture* tests.
const CHRONOLOGICAL_PROVIDER_STREAM_SUMMARY = [
  { kind: "assistant_text", label: "step one (before any command)" },
  { kind: "activity_item", label: "command A (running -> output chunks -> completed)" },
  { kind: "activity_item", label: "command B (adjacent command)" },
  { kind: "assistant_text", label: "step two (after the commands)" },
  { kind: "reasoning", label: "active thinking headline (no summary, no tool)" },
  { kind: "assistant_text", label: "step three (after reasoning, no tool between)" },
  { kind: "reasoning", label: "public summary on the same reasoning item" },
  { kind: "reasoning", label: "private/generic reasoning, hidden text only (stays silent)" },
  { kind: "assistant_text", label: "step four (final answer)" },
];

const CHRONOLOGICAL_STEP_TEXTS = [
  "Chronological step one: inspecting the shell scripts.",
  "Chronological step two: the scripts are pinned-toolchain wrappers.",
  "Chronological step three: the parser lives in internal/chat.",
  "Chronological step four: final chronological answer.",
];

// The chronological DOM block order the transcript must render: assistant text, activity rows, and
// reasoning interleaved exactly as the provider produced them. reasoning appears once (the thinking
// block updates to summary mode in place, keeping its ordinal). The final answer (step four) shares
// the post-reasoning assistant block with step three because the in-place summary update does not
// open a new segment, so the strict order ends at step three and step four presence is checked
// separately.
const CHRONOLOGICAL_DOM_TEXT_ORDER = [
  "Chronological step one: inspecting the shell scripts.",
  "Chronological command A",
  "Chronological command B",
  "Chronological step two: the scripts are pinned-toolchain wrappers.",
  "Chronological reasoning headline",
  "Chronological step three: the parser lives in internal/chat.",
];

// runChronologicalTranscriptWorkflow drives the chronological provider stream end-to-end, records
// the three diagnostic layers, and asserts the chronological transcript: assistant text interleaves
// with activity rows and reasoning in provider order, with no outer Activity accordion.
export async function runChronologicalTranscriptWorkflow({
  appendWorkflowState,
  assertActivityRows,
  assertRunActivityProjection,
  assertTextAbsent,
  backend,
  client,
  conversationId,
  recordingDir,
  submitComposer,
  waitForRunWithPrompt,
  waitForTexts,
  workspaceId,
}) {
  // Hidden/private reasoning must never surface, including transiently while streaming, so watch
  // the whole turn with a live monitor rather than only checking the final state.
  const forbiddenMonitor = startForbiddenTextMonitor(client, ["private chronological reasoning"]);
  let run;
  let streamingViolation;
  try {
    await submitComposer(client, "chronological transcript workflow", "Send message");
    run = await waitForRunWithPrompt(
      backend,
      workspaceId,
      conversationId,
      "chronological transcript workflow",
      "completed",
    );
    await waitForTexts(client, [
      ...CHRONOLOGICAL_STEP_TEXTS,
      "Chronological command A",
      "Chronological command B",
      "Chronological reasoning headline",
    ]);
  } finally {
    // Always stop polling so the monitor never outlives the workflow; stop() returns the
    // violation rather than throwing, so a failure above is preserved instead of masked.
    streamingViolation = await forbiddenMonitor.stop();
  }
  if (streamingViolation !== null) {
    throw new Error(`private reasoning rendered while streaming: ${streamingViolation}`);
  }
  // Final-state guarantee in addition to the streaming monitor.
  await assertTextAbsent(client, "private chronological reasoning");

  // Backend projection: the two commands are activity rows; reasoning is its own block, not an
  // activity row, so it is absent from the activity projection.
  const projection = await assertRunActivityProjection(backend, workspaceId, run.id, {
    rawTypes: ["command_execution", "reasoning"],
    rows: [
      { title: "Chronological command A", type: "command_execution" },
      { title: "Chronological command B", type: "command_execution" },
    ],
  });
  await assertActivityRows(client, projection.rows);

  // Capture the three diagnostic layers, then assert the chronological behavior.
  const domBlocks = await client.driver("chatTranscriptBlockOrder");
  const messagePage = await backend.post("/chat/messages/page", {
    conversationId,
    limit: 40,
    workspaceId,
  });
  await recordChronologicalDiagnostics(recordingDir, {
    appendWorkflowState,
    domBlocks,
    messagePage,
    projection,
    run,
  });
  assertChronologicalInterleaving(domBlocks.blocks, run.id);
}

function assertChronologicalInterleaving(blocks, runId) {
  const runBlocks = blocks.filter((block) => block.runId === runId);
  const kinds = runBlocks.map((block) => block.kind);
  assertChronologicalBlockCounts(kinds);
  assertChronologyInterleaved(kinds);
  assertBlockTextOrder(runBlocks, CHRONOLOGICAL_DOM_TEXT_ORDER);
}

function assertChronologicalBlockCounts(kinds) {
  // The two commands stay activity rows; reasoning is one block (thinking updated to summary in
  // place). Assistant text splits around the commands and the reasoning into at least three
  // chronological segments. The outer Activity accordion is gone, so no activity_group node exists.
  const exactCounts = { activity_item: 2, reasoning: 1 };
  for (const [kind, expected] of Object.entries(exactCounts)) {
    const actual = kinds.filter((candidate) => candidate === kind).length;
    if (actual !== expected) {
      throw new Error(
        `expected ${expected} ${kind} block(s), got ${actual}: ${JSON.stringify(kinds)}`,
      );
    }
  }
  const assistantBlocks = kinds.filter((candidate) => candidate === "assistant_text").length;
  if (assistantBlocks < 3) {
    throw new Error(
      `expected assistant text to split into at least 3 chronological blocks, got ${assistantBlocks}: ${JSON.stringify(kinds)}`,
    );
  }
  if (kinds.includes("activity_group")) {
    throw new Error(`expected no outer activity accordion, got: ${JSON.stringify(kinds)}`);
  }
}

function assertChronologyInterleaved(kinds) {
  // Chronology preserved: assistant text exists both before the first activity row and after the
  // last one, and reasoning lands after the commands — never flattened to one block before all rows.
  const firstActivity = kinds.indexOf("activity_item");
  const lastActivity = kinds.lastIndexOf("activity_item");
  const assistantIndexes = kinds.flatMap((kind, index) =>
    kind === "assistant_text" ? [index] : [],
  );
  const interleaves =
    assistantIndexes.some((index) => index < firstActivity) &&
    assistantIndexes.some((index) => index > lastActivity);
  if (!interleaves) {
    throw new Error(
      `expected assistant text both before and after activity rows: ${JSON.stringify(kinds)}`,
    );
  }
  if (kinds.indexOf("reasoning") < lastActivity) {
    throw new Error(`expected reasoning after the commands: ${JSON.stringify(kinds)}`);
  }
}

function assertBlockTextOrder(runBlocks, texts) {
  let previousIndex = -1;
  for (const text of texts) {
    const index = runBlocks.findIndex(
      (block, candidateIndex) => candidateIndex > previousIndex && block.text.includes(text),
    );
    if (index <= previousIndex) {
      throw new Error(
        `expected "${text}" after block ${previousIndex}: ${JSON.stringify(runBlocks.map((block) => block.text))}`,
      );
    }
    previousIndex = index;
  }
}

// startForbiddenTextMonitor polls the rendered document for any of forbiddenTexts until stopped,
// so transient leaks during streaming are caught, not just the final state. It stores the first
// match instead of rejecting mid-stream (no unhandled rejection), and stop() RETURNS that match
// (or null) rather than throwing — so it is safe to await in a finally without masking an
// in-flight failure. A teardown that breaks client.evaluate simply ends observation.
function startForbiddenTextMonitor(client, forbiddenTexts) {
  let stopped = false;
  let violation = null;
  const polling = (async () => {
    while (!stopped && violation === null) {
      const body = await client.evaluate("document.body.innerText");
      violation = forbiddenTexts.find((text) => body.includes(text)) ?? null;
      if (violation === null) {
        await delay(16);
      }
    }
  })();
  return {
    stop: async () => {
      stopped = true;
      await polling.catch(() => {});
      return violation;
    },
  };
}

async function recordChronologicalDiagnostics(
  recordingDir,
  { appendWorkflowState, domBlocks, messagePage, projection, run },
) {
  const assistant = messagePage.messages.find(
    (message) => message.runId === run.id && message.role === "assistant",
  );
  const diagnostics = {
    backendActivityProjection: (projection.rows ?? []).map((row) => ({
      hasDetails: row.hasDetails,
      hasOutput: row.hasOutput,
      sourceRunItemId: row.sourceRunItemId,
      status: row.status,
      summary: row.details?.summary ?? "",
      title: row.title,
      type: row.type,
    })),
    backendAssistantMessage: {
      id: assistant?.id ?? "",
      partCount: assistant?.parts?.length ?? 0,
      text: (assistant?.parts ?? []).map((part) => part.text ?? "").join(""),
    },
    domBlockOrder: domBlocks.blocks,
    note: "Chronological transcript: provider chronology is preserved as ordered transcript blocks in the backend and DOM. providerStreamSummary is a hand-authored block-level summary; the full raw stream is frozen by the Go TestChronologicalFixture* tests.",
    phase: 5,
    plan: "docs/plans/chronological_chat_transcript_plan.md",
    providerStreamSummary: CHRONOLOGICAL_PROVIDER_STREAM_SUMMARY,
    runId: run.id,
  };
  await writeFile(
    join(recordingDir, "chronological-transcript-diagnostics.json"),
    `${JSON.stringify(diagnostics, null, 2)}\n`,
  );
  await appendWorkflowState(recordingDir, {
    domBlockKinds: domBlocks.blocks.map((block) => block.kind),
    path: "chronological-transcript-diagnostics.json",
    providerStreamSummaryKinds: CHRONOLOGICAL_PROVIDER_STREAM_SUMMARY.map((event) => event.kind),
    type: "chronological_transcript_diagnostics",
  });
}
