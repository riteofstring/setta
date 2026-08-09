import { existsSync } from "node:fs";
import path from "node:path";

import { selectFiles } from "./lib/files.mjs";
import { repositoryRoot, run, runPnpm } from "./lib/process.mjs";

const selectedFiles = selectFiles(process.argv.slice(2));
const formattingFiles = selectedFiles.filter((relativePath) =>
  /\.(?:css|html|js|json|md|mjs|ts|tsx|yaml|yml)$/.test(relativePath),
);
const eslintFiles = selectedFiles.filter((relativePath) =>
  /\.(?:js|mjs|ts|tsx)$/.test(relativePath),
);
const shellFiles = selectedFiles.filter((relativePath) => relativePath.endsWith(".sh"));

if (selectedFiles.length === 0) {
  console.log("No supported files to check.");
  process.exit(0);
}

function typecheckProjects() {
  const candidates = ["packages", "apps"].flatMap((groupDirectory) => {
    const absoluteGroup = path.join(repositoryRoot, groupDirectory);
    if (!existsSync(absoluteGroup)) {
      return [];
    }
    return run("git", ["ls-files", `${groupDirectory}/*/tsconfig.json`], { capture: true })
      .stdout.split("\n")
      .filter(Boolean);
  });
  return candidates.filter((relativePath) => existsSync(path.join(repositoryRoot, relativePath)));
}

console.log(`Checking ${selectedFiles.length} project files.`);
run(process.execPath, [path.join(repositoryRoot, "scripts/check-dependencies.mjs")]);
run(process.execPath, [path.join(repositoryRoot, "scripts/check-package-boundary.mjs")]);

if (formattingFiles.length > 0) {
  runPnpm(["exec", "prettier", "--check", ...formattingFiles]);
}
if (shellFiles.length > 0) {
  for (const shellFile of shellFiles) {
    run("bash", ["-n", shellFile]);
  }
  console.log(`Shell syntax passed for ${shellFiles.length} file(s).`);
}
if (eslintFiles.length > 0) {
  runPnpm(["exec", "eslint", "--max-warnings", "0", ...eslintFiles]);
}

run(process.execPath, [
  path.join(repositoryRoot, "scripts/check-file-lengths.mjs"),
  "--files",
  ...selectedFiles,
]);

const tsconfigPaths = typecheckProjects();
if (tsconfigPaths.length === 0) {
  console.log("No TypeScript projects yet; skipping typecheck.");
}
// The playground typechecks and resolves against the built package (`exports` points at dist),
// so the static gate demands the artifact rather than silently skipping or building here.
const workspaceDeclarationsPath = "packages/workspace/dist/types/index.d.ts";
if (
  existsSync(path.join(repositoryRoot, "packages/workspace")) &&
  !existsSync(path.join(repositoryRoot, workspaceDeclarationsPath))
) {
  console.error(
    `${workspaceDeclarationsPath} is missing; run \`pnpm --filter @setta/workspace build\` before the quality gate.`,
  );
  process.exit(1);
}
for (const tsconfigPath of tsconfigPaths) {
  runPnpm(["exec", "tsc", "-p", tsconfigPath, "--noEmit", "--pretty", "false"]);
}

runPnpm(["exec", "knip"]);

console.log("Static quality checks passed.");
