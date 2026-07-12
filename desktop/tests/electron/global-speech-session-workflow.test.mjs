#!/usr/bin/env node
/* global console */

import { readdir, readFile, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import process from "node:process";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { startSpeechTranscriptionProviderFixture } from "./speech-transcription-provider-fixture.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "global-speech-session";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/global-speech-session-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const provider = await startSpeechTranscriptionProviderFixture();
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      OPENAI_API_KEY: provider.apiKey,
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: provider.baseURL,
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');

  const capabilities = await context.client.evaluate("window.setta.speech.readCapabilities()");
  assertConfiguredCapabilities(capabilities);
  const session = await context.client.evaluate("window.setta.speech.createTranscriptionSession()");
  assertTranscriptionSession(session, provider.clientSecret);
  const easyButtonPaneCount = await context.client.evaluate(
    "document.querySelectorAll('[data-testid=\"easy-button-surface\"]').length",
  );
  if (easyButtonPaneCount !== 0) {
    throw new Error(
      `global transcription session required ${easyButtonPaneCount} Easy Button panes`,
    );
  }
  provider.assertHealthy();
  if (
    provider.requests.length !== 1 ||
    provider.requests[0]?.path !== "/v1/realtime/client_secrets"
  ) {
    throw new Error(`unexpected provider operations: ${JSON.stringify(provider.requests)}`);
  }

  await captureScreenshot(context.client, join(artifactDir, "global-speech-session.png"));
  await stopElectronCdpContext(context);
  context = null;
  await assertNoSensitiveSpeechArtifacts(artifactDir, [provider.apiKey, provider.clientSecret]);
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    easyButtonPaneCount,
    providerOperationCount: provider.requests.length,
    status: "passed",
  });
  console.log(`Electron global speech session workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  });
  throw error;
} finally {
  await stopElectronCdpContext(context);
  await provider.close();
  await rm(fixture.tempRoot, { force: true, recursive: true });
}

function assertConfiguredCapabilities(capabilities) {
  if (
    capabilities?.providerStatus !== "configured" ||
    capabilities.transcriptionModel !== "gpt-realtime-whisper" ||
    capabilities.maximumRecordingSeconds !== 120 ||
    capabilities.maximumTranscriptCharacters !== 8000
  ) {
    throw new Error(`invalid global speech capabilities: ${JSON.stringify(capabilities)}`);
  }
}

function assertTranscriptionSession(session, expectedSecret) {
  if (
    session?.clientSecret !== expectedSecret ||
    session.transcriptionModel !== "gpt-realtime-whisper" ||
    session.transcriptionDelay !== "medium" ||
    session.maximumRecordingSeconds !== 120 ||
    session.maximumTranscriptCharacters !== 8000 ||
    session.webRTCURL !== "https://api.openai.com/v1/realtime/calls"
  ) {
    throw new Error("global speech workflow received an invalid transcription session");
  }
}

async function assertNoSensitiveSpeechArtifacts(root, markers) {
  for (const path of await textArtifactPaths(root)) {
    const content = await readFile(path, "utf8");
    for (const marker of markers) {
      if (content.includes(marker)) {
        throw new Error(`private speech credential leaked into ${path}`);
      }
    }
  }
}

async function textArtifactPaths(root) {
  const paths = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await textArtifactPaths(path)));
    } else if ([".json", ".jsonl", ".log", ".txt"].includes(extname(entry.name))) {
      paths.push(path);
    }
  }
  return paths;
}
