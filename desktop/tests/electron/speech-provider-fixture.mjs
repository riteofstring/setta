import { Buffer } from "node:buffer";
import { createServer } from "node:http";

const apiKey = "sk-setta-speech-electron-fixture";
const clientSecret = "ek_setta_speech_electron_ephemeral";
const wav = Buffer.from([
  82, 73, 70, 70, 38, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0, 64, 31,
  0, 0, 128, 62, 0, 0, 2, 0, 16, 0, 100, 97, 116, 97, 2, 0, 0, 0, 0, 0,
]);

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
    !/^setta-device-[0-9a-f]{64}$/.test(safetyIdentifier)
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
            transcription: { delay: "medium", model: "gpt-realtime-whisper" },
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
    payload.response_format !== "wav" ||
    typeof payload.input !== "string" ||
    payload.input === ""
  ) {
    throw new Error("speech provider fixture received an invalid synthesis request");
  }
  synthesisInputs.push(payload.input);
  if (synthesisControl.consume(response)) {
    return;
  }
  writeWAV(response);
}

function writeWAV(response) {
  response.writeHead(200, { "Content-Type": "audio/wav" });
  response.end(wav);
}

function createSynthesisControl() {
  let behavior = "succeed";
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
      writeWAV(response);
      return true;
    },
  };
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
