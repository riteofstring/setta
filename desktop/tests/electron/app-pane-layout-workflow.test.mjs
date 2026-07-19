#!/usr/bin/env node
/* global console */

import { join } from "node:path";
import process from "node:process";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "app-pane-layout";
const workflowTimeoutMs = 20_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/app-pane-layout-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    fixture,
    visible: options.visible,
  });
  await context.client.installDriver();
  const result = await waitForState(
    context.client,
    driverCallExpression("appPaneLayoutRoundTrip"),
    (state) => state.status === "passed" || state.status === "failed",
    workflowTimeoutMs,
  );
  if (result.status !== "passed") {
    throw new Error(`app pane layout workflow failed: ${JSON.stringify(result)}`);
  }

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    focusedPaneId: result.readBack.layout.focusedPaneId,
    status: "passed",
  });
  console.log(`Electron app pane layout workflow passed: ${artifactDir}`);
} catch (error) {
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  }).catch(() => {});
  throw error;
} finally {
  await stopElectronCdpContext(context);
}
