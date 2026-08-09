import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { repositoryRoot, run } from "./process.mjs";

const ignoredDirectoryNames = new Set([".git", ".reports", "coverage", "dist", "node_modules"]);

const projectDirectories = ["apps", "docs", "packages", "scripts"];
const rootFiles = [
  ".gitattributes",
  ".gitignore",
  ".node-version",
  ".prettierignore",
  ".prettierrc.json",
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "dependency-license-policy.json",
  "eslint.config.js",
  "knip.json",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "supply-chain-exceptions.json",
  "supply-chain-policy.json",
];

function walk(relativeDirectory) {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
  if (!existsSync(absoluteDirectory)) {
    return [];
  }

  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) {
      return [];
    }

    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      return walk(relativePath);
    }
    return entry.isFile() ? [relativePath] : [];
  });
}

export function listProjectFiles() {
  const nestedFiles = projectDirectories.flatMap(walk);
  const existingRootFiles = rootFiles.filter((file) => existsSync(path.join(repositoryRoot, file)));
  return [...existingRootFiles, ...nestedFiles].sort();
}

function gitPaths(args) {
  const output = run("git", args, { capture: true }).stdout;
  return output.split("\n").filter(Boolean);
}

function isProjectFile(relativePath) {
  const normalizedPath = relativePath.split(path.sep).join("/");
  const isRootFile = rootFiles.includes(normalizedPath);
  const isNestedFile = projectDirectories.some((directory) =>
    normalizedPath.startsWith(`${directory}/`),
  );
  return (isRootFile || isNestedFile) && existsSync(path.join(repositoryRoot, normalizedPath));
}

export function selectFiles(args) {
  if (args[0] === "--all") {
    return listProjectFiles();
  }
  if (args[0] === "--staged") {
    return gitPaths(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]).filter(
      isProjectFile,
    );
  }
  if (args[0] === "--files") {
    return args.slice(1).filter(isProjectFile);
  }

  const changedFiles = gitPaths(["diff", "HEAD", "--name-only", "--diff-filter=ACMR"]);
  const untrackedFiles = gitPaths(["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...changedFiles, ...untrackedFiles].filter(isProjectFile))].sort();
}

export function workspaceManifestPaths() {
  return ["packages", "apps"].flatMap((groupDirectory) => {
    const absoluteGroup = path.join(repositoryRoot, groupDirectory);
    if (!existsSync(absoluteGroup)) {
      return [];
    }
    return readdirSync(absoluteGroup, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${groupDirectory}/${entry.name}/package.json`)
      .filter((relativePath) => existsSync(path.join(repositoryRoot, relativePath)));
  });
}

export function isTestFile(relativePath) {
  return (
    /(?:^|\/)(?:tests|__tests__)\//.test(relativePath) || /\.(?:test|spec)\./.test(relativePath)
  );
}
