import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertAssistantCompleted,
  assertNoActiveRun,
  clickButtonByAria,
  createChat,
  submitComposer,
  waitForCommandResult,
  waitForDriverState,
  waitForGoalStatus,
  waitForRunStatus,
  waitForState,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

const goalBackgroundTerminal = {
  command: "npm run goal-bg",
  idleGapOutput: "goal background idle output\n",
  itemId: "goal_bg_terminal",
  processId: "goal_bg_process",
  secondTurnOutput: "goal background turn B output\n",
};

const goalBackgroundTerminalFailure = {
  command: "npm run goal-bg-fail",
  exitCode: 1,
  itemId: "goal_bg_terminal_failed",
  processId: "goal_bg_process_failed",
};

export async function runProtocolGoalBackgroundTerminalWorkflow(
  client,
  backend,
  workspaceId,
  fixture,
) {
  const conversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "/goal phase5 codex background terminal", "Send message");
  const commandPage = await waitForCommandResult(
    backend,
    workspaceId,
    conversationId,
    "Goal set: phase5 codex background terminal",
  );
  const runId = goalRunIDFromCommandPage(commandPage);
  await assertProtocolGoalActiveWorkStack(client, runId);
  await assertProtocolGoalBackgroundTerminalMonitor(client);
  await assertProtocolGoalBackgroundTerminalCompletionDwell(client);
  const run = await waitForRunStatus(backend, workspaceId, conversationId, runId, "completed");
  await assertAssistantCompleted(backend, workspaceId, conversationId, run.id);
  await waitForGoalStatus(backend, workspaceId, conversationId, "complete");
  await waitForTexts(client, ["Goal turn A.", "Goal turn B.", goalBackgroundTerminal.command]);
  await assertProtocolBackgroundTerminalMarker(client);
  await waitForProtocolGoalBackgroundTerminalStore(fixture, workspaceId, conversationId);
  await assertProtocolGoalBackgroundTerminalProjections(
    client,
    backend,
    workspaceId,
    conversationId,
  );
  await assertNoActiveRun(backend, workspaceId, conversationId);
  await runProtocolGoalBackgroundTerminalFailureWorkflow(client, backend, workspaceId);
}

async function assertProtocolGoalActiveWorkStack(client, runId) {
  await waitForDriverState(client, "protocolGoalActiveWorkStack", {}, (value) =>
    activeWorkStackMatches(value, runId),
  );
}

function activeWorkStackMatches(value, runId) {
  if (!value.present) {
    return false;
  }
  const currentPlan = value.rows.find((row) => row.testId === "current-plan-surface");
  const backgroundTerminal = value.rows.find((row) => row.testId === "background-terminals-footer");
  return (
    currentPlanStackRowMatches(currentPlan, runId) &&
    backgroundTerminalStackRowMatches(backgroundTerminal)
  );
}

function currentPlanStackRowMatches(row, runId) {
  if (row === undefined) {
    return false;
  }
  return (
    row.testId === "current-plan-surface" &&
    row.runId === runId &&
    row.completedCount === "1" &&
    row.stepCount === "3" &&
    row.currentStep === "Watch the background terminal" &&
    row.text.includes("Current plan") &&
    row.text.includes("Watch the background terminal")
  );
}

function backgroundTerminalStackRowMatches(row) {
  if (row === undefined) {
    return false;
  }
  return (
    row.testId === "background-terminals-footer" &&
    row.text.includes("1 background terminal running")
  );
}

async function assertProtocolGoalBackgroundTerminalMonitor(client) {
  await waitForState(
    client,
    `(() => {
      const footer = document.querySelector('[data-testid="background-terminals-footer"]');
      return { present: Boolean(footer), text: footer?.innerText ?? "" };
    })()`,
    (value) => value.present && value.text.includes("1 background terminal running"),
  );
  await client.evaluate(
    `document.querySelector('[data-testid="background-terminals-footer"]')?.click()`,
  );
  await waitForState(
    client,
    protocolGoalBackgroundTerminalMonitorExpression(),
    (value) =>
      value.monitorOpen &&
      value.processes.some(
        (process) =>
          process.command === goalBackgroundTerminal.command &&
          process.status === "running" &&
          process.text.includes(goalBackgroundTerminal.idleGapOutput.trim()),
      ),
  );
  await clickButtonByAria(client, "Close background terminal monitor");
  await waitForState(
    client,
    protocolGoalBackgroundTerminalFooterExpression(),
    (value) =>
      !value.monitorOpen &&
      value.footerPresent &&
      value.footerPhase === "active" &&
      value.footerText.includes("1 background terminal running"),
  );
}

