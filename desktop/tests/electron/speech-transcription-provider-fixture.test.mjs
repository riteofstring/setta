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

  assert.notEqual(first.apiKey, second.apiKey);
  assert.notEqual(first.clientSecret, second.clientSecret);
  assert.deepEqual(first.privacyMarkers, [first.apiKey, first.clientSecret]);
  assert.deepEqual(second.privacyMarkers, [second.apiKey, second.clientSecret]);
  assert.match(first.apiKey, /^sk-setta-global-speech-electron-fixture-[a-f0-9]{32}$/);
  assert.match(first.clientSecret, /^ek_setta_global_speech_electron_ephemeral_[a-f0-9]{32}$/);
});
