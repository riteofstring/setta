import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, test } from "vitest";

import { readWorkspaceGitInfo } from "./workspace-actions";

const execFileAsync = promisify(execFile);

describe("workspace actions", () => {
  test("reads branch and worktree metadata from a temporary git worktree", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-workspace-actions-"));
    try {
      await git(root, "init");
      await git(root, "config", "user.email", "test@example.com");
      await git(root, "config", "user.name", "Setta Test");
      await writeFile(join(root, "README.md"), "test\n");
      await git(root, "add", "README.md");
      await git(root, "commit", "-m", "Initial commit");
      await git(root, "checkout", "-b", "feature/shell-controls");

      const info = await readWorkspaceGitInfo(root);
      const resolvedRoot = await realpath(root);

      expect(info).toMatchObject({
        branchName: "feature/shell-controls",
        worktreeName: basename(resolvedRoot),
        worktreeRoot: resolvedRoot,
      });
      expect(info.commitShort).toMatch(/^[0-9a-f]+$/);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }, 15_000);

  test("returns an explicit non-git state for a plain workspace folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-plain-workspace-"));
    try {
      const info = await readWorkspaceGitInfo(root);
      const resolvedRoot = await realpath(root);

      expect(info).toMatchObject({
        branchName: "No git repo",
        commitShort: "",
        worktreeName: basename(resolvedRoot),
        worktreeRoot: resolvedRoot,
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

async function git(cwd: string, ...args: string[]) {
  await execFileAsync("git", args, { cwd });
}
