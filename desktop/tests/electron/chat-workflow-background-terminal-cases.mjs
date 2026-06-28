import { writeFile } from "node:fs/promises";
import { join } from "node:path";

// Phase 0 of docs/plans/background_terminal_lifecycle_plan.md. The provider starts two
// unified-exec style background terminals and leaves them running when the turn completes.
// The current backend has no background terminal lifecycle, so the terminals render as
// ordinary per-run command activity rows that are finalized with the run, and there is no
// background-terminal footer or monitor. This summary mirrors the Go fixture
// scriptedBackgroundTerminalTurn; the authoritative raw stream (running upserts with no
// completed upsert, output chunks) is frozen by the Go TestBackgroundTerminalFixture* tests.
const BACKGROUND_TERMINAL_PROVIDER_STREAM_SUMMARY = [
  { kind: "assistant_text", label: "step one (before the terminals)" },
  { kind: "activity_item", label: "terminal alpha (running -> output chunks, never completes)" },
  { kind: "activity_item", label: "terminal beta (running, never completes)" },
  { kind: "assistant_text", label: "step two (final response while terminals run)" },
];

// The Phase 4 background-terminal footer test id. It does not exist yet; freezing its absence
// makes the Phase 4 flip a one-line change from "absent" to "present".
const BACKGROUND_TERMINAL_FOOTER_SELECTOR = '[data-testid="background-terminals-footer"]';

// runBackgroundTerminalWorkflow drives the background terminal provider stream end-to-end and
// asserts the CURRENT behavior: the terminals are ordinary activity rows finalized with the
// run, and no background-terminal surface exists. These assertions are expected to be flipped
// when the background terminal lifecycle, footer, and monitor land in later phases.
export async function runBackgroundTerminalWorkflow({
  appendWorkflowState,
  assertActivityRows,
  assertRunActivityProjection,
  backend,
  client,
  conversationId,
  recordingDir,
  submitComposer,
  waitForRunWithPrompt,
  waitForTexts,
  workspaceId,
}) {
  await submitComposer(client, "background terminal workflow", "Send message");
  const run = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "background terminal workflow",
    "completed",
  );
  await waitForTexts(client, [
    "Background terminal step one: starting the dev servers.",
    "Background terminal step two: both servers are running in the background.",
    "npm run dev",
    "vite --host 0.0.0.0",
  ]);

  // Backend projection: both background terminals are ordinary command activity rows. This is
  // a plan Non-Goal once the lifecycle lands (Phase 4 stops representing them as per-run rows
  // after the run ends), so this projection shape is expected to change then.
  const projection = await assertRunActivityProjection(backend, workspaceId, run.id, {
    rawTypes: ["command_execution"],
    rows: [
      { title: "npm run dev", type: "command_execution" },
      { title: "vite --host 0.0.0.0", type: "command_execution" },
    ],
  });
  await assertActivityRows(client, projection.rows);

  // Freeze the finalized-with-run bug: the provider left both terminals running, but because the
  // backend finalizes every still-streaming block with the run, the typed projection reports
  // them as completed. Phase 4 must exempt background terminals, flipping this to "running".
  for (const row of projection.rows) {
    if (row.status !== "completed") {
      throw new Error(
        `Phase 0 expected background terminal row finalized to "completed", got ${JSON.stringify(row.status)}: ${JSON.stringify(row)}`,
      );
    }
  }

  // And the same bug at the UI: each still-running terminal renders a completed status icon
  // (aria-label "completed") rather than a live running indicator. Phase 4 flips this.
  await assertBackgroundTerminalRowsFinalized(client, projection.rows.length);

  // No background-terminal footer/monitor exists yet, even though two terminals are still
  // running. Phase 4 adds the footer; this assertion then flips to require it.
  const footerAbsent = await client.evaluate(
    `document.querySelector(${JSON.stringify(BACKGROUND_TERMINAL_FOOTER_SELECTOR)}) === null`,
  );
  if (!footerAbsent) {
    throw new Error("Phase 0 expected no background-terminal footer yet, but one was rendered");
  }

  await recordBackgroundTerminalDiagnostics(recordingDir, {
    appendWorkflowState,
    footerAbsent,
    projection,
    run,
  });
}

// assertBackgroundTerminalRowsFinalized checks that every background terminal activity row shows
// a completed status icon and no live running indicator, freezing that the UI currently finalizes
// these still-running terminals when the run completes.
async function assertBackgroundTerminalRowsFinalized(client, expectedCount) {
  const statuses = await client.evaluate(`(() =>
    Array.from(document.querySelectorAll('[data-testid="run-activity-row"]')).map((row) => ({
      runItemId: row.getAttribute("data-run-item-id") ?? "",
      completed: row.querySelector('[aria-label="completed"]') !== null,
      running: row.querySelector('[aria-label$=" running"]') !== null,
    }))
  )()`);
  if (statuses.length !== expectedCount) {
    throw new Error(
      `Phase 0 expected ${expectedCount} background terminal rows with status, got ${JSON.stringify(statuses)}`,
    );
  }
  for (const status of statuses) {
    if (!status.completed || status.running) {
      throw new Error(
        `Phase 0 expected background terminal row finalized to completed in the UI, got ${JSON.stringify(status)}`,
      );
    }
  }
}

async function recordBackgroundTerminalDiagnostics(
  recordingDir,
  { appendWorkflowState, footerAbsent, projection, run },
) {
  const diagnostics = {
    backgroundTerminalActivityProjection: (projection.rows ?? []).map((row) => ({
      hasOutput: row.hasOutput,
      sourceRunItemId: row.sourceRunItemId,
      status: row.status,
      title: row.title,
      type: row.type,
    })),
    footerPresent: !footerAbsent,
    note: "Frozen pre-lifecycle behavior: background terminals are ordinary per-run command activity rows finalized with the run, and no background-terminal footer/monitor exists. providerStreamSummary is a hand-authored block-level summary; the full raw stream is frozen by the Go TestBackgroundTerminalFixture* tests.",
    phase: 0,
    plan: "docs/plans/background_terminal_lifecycle_plan.md",
    providerStreamSummary: BACKGROUND_TERMINAL_PROVIDER_STREAM_SUMMARY,
    runId: run.id,
  };
  await writeFile(
    join(recordingDir, "background-terminal-diagnostics.json"),
    `${JSON.stringify(diagnostics, null, 2)}\n`,
  );
  await appendWorkflowState(recordingDir, {
    footerPresent: !footerAbsent,
    path: "background-terminal-diagnostics.json",
    providerStreamSummaryKinds: BACKGROUND_TERMINAL_PROVIDER_STREAM_SUMMARY.map(
      (event) => event.kind,
    ),
    type: "background_terminal_diagnostics",
  });
}
