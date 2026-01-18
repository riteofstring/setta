import fs from "node:fs";
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";

function writeEvent(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function readInput() {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    writeEvent({
      type: "error",
      message: `Failed to parse input JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    process.exit(1);
  }
}

function extractSessionId(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidates = [
    payload.id,
    payload.sessionId,
    payload.session_id,
    payload?.data?.id,
    payload?.data?.sessionId,
    payload?.session?.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

process.on("unhandledRejection", (err) => {
  writeEvent({
    type: "error",
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});

const input = readInput();
if (!input) {
  process.exit(0);
}

const prompt = typeof input.prompt === "string" ? input.prompt : "";
const baseUrl = typeof input.baseUrl === "string" ? input.baseUrl : null;
const workingDir =
  typeof input.workingDir === "string" ? input.workingDir : process.cwd();
const model = typeof input.model === "string" ? input.model : undefined;
const requestedSessionId =
  typeof input.sessionId === "string" ? input.sessionId : null;

let client;
let serverHandle = null;
if (baseUrl) {
  client = createOpencodeClient({ baseUrl });
} else {
  const opencode = await createOpencode({ cwd: workingDir });
  client = opencode.client ?? opencode;
  serverHandle = opencode.server ?? opencode.process ?? null;
}

let sessionId = requestedSessionId;
if (!sessionId) {
  const created = await client.session.create({
    body: { title: "Setta external run" },
  });
  sessionId = extractSessionId(created);
}

if (!sessionId) {
  writeEvent({
    type: "error",
    message: "Failed to create or resolve OpenCode session id.",
  });
  process.exit(1);
}

const response = await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: "text", text: prompt }],
    model,
  },
});
writeEvent({
  type: "assistant_message",
  sessionId,
  message: response,
});

if (serverHandle && typeof serverHandle.stop === "function") {
  await serverHandle.stop();
} else if (serverHandle && typeof serverHandle.close === "function") {
  await serverHandle.close();
}
