import { runPnpm } from "./lib/process.mjs";

runPnpm(["--filter", "@setta/workspace", "test"]);
runPnpm(["--filter", "@setta/playground", "test"]);

console.log("Workspace and playground component suites passed.");
