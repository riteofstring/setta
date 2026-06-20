#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { electronWorkflowNames, electronWorkflows } from "./workflows.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printUsage();
  process.exit(0);
}

if (options.list) {
  for (const workflow of electronWorkflows) {
    process.stdout.write(`${workflow.name}\t${workflow.tiers.join(",")}\t${workflow.file}\n`);
  }
  process.exit(0);
}

const selectedWorkflows = selectWorkflows(options);
if (selectedWorkflows.length === 0) {
  throw new Error("no Electron workflows matched the requested filters");
}

let status = 0;
const passed = [];
const failed = [];
for (const workflow of selectedWorkflows) {
  const result = await runWorkflow(workflow, options);
  if (result === 0) {
    passed.push(workflow.name);
    continue;
  }
  failed.push(workflow.name);
  status = result;
  if (!options.keepGoing) {
    break;
  }
}

process.stdout.write("Electron workflow manifest summary:\n");
for (const name of passed) {
  process.stdout.write(`  passed: ${name}\n`);
}
for (const name of failed) {
  process.stdout.write(`  failed: ${name}\n`);
}

process.exitCode = status;

function parseArgs(args) {
  const parsed = {
    extraWorkflowArgs: [],
    help: false,
    keepArtifacts: false,
    keepGoing: false,
    list: false,
    tiers: [],
    visible: false,
    workflows: [],
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const handler = argHandlerFor(arg);
    if (!handler) {
      throw new Error(`unknown Electron workflow runner argument: ${arg}`);
    }
    index += handler(parsed, args, index);
  }
  if (parsed.tiers.length === 0 && parsed.workflows.length === 0 && !parsed.list) {
    parsed.tiers.push("required");
  }
  return parsed;
}

function argHandlerFor(arg) {
  return {
    "--artifact-dir": parseArtifactDir,
    "--help": parseHelp,
    "--keep-artifacts": parseKeepArtifacts,
    "--keep-going": parseKeepGoing,
    "--list": parseList,
    "--skip-build": parseSkipBuild,
    "--tier": parseTier,
    "--visible": parseVisible,
    "--workflow": parseWorkflow,
    "-h": parseHelp,
  }[arg];
}

function parseHelp(parsed) {
  parsed.help = true;
  return 0;
}

function parseKeepArtifacts(parsed) {
  parsed.keepArtifacts = true;
  return 0;
}

function parseKeepGoing(parsed) {
  parsed.keepGoing = true;
  return 0;
}

function parseList(parsed) {
  parsed.list = true;
  return 0;
}

function parseSkipBuild() {
  return 0;
}

function parseVisible(parsed) {
  parsed.visible = true;
  return 0;
}

function parseArtifactDir(parsed, args, index) {
  const artifactDir = requiredArgValue(args, index, "--artifact-dir");
  parsed.extraWorkflowArgs.push("--artifact-dir", artifactDir);
  return 1;
}

function parseTier(parsed, args, index) {
  parsed.tiers.push(requiredArgValue(args, index, "--tier"));
  return 1;
}

function parseWorkflow(parsed, args, index) {
  parsed.workflows.push(requiredArgValue(args, index, "--workflow"));
  return 1;
}

function requiredArgValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printUsage() {
  process.stdout.write(`Usage: node desktop/tests/electron/run-workflows.mjs [options]

Options:
  --tier <required|performance|refactor|live|all>
                                           Run workflows in a manifest tier.
  --workflow <name>                       Run one named workflow; repeatable.
  --visible                               Show Electron windows for workflows that support it.
  --keep-artifacts                        Keep timestamped workflow artifacts where supported.
  --keep-going                            Continue after a workflow fails.
  --list                                  Print registered workflows.

Registered workflows:
  ${electronWorkflowNames().join("\n  ")}
`);
}

function selectWorkflows(parsed) {
  const requestedNames = new Set(parsed.workflows);
  const requestedTiers = new Set(parsed.tiers);
  for (const name of requestedNames) {
    if (!electronWorkflowNames().includes(name)) {
      throw new Error(`unknown Electron workflow: ${name}`);
    }
  }
  return electronWorkflows.filter((workflow) => {
    if (requestedNames.has(workflow.name)) {
      return true;
    }
    if (requestedTiers.has("all")) {
      return true;
    }
    return workflow.tiers.some((tier) => requestedTiers.has(tier));
  });
}

async function runWorkflow(workflow, parsed) {
  const workflowArgs = [...(workflow.args ?? [])];
  if (parsed.visible) {
    workflowArgs.push("--visible");
  }
  if (parsed.keepArtifacts) {
    workflowArgs.push("--keep-artifacts");
  }
  workflowArgs.push(...parsed.extraWorkflowArgs);
  process.stdout.write(`Electron workflow starting: ${workflow.name}\n`);
  const child = spawn(process.execPath, [join(scriptDir, workflow.file), ...workflowArgs], {
    cwd: join(scriptDir, "../.."),
    env: process.env,
    stdio: "inherit",
  });
  return new Promise((resolvePromise) => {
    child.once("exit", (code, signal) => {
      if (signal) {
        process.stderr.write(`Electron workflow ${workflow.name} exited by signal ${signal}\n`);
        resolvePromise(1);
        return;
      }
      resolvePromise(code ?? 1);
    });
  });
}
