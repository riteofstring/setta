import { createInterface } from "node:readline";

const mode = process.argv[2] ?? "ok";
const sessions = new Map();
const synthesisOperations = new Map();
const localVoiceIds = [
  "com.apple.voice.compact.en-US.Samantha",
  "com.apple.voice.compact.en-US.Alex",
];
const minimalWavBase64 = "UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==";
const transcriptQueue = parseTranscriptQueue(process.env.SETTA_E2E_LOCAL_MACOS_VOICE_TRANSCRIPTS);
const input = createInterface({ input: process.stdin });
const commandHandlers = new Map([
  ["cancel_capture", handleCancelCapture],
  ["cancel_synthesis", handleCancelSynthesis],
  ["finish_capture", handleFinishCapture],
  ["list_voices", handleListVoices],
  ["read_health", handleReadHealth],
  ["start_capture", handleStartCapture],
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
  respond(command.id, { sessionId: command.payload.sessionId });
}

function handleFinishCapture(command) {
  if (!sessions.has(command.payload.sessionId)) {
    reject(command.id, "invalid_session", "session is not active");
    return;
  }
  sessions.delete(command.payload.sessionId);
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
    transcript: queuedTranscriptFor(command.payload.sessionId),
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
  if (command.payload.sessionId.includes("microphone_denied")) {
    reject(command.id, "microphone_denied", "microphone access is denied for Setta");
    return;
  }
  sessions.set(command.payload.sessionId, {
    maximumRecordingSeconds: command.payload.maximumRecordingSeconds,
    maximumTranscriptCharacters: command.payload.maximumTranscriptCharacters,
  });
  respond(command.id, { sessionId: command.payload.sessionId });
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

function queuedTranscriptFor(sessionId) {
  return transcriptQueue.shift() ?? `local transcript for ${sessionId}`;
}

function parseTranscriptQueue(raw) {
  if (!raw) {
    return [];
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((transcript) => typeof transcript !== "string")) {
    throw new Error("SETTA_E2E_LOCAL_MACOS_VOICE_TRANSCRIPTS must be a JSON string array");
  }
  return [...parsed];
}
