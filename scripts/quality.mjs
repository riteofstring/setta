import path from "node:path";

import { selectFiles } from "./lib/files.mjs";
import { repositoryRoot, run, runPnpm } from "./lib/process.mjs";

const selectedFiles = selectFiles(process.argv.slice(2));
const formattingFiles = selectedFiles.filter((relativePath) =>
  /\.(css|html|js|json|md|mjs|ts|tsx|yaml|yml)$/.test(relativePath),
);
const eslintFiles = selectedFiles.filter((relativePath) => /\.(js|mjs|ts|tsx)$/.test(relativePath));

if (selectedFiles.length === 0) {
  console.log("No supported files to check.");
  process.exit(0);
}

console.log(`Checking ${selectedFiles.length} project files.`);
runPnpm(["run", "check:boundaries"]);
runPnpm(["run", "check:dependencies"]);

if (formattingFiles.length > 0) {
  runPnpm(["exec", "prettier", "--check", ...formattingFiles]);
}
if (eslintFiles.length > 0) {
  runPnpm(["exec", "eslint", "--max-warnings", "0", ...eslintFiles]);
}

run(process.execPath, [
  path.join(repositoryRoot, "scripts/check-file-lengths.mjs"),
  "--files",
  ...selectedFiles,
]);
runPnpm(["run", "typecheck"]);
runPnpm(["run", "knip"]);
runPnpm(["run", "test:unit"]);
runPnpm(["run", "test:automation"]);
runPnpm(["run", "build"]);
runPnpm(["run", "pack:check"]);
runPnpm(["run", "api:report"]);

console.log("Deterministic quality checks passed.");
