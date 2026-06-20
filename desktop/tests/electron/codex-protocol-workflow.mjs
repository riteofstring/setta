import process from "node:process";
import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fakeCodexAppServerFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-codex-app-server.mjs",
);

export async function installFakeCodexAppServer(fixture) {
  const binDir = join(fixture.tempRoot, "fake-bin");
  await mkdir(binDir, { recursive: true });
  const scriptPath = join(binDir, "fake-codex-app-server.mjs");
  await copyFile(fakeCodexAppServerFixture, scriptPath);
  if (process.platform === "win32") {
    const commandPath = join(binDir, "codex.cmd");
    await writeFile(commandPath, `@echo off\r\nnode "${scriptPath}" %*\r\n`, "utf8");
    return { binDir, commandPath };
  }
  const commandPath = join(binDir, "codex");
  await writeFile(commandPath, `#!/usr/bin/env sh\nexec node "${scriptPath}" "$@"\n`, "utf8");
  await chmod(commandPath, 0o755);
  return { binDir, commandPath };
}

export async function assertProtocolNotificationActivity(
  backend,
  workspaceId,
  conversationId,
  runId,
) {
  const page = await backend.post("/chat/runs/activity", { limit: 100, runId, workspaceId });
  await assertRunActivityItem(page, "hook", (item) => item.title === "Hook: pre-command");
  await assertRunActivityItem(page, "approval_review", (item) => item.reviewId === "review_fake");
  await assertRunActivityItem(
    page,
    "context_compaction",
    (item) => item.title === "Context compaction" && item.status === "completed",
  );
  await assertRunActivityItem(
    page,
    "file_change",
    (item) =>
      item.patchStatus === "updated" &&
      item.filePaths.includes("/tmp/workspace/main.go") &&
      item.fileOperations.some(
        (operation) =>
          operation.path === "/tmp/workspace/main.go" &&
          operation.operation === "write" &&
          operation.additions === 1 &&
          operation.deletions === 1,
      ) &&
      item.diffStats.structured &&
      item.diffStats.additions === 1 &&
      item.diffStats.deletions === 1,
  );
  await assertRunActivityItem(
    page,
    "diff",
    (item) =>
      item.fileOperations.some(
        (operation) =>
          operation.path === "main.go" &&
          operation.operation === "diff" &&
          operation.additions === 1 &&
          operation.deletions === 1,
      ) &&
      item.diffStats.structured &&
      item.diffStats.additions === 1 &&
      item.diffStats.deletions === 1,
  );
  await assertRunActivityItem(page, "reasoning", (item) => item.hiddenText === "private reasoning");
  await assertRunActivityItem(
    page,
    "command_execution",
    (item) => item.processId === "process_fake",
  );
  await assertRunActivityItem(
    page,
    "dynamic_tool_call",
    (item) =>
      item.status === "completed" &&
      item.namespace === "setta" &&
      item.toolName === "read_workspace_file" &&
      item.fileOperations.some(
        (operation) =>
          operation.path === "main.go" &&
          operation.operation === "read" &&
          operation.rangeStart === 1 &&
          operation.rangeEnd === 3,
      ) &&
      item.result.includes("package main"),
  );
  await assertRunActivityItem(
    page,
    "dynamic_tool_call",
    (item) =>
      item.status === "completed" &&
      item.namespace === "setta" &&
      item.toolName === "workspace_context" &&
      item.result.includes("rootPath"),
  );
  await assertRunActivityItem(
    page,
    "dynamic_tool_call",
    (item) =>
      item.status === "failed" &&
      item.namespace === "setta" &&
      item.toolName === "missing_tool" &&
      item.error.includes("unsupported dynamic tool"),
  );
  await assertRunActivityItem(page, "notice", (item) => item.noticeKind === "deprecationNotice");

  const diagnostics = await backend.post("/chat/diagnostics/list", {
    conversationId,
    runId,
    workspaceId,
  });
  const warningCodes = diagnostics.diagnostics.map((diagnostic) => diagnostic.code);
  if (
    !warningCodes.includes("codex_windows_world_writable_warning") ||
    !warningCodes.includes("codex_realtime_notification_ignored")
  ) {
    throw new Error(
      `protocol diagnostics missing expected warnings: ${JSON.stringify(diagnostics)}`,
    );
  }
}

async function assertRunActivityItem(page, type, matches) {
  const item = page.items.find((candidate) => candidate.type === type && matches(candidate));
  if (!item) {
    throw new Error(`run activity missing ${type}: ${JSON.stringify(page.items)}`);
  }
  return item;
}
