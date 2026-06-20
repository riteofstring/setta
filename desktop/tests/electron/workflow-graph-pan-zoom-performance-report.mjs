#!/usr/bin/env node
/* global console */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

import {
  appendPhase0PerformanceReport,
  panZoomPerformanceReportMarkdown,
  parsePanZoomPerformanceArtifacts,
} from "./workflow-graph-phase0-performance-report.mjs";
import { writeJson } from "./electron-cdp-harness.mjs";

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  console.log(`Usage: node desktop/tests/electron/workflow-graph-pan-zoom-performance-report.mjs --artifact-root <dir> [--phase <phase0|phase3|phase7>] [--json-out <path>] [--markdown-out <path>] [--write-report]

Parses saved workflow graph pan/zoom recording artifacts and emits the shared
performance report used by the deterministic Electron workflow.`);
  process.exit(0);
}

if (!options.artifactRoot) {
  throw new Error("--artifact-root is required");
}

const report = await parsePanZoomPerformanceArtifacts({
  artifactRoot: options.artifactRoot,
  phase: options.phase,
});
const markdown = panZoomPerformanceReportMarkdown(report);

if (options.jsonOut) {
  await writeJson(options.jsonOut, report);
}
if (options.markdownOut) {
  await mkdir(dirname(options.markdownOut), { recursive: true });
  await writeFile(options.markdownOut, markdown);
}
if (options.writeReport) {
  await appendPhase0PerformanceReport(report);
}
if (!options.jsonOut && !options.markdownOut && !options.writeReport) {
  process.stdout.write(markdown);
}

function parseArgs(args) {
  const parsed = {
    artifactRoot: "",
    help: false,
    jsonOut: "",
    markdownOut: "",
    phase: "phase0",
    writeReport: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--artifact-root":
        parsed.artifactRoot = resolve(requiredValue(args, index, arg));
        index += 1;
        break;
      case "--json-out":
        parsed.jsonOut = resolve(requiredValue(args, index, arg));
        index += 1;
        break;
      case "--markdown-out":
        parsed.markdownOut = resolve(requiredValue(args, index, arg));
        index += 1;
        break;
      case "--phase":
        parsed.phase = requiredValue(args, index, arg);
        index += 1;
        break;
      case "--write-report":
        parsed.writeReport = true;
        break;
      case "-h":
      case "--help":
        parsed.help = true;
        break;
      default:
        throw new Error(`unknown pan/zoom report argument: ${arg}`);
    }
  }
  return parsed;
}

function requiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}
