import { writeFile } from "node:fs/promises";
import { join } from "node:path";

// Phase 3 of docs/plans/background_terminal_lifecycle_plan.md. The provider starts two
// unified-exec style background terminals and leaves them running when the turn completes.
// The backend routes unified-exec commands into the background terminal process registry,
// renders slim chronological background_terminal marker blocks, exposes typed list/output/kill
// contracts over HTTP and preload IPC, and fails kill loudly when the scripted provider cannot
// terminate a process. The footer and monitor surfaces that read the registry land in Phase 4,
// so their absence is still frozen here. The authoritative provider stream (running upserts
// with no completed upsert, output chunks) is frozen by the Go TestBackgroundTerminalFixture*
// tests.
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
// asserts the Phase 3 behavior: the terminals are slim background_terminal marker blocks owned
// by the process registry, not run-item activity rows, and the registry projections are available
// through both backend HTTP and renderer IPC.
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
  const projectionDiagnostics = await assertBackgroundTerminalProjections({
    backend,
    client,
    conversationId,
    workspaceId,
  });

  // No background-terminal footer/monitor exists yet, even though two terminals are still
  // running. Phase 4 adds the footer; this assertion then flips to require it.
  const footerAbsent = await client.evaluate(
    `document.querySelector(${JSON.stringify(BACKGROUND_TERMINAL_FOOTER_SELECTOR)}) === null`,
  );
  if (!footerAbsent) {
    throw new Error("Phase 3 expected no background-terminal footer yet, but one was rendered");
  }

  await recordBackgroundTerminalDiagnostics(recordingDir, {
    appendWorkflowState,
    footerAbsent,
    markers,
    projectionDiagnostics,
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

async function assertBackgroundTerminalProjections({
  backend,
  client,
  conversationId,
  workspaceId,
}) {
  const list = await backend.post("/chat/background-terminals/list", {
    conversationId,
    workspaceId,
  });
  assertBackgroundTerminalList(list, "backend HTTP list");
  const alpha = terminalByCommand(list.terminals, "npm run dev");
  if (alpha.recentOutput.length !== 2 || !alpha.recentOutput[0].includes("output chunk 001")) {
    throw new Error(`alpha recent output was not projected: ${JSON.stringify(alpha)}`);
  }

  const outputPage = await backend.post("/chat/background-terminals/output", {
    afterOrdinal: 0,
    conversationId,
    limit: 20,
    processId: alpha.id,
    workspaceId,
  });
  assertBackgroundTerminalOutputPage(outputPage, alpha.id, "backend HTTP output");

  const ipcList = await callRendererChatAPI(client, "listBackgroundTerminals", [
    workspaceId,
    conversationId,
  ]);
  assertBackgroundTerminalList(ipcList, "renderer IPC list");
  const ipcAlpha = terminalByCommand(ipcList.terminals, "npm run dev");
  const ipcOutputPage = await callRendererChatAPI(client, "getBackgroundTerminalOutput", [
    workspaceId,
    conversationId,
    ipcAlpha.id,
    0,
    20,
  ]);
  assertBackgroundTerminalOutputPage(ipcOutputPage, ipcAlpha.id, "renderer IPC output");

  const killResult = await callRendererChatAPIExpectError(client, "killBackgroundTerminal", [
    workspaceId,
    conversationId,
    ipcAlpha.id,
  ]);
  if (!killResult.message.includes("does not support provider termination")) {
    throw new Error(`renderer IPC kill error was not specific: ${JSON.stringify(killResult)}`);
  }
  const killAllResult = await callRendererChatAPIExpectError(client, "killAllBackgroundTerminals", [
    workspaceId,
    conversationId,
  ]);
  if (!killAllResult.message.includes("does not support provider termination")) {
    throw new Error(
      `renderer IPC kill-all error was not specific: ${JSON.stringify(killAllResult)}`,
    );
  }

  const afterFailedKill = await backend.post("/chat/background-terminals/list", {
    conversationId,
    workspaceId,
  });
  assertBackgroundTerminalList(afterFailedKill, "backend HTTP list after failed kill");
  for (const process of afterFailedKill.terminals) {
    if (process.status !== "running") {
      throw new Error(`failed kill mutated terminal state: ${JSON.stringify(afterFailedKill)}`);
    }
  }

  return {
    afterFailedKillStatuses: afterFailedKill.terminals.map((process) => ({
      command: process.command,
      status: process.status,
    })),
    backendOutputChunks: outputPage.output.length,
    ipcOutputChunks: ipcOutputPage.output.length,
    killAllError: killAllResult.message,
    killError: killResult.message,
    terminalCount: list.terminals.length,
  };
}

function assertBackgroundTerminalList(list, label) {
  if (!Array.isArray(list.terminals) || list.terminals.length !== 2) {
    throw new Error(`${label} terminals = ${JSON.stringify(list)}, want two terminals`);
  }
  for (const command of ["npm run dev", "vite --host 0.0.0.0"]) {
    const terminal = terminalByCommand(list.terminals, command);
    if (terminal.status !== "running") {
      throw new Error(`${label} terminal ${command} status = ${terminal.status}, want running`);
    }
    if (!terminal.id || !terminal.processId || !terminal.providerItemId) {
      throw new Error(`${label} terminal missing stable/provider ids: ${JSON.stringify(terminal)}`);
    }
  }
}

function assertBackgroundTerminalOutputPage(page, processId, label) {
  if (page.processId !== processId || !Array.isArray(page.output) || page.output.length !== 2) {
    throw new Error(`${label} output page = ${JSON.stringify(page)}, want two alpha chunks`);
  }
  for (const [index, output] of page.output.entries()) {
    const suffix = String(index + 1).padStart(3, "0");
    if (
      output.processId !== processId ||
      !output.text.includes(`npm run dev output chunk ${suffix}`)
    ) {
      throw new Error(`${label} output chunk ${index} = ${JSON.stringify(output)}`);
    }
  }
}

function terminalByCommand(terminals, command) {
  const terminal = terminals.find((candidate) => candidate.command === command);
  if (!terminal) {
    throw new Error(`missing background terminal for ${command}: ${JSON.stringify(terminals)}`);
  }
  return terminal;
}

async function callRendererChatAPI(client, method, args) {
  return client.evaluate(
    `window.setta.chat[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

async function callRendererChatAPIExpectError(client, method, args) {
  const result = await client.evaluate(`(async () => {
    try {
      const value = await window.setta.chat[${JSON.stringify(method)}](...${JSON.stringify(args)});
      return { ok: true, value };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  })()`);
  if (result.ok) {
    throw new Error(
      `renderer chat ${method} unexpectedly succeeded: ${JSON.stringify(result.value)}`,
    );
  }
  return result;
}

async function recordBackgroundTerminalDiagnostics(
  recordingDir,
  { appendWorkflowState, footerAbsent, markers, projectionDiagnostics, run },
) {
  const diagnostics = {
    backgroundTerminalMarkers: markers.map((marker) => ({
      processId: marker.processId,
      text: marker.text,
    })),
    footerPresent: !footerAbsent,
    note: "Phase 3 background terminal lifecycle: unified-exec commands are routed into the backend process registry, rendered as slim background_terminal marker blocks, exposed through typed HTTP/preload IPC list and output projections, and kill requests fail loudly when provider termination is unavailable. The footer/monitor surfaces that read the registry land in Phase 4.",
    phase: 3,
    plan: "docs/plans/background_terminal_lifecycle_plan.md",
    projectionDiagnostics,
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
