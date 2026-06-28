import { writeFile } from "node:fs/promises";
import { join } from "node:path";

// Phase 2 of docs/plans/background_terminal_lifecycle_plan.md. The provider starts two
// unified-exec style background terminals and leaves them running when the turn completes.
// The backend now routes unified-exec commands into the background terminal process registry
// and renders them as slim chronological background_terminal marker blocks, not as per-run
// command activity rows: the terminals are no longer run items, so the run activity projection
// is empty, and their output is owned by the registry rather than run-item output. The footer
// and monitor surfaces that read the registry land in Phase 4, so their absence is still frozen
// here. The authoritative provider stream (running upserts with no completed upsert, output
// chunks) is frozen by the Go TestBackgroundTerminalFixture* tests.
const BACKGROUND_TERMINAL_MARKER_SUMMARY = [
  { kind: "assistant_text", label: "step one (before the terminals)" },
  { kind: "background_terminal", label: "marker: npm run dev (running, owned by the registry)" },
  {
    kind: "background_terminal",
    label: "marker: vite --host 0.0.0.0 (running, owned by the registry)",
  },
  { kind: "assistant_text", label: "step two (final response while terminals run)" },
];

// The Phase 4 background-terminal footer test id. It does not exist yet; freezing its absence
// makes the Phase 4 flip a one-line change from "absent" to "present".
const BACKGROUND_TERMINAL_FOOTER_SELECTOR = '[data-testid="background-terminals-footer"]';
const BACKGROUND_TERMINAL_BLOCK_SELECTOR = '[data-testid="background-terminal-block"]';

// runBackgroundTerminalWorkflow drives the background terminal provider stream end-to-end and
// asserts the Phase 2 behavior: the terminals are slim background_terminal marker blocks owned
// by the process registry, not run-item activity rows, and the footer/monitor do not exist yet.
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

  // Backend projection: background terminals are no longer run items, so the run activity
  // projection is empty. This is the plan's clean replacement of the per-run command rows.
  const projection = await assertRunActivityProjection(backend, workspaceId, run.id, {
    rawTypes: [],
    rows: [],
  });
  await assertActivityRows(client, projection.rows);

  // The terminals render as two slim background_terminal marker blocks carrying the started
  // command, each linked to its registry process by a stable process id.
  const markers = await assertBackgroundTerminalMarkers(client, [
    "npm run dev",
    "vite --host 0.0.0.0",
  ]);

  // No background-terminal footer/monitor exists yet, even though two terminals are still
  // running. Phase 4 adds the footer; this assertion then flips to require it.
  const footerAbsent = await client.evaluate(
    `document.querySelector(${JSON.stringify(BACKGROUND_TERMINAL_FOOTER_SELECTOR)}) === null`,
  );
  if (!footerAbsent) {
    throw new Error("Phase 2 expected no background-terminal footer yet, but one was rendered");
  }

  await recordBackgroundTerminalDiagnostics(recordingDir, {
    appendWorkflowState,
    footerAbsent,
    markers,
    run,
  });
}

// assertBackgroundTerminalMarkers checks that exactly one slim background_terminal marker block
// renders per started command, each tagged with the registry process id it is joined to.
async function assertBackgroundTerminalMarkers(client, expectedCommands) {
  const markers = await client.evaluate(`(() =>
    Array.from(document.querySelectorAll(${JSON.stringify(BACKGROUND_TERMINAL_BLOCK_SELECTOR)})).map((el) => ({
      processId: el.getAttribute("data-process-id") ?? "",
      text: el.innerText,
    }))
  )()`);
  if (markers.length !== expectedCommands.length) {
    throw new Error(
      `background terminal markers = ${markers.length}, want ${expectedCommands.length}: ${JSON.stringify(markers)}`,
    );
  }
  for (const command of expectedCommands) {
    const marker = markers.find((candidate) => candidate.text.includes(command));
    if (!marker) {
      throw new Error(
        `background terminal marker missing command ${JSON.stringify(command)}: ${JSON.stringify(markers)}`,
      );
    }
    if (!marker.processId) {
      throw new Error(`background terminal marker missing process id: ${JSON.stringify(marker)}`);
    }
  }
  return markers;
}

async function recordBackgroundTerminalDiagnostics(
  recordingDir,
  { appendWorkflowState, footerAbsent, markers, run },
) {
  const diagnostics = {
    backgroundTerminalMarkers: markers.map((marker) => ({
      processId: marker.processId,
      text: marker.text,
    })),
    footerPresent: !footerAbsent,
    note: "Phase 2 background terminal lifecycle: unified-exec commands are routed into the backend process registry and rendered as slim background_terminal marker blocks, not per-run command activity rows. The run activity projection is empty because they are no longer run items. The footer/monitor surfaces that read the registry land in Phase 4.",
    phase: 2,
    plan: "docs/plans/background_terminal_lifecycle_plan.md",
    providerStreamSummary: BACKGROUND_TERMINAL_MARKER_SUMMARY,
    runId: run.id,
  };
  await writeFile(
    join(recordingDir, "background-terminal-diagnostics.json"),
    `${JSON.stringify(diagnostics, null, 2)}\n`,
  );
  await appendWorkflowState(recordingDir, {
    footerPresent: !footerAbsent,
    markerCommandKinds: BACKGROUND_TERMINAL_MARKER_SUMMARY.map((event) => event.kind),
    path: "background-terminal-diagnostics.json",
    type: "background_terminal_diagnostics",
  });
}
