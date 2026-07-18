/* global fetch */

import assert from "node:assert/strict";
import test from "node:test";

import { startSpeechTranscriptionProviderFixture } from "./speech-transcription-provider-fixture.mjs";

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
