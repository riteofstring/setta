import { expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureAppReady, seedLocalStorage } from "../../helpers";

export function runGit(
  cwd: string,
  args: string[],
  envOverride?: Record<string, string>,
): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: envOverride ? { ...process.env, ...envOverride } : process.env,
  });
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

export function getWorkspaceRootOrThrow(): string {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
  return workspaceRoot;
}

const GIT_FIXTURE_DIR_NAME = ".setta-git-e2e-fixture";
const GIT_FIXTURE_SENTINEL_NAME = ".setta-git-e2e-sentinel";

export function toRepoRelativePath(
  workspaceRoot: string,
  targetPath: string,
): string {
  return path.relative(workspaceRoot, targetPath).split(path.sep).join("/");
}

type DisposableGitRepo = {
  gitDir: string;
  fixtureRoot: string;
};

async function ensureDisposableFixtureDirectory(
  workspaceRoot: string,
): Promise<string> {
  const fixtureRoot = path.join(workspaceRoot, GIT_FIXTURE_DIR_NAME);
  await fs.mkdir(fixtureRoot, { recursive: true });
  const entries = await fs.readdir(fixtureRoot);
  const nonSentinelEntries = entries.filter(
    (entry) => entry !== GIT_FIXTURE_SENTINEL_NAME,
  );
  if (nonSentinelEntries.length > 0) {
    throw new Error(
      `Refusing to run git e2e fixture in non-disposable directory: ${fixtureRoot}. Remove unexpected entries: ${nonSentinelEntries.join(
        ", ",
      )}`,
    );
  }
  await fs.writeFile(
    path.join(fixtureRoot, GIT_FIXTURE_SENTINEL_NAME),
    "setta git e2e fixture sentinel\n",
    "utf8",
  );
  return fixtureRoot;
}

export async function initializeDisposableGitRepo(
  workspaceRoot: string,
): Promise<DisposableGitRepo> {
  const gitDir = path.join(workspaceRoot, ".git");
  if (await pathExists(gitDir)) {
    throw new Error(
      `Git e2e tests require a disposable workspace root. Refusing to mutate existing repo: ${gitDir}`,
    );
  }
  const fixtureRoot = await ensureDisposableFixtureDirectory(workspaceRoot);
  runGit(workspaceRoot, ["init"]);
  runGit(workspaceRoot, ["config", "user.email", "e2e@example.com"]);
  runGit(workspaceRoot, ["config", "user.name", "E2E"]);
  await fs.writeFile(
    path.join(gitDir, "info", "exclude"),
    "setta_files/\n",
    "utf8",
  );
  return { gitDir, fixtureRoot };
}

type GitOverlayFixture = {
  repo: DisposableGitRepo;
  trackedPath: string;
  trackedRepoPath: string;
  legacyPath: string;
  legacyRepoPath: string;
  renameOldPath: string;
  renameOldRepoPath: string;
  renameNewPath: string;
  renameNewRepoPath: string;
  historyPath: string;
  historyRepoPath: string;
  untrackedPath: string;
  untrackedRepoPath: string;
  latestHistoryLabel: string | null;
};

export async function seedGitOverlayFixture(
  workspaceRoot: string,
  { historyCommitCount }: { historyCommitCount: number },
): Promise<GitOverlayFixture> {
  const repo = await initializeDisposableGitRepo(workspaceRoot);
  const trackedPath = path.join(repo.fixtureRoot, "tracked.py");
  const trackedRepoPath = toRepoRelativePath(workspaceRoot, trackedPath);
  const legacyPath = path.join(repo.fixtureRoot, "legacy.py");
  const legacyRepoPath = toRepoRelativePath(workspaceRoot, legacyPath);
  const renameOldPath = path.join(repo.fixtureRoot, "rename-old.py");
  const renameOldRepoPath = toRepoRelativePath(workspaceRoot, renameOldPath);
  const renameNewPath = path.join(repo.fixtureRoot, "rename-new.py");
  const renameNewRepoPath = toRepoRelativePath(workspaceRoot, renameNewPath);
  const historyPath = path.join(repo.fixtureRoot, "history.txt");
  const historyRepoPath = toRepoRelativePath(workspaceRoot, historyPath);
  const untrackedPath = path.join(repo.fixtureRoot, "new.py");
  const untrackedRepoPath = toRepoRelativePath(workspaceRoot, untrackedPath);
  const initPath = path.join(repo.fixtureRoot, "init.txt");
  const initRepoPath = toRepoRelativePath(workspaceRoot, initPath);

  await fs.writeFile(initPath, "git fixture init\n", "utf8");
  runGit(workspaceRoot, ["add", initRepoPath]);
  runGit(workspaceRoot, ["commit", "-m", "init"]);

  await fs.writeFile(trackedPath, "def foo():\n  return 1\n", "utf8");
  runGit(workspaceRoot, ["add", trackedRepoPath]);
  runGit(workspaceRoot, ["commit", "-m", "add tracked"]);

  await fs.writeFile(legacyPath, "legacy\n", "utf8");
  runGit(workspaceRoot, ["add", legacyRepoPath]);
  runGit(workspaceRoot, ["commit", "-m", "add legacy"]);

  await fs.writeFile(renameOldPath, "rename me\n", "utf8");
  runGit(workspaceRoot, ["add", renameOldRepoPath]);
  runGit(workspaceRoot, ["commit", "-m", "add rename source"]);

  for (let i = 0; i < historyCommitCount; i += 1) {
    const label = i.toString().padStart(3, "0");
    await fs.writeFile(historyPath, `history ${label}\n`, "utf8");
    runGit(workspaceRoot, ["add", historyRepoPath]);
    runGit(workspaceRoot, ["commit", "-m", `history-${label}`]);
  }

  // Create both staged + unstaged changes for the same file.
  await fs.writeFile(trackedPath, "def foo():\n  return 2\n", "utf8");
  runGit(workspaceRoot, ["add", trackedRepoPath]);
  await fs.writeFile(trackedPath, "def foo():\n  return 3\n", "utf8");
  await fs.writeFile(untrackedPath, "def bar():\n  return 'hello'\n", "utf8");
  await fs.rm(legacyPath, { force: true });
  runGit(workspaceRoot, ["add", legacyRepoPath]);
  runGit(workspaceRoot, ["mv", renameOldRepoPath, renameNewRepoPath]);

  const latestHistoryLabel =
    historyCommitCount > 0
      ? `history-${(historyCommitCount - 1).toString().padStart(3, "0")}`
      : null;

  return {
    repo,
    trackedPath,
    trackedRepoPath,
    legacyPath,
    legacyRepoPath,
    renameOldPath,
    renameOldRepoPath,
    renameNewPath,
    renameNewRepoPath,
    historyPath,
    historyRepoPath,
    untrackedPath,
    untrackedRepoPath,
    latestHistoryLabel,
  };
}

export async function cleanupGitOverlayFixture(
  fixture: GitOverlayFixture,
): Promise<void> {
  await fs.rm(fixture.repo.fixtureRoot, { recursive: true, force: true });
  await fs.rm(fixture.repo.gitDir, { recursive: true, force: true });
}

export async function openGitOverview(page: Page): Promise<void> {
  await seedLocalStorage(page, {
    overviewTab: "Git",
    overviewVis: true,
    gitGraphSplitPct: 56,
    gitGraphColWidthPx: 120,
    gitGraphAuthorWidthPx: 120,
    gitGraphDateWidthPx: 110,
    gitGraphHashWidthPx: 84,
  });
  await ensureAppReady(page);
  await expect(page.getByRole("heading", { name: "Git" })).toBeVisible();
}
