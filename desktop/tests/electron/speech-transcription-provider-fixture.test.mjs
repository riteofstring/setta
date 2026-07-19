/* global fetch */

import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedSynthesisSpeed,
  startSpeechTranscriptionProviderFixture,
} from "./speech-transcription-provider-fixture.mjs";

test("fake speech provider emits fixture-unique credential privacy markers", async (t) => {
  const first = await startSpeechTranscriptionProviderFixture();
  t.after(async () => {
    await first.close();
  });
  const second = await startSpeechTranscriptionProviderFixture();
  t.after(async () => {
    await second.close();
  });
  const replacement = first.createCredential("replacement");
  const rejected = first.createRejectedAPIKey("rejected");

  assert.notEqual(first.apiKey, second.apiKey);
  assert.notEqual(first.clientSecret, second.clientSecret);
  assert.deepEqual(first.privacyMarkers, [
    first.apiKey,
    first.clientSecret,
    replacement.apiKey,
    replacement.clientSecret,
    rejected,
  ]);
  assert.deepEqual(second.privacyMarkers, [second.apiKey, second.clientSecret]);
  assert.match(first.apiKey, /^sk-setta-global-speech-electron-fixture-initial-[a-f0-9]{32}$/);
  assert.match(
    first.clientSecret,
    /^ek_setta_global_speech_electron_ephemeral_initial_[a-f0-9]{32}$/,
  );
  assert.match(
    replacement.apiKey,
    /^sk-setta-global-speech-electron-fixture-replacement-[a-f0-9]{32}$/,
  );
  assert.match(rejected, /^sk-setta-global-speech-electron-fixture-rejected-[a-f0-9]{32}$/);

  const rejectedResponse = await fetch(`${first.baseURL}/realtime/client_secrets`, {
    headers: { Authorization: `Bearer ${rejected}` },
    method: "POST",
  });
  assert.equal(rejectedResponse.status, 401);
  assert.deepEqual(first.requests.at(-1), {
    credentialLabel: null,
    path: "/v1/realtime/client_secrets",
    rejected: true,
    status: 401,
  });
  first.assertHealthy();
});

test("fake speech provider fails unexpected paths before credential rejection", async (t) => {
  const provider = await startSpeechTranscriptionProviderFixture();
  t.after(async () => {
    await provider.close();
  });

  const rejected = provider.createRejectedAPIKey("unexpected-path");
  const response = await fetch(`${provider.baseURL}/unknown`, {
    headers: { Authorization: `Bearer ${rejected}` },
    method: "POST",
  });
  assert.equal(response.status, 500);
  assert.throws(() => provider.assertHealthy(), /unexpected provider request: POST \/v1\/unknown/);
});

test("fake speech provider requires and records synthesis speed", async (t) => {
  const provider = await startSpeechTranscriptionProviderFixture();
  t.after(async () => {
    await provider.close();
  });

  const response = await fetch(`${provider.baseURL}/audio/speech`, {
    body: JSON.stringify({
      input: "The answer is ready.",
      model: "gpt-4o-mini-tts",
      response_format: "pcm",
      speed: expectedSynthesisSpeed,
      voice: "marin",
    }),
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(provider.requests.at(-1), {
    credentialLabel: "initial",
    input: "The answer is ready.",
    path: "/v1/audio/speech",
    rejected: false,
    speed: expectedSynthesisSpeed,
    voice: "marin",
  });
  provider.assertHealthy();
});

test("fake speech provider rejects synthesis without speed", async (t) => {
  const provider = await startSpeechTranscriptionProviderFixture();
  t.after(async () => {
    await provider.close();
  });

  const response = await fetch(`${provider.baseURL}/audio/speech`, {
    body: JSON.stringify({
      input: "The answer is ready.",
      model: "gpt-4o-mini-tts",
      response_format: "pcm",
      voice: "marin",
    }),
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  assert.equal(response.status, 500);
  assert.throws(() => provider.assertHealthy(), /invalid request/);
});