async function assertProtocolGoalBackgroundTerminalCompletionDwell(client) {
  await waitForState(
    client,
    protocolGoalBackgroundTerminalFooterExpression(),
    (value) =>
      value.footerPresent &&
      value.footerPhase === "complete" &&
      value.footerText.includes("1 background terminal completed"),
  );
  await delay(2700);
  await waitForState(
    client,
    protocolGoalBackgroundTerminalFooterExpression(),
    (value) => !value.footerPresent,
  );
}

function protocolGoalBackgroundTerminalMonitorExpression() {
  return `(() => ({
    monitorOpen: Boolean(document.querySelector('[data-testid="background-terminal-monitor"]')),
    processes: Array.from(document.querySelectorAll('[data-testid="background-terminal-monitor-process"]')).map((row) => ({
      command: row.getAttribute("data-command") ?? "",
      status: row.getAttribute("data-status") ?? "",
      text: row.innerText,
    })),
  }))()`;
}

function protocolGoalBackgroundTerminalFooterExpression() {
  return `(() => {
    const footer = document.querySelector('[data-testid="background-terminals-footer"]');
    return {
      footerPhase: footer?.getAttribute("data-terminal-surface-state") ?? "",
      footerPresent: Boolean(footer),
      footerText: footer?.innerText ?? "",
      monitorOpen: Boolean(document.querySelector('[data-testid="background-terminal-monitor"]')),
    };
  })()`;
}

async function runProtocolGoalBackgroundTerminalFailureWorkflow(client, backend, workspaceId) {
  const conversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "/goal phase5 codex background terminal failure", "Send message");
  const commandPage = await waitForCommandResult(
    backend,
    workspaceId,
    conversationId,
    "Goal set: phase5 codex background terminal failure",
  );
  const runId = goalRunIDFromCommandPage(commandPage);
  await waitForRunStatus(backend, workspaceId, conversationId, runId, "completed");
  await assertAssistantCompleted(backend, workspaceId, conversationId, runId);
  await waitForGoalStatus(backend, workspaceId, conversationId, "complete");
  await assertProtocolGoalBackgroundTerminalFailureProjection(backend, workspaceId, conversationId);
  await waitForTexts(client, [goalBackgroundTerminalFailure.command]);
  await waitForState(
    client,
    protocolGoalBackgroundTerminalFooterExpression(),
    (value) => !value.footerPresent && !value.monitorOpen,
  );
}

async function assertProtocolGoalBackgroundTerminalFailureProjection(
  backend,
  workspaceId,
  conversationId,
) {
  const list = await backend.post("/chat/background-terminals/list", {
    conversationId,
    workspaceId,
  });
  if (!Array.isArray(list.terminals) || list.terminals.length !== 1) {
    throw new Error(`${JSON.stringify(list)} does not contain one failed background terminal`);
  }
  const terminal = list.terminals[0];
  if (
    terminal.command !== goalBackgroundTerminalFailure.command ||
    terminal.exitCode !== goalBackgroundTerminalFailure.exitCode ||
    terminal.processId !== goalBackgroundTerminalFailure.processId ||
    terminal.providerItemId !== goalBackgroundTerminalFailure.itemId ||
    terminal.status !== "exited"
  ) {
    throw new Error(`failed background terminal projection mismatch: ${JSON.stringify(terminal)}`);
  }
}

function goalRunIDFromCommandPage(page) {
  const assistant = page.messages.find(
    (message) => message.role === "assistant" && message.runId !== "",
  );
  if (!assistant) {
    throw new Error(`goal command page did not include assistant run: ${JSON.stringify(page)}`);
  }
  return assistant.runId;
}

async function assertProtocolBackgroundTerminalMarker(client) {
  const markers = await client.evaluate(`(() =>
    Array.from(document.querySelectorAll('[data-testid="background-terminal-block"]')).map((el) => ({
      processId: el.getAttribute("data-process-id") ?? "",
      text: el.innerText,
    }))
  )()`);
  const marker = markers.find((candidate) =>
    candidate.text.includes(goalBackgroundTerminal.command),
  );
  if (!marker) {
    throw new Error(`goal background terminal marker missing: ${JSON.stringify(markers)}`);
  }
  if (marker.processId === "") {
    throw new Error(
      `goal background terminal marker missing process id: ${JSON.stringify(marker)}`,
    );
  }
}

