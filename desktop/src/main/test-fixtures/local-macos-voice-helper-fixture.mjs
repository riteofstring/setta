import { createInterface } from "node:readline";

const mode = process.argv[2] ?? "ok";
const sessions = new Map();
const synthesisOperations = new Map();
const listenerPauseReasons = new Set();
let microphoneOwner = null;
let listenerActive = false;
const localVoiceIds = [
  "com.apple.voice.compact.en-US.Samantha",
  "com.apple.voice.compact.en-US.Alex",
];
const minimalWavBase64 = "UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==";
const input = createInterface({ input: process.stdin });
const commandHandlers = new Map([
  ["cancel_capture", handleCancelCapture],
  ["cancel_synthesis", handleCancelSynthesis],
  ["finish_capture", handleFinishCapture],
  ["list_voices", handleListVoices],
  ["pause_listener", handlePauseListener],
  ["read_health", handleReadHealth],
  ["resume_listener", handleResumeListener],
  ["start_capture", handleStartCapture],
  ["start_listener", handleStartListener],
  ["stop_listener", handleStopListener],
  ["synthesize_speech", handleSynthesizeSpeech],
]);

input.on("line", (line) => {
  if (mode === "malformed" || mode === "malformed_json") {
    process.stdout.write("not-json\n");
    return;
  }

  const command = JSON.parse(line);
  if (mode === "unknown_id") {
    respond("local-macos-voice-unknown", { status: "ready" });
    return;
  }
  if (mode === "omitted_error") {
    process.stdout.write(JSON.stringify({ id: command.id, ok: false, type: "response" }) + "\n");
    return;
  }
  if (mode === "malformed_result" && command.type === "read_health") {
    respond(command.id, { extra: true, status: "ready" });
    return;
  }
  const handler = commandHandlers.get(command.type);
  if (!handler) {
    reject(command.id, "unsupported_command", "command is unsupported");
    return;
  }
  handler(command);
});

function handleCancelCapture(command) {
  sessions.delete(command.payload.sessionId);
  releaseMicrophoneOwner("manual_capture", command.payload.sessionId);
  respond(command.id, { sessionId: command.payload.sessionId });
}

function handleFinishCapture(command) {
  if (!sessions.has(command.payload.sessionId)) {
    reject(command.id, "invalid_session", "session is not active");
    return;
  }
  sessions.delete(command.payload.sessionId);
  releaseMicrophoneOwner("manual_capture", command.payload.sessionId);
  if (command.payload.sessionId.includes("microphone_revoked")) {
    reject(command.id, "microphone_denied", "microphone access was revoked during capture");
    return;
  }
  if (command.payload.sessionId.includes("duration_limit")) {
    reject(command.id, "duration_limit", "local capture reached the recording limit");
    return;
  }
  if (command.payload.sessionId.includes("empty")) {
    respond(command.id, {
      sessionId: command.payload.sessionId,
      transcript: "   ",
    });
    return;
  }
  respond(command.id, {
    sessionId: command.payload.sessionId,
    transcript: `local transcript for ${command.payload.sessionId}`,
  });
}

function handleReadHealth(command) {
  if (command.payload.modelPath.includes("missing-model")) {
    respond(command.id, { message: "model file is missing", status: "missing_model" });
    return;
  }
  respond(command.id, { status: "ready" });
}

function handleListVoices(command) {
  if (mode === "malformed_voice_catalog") {
    respond(command.id, {
      version: "fixture-local-voices",
      voiceIds: [
        "com.apple.voice.compact.en-US.Samantha",
        "com.apple.voice.compact.en-US.Samantha",
      ],
    });
    return;
  }
  respond(command.id, {
    version: "fixture-local-voices",
    voiceIds: localVoiceIds,
  });
}

function handleStartCapture(command) {
  if (!command.payload.modelPath || command.payload.modelPath.includes("missing-model")) {
    reject(command.id, "missing_model", "model file is missing");
    return;
  }
  if (!claimMicrophoneOwner({ sessionId: command.payload.sessionId, type: "manual_capture" })) {
    reject(command.id, "microphone_busy", "Local macOS microphone is already in use.");
    return;
  }
  if (command.payload.sessionId.includes("microphone_denied")) {
    releaseMicrophoneOwner("manual_capture", command.payload.sessionId);
    reject(command.id, "microphone_denied", "microphone access is denied for Setta");
    return;
  }
  sessions.set(command.payload.sessionId, {
    maximumRecordingSeconds: command.payload.maximumRecordingSeconds,
    maximumTranscriptCharacters: command.payload.maximumTranscriptCharacters,
  });
  respond(command.id, { sessionId: command.payload.sessionId });
}

