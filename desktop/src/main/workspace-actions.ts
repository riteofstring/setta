import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import type { WorkspaceGitInfo } from "@shared/types";

const execFileAsync = promisify(execFile);

export function createVSCodeWorkspaceURI(rootPath: string) {
  if (!rootPath) {
    throw new Error("workspace path is required");
  }
  return `vscode://file${pathToFileURL(resolve(rootPath)).pathname}`;
}

export async function readWorkspaceGitInfo(rootPath: string): Promise<WorkspaceGitInfo> {
  if (!rootPath) {
    throw new Error("workspace path is required");
  }
  const worktreeRoot = await gitOutputOrNull(rootPath, ["rev-parse", "--show-toplevel"]);
  if (!worktreeRoot) {
    const resolvedRoot = await realpath(rootPath);
    return {
      branchName: "No git repo",
      commitShort: "",
      worktreeName: basename(resolvedRoot) || resolvedRoot,
      worktreeRoot: resolvedRoot,
    };
  }
  const branchName = await gitOutput(rootPath, ["branch", "--show-current"]);
  const commitShort = await gitOutput(rootPath, ["rev-parse", "--short", "HEAD"]);
  return {
    branchName: branchName || "detached",
    commitShort,
    worktreeName: basename(worktreeRoot) || worktreeRoot,
    worktreeRoot,
  };
}

async function gitOutput(rootPath: string, args: string[]) {
  const result = await execFileAsync("git", ["-C", rootPath, ...args], {
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout.trim();
}

async function gitOutputOrNull(rootPath: string, args: string[]) {
  try {
    return await gitOutput(rootPath, args);
  } catch (error) {
    if (isGitExit(error)) {
      return null;
    }
    throw error;
  }
}

function isGitExit(error: unknown) {
  return (
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "number"
  );
}