async function waitForProtocolGoalBackgroundTerminalStore(fixture, workspaceId, conversationId) {
  const conversationDir = join(
    fixture.appDataDir,
    "workspaces",
    workspaceId,
    "conversations",
    conversationId,
  );
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt < 5000) {
    lastState = await readProtocolGoalBackgroundTerminalState(conversationDir);
    if (protocolGoalBackgroundTerminalStateReady(lastState)) {
      return;
    }
    await delay(100);
  }
  throw new Error(
    `timed out waiting for goal background terminal store state: ${JSON.stringify(lastState)}`,
  );
}

async function readProtocolGoalBackgroundTerminalState(conversationDir) {
  const processes = await readJsonFiles(join(conversationDir, "background_terminals"));
  const processRecord = processes.find(
    (candidate) => candidate.providerItemId === goalBackgroundTerminal.itemId,
  );
  const outputs =
    processRecord === undefined
      ? []
      : await readJsonFiles(join(conversationDir, "background_terminal_output", processRecord.id));
  return { outputs, process: processRecord ?? null };
}

function protocolGoalBackgroundTerminalStateReady(state) {
  if (
    state.process?.command !== goalBackgroundTerminal.command ||
    state.process?.processId !== goalBackgroundTerminal.processId ||
    state.process?.status !== "exited"
  ) {
    return false;
  }
  const outputText = state.outputs
    .slice()
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((output) => output.text)
    .join("");
  return (
    outputText === goalBackgroundTerminal.idleGapOutput + goalBackgroundTerminal.secondTurnOutput
  );
}

async function assertProtocolGoalBackgroundTerminalProjections(
  client,
  backend,
  workspaceId,
  conversationId,
) {
  const list = await backend.post("/chat/background-terminals/list", {
    conversationId,
    workspaceId,
  });
  const terminal = assertProtocolGoalBackgroundTerminalList(list, "backend HTTP list");

  const outputPage = await backend.post("/chat/background-terminals/output", {
    afterOrdinal: 0,
    conversationId,
    limit: 20,
    processId: terminal.id,
    workspaceId,
  });
  assertProtocolGoalBackgroundTerminalOutput(outputPage, terminal.id, "backend HTTP output");

  const ipcList = await callRendererChatAPI(client, "listBackgroundTerminals", [
    workspaceId,
    conversationId,
  ]);
  const ipcTerminal = assertProtocolGoalBackgroundTerminalList(ipcList, "renderer IPC list");
  const ipcOutputPage = await callRendererChatAPI(client, "getBackgroundTerminalOutput", [
    workspaceId,
    conversationId,
    ipcTerminal.id,
    0,
    20,
  ]);
  assertProtocolGoalBackgroundTerminalOutput(ipcOutputPage, ipcTerminal.id, "renderer IPC output");
}

function assertProtocolGoalBackgroundTerminalList(list, label) {
  if (!Array.isArray(list.terminals) || list.terminals.length !== 1) {
    throw new Error(`${label} terminals = ${JSON.stringify(list)}, want one goal terminal`);
  }
  const terminal = list.terminals[0];
  if (
    terminal.command !== goalBackgroundTerminal.command ||
    terminal.processId !== goalBackgroundTerminal.processId ||
    terminal.providerItemId !== goalBackgroundTerminal.itemId ||
    terminal.status !== "exited"
  ) {
    throw new Error(`${label} terminal = ${JSON.stringify(terminal)}`);
  }
  if (
    terminal.recentOutput.join("\n") !==
    "goal background idle output\ngoal background turn B output"
  ) {
    throw new Error(`${label} recent output = ${JSON.stringify(terminal.recentOutput)}`);
  }
  return terminal;
}

function assertProtocolGoalBackgroundTerminalOutput(page, processId, label) {
  if (page.processId !== processId || !Array.isArray(page.output) || page.output.length !== 2) {
    throw new Error(`${label} output page = ${JSON.stringify(page)}, want two chunks`);
  }
  const outputText = page.output.map((output) => output.text).join("");
  if (
    outputText !==
    goalBackgroundTerminal.idleGapOutput + goalBackgroundTerminal.secondTurnOutput
  ) {
    throw new Error(`${label} output text = ${JSON.stringify(outputText)}`);
  }
}

async function callRendererChatAPI(client, method, args) {
  return client.evaluate(
    `window.setta.chat[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

async function readJsonFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  return Promise.all(files.map((file) => readJsonFile(join(dir, file))));
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
