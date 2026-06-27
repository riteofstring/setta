import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Phase 0 of docs/plans/chronological_chat_transcript_plan.md. The provider emits assistant
// text interleaved with commands and reasoning, but the current backend flattens it into one
// assistant bubble plus one outer Activity accordion. This is a hand-authored block-level
// summary of that stream that mirrors the Go fixture scriptedChronologicalTranscriptTurn; the
// authoritative, full raw stream (output chunks, running/completed upserts, hidden reasoning)
// is frozen by the Go TestChronologicalFixture* tests. It is recorded as a diagnostic so the
// artifact can line up the provider block order against the backend projection and DOM order.
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

// runChronologicalTranscriptWorkflow drives the chronological provider stream end-to-end,
// records the three diagnostic layers, and asserts the CURRENT confusing UI: the chronology
// is flattened. The assertions and recorded diagnostics are expected to be flipped as the
// chronological transcript blocks land in later phases.
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
    throw new Error(`Phase 0 private reasoning rendered while streaming: ${streamingViolation}`);
  }
  // Final-state guarantee in addition to the streaming monitor.
  await assertTextAbsent(client, "private chronological reasoning");

  // Backend projection: three displayable rows collapsed into one activity group.
  const projection = await assertRunActivityProjection(backend, workspaceId, run.id, {
    rawTypes: ["command_execution", "reasoning"],
    rows: [
      { title: "Chronological command A", type: "command_execution" },
      { title: "Chronological command B", type: "command_execution" },
      {
        summary: "Chronological public reasoning summary body.",
        title: "Chronological reasoning headline",
        type: "reasoning",
      },
    ],
  });
  await assertActivityRows(client, projection.rows);

  // Capture the three diagnostic layers, then assert the current flattened behavior.
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
  assertChronologicalFlattening(domBlocks.blocks, run.id, messagePage);
}

function assertChronologicalFlattening(blocks, runId, messagePage) {
  const kinds = blocks.filter((block) => block.runId === runId).map((block) => block.kind);
  assertChronologicalBlockCounts(kinds);
  assertChronologyFlattenedNotInterleaved(kinds);
  assertFlattenedAssistantPart(messagePage, runId);
}

function assertChronologicalBlockCounts(kinds) {
  // The chronology collapses to one assistant block plus one outer Activity accordion of rows.
  const expectedCounts = { activity_group: 1, activity_row: 3, assistant_text: 1 };
  for (const [kind, expected] of Object.entries(expectedCounts)) {
    const actual = kinds.filter((candidate) => candidate === kind).length;
    if (actual !== expected) {
      throw new Error(
        `Phase 0 expected ${expected} ${kind} block(s) flattened, got ${actual}: ${JSON.stringify(kinds)}`,
      );
    }
  }
}

function assertChronologyFlattenedNotInterleaved(kinds) {
  // Lost chronology: the single assistant block precedes every activity row in the DOM even
  // though the provider emitted assistant text after the commands and reasoning.
  if (kinds.lastIndexOf("assistant_text") > kinds.indexOf("activity_row")) {
    throw new Error(
      `Phase 0 expected all assistant text before activity rows (flattened): ${JSON.stringify(kinds)}`,
    );
  }
  if (!providerStreamInterleaves() || domBlocksInterleave(kinds)) {
    throw new Error(
      `Phase 0 expected interleaved provider chronology but a flattened DOM: ${JSON.stringify(kinds)}`,
    );
  }
}

function providerStreamInterleaves() {
  return CHRONOLOGICAL_PROVIDER_STREAM_SUMMARY.some(
    (event, index) =>
      event.kind === "assistant_text" &&
      CHRONOLOGICAL_PROVIDER_STREAM_SUMMARY.slice(0, index).some(
        (earlier) => earlier.kind !== "assistant_text",
      ),
  );
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

function domBlocksInterleave(kinds) {
  return kinds.some(
    (kind, index) => kind === "assistant_text" && kinds.slice(0, index).includes("activity_row"),
  );
}

function assertFlattenedAssistantPart(messagePage, runId) {
  // The assistant message is one flattened part holding every chronological text segment.
  const assistant = messagePage.messages.find(
    (message) => message.runId === runId && message.role === "assistant",
  );
  if (!assistant || assistant.parts.length !== 1) {
    throw new Error(`Phase 0 expected one flattened assistant part: ${JSON.stringify(assistant)}`);
  }
  const flattenedText = assistant.parts.map((part) => part.text ?? "").join("");
  for (const step of CHRONOLOGICAL_STEP_TEXTS) {
    if (!flattenedText.includes(step)) {
      throw new Error(
        `Phase 0 flattened assistant text missing ${step}: ${JSON.stringify(flattenedText)}`,
      );
    }
  }
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
    note: "Frozen pre-chronological behavior: provider chronology is flattened in the backend and DOM. providerStreamSummary is a hand-authored block-level summary; the full raw stream is frozen by the Go TestChronologicalFixture* tests.",
    phase: 0,
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
