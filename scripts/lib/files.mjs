import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { repositoryRoot } from "./process.mjs";

function manifestPathsIn(groupDirectory) {
  const absoluteGroup = path.join(repositoryRoot, groupDirectory);
  if (!existsSync(absoluteGroup)) {
    return [];
  }
  return readdirSync(absoluteGroup, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${groupDirectory}/${entry.name}/package.json`)
    .filter((relativePath) => existsSync(path.join(repositoryRoot, relativePath)));
}

export function workspaceManifestPaths() {
  return ["packages", "apps", "fixtures"].flatMap(manifestPathsIn);
}

export function isTestFile(relativePath) {
  return (
    /(?:^|\/)(?:tests|__tests__)\//.test(relativePath) || /\.(?:test|spec)\./.test(relativePath)
  );
}
