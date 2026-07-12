import { Buffer } from "node:buffer";
import { createServer } from "node:http";

const apiKey = "sk-setta-global-speech-electron-fixture";
const clientSecret = "ek_setta_global_speech_electron_ephemeral";

export async function startSpeechTranscriptionProviderFixture() {
  const failures = [];
  const requests = [];
  const server = createServer((request, response) => {
    void handleProviderRequest(request, response, requests).catch((error) => {
      failures.push(error);
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("speech transcription fixture rejected the request");
    });
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("speech transcription fixture did not bind a TCP port");
  }
  return {
    apiKey,
    assertHealthy() {
      if (failures.length > 0) {
        throw new Error(
          `speech transcription fixture failed: ${failures[0]?.message ?? "unknown error"}`,
        );
      }
    },
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    clientSecret,
    close: () =>
      new Promise((resolvePromise, reject) => {
        server.close((error) => (error ? reject(error) : resolvePromise()));
      }),
    requests,
  };
}

async function handleProviderRequest(request, response, requests) {
  assertProviderRoute(request);
  assertProviderAuthorization(request);
  const safetyIdentifier = requireSafetyIdentifier(request);
  assertTranscriptionRequest(await readJSONBody(request));
  requests.push({ path: request.url, safetyIdentifier });
  writeTranscriptionSession(response);
}

function assertProviderRoute(request) {
  if (request.method !== "POST" || request.url !== "/v1/realtime/client_secrets") {
    throw new Error(`unexpected provider request: ${request.method} ${request.url}`);
  }
}

function assertProviderAuthorization(request) {
  if (request.headers.authorization !== `Bearer ${apiKey}`) {
    throw new Error("speech transcription fixture received invalid authorization");
  }
}

function requireSafetyIdentifier(request) {
  const safetyIdentifier = request.headers["openai-safety-identifier"];
  if (
    typeof safetyIdentifier !== "string" ||
    safetyIdentifier.length === 0 ||
    safetyIdentifier.length > 64 ||
    !/^[!-~]+$/.test(safetyIdentifier)
  ) {
    throw new Error("speech transcription fixture received an invalid safety identifier");
  }
  return safetyIdentifier;
}

function assertTranscriptionRequest(payload) {
  if (!isRecord(payload)) {
    throw new Error("speech transcription fixture requires a JSON object");
  }
  const session = requiredRecord(payload, "session");
  const audio = requiredRecord(session, "audio");
  const input = requiredRecord(audio, "input");
  const transcription = requiredRecord(input, "transcription");
  if (
    session.type !== "transcription" ||
    transcription.model !== "gpt-realtime-whisper" ||
    transcription.delay !== "medium" ||
    input.turn_detection !== null
  ) {
    throw new Error("speech transcription fixture received an invalid session request");
  }
}

function requiredRecord(parent, field) {
  const value = parent[field];
  if (!isRecord(value)) {
    throw new Error(`speech transcription fixture requires object field ${field}`);
  }
  return value;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeTranscriptionSession(response) {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(
    JSON.stringify({
      expires_at: Math.floor(Date.now() / 1000) + 600,
      session: {
        audio: {
          input: {
            transcription: { model: "gpt-realtime-whisper" },
            turn_detection: null,
          },
        },
        type: "transcription",
      },
      value: clientSecret,
    }),
  );
}

async function readJSONBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
