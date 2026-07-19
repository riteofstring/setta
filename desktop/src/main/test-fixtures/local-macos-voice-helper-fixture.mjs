import { createInterface } from "node:readline";

const mode = process.argv[2] ?? "ok";
const sessions = new Set();
const input = createInterface({ input: process.stdin });

input.on("line", (line) => {
  if (mode === "malformed") {
    process.stdout.write("not-json\n");
    return;
  }

  const command = JSON.parse(line);
  switch (command.type) {
    case "cancel_capture":
      sessions.delete(command.payload.sessionId);
      respond(command.id, { sessionId: command.payload.sessionId });
      return;
    case "finish_capture":
      if (!sessions.has(command.payload.sessionId)) {
        reject(command.id, "invalid_session", "session is not active");
        return;
      }
      sessions.delete(command.payload.sessionId);
      respond(command.id, {
        sessionId: command.payload.sessionId,
        transcript: `local transcript for ${command.payload.sessionId}`,
      });
      return;
    case "read_health":
      respond(command.id, { status: "ready" });
      return;
    case "start_capture":
      if (!command.payload.modelPath) {
        reject(command.id, "missing_model", "model path is required");
        return;
      }
      sessions.add(command.payload.sessionId);
      respond(command.id, { sessionId: command.payload.sessionId });
      return;
    default:
      reject(command.id, "unsupported_command", "command is unsupported");
  }
});

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
