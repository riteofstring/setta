import { setTimeout as delay } from "node:timers/promises";

import {
  clickButtonByAria,
  setInputValue,
  submitComposer,
  waitForRunWithPrompt,
  waitForState,
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
  await waitForState(
    client,
    `(() => {
      const sourceRunItemId = ${JSON.stringify(row.sourceRunItemId)};
      const row = Array.from(document.querySelectorAll('[data-testid="run-activity-row"]'))
        .find((candidate) => candidate.getAttribute("data-run-item-id") === sourceRunItemId);
      const text = row?.innerText ?? "";
      return {
        ok:
          text.includes("Shell command failed to start") &&
          text.includes("printf scripted-start-failure") &&
          text.includes("Too many open files (os error 24)") &&
          text.includes("resource_exhaustion") &&
          text.includes("scripted-emfile-"),
        text,
      };
    })()`,
    (value) => value.ok,
  );
  await openChatSearch(client);
  await setInputValue(client, 'input[placeholder="Search chat"]', "scripted-emfile");
  await waitForState(
    client,
    `(() => {
      const sourceRunItemId = ${JSON.stringify(row.sourceRunItemId)};
      const row = document.querySelector('[data-activity-focused="true"]');
      return {
        ok:
          row?.getAttribute("data-run-item-id") === sourceRunItemId &&
          row?.innerText.includes("Too many open files (os error 24)"),
        sourceRunItemId: row?.getAttribute("data-run-item-id") ?? "",
        text: row?.innerText ?? "",
      };
    })()`,
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
    opened = await client.evaluate(`(() => {
      const sourceRunItemId = ${JSON.stringify(sourceRunItemId)};
      const transcript = document.querySelector('[data-testid="chat-transcript-region"]') ?? document;
      const groupHeaders = Array.from(transcript.querySelectorAll('[data-testid="activity-group-header"]'));
      const groupHeader = groupHeaders.find((candidate) =>
        (candidate.getAttribute("data-activity-group-source-run-item-ids") ?? "")
          .split(/\\s+/)
          .includes(sourceRunItemId)
      );
      let rows = Array.from(transcript.querySelectorAll('[data-testid="run-activity-row"]'));
      let row = rows.find((candidate) => candidate.getAttribute("data-run-item-id") === sourceRunItemId);
      if (
        !row &&
        groupHeader instanceof HTMLButtonElement &&
        groupHeader.getAttribute("data-activity-group-expanded") !== "true"
      ) {
        groupHeader.click();
        rows = Array.from(transcript.querySelectorAll('[data-testid="run-activity-row"]'));
        row = rows.find((candidate) => candidate.getAttribute("data-run-item-id") === sourceRunItemId);
      }
      if (!row) {
        return {
          ok: false,
          reason: "missing-row",
          groups: groupHeaders.map((candidate) => ({
            expanded: candidate.getAttribute("data-activity-group-expanded") ?? "",
            sourceRunItemIds: candidate.getAttribute("data-activity-group-source-run-item-ids") ?? "",
            text: candidate.innerText,
          })),
          rows: rows.map((candidate) => ({
            sourceRunItemId: candidate.getAttribute("data-run-item-id") ?? "",
            text: candidate.innerText,
          })),
        };
      }
      if (!(row instanceof HTMLDetailsElement)) {
        return { ok: true, reason: "compact-row" };
      }
      if (!row.open) {
        row.querySelector("summary")?.click();
      }
      return { ok: row.open, reason: row.open ? "opened" : "not-opened", text: row.innerText };
    })()`);
    if (opened.ok) {
      return;
    }
    await delay(50);
  }
  throw new Error(`activity row ${sourceRunItemId} was not opened: ${JSON.stringify(opened)}`);
}

async function openChatSearch(client) {
  await client.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      ctrlKey: true,
      key: "f",
      metaKey: true,
    }));
  })()`);
  await waitForState(
    client,
    `(() => ({ open: Boolean(document.querySelector('input[placeholder="Search chat"]')) }))()`,
    (value) => value.open,
  );
}
