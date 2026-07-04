import { setTimeout as delay } from "node:timers/promises";

import {
  clickButtonByAria,
  setInputValue,
  submitComposer,
  waitForDriverState,
  waitForRunWithPrompt,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

export async function runCommandStartFailureWorkflow({
  backend,
  client,
  conversationId,
  workspaceId,
}) {
  await submitComposer(client, "command start failure workflow", "Send message");
  const run = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "command start failure workflow",
    "completed",
  );
  await waitForTexts(client, [
    "Command start failure workflow complete.",
    "Shell command failed to start",
  ]);

  const page = await backend.post("/chat/runs/activity", {
    limit: 100,
    runId: run.id,
    workspaceId,
  });
  const row = (page.activity ?? []).find((candidate) => candidate.type === "command_start_failure");
  if (!row) {
    throw new Error(`command-start failure row missing: ${JSON.stringify(page)}`);
  }
  assertCommandStartFailureRow(row);
  await openProjectedActivityRow(client, row.sourceRunItemId);
  await waitForDriverState(
    client,
    "commandStartFailureActivityDetails",
    { sourceRunItemId: row.sourceRunItemId },
    (value) => value.ok,
  );
  await openChatSearch(client);
  await setInputValue(client, 'input[placeholder="Search chat"]', "scripted-emfile");
  await waitForDriverState(
    client,
    "focusedActivityRowContains",
    {
      sourceRunItemId: row.sourceRunItemId,
      texts: ["Too many open files (os error 24)"],
    },
    (value) => value.ok,
  );
  await clickButtonByAria(client, "Close chat search");
}

function assertCommandStartFailureRow(row) {
  const failure = row.details?.commandStartFailure;
  if (!failure) {
    throw new Error(`command-start failure details missing: ${JSON.stringify(row)}`);
  }
  const checks = [
    ["type", row.type, "command_start_failure"],
    ["title", row.title, "Shell command failed to start"],
    ["status", row.status, "failed"],
    ["command", failure.command, "printf scripted-start-failure"],
    ["message", failure.message, "Too many open files (os error 24)"],
    ["osError", failure.osError, "os error 24"],
    ["failureClass", failure.failureClass, "resource_exhaustion"],
    ["source", failure.source, "agent"],
    ["sandbox", failure.sandbox, "workspace-write"],
    ["approvalPolicy", failure.approvalPolicy, "on-request"],
  ];
  const mismatch = checks.find(([, actual, expected]) => actual !== expected);
  if (mismatch) {
    throw new Error(
      `command-start failure row ${mismatch[0]} mismatch: ${JSON.stringify({
        actual: mismatch[1],
        expected: mismatch[2],
        row,
      })}`,
    );
  }
  if (!failure.providerErrorId.startsWith("scripted-emfile-")) {
    throw new Error(`provider error id mismatch: ${JSON.stringify(row)}`);
  }
}

async function openProjectedActivityRow(client, sourceRunItemId) {
  const startedAt = Date.now();
  let opened = null;
  while (Date.now() - startedAt < 2_000) {
    opened = await client.driver("openProjectedActivityRow", { sourceRunItemId });
    if (opened.ok) {
      return;
    }
    await delay(50);
  }
  throw new Error(`activity row ${sourceRunItemId} was not opened: ${JSON.stringify(opened)}`);
}

async function openChatSearch(client) {
  await client.driver("openChatSearch");
  await waitForDriverState(client, "chatSearchState", {}, (value) => value.open);
}
