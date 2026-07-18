import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

const audioMarker = "setta-audio-secret-20260714!";
const synthesizedAudio = Buffer.from(audioMarker, "utf8");

export async function startSpeechTranscriptionProviderFixture(options = {}) {
  const secretSuffix = randomUUID().replaceAll("-", "");
  const apiKey = `sk-setta-global-speech-electron-fixture-${secretSuffix}`;
  const clientSecret = `ek_setta_global_speech_electron_ephemeral_${secretSuffix}`;
  const failures = [];
  const requests = [];
  const timing = createProviderTiming();
  let timingContext = {};
  let transcriptionSessionDelayMs = validDelayMs(
    options.transcriptionSessionDelayMs ?? 0,
    "transcriptionSessionDelayMs",
  );
  const server = createServer((request, response) => {
    void handleProviderRequest(request, response, {
      apiKey,
      clientSecret,
      requests,
      timing,
      timingContext,
      transcriptionSessionDelayMs,
    }).catch((error) => {
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
    audioBase64: synthesizedAudio.toString("base64"),
    audioMarker,
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
    privacyMarkers: [apiKey, clientSecret],
    requests,
    setTimingContext(context) {
      timingContext = validTimingContext(context);
    },
    setTranscriptionSessionDelayMs(delayMs) {
      transcriptionSessionDelayMs = validDelayMs(delayMs, "transcriptionSessionDelayMs");
    },
    snapshotTiming() {
      return {
        events: timing.events.map((event) => ({ ...event, detail: { ...event.detail } })),
        transcriptionSessionDelayMs,
      };
    },
  };
}

async function handleProviderRequest(
  request,
  response,
  { apiKey, clientSecret, requests, timing, timingContext, transcriptionSessionDelayMs },
) {
  assertProviderAuthorization(request, apiKey);
  if (request.method === "POST" && request.url === "/v1/realtime/client_secrets") {
    const requestReceived = markProviderTiming(
      timing,
      "transcription_session_request_received",
      timingContext,
      { path: request.url, transcriptionSessionDelayMs },
    );
    const safetyIdentifier = requireSafetyIdentifier(request);
    assertTranscriptionRequest(await readJSONBody(request));
    if (transcriptionSessionDelayMs > 0) {
      await delay(transcriptionSessionDelayMs);
    }
    requests.push({
      path: request.url,
      requestReceivedAtMs: requestReceived.epochMs,
      safetyIdentifier,
      transcriptionSessionDelayMs,
    });
    writeTranscriptionSession(response, clientSecret);
    const responseSent = markProviderTiming(
      timing,
      "transcription_session_response_sent",
      timingContext,
      { path: request.url, transcriptionSessionDelayMs },
    );
    requests[requests.length - 1].responseSentAtMs = responseSent.epochMs;
    return;
  }
  if (request.method === "POST" && request.url === "/v1/audio/speech") {
    if (request.headers["openai-safety-identifier"] !== undefined) {
      throw new Error("speech synthesis fixture received an unexpected safety identifier");
    }
    const synthesis = assertSynthesisRequest(await readJSONBody(request));
    requests.push({ path: request.url, ...synthesis });
    markProviderTiming(timing, "speech_synthesis_response_sent", timingContext, {
      path: request.url,
    });
    response.writeHead(200, { "Content-Type": "application/octet-stream" });
    response.end(synthesizedAudio);
    return;
  }
  throw new Error(`unexpected provider request: ${request.method} ${request.url}`);
}

function assertProviderAuthorization(request, apiKey) {
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

function assertSynthesisRequest(payload) {
  if (
    !isRecord(payload) ||
    payload.model !== "gpt-4o-mini-tts" ||
    typeof payload.input !== "string" ||
    payload.input.length === 0 ||
    typeof payload.voice !== "string" ||
    payload.voice.length === 0 ||
    payload.response_format !== "pcm"
  ) {
    throw new Error("speech synthesis fixture received an invalid request");
  }
  return { input: payload.input, voice: payload.voice };
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

function writeTranscriptionSession(response, clientSecret) {
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

function createProviderTiming() {
  return { events: [], sequence: 0 };
}

function markProviderTiming(timing, name, context, detail = {}) {
  const event = {
    detail: { ...context, ...detail },
    epochMs: Date.now(),
    name,
    sequence: timing.sequence,
  };
  timing.sequence += 1;
  timing.events.push(event);
  return event;
}

function validDelayMs(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}

function validTimingContext(context) {
  if (!isRecord(context)) {
    throw new Error("speech transcription timing context must be an object");
  }
  return { ...context };
}
