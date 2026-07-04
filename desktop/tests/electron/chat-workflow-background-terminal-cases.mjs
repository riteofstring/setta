import { writeFile } from "node:fs/promises";
import { join } from "node:path";

// Background terminal workflow verification. The provider starts two
// unified-exec style background terminals and leaves them running when the turn completes.
// The backend routes unified-exec commands into the background terminal process registry,
// renders slim chronological background_terminal marker blocks, exposes typed list/output/kill
// contracts over HTTP and preload IPC, and renders the footer plus monitor UI from the typed
// process/output projections. The authoritative provider stream (running upserts with no
// completed upsert, output chunks) is frozen by the Go TestBackgroundTerminalFixture* tests.
const BACKGROUND_TERMINAL_MARKER_SUMMARY = [
  { kind: "assistant_text", label: "step one (before the terminals)" },
  { kind: "background_terminal", label: "marker: npm run dev (running, owned by the registry)" },
  {
    kind: "background_terminal",
    label: "marker: vite --host 0.0.0.0 (running, owned by the registry)",
  },
  { kind: "assistant_text", label: "step two (final response while terminals run)" },
];

const BACKGROUND_TERMINAL_FOOTER_SELECTOR = '[data-testid="background-terminals-footer"]';
const BACKGROUND_TERMINAL_BLOCK_SELECTOR = '[data-testid="background-terminal-block"]';
const BACKGROUND_TERMINAL_MONITOR_SELECTOR = '[data-testid="background-terminal-monitor"]';
const BACKGROUND_TERMINAL_MONITOR_PROCESS_SELECTOR =
  '[data-testid="background-terminal-monitor-process"]';

// runBackgroundTerminalWorkflow drives the background terminal provider stream end-to-end and
// asserts the lifecycle behavior: the terminals are slim background_terminal marker blocks owned
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
  waitForState,
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

  const monitorDiagnostics = await assertBackgroundTerminalMonitor({
    backend,
    client,
    conversationId,
    waitForState,
    workspaceId,
  });

  await recordBackgroundTerminalDiagnostics(recordingDir, {
    appendWorkflowState,
    markers,
    monitorDiagnostics,
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

  return {
    backendOutputChunks: outputPage.output.length,
    ipcOutputChunks: ipcOutputPage.output.length,
    terminalCount: list.terminals.length,
  };
}

async function assertBackgroundTerminalMonitor({
  backend,
  client,
  conversationId,
  waitForState,
  workspaceId,
}) {
  const footer = await waitForState(
    client,
    `(() => {
      const footer = document.querySelector(${JSON.stringify(BACKGROUND_TERMINAL_FOOTER_SELECTOR)});
      return {
        present: Boolean(footer),
        text: footer?.innerText ?? "",
      };
    })()`,
    (value) => value.present && value.text.includes("2 background terminals running"),
  );
  await client.evaluate(
    `document.querySelector(${JSON.stringify(BACKGROUND_TERMINAL_FOOTER_SELECTOR)})?.click()`,
  );
  await waitForState(
    client,
    backgroundTerminalMonitorStateExpression(),
    (value) =>
      value.monitorOpen &&
      value.processes.some(
        (process) =>
          process.command === "npm run dev" &&
          process.status === "running" &&
          process.text.includes("npm run dev output chunk 001") &&
          process.text.includes("Kill"),
      ) &&
      value.processes.some(
        (process) => process.command === "vite --host 0.0.0.0" && process.status === "running",
      ),
  );
  const killed = await client.evaluate(backgroundTerminalKillClickExpression("npm run dev"));
  if (!killed) {
    throw new Error("background terminal monitor did not click the npm run dev kill control");
  }
  const monitorAfterKill = await waitForState(
    client,
    backgroundTerminalMonitorStateExpression(),
    (value) =>
      value.processes.some(
        (process) => process.command === "npm run dev" && process.status === "terminating",
      ) &&
      value.processes.some(
        (process) => process.command === "vite --host 0.0.0.0" && process.status === "running",
      ),
  );
  const backendAfterKill = await backend.post("/chat/background-terminals/list", {
    conversationId,
    workspaceId,
  });
  const alpha = terminalByCommand(backendAfterKill.terminals, "npm run dev");
  const beta = terminalByCommand(backendAfterKill.terminals, "vite --host 0.0.0.0");
  if (alpha.status !== "terminating" || beta.status !== "running") {
    throw new Error(
      `background terminal kill statuses = ${JSON.stringify(backendAfterKill.terminals)}`,
    );
  }
  return {
    backendStatusesAfterKill: backendAfterKill.terminals.map((process) => ({
      command: process.command,
      status: process.status,
    })),
    footerText: footer.text,
    monitorProcessCount: monitorAfterKill.processes.length,
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

function backgroundTerminalMonitorStateExpression() {
  return `(() => ({
    monitorOpen: Boolean(document.querySelector(${JSON.stringify(BACKGROUND_TERMINAL_MONITOR_SELECTOR)})),
    processes: Array.from(document.querySelectorAll(${JSON.stringify(BACKGROUND_TERMINAL_MONITOR_PROCESS_SELECTOR)})).map((row) => ({
      command: row.getAttribute("data-command") ?? "",
      status: row.getAttribute("data-status") ?? "",
      text: row.innerText,
    })),
  }))()`;
}

function backgroundTerminalKillClickExpression(command) {
  return `(() => {
    const rows = Array.from(document.querySelectorAll(${JSON.stringify(BACKGROUND_TERMINAL_MONITOR_PROCESS_SELECTOR)}));
    const row = rows.find((candidate) => candidate.getAttribute("data-command") === ${JSON.stringify(command)});
    const button = row?.querySelector("button[aria-label^='Kill background terminal']");
    if (!button) {
      return false;
    }
    button.click();
    return true;
  })()`;
}

async function recordBackgroundTerminalDiagnostics(
  recordingDir,
  { appendWorkflowState, markers, monitorDiagnostics, projectionDiagnostics, run },
) {
  const diagnostics = {
    backgroundTerminalMarkers: markers.map((marker) => ({
      processId: marker.processId,
      text: marker.text,
    })),
    footerPresent: true,
    monitorDiagnostics,
    note: "Phase 5 background terminal lifecycle verification: unified-exec commands are routed into the backend process registry, rendered as slim background_terminal marker blocks, exposed through typed HTTP/preload IPC list and output projections, surfaced through the footer/monitor UI with per-process kill controls, and kept out of run-item activity rows.",
    phase: 5,
    feature: "background-terminal-lifecycle",
    projectionDiagnostics,
    providerStreamSummary: BACKGROUND_TERMINAL_MARKER_SUMMARY,
    runId: run.id,
  };
  await writeFile(
    join(recordingDir, "background-terminal-diagnostics.json"),
    `${JSON.stringify(diagnostics, null, 2)}\n`,
  );
  await appendWorkflowState(recordingDir, {
    footerPresent: true,
    markerCommandKinds: BACKGROUND_TERMINAL_MARKER_SUMMARY.map((event) => event.kind),
    monitorProcessCount: monitorDiagnostics.monitorProcessCount,
    path: "background-terminal-diagnostics.json",
    type: "background_terminal_diagnostics",
  });
}
