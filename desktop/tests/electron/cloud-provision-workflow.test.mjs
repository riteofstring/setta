#!/usr/bin/env node
/* global console, process */

import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertBuildExists,
  captureScreenshot,
  configureChatWorkflowHarness,
  createFixture,
  failureWithLogs,
  launchContext,
  pathTimestamp,
  stopLaunchedContext,
} from "./chat-workflow-harness.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "../..");
const repoRoot = resolve(desktopRoot, "..");
const options = parseArgs(process.argv.slice(2));
configureChatWorkflowHarness({ visible: options.visible });
const recordingRoot = options.keepArtifacts
  ? join(repoRoot, "test-results", "electron-integration", "cloud-provision", pathTimestamp())
  : join(repoRoot, "test-results", "electron-integration", "cloud-provision");

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/cloud-provision-workflow.test.mjs [--visible] [--keep-artifacts]",
  );
  process.exit(0);
}

assertBuildExists();
await mkdir(recordingRoot, { recursive: true });

const fixture = await createFixture("cloud-provision");
const recordingDir = join(recordingRoot, "workflow");
let context = null;

try {
  const fakeSettaCLIPath = await writeFakeProvisionCLI(fixture.tempRoot);
  context = await launchContext(fixture, recordingDir, {
    extraEnv: {
      SETTA_CLI_PATH: fakeSettaCLIPath,
    },
  });

  const result = await context.client.evaluate(`(async () => {
    const options = await window.setta.runtimes.cloudProvisionOptions();
    const resolution = await window.setta.runtimes.cloudProvisionResolve({
      intent: "cheap box for agents",
      provider: "hetzner",
      shape: "dev-standard",
      region: "fsn1"
    });
    return { options, resolution };
  })()`);

  if (
    result.options.defaultProvider !== "hetzner" ||
    result.options.defaultShape !== "dev-standard" ||
    result.resolution.constraints.intent !== "cheap box for agents" ||
    result.resolution.resolution.instanceType !== "cx42" ||
    result.resolution.resolution.region !== "fsn1" ||
    result.resolution.resolution.approval.secretFree !== true
  ) {
    throw new Error(`unexpected cloud provision result: ${JSON.stringify(result)}`);
  }

  await writeFile(
    join(recordingDir, "cloud-provision-summary.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(`Electron cloud provision workflow passed: ${recordingDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(recordingDir, "failure.png")).catch(() => {});
  }
  throw context ? failureWithLogs(error, context.electron.logs) : error;
} finally {
  await stopLaunchedContext(context);
}

function parseArgs(args) {
  const parsed = {
    help: false,
    keepArtifacts: false,
    visible: process.env.SETTA_E2E_VISIBLE === "1",
  };
  for (const arg of args) {
    switch (arg) {
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--keep-artifacts":
        parsed.keepArtifacts = true;
        break;
      case "--visible":
        parsed.visible = true;
        break;
      default:
        throw new Error(`unknown cloud provision workflow argument: ${arg}`);
    }
  }
  return parsed;
}

async function writeFakeProvisionCLI(root) {
  const path = join(root, "fake-setta-provision.cjs");
  await writeFile(path, fakeProvisionCLISource(), { mode: 0o700 });
  await chmod(path, 0o700);
  return path;
}

function fakeProvisionCLISource() {
  return [
    "#!/usr/bin/env node",
    "",
    "const args = process.argv.slice(2);",
    'if (args[0] !== "provision") {',
    '  throw new Error("expected setta provision, got " + args.join(" "));',
    "}",
    "",
    'if (args[1] === "shapes" && args[2] === "--json") {',
    "  process.stdout.write(JSON.stringify({",
    "    ok: true,",
    '    defaultShape: "dev-standard",',
    "    catalog: {",
    "      schemaVersion: 1,",
    '      defaultProvider: "hetzner",',
    '      shapes: [{ id: "dev-standard", label: "Dev standard", guide: "4 vCPU / 16 GB RAM", cpuMin: 4, memoryGbMin: 16, diskFloorGb: 64 }],',
    "      providers: [{",
    '        id: "hetzner",',
    '        displayName: "Hetzner Cloud",',
    '        pricingUrl: "https://www.hetzner.com/cloud",',
    '        regionPreferences: ["fsn1"],',
    '        imageSelector: { kind: "image_alias", value: "ubuntu-24.04", description: "Hetzner stable Ubuntu image alias" },',
    '        mappings: { "dev-standard": { instanceType: "cx42", costClass: "standard" } }',
    "      }]",
    "    }",
    '  }) + "\\n");',
    "  process.exit(0);",
    "}",
    "",
    'if (args[1] === "resolve" && args[2] === "--json") {',
    '  if (!args.includes("--intent") || !args.includes("cheap box for agents")) {',
    '    throw new Error("resolve did not receive intent");',
    "  }",
    "  const resolution = {",
    '    provider: "hetzner", displayName: "Hetzner Cloud", shape: "dev-standard", source: "catalog", instanceType: "cx42", region: "fsn1", regionOptions: ["fsn1"], diskGb: 64,',
    "    machine: { cpus: 4, memoryGb: 16, diskGb: 64 },",
    '    imageSelector: { kind: "image_alias", value: "ubuntu-24.04", description: "Hetzner stable Ubuntu image alias" },',
    '    cost: { kind: "class", class: "standard", pricingUrl: "https://www.hetzner.com/cloud", description: "catalog cost class" },',
    "    approval: { requiresMutationApproval: true, commandPreview: [], secretFree: true }",
    "  };",
    "  process.stdout.write(JSON.stringify({",
    "    ok: true,",
    '    request: { provider: "hetzner", shape: "dev-standard", constraints: { intent: "cheap box for agents", regionPreference: "fsn1" } },',
    "    resolution,",
    "    candidates: [resolution]",
    '  }) + "\\n");',
    "  process.exit(0);",
    "}",
    "",
    'throw new Error("unexpected setta provision command " + args.join(" "));',
    "",
  ].join("\n");
}
