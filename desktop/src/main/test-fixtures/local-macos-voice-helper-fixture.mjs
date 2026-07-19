import { createInterface } from "node:readline";

const mode = process.argv[2] ?? "ok";
const sessions = new Set();
const synthesisOperations = new Map();
const input = createInterface({ input: process.stdin });
const commandHandlers = new Map([
  ["cancel_capture", handleCancelCapture],
  ["cancel_synthesis", handleCancelSynthesis],
  ["finish_capture", handleFinishCapture],
  ["read_health", handleReadHealth],
  ["start_capture", handleStartCapture],
  ["synthesize_speech", handleSynthesizeSpeech],
]);

input.on("line", (line) => {
  if (mode === "malformed") {
    process.stdout.write("not-json\n");
    return;
  }

  const command = JSON.parse(line);
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
  respond(command.id, {
    sessionId: command.payload.sessionId,
    transcript: `local transcript for ${command.payload.sessionId}`,
  });
}

function handleReadHealth(command) {
  respond(command.id, { status: "ready" });
}

function handleStartCapture(command) {
  if (!command.payload.modelPath) {
    reject(command.id, "missing_model", "model path is required");
    return;
  }
  sessions.add(command.payload.sessionId);
  respond(command.id, { sessionId: command.payload.sessionId });
}

function handleSynthesizeSpeech(command) {
  if (mode === "synthesis_unavailable") {
    reject(command.id, "synthesis_unavailable", "system speech synthesis is unavailable");
    return;
  }
  if (!command.payload.operationId || !command.payload.text || !command.payload.voiceId) {
    reject(command.id, "synthesis_failed", "synthesis request is invalid");
    return;
  }
  if (mode === "slow_synthesis" || command.payload.operationId.includes("cancel")) {
    synthesisOperations.set(command.payload.operationId, command.id);
    return;
  }
  respond(command.id, synthesisResult(command.payload.operationId));
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
    audioBase64: Buffer.from(`local speech for ${operationId}`, "utf8").toString("base64"),
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
