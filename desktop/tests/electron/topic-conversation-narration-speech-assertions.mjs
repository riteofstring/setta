import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";

import { waitForState } from "./electron-cdp-harness.mjs";
import { expectedSynthesisSpeed } from "./speech-transcription-provider-fixture.mjs";
import { readJsonLinesWhileAppending } from "./topic-conversation-master-overlay-assertions.mjs";

export async function waitForAutomaticNarrationStatusPlayback({
  client,
  initialRequestCount,
  provider,
  resolvedVoiceId,
  text,
  timeoutMs,
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const request = findSpeechRequest(provider, initialRequestCount, text, resolvedVoiceId);
    if (request) {
      const audio = await waitForState(
        client,
        "globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()",
        (state) => state.audioPlayCount > state.audioEndCount,
        timeoutMs,
      );
      provider.assertHealthy();
      return { audio, providerRequest: request };
    }
    await client.evaluate("globalThis.__settaSpeechRealtimeBrowserFixture.finishAllAudio()");
    await delay(20);
  }
  throw new Error("automatic narrator status playback did not reach the speech provider");
}

export async function waitForNarrationProviderRequest({
  initialRequestCount,
  provider,
  resolvedVoiceId,
  text,
  timeoutMs,
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const request = findSpeechRequest(provider, initialRequestCount, text, resolvedVoiceId);
    if (request) {
      provider.assertHealthy();
      return request;
    }
    await delay(20);
  }
  throw new Error("pane-free terminal narration playback did not reach the speech provider");
}

function findSpeechRequest(provider, initialRequestCount, text, resolvedVoiceId) {
  return provider.requests
    .slice(initialRequestCount)
    .find(
      (candidate) =>
        candidate.path === "/v1/audio/speech" &&
        candidate.input === text &&
        candidate.speed === expectedSynthesisSpeed &&
        candidate.voice === resolvedVoiceId,
    );
}

export function assertRecordedNarrationSynthesis(
  event,
  conversationId,
  narrationEventId,
  resolvedVoiceId,
) {
  const operation = event.args?.[0];
  if (
    event.channel !== "speech:synthesize" ||
    typeof operation?.operationId !== "string" ||
    !operation.operationId.startsWith("speech_") ||
    operation.request?.resolvedVoiceId !== resolvedVoiceId
  ) {
    throw new Error(`automatic narration synthesis source drifted: ${JSON.stringify(event)}`);
  }
  assertRecordedNarratorSource(operation.request.source, conversationId, narrationEventId, event);
}

function assertRecordedNarratorSource(source, conversationId, narrationEventId, event) {
  if (
    source?.speaker !== "narrator" ||
    source.conversationId !== conversationId ||
    source.eventId !== narrationEventId
  ) {
    throw new Error(`automatic narration synthesis source drifted: ${JSON.stringify(event)}`);
  }
}

export async function waitForRecordedSpeechSynthesis({
  artifactDirectory,
  narrationEventId,
  timeoutMs,
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const events = await readJsonLinesWhileAppending(join(artifactDirectory, "ipc.jsonl"));
    const synthesis = events.find(
      (event) =>
        event.type === "ipc_start" &&
        event.channel === "speech:synthesize" &&
        event.args?.[0]?.request?.source?.eventId === narrationEventId,
    );
    if (synthesis) {
      return synthesis;
    }
    await delay(20);
  }
  throw new Error(`speech synthesis IPC was not recorded for narration ${narrationEventId}`);
}

export async function waitForRecordedConversationKeepAlive({
  artifactDirectory,
  conversationId,
  timeoutMs,
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const events = await readJsonLinesWhileAppending(join(artifactDirectory, "ipc.jsonl"));
    const release = events.find(
      (event) =>
        event.type === "ipc_start" &&
        event.channel === "conversation:release-events" &&
        event.args?.[0]?.conversationId === conversationId &&
        event.args[0].keepAlive === true,
    );
    if (release && events.some((event) => event.type === "ipc_finish" && event.id === release.id)) {
      return release;
    }
    await delay(20);
  }
  throw new Error(`conversation stream was not retained for pane-free work ${conversationId}`);
}