function handleStartListener(command) {
  const payload = command.payload;
  if (!payload.transcriptionModelPath || payload.transcriptionModelPath.includes("missing-model")) {
    reject(command.id, "missing_model", "model file is missing");
    return;
  }
  if (!payload.wakeModelPath || payload.wakeModelPath.includes("missing-wake-model")) {
    reject(command.id, "missing_model", "wake model file is missing");
    return;
  }
  if (listenerActive) {
    reject(command.id, "invalid_listener", "Always listening is already active.");
    return;
  }
  if (!claimMicrophoneOwner({ type: "always_listening" })) {
    reject(command.id, "microphone_busy", "Local macOS microphone is already in use.");
    return;
  }
  listenerActive = true;
  listenerPauseReasons.clear();
  respond(command.id, { status: "started" });
  emitListenerEvent({ type: "listener_armed" });
  if (mode === "scripted_listener") {
    emitListenerEvent({ score: 0.74, timeMs: 960, type: "wake_detected" });
    emitListenerEvent({ timeMs: 1_140, type: "message_speech_started" });
    emitListenerEvent({ timeMs: 2_220, type: "candidate_endpoint_detected" });
    emitListenerEvent({ transcript: "open the release checklist", type: "utterance_finalized" });
  }
}

function handleStopListener(command) {
  if (!listenerActive) {
    reject(command.id, "invalid_listener", "Always listening is not active.");
    return;
  }
  listenerActive = false;
  listenerPauseReasons.clear();
  releaseMicrophoneOwner("always_listening");
  respond(command.id, { status: "stopped" });
}

function handlePauseListener(command) {
  if (!listenerActive) {
    reject(command.id, "invalid_listener", "Always listening is not active.");
    return;
  }
  listenerPauseReasons.add(command.payload.reason);
  releaseMicrophoneOwner("always_listening");
  respond(command.id, { status: "paused" });
}

function handleResumeListener(command) {
  if (!listenerActive) {
    reject(command.id, "invalid_listener", "Always listening is not active.");
    return;
  }
  const hadReason = listenerPauseReasons.delete(command.payload.reason);
  if (hadReason && listenerPauseReasons.size === 0) {
    if (!claimMicrophoneOwner({ type: "always_listening" })) {
      listenerPauseReasons.add(command.payload.reason);
      reject(command.id, "microphone_busy", "Local macOS microphone is already in use.");
      return;
    }
    respond(command.id, { status: "resumed" });
    emitListenerEvent({ type: "listener_armed" });
    return;
  }
  respond(command.id, { status: "resumed" });
}

function handleSynthesizeSpeech(command) {
  const payload = command.payload;
  if (!validSynthesisPayload(payload)) {
    reject(command.id, "synthesis_failed", "synthesis request is invalid");
    return;
  }
  if (mode === "synthesis_unavailable" || payload.operationId.includes("unavailable")) {
    reject(command.id, "synthesis_unavailable", "system speech synthesis is unavailable");
    return;
  }
  if (!localVoiceIds.includes(payload.voiceId)) {
    reject(command.id, "voice_unavailable", "The selected macOS system voice is unavailable.");
    return;
  }
  if (payload.operationId.includes("malformed_audio")) {
    respond(command.id, {
      audioBase64: Buffer.from("not wav audio", "utf8").toString("base64"),
      format: "wav",
      mediaType: "audio/wav",
      operationId: payload.operationId,
    });
    return;
  }
  if (mode === "slow_synthesis" || payload.operationId.includes("cancel")) {
    synthesisOperations.set(payload.operationId, command.id);
    return;
  }
  respond(command.id, synthesisResult(payload.operationId));
}

function validSynthesisPayload(payload) {
  return (
    payload &&
    typeof payload.operationId === "string" &&
    payload.operationId !== "" &&
    typeof payload.text === "string" &&
    payload.text !== "" &&
    typeof payload.voiceId === "string" &&
    payload.voiceId !== "" &&
    typeof payload.rate === "number"
  );
}

function handleCancelSynthesis(command) {
  const pendingId = synthesisOperations.get(command.payload.operationId);
  if (pendingId) {
    synthesisOperations.delete(command.payload.operationId);
    reject(pendingId, "synthesis_failed", "synthesis was canceled");
  }
  respond(command.id, { operationId: command.payload.operationId });
}

function synthesisResult(operationId) {
  return {
    audioBase64: minimalWavBase64,
    format: "wav",
    mediaType: "audio/wav",
    operationId,
  };
}

function respond(id, result) {
  process.stdout.write(JSON.stringify({ id, ok: true, result, type: "response" }) + "\n");
}

function reject(id, code, message) {
  process.stdout.write(
    JSON.stringify({
      error: { code, message },
      id,
      ok: false,
      type: "response",
    }) + "\n",
  );
}

function claimMicrophoneOwner(owner) {
  if (microphoneOwner !== null) {
    return false;
  }
  microphoneOwner = owner;
  return true;
}

function releaseMicrophoneOwner(type, sessionId) {
  if (microphoneOwner === null || microphoneOwner.type !== type) {
    return;
  }
  if (
    type === "manual_capture" &&
    sessionId !== undefined &&
    microphoneOwner.sessionId !== sessionId
  ) {
    return;
  }
  microphoneOwner = null;
}

function emitListenerEvent(event) {
  process.stdout.write(JSON.stringify({ event, type: "listener_event" }) + "\n");
}
