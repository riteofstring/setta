import { Buffer } from "node:buffer";
import { createServer } from "node:http";

const apiKey = "sk-setta-speech-electron-fixture";
const clientSecret = "ek_setta_speech_electron_ephemeral";
const pcm = Buffer.from([0, 0]);
const wav = pcm16MonoWAV(pcm);

export async function startSpeechProviderFixture() {
  const failures = [];
  const requests = [];
  const synthesisControl = createSynthesisControl();
  const synthesisInputs = [];
  const server = createServer((request, response) => {
    void handleProviderRequest({
      request,
      requests,
      response,
      synthesisControl,
      synthesisInputs,
    }).catch((error) => {
      failures.push(error);
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("speech provider fixture rejected the request");
    });
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("speech provider fixture did not bind a TCP port");
  }
  return {
    apiKey,
    assertHealthy() {
      if (failures.length > 0) {
        throw new Error(
          `speech provider fixture failed: ${failures[0]?.message ?? "unknown error"}`,
        );
      }
    },
    audioBase64: wav.toString("base64"),
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    clientSecret,
    close: () =>
      new Promise((resolvePromise, reject) => {
        synthesisControl.releaseHeld();
        server.close((error) => (error ? reject(error) : resolvePromise()));
      }),
    failNextSynthesis: synthesisControl.failNext,
    holdNextSynthesis: synthesisControl.holdNext,
    releaseHeldSynthesis: synthesisControl.releaseHeld,
    requests,
    synthesisInputs,
    waitForHeldSynthesisCancellation: synthesisControl.waitForHeldCancellation,
  };
}

async function handleProviderRequest({
  request,
  requests,
  response,
  synthesisControl,
  synthesisInputs,
}) {
  if (request.method !== "POST") {
    throw new Error("speech provider fixture requires POST");
  }
  if (request.headers.authorization !== `Bearer ${apiKey}`) {
    throw new Error("speech provider fixture received invalid authorization");
  }
  const payload = await readJSONBody(request);
  requests.push({ path: request.url, payload });
  switch (request.url) {
    case "/v1/realtime/client_secrets":
      handleTranscriptionRequest(request, response, payload);
      return;
    case "/v1/audio/speech":
      handleSynthesisRequest(request, response, payload, synthesisControl, synthesisInputs);
      return;
    default:
      throw new Error(`speech provider fixture received an unexpected path: ${request.url}`);
  }
}

function handleTranscriptionRequest(request, response, payload) {
  const safetyIdentifier = request.headers["openai-safety-identifier"];
  if (
    typeof safetyIdentifier !== "string" ||
    safetyIdentifier.length === 0 ||
    safetyIdentifier.length > 64 ||
    !/^[!-~]+$/.test(safetyIdentifier)
  ) {
    throw new Error("speech provider fixture received an invalid safety identifier");
  }
  const input = payload.session.audio.input;
  if (
    payload.session.type !== "transcription" ||
    input.transcription.model !== "gpt-realtime-whisper" ||
    input.transcription.delay !== "medium" ||
    input.turn_detection !== null
  ) {
    throw new Error("speech provider fixture received an invalid transcription session");
  }
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

function handleSynthesisRequest(request, response, payload, synthesisControl, synthesisInputs) {
  if (request.headers["openai-safety-identifier"] !== undefined) {
    throw new Error("speech synthesis unexpectedly carried a safety identifier");
  }
  if (
    payload.model !== "gpt-4o-mini-tts" ||
    payload.voice !== "marin" ||
    payload.response_format !== "pcm" ||
    typeof payload.input !== "string" ||
    payload.input === ""
  ) {
    throw new Error("speech provider fixture received an invalid synthesis request");
  }
  synthesisInputs.push(payload.input);
  if (synthesisControl.consume(response)) {
    return;
  }
  writePCM(response);
}

function writePCM(response) {
  response.writeHead(200, { "Content-Type": "application/octet-stream" });
  response.end(pcm);
}

function createSynthesisControl() {
  let behavior = "succeed";
  let heldCancelled = null;
  let heldCancelledResolve = null;
  let heldResponse = null;
  let heldReady = null;
  return {
    consume(response) {
      const selected = behavior;
      behavior = "succeed";
      if (selected === "fail") {
        response.writeHead(500, { "Content-Type": "text/plain" });
        response.end("fixture synthesis provider body must stay hidden");
        return true;
      }
      if (selected === "hold") {
        heldResponse = response;
        response.once("close", () => {
          if (!response.writableEnded && heldResponse === response) {
            heldResponse = null;
            heldCancelledResolve?.();
            heldCancelledResolve = null;
          }
        });
        heldReady?.();
        heldReady = null;
        return true;
      }
      return false;
    },
    failNext() {
      requireSynthesisControlIdle(behavior, heldResponse);
      behavior = "fail";
    },
    holdNext() {
      requireSynthesisControlIdle(behavior, heldResponse);
      behavior = "hold";
      heldCancelled = new Promise((resolve) => {
        heldCancelledResolve = resolve;
      });
      return new Promise((resolve) => {
        heldReady = resolve;
      });
    },
    releaseHeld() {
      if (!heldResponse) {
        return false;
      }
      const response = heldResponse;
      heldResponse = null;
      writePCM(response);
      return true;
    },
    waitForHeldCancellation() {
      if (!heldCancelled) {
        throw new Error("speech provider fixture has no held synthesis cancellation");
      }
      return heldCancelled;
    },
  };
}

function pcm16MonoWAV(samples) {
  const wavHeaderBytes = 44;
  const sampleRate = 24_000;
  const wav = Buffer.alloc(wavHeaderBytes + samples.length);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(samples.length, 40);
  samples.copy(wav, wavHeaderBytes);
  return wav;
}

function requireSynthesisControlIdle(behavior, heldResponse) {
  if (behavior !== "succeed" || heldResponse) {
    throw new Error("speech provider fixture already has controlled synthesis work");
  }
}

async function readJSONBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
