import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export function repositoryRevision(repositoryRoot) {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

export function resolveRevision(repositoryRoot, revision) {
  return execFileSync("git", ["rev-parse", `${revision}^{commit}`], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

export function productSourceDifferences(repositoryRoot, referenceRevision) {
  return execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      referenceRevision,
      "--",
      "apps/playground/src",
      "apps/python-canvas/src",
      "packages/workspace/src",
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
}

export function artifactHashes(repositoryRoot) {
  const roots = [
    path.join(repositoryRoot, "apps", "python-canvas", "dist"),
    path.join(repositoryRoot, "packages", "workspace", "dist"),
  ];
  const files = [];
  const visit = (candidatePath) => {
    if (lstatSync(candidatePath).isDirectory()) {
      for (const entry of readdirSync(candidatePath).sort()) {
        visit(path.join(candidatePath, entry));
      }
      return;
    }
    files.push(candidatePath);
  };
  for (const root of roots) {
    visit(root);
  }
  return Object.fromEntries(
    files.map((filePath) => [
      path.relative(repositoryRoot, filePath),
      createHash("sha256").update(readFileSync(filePath)).digest("hex"),
    ]),
  );
}
