import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, constants } from "node:fs/promises";

import type { SpeechVoiceID } from "@generated/backend";
import type { LocalMacOSVoiceHealth } from "@shared/speech-ipc";
import { localMacOSSpeechProviderID } from "@shared/speech-providers";

export interface LocalMacOSVoiceHelper {
  cancelCapture: (
    request: LocalMacOSVoiceCancelCaptureRequest,
  ) => Promise<LocalMacOSVoiceCaptureCanceled>;
  cancelSynthesis: (
    request: LocalMacOSVoiceCancelSynthesisRequest,
  ) => Promise<LocalMacOSVoiceSynthesisCanceled>;
  finishCapture: (
    request: LocalMacOSVoiceFinishCaptureRequest,
  ) => Promise<LocalMacOSVoiceTranscriptionResult>;
  readHealth: () => Promise<LocalMacOSVoiceHealth>;
  shutdown: () => void;
  startCapture: (
    request: Omit<LocalMacOSVoiceStartCaptureRequest, "modelPath">,
  ) => Promise<LocalMacOSVoiceCaptureStarted>;
  synthesizeSpeech: (
    request: LocalMacOSVoiceSynthesisRequest,
  ) => Promise<LocalMacOSVoiceSynthesisResult>;
}

export interface LocalMacOSVoiceHelperProcessClientOptions {
  args?: string[];
  command: string;
  env?: NodeJS.ProcessEnv;
}

export interface LocalMacOSVoiceHealthServiceOptions {
  createClient?: (helperPath: string) => LocalMacOSVoiceHelperClient;
  expectedModelSHA256?: string | null;
  helperPath?: string | null;
  modelPath?: string | null;
  platform?: NodeJS.Platform;
}

export interface LocalMacOSVoiceHelperClient {
  cancelCapture: (
    request: LocalMacOSVoiceCancelCaptureRequest,
  ) => Promise<LocalMacOSVoiceCaptureCanceled>;
  cancelSynthesis: (
    request: LocalMacOSVoiceCancelSynthesisRequest,
  ) => Promise<LocalMacOSVoiceSynthesisCanceled>;
  finishCapture: (
    request: LocalMacOSVoiceFinishCaptureRequest,
  ) => Promise<LocalMacOSVoiceTranscriptionResult>;
  readHealth: (
    request: LocalMacOSVoiceHelperHealthRequest,
  ) => Promise<LocalMacOSVoiceHelperHealthResult>;
  shutdown: () => void;
  startCapture: (
    request: LocalMacOSVoiceStartCaptureRequest,
  ) => Promise<LocalMacOSVoiceCaptureStarted>;
  synthesizeSpeech: (
    request: LocalMacOSVoiceSynthesisRequest,
  ) => Promise<LocalMacOSVoiceSynthesisResult>;
}

export interface LocalMacOSVoiceHelperHealthRequest {
  modelPath: string;
}

export interface LocalMacOSVoiceStartCaptureRequest {
  maximumRecordingSeconds: number;
  maximumTranscriptCharacters: number;
  modelPath: string;
  sessionId: string;
}

export interface LocalMacOSVoiceFinishCaptureRequest {
  sessionId: string;
}

export interface LocalMacOSVoiceCancelCaptureRequest {
  sessionId: string;
}

export interface LocalMacOSVoiceSynthesisRequest {
  operationId: string;
  rate: number;
  text: string;
  voiceId: SpeechVoiceID;
}

export interface LocalMacOSVoiceCancelSynthesisRequest {
  operationId: string;
}

export type LocalMacOSVoiceHelperHealthResult =
  | { status: "ready" }
  | { message: string; status: "missing_model" }
  | {
      actualSHA256: string;
      expectedSHA256: string;
      message: string;
      status: "model_hash_mismatch";
    }
  | { message: string; status: "helper_unavailable" }
  | { message: string; status: "microphone_denied" }
  | { message: string; status: "synthesis_unavailable" };

export interface LocalMacOSVoiceCaptureStarted {
  sessionId: string;
}

export interface LocalMacOSVoiceCaptureCanceled {
  sessionId: string;
}

export interface LocalMacOSVoiceTranscriptionResult {
  sessionId: string;
  transcript: string;
}

export interface LocalMacOSVoiceSynthesisResult {
  audioBase64: string;
  format: string;
  mediaType: string;
  operationId: string;
}

export interface LocalMacOSVoiceSynthesisCanceled {
  operationId: string;
}

interface HelperCommandEnvelope {
  id: string;
  payload: object;
  type: string;
}

type HelperCommandType =
  | "cancel_capture"
  | "cancel_synthesis"
  | "finish_capture"
  | "read_health"
  | "start_capture"
  | "synthesize_speech";

interface HelperResponseEnvelope {
  error?: {
    code: string;
    message: string;
  };
  id: string;
  ok: boolean;
  result?: unknown;
  type: "response";
}

interface PendingCommand {
  reject: (error: Error) => void;
  resolve: (result: unknown) => void;
}

type LocalMacOSVoiceReadyPreflight =
  | {
      helperPath: string;
      modelPath: string;
      modelSHA256: string;
      status: "ready";
    }
  | {
      health: LocalMacOSVoiceUnavailableHealth;
      status: "unavailable";
    };
type LocalMacOSVoiceUnavailableHealth = Exclude<LocalMacOSVoiceHealth, { status: "ready" }>;

const helperPathEnvironmentVariable = "SETTA_LOCAL_MACOS_VOICE_HELPER_PATH";
const modelPathEnvironmentVariable = "SETTA_LOCAL_MACOS_VOICE_MODEL_PATH";
const modelSHA256EnvironmentVariable = "SETTA_LOCAL_MACOS_VOICE_MODEL_SHA256";
const localMacOSProvider = localMacOSSpeechProviderID();

export class LocalMacOSVoiceHelperProtocolError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LocalMacOSVoiceHelperProtocolError";
  }
}

export class LocalMacOSVoiceHelperCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LocalMacOSVoiceHelperCommandError";
  }
}

export class LocalMacOSVoiceHelperUnavailableError extends Error {
  constructor(readonly health: LocalMacOSVoiceUnavailableHealth) {
    super(health.message);
    this.name = "LocalMacOSVoiceHelperUnavailableError";
  }
}

export function createLocalMacOSVoiceHelperFromEnvironment(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): LocalMacOSVoiceHelper {
  return new LocalMacOSVoiceHealthService({
    expectedModelSHA256: env[modelSHA256EnvironmentVariable] ?? null,
    helperPath: env[helperPathEnvironmentVariable] ?? null,
    modelPath: env[modelPathEnvironmentVariable] ?? null,
    platform,
  });
}

export class LocalMacOSVoiceHealthService implements LocalMacOSVoiceHelper {
  private client: LocalMacOSVoiceHelperClient | null = null;
  private readonly expectedModelSHA256: string | null;
  private readonly helperPath: string | null;
  private readonly modelPath: string | null;
  private readonly platform: NodeJS.Platform;

  constructor(private readonly options: LocalMacOSVoiceHealthServiceOptions) {
    this.expectedModelSHA256 = normalizedOptionalText(options.expectedModelSHA256);
    this.helperPath = normalizedOptionalText(options.helperPath);
    this.modelPath = normalizedOptionalText(options.modelPath);
    this.platform = options.platform ?? process.platform;
  }

  async readHealth(): Promise<LocalMacOSVoiceHealth> {
    const preflight = await this.readReadyPreflight();
    if (preflight.status === "unavailable") {
      return preflight.health;
    }

    try {
      const health = await this.requireClient().readHealth({ modelPath: preflight.modelPath });
      return healthFromHelperResult(health, {
        helperPath: preflight.helperPath,
        modelPath: preflight.modelPath,
        modelSHA256: preflight.modelSHA256,
      });
    } catch (error) {
      const health = healthFromHelperError(error, {
        helperPath: preflight.helperPath,
        modelPath: preflight.modelPath,
      });
      if (health !== null) {
        return health;
      }
      return helperUnavailable(
        preflight.helperPath,
        "The local macOS voice helper did not return health.",
      );
    }
  }

  async startCapture(
    request: Omit<LocalMacOSVoiceStartCaptureRequest, "modelPath">,
  ): Promise<LocalMacOSVoiceCaptureStarted> {
    const preflight = await this.readReadyPreflight();
    if (preflight.status === "unavailable") {
      throw new LocalMacOSVoiceHelperUnavailableError(preflight.health);
    }
    return this.requireClient().startCapture({
      ...request,
      modelPath: preflight.modelPath,
    });
  }

  finishCapture(
    request: LocalMacOSVoiceFinishCaptureRequest,
  ): Promise<LocalMacOSVoiceTranscriptionResult> {
    return this.requireClient().finishCapture(request);
  }

  cancelCapture(
    request: LocalMacOSVoiceCancelCaptureRequest,
  ): Promise<LocalMacOSVoiceCaptureCanceled> {
    return this.requireClient().cancelCapture(request);
  }

  async synthesizeSpeech(
    request: LocalMacOSVoiceSynthesisRequest,
  ): Promise<LocalMacOSVoiceSynthesisResult> {
    const preflight = await this.readHelperPreflight();
    if (preflight.status === "unavailable") {
      throw new LocalMacOSVoiceHelperUnavailableError(preflight.health);
    }
    return this.requireClient().synthesizeSpeech(request);
  }

  cancelSynthesis(
    request: LocalMacOSVoiceCancelSynthesisRequest,
  ): Promise<LocalMacOSVoiceSynthesisCanceled> {
    return this.requireClient().cancelSynthesis(request);
  }

  private async readReadyPreflight(): Promise<LocalMacOSVoiceReadyPreflight> {
    if (this.platform !== "darwin") {
      return {
        health: helperUnavailable(this.helperPath, "Local macOS voice is available only on macOS."),
        status: "unavailable",
      };
    }
    if (this.modelPath === null) {
      return {
        health: missingModel(null, "Local macOS voice needs a configured Whisper model path."),
        status: "unavailable",
      };
    }
    const modelSHA256 = await this.readVerifiedModelSHA256(this.modelPath);
    if (typeof modelSHA256 !== "string") {
      return { health: modelSHA256, status: "unavailable" };
    }
    const helperPreflight = await this.readHelperPreflight();
    if (helperPreflight.status === "unavailable") {
      return helperPreflight;
    }
    return {
      helperPath: helperPreflight.helperPath,
      modelPath: this.modelPath,
      modelSHA256,
      status: "ready",
    };
  }

  private async readHelperPreflight(): Promise<
    | { helperPath: string; status: "ready" }
    | { health: LocalMacOSVoiceUnavailableHealth; status: "unavailable" }
  > {
    if (this.platform !== "darwin") {
      return {
        health: helperUnavailable(this.helperPath, "Local macOS voice is available only on macOS."),
        status: "unavailable",
      };
    }
    if (this.helperPath === null) {
      return {
        health: helperUnavailable(null, "The local macOS voice helper is not installed."),
        status: "unavailable",
      };
    }
    if (!(await fileAccessible(this.helperPath, constants.X_OK))) {
      return {
        health: helperUnavailable(this.helperPath, "The local macOS voice helper is unavailable."),
        status: "unavailable",
      };
    }
    return {
      helperPath: this.helperPath,
      status: "ready",
    };
  }

  private async readVerifiedModelSHA256(
    modelPath: string,
  ): Promise<string | LocalMacOSVoiceUnavailableHealth> {
    if (!(await fileAccessible(modelPath, constants.R_OK))) {
      return missingModel(modelPath, "The configured Whisper model file is missing.");
    }
    const actualSHA256 = await sha256File(modelPath);
    if (
      this.expectedModelSHA256 !== null &&
      actualSHA256.toLowerCase() !== this.expectedModelSHA256.toLowerCase()
    ) {
      return {
        actualSHA256,
        expectedSHA256: this.expectedModelSHA256,
        message: "The configured Whisper model hash does not match the expected Setta model.",
        modelPath,
        provider: localMacOSProvider,
        status: "model_hash_mismatch",
      };
    }
    return actualSHA256;
  }

  shutdown(): void {
    this.client?.shutdown();
    this.client = null;
  }

  private requireClient(): LocalMacOSVoiceHelperClient {
    if (this.helperPath === null) {
      throw new Error("local macOS voice helper path is required");
    }
    if (this.client === null) {
      this.client =
        this.options.createClient?.(this.helperPath) ??
        new LocalMacOSVoiceHelperProcessClient({ command: this.helperPath });
    }
    return this.client;
  }
}

export class LocalMacOSVoiceHelperProcessClient implements LocalMacOSVoiceHelperClient {
  private buffer = "";
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, PendingCommand>();
  private sequence = 0;

  constructor(private readonly options: LocalMacOSVoiceHelperProcessClientOptions) {}

  readHealth = async (
    request: LocalMacOSVoiceHelperHealthRequest,
  ): Promise<LocalMacOSVoiceHelperHealthResult> =>
    decodeHealthResult(await this.sendCommand("read_health", request));

  startCapture = async (
    request: LocalMacOSVoiceStartCaptureRequest,
  ): Promise<LocalMacOSVoiceCaptureStarted> =>
    decodeSessionResult(await this.sendCommand("start_capture", request), "start_capture");

  finishCapture = async (
    request: LocalMacOSVoiceFinishCaptureRequest,
  ): Promise<LocalMacOSVoiceTranscriptionResult> =>
    decodeTranscriptionResult(await this.sendCommand("finish_capture", request));

  cancelCapture = async (
    request: LocalMacOSVoiceCancelCaptureRequest,
  ): Promise<LocalMacOSVoiceCaptureCanceled> =>
    decodeSessionResult(await this.sendCommand("cancel_capture", request), "cancel_capture");

  synthesizeSpeech = async (
    request: LocalMacOSVoiceSynthesisRequest,
  ): Promise<LocalMacOSVoiceSynthesisResult> =>
    decodeSynthesisResult(await this.sendCommand("synthesize_speech", request));

  cancelSynthesis = async (
    request: LocalMacOSVoiceCancelSynthesisRequest,
  ): Promise<LocalMacOSVoiceSynthesisCanceled> =>
    decodeSynthesisCancelResult(
      await this.sendCommand("cancel_synthesis", request),
      "cancel_synthesis",
    );

  shutdown(): void {
    const child = this.child;
    this.child = null;
    child?.kill();
    this.failPending(new LocalMacOSVoiceHelperProtocolError("Local macOS voice helper stopped."));
  }

  private sendCommand(type: HelperCommandType, payload: object): Promise<unknown> {
    const child = this.requireChild();
    const id = `local-macos-voice-${++this.sequence}`;
    const envelope = { id, payload, type } satisfies HelperCommandEnvelope;
    const serialized = JSON.stringify(envelope) + "\n";
    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
      child.stdin.write(serialized, "utf8", (error) => {
        if (error) {
          if (this.pending.delete(id)) {
            reject(
              new LocalMacOSVoiceHelperProtocolError("Local macOS voice helper write failed.", {
                cause: error,
              }),
            );
          }
        }
      });
    });
  }

  private requireChild(): ChildProcessWithoutNullStreams {
    if (this.child !== null) {
      return this.child;
    }
    const child = spawn(this.options.command, this.options.args ?? [], {
      env: this.options.env,
      stdio: "pipe",
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.receive(chunk));
    child.stderr.resume();
    child.once("error", (error) => {
      this.child = null;
      this.failPending(
        new LocalMacOSVoiceHelperProtocolError("Local macOS voice helper failed to start.", {
          cause: error,
        }),
      );
    });
    child.once("exit", (code, signal) => {
      this.child = null;
      const detail = signal === null ? `exit code ${code ?? "unknown"}` : `signal ${signal}`;
      this.failPending(
        new LocalMacOSVoiceHelperProtocolError(`Local macOS voice helper exited with ${detail}.`),
      );
    });
    this.child = child;
    return child;
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.trim() !== "") {
        this.receiveLine(line);
      }
    }
  }

  private receiveLine(line: string): void {
    let decoded: unknown;
    try {
      decoded = JSON.parse(line);
    } catch (error) {
      this.failProtocol("Local macOS voice helper returned malformed JSON.", error);
      return;
    }

    let response: HelperResponseEnvelope;
    try {
      response = decodeHelperResponse(decoded);
    } catch (error) {
      this.failProtocol("Local macOS voice helper returned a malformed event.", error);
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) {
      this.failProtocol("Local macOS voice helper returned an unknown response id.");
      return;
    }
    this.pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
      return;
    }
    if (!response.error) {
      pending.reject(
        new LocalMacOSVoiceHelperProtocolError("Local macOS voice helper omitted error details."),
      );
      return;
    }
    pending.reject(
      new LocalMacOSVoiceHelperCommandError(response.error.code, response.error.message),
    );
  }

  private failProtocol(message: string, cause?: unknown): void {
    this.child?.kill();
    this.child = null;
    this.failPending(new LocalMacOSVoiceHelperProtocolError(message, { cause }));
  }

  private failPending(error: Error): void {
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const command of pending) {
      command.reject(error);
    }
  }
}

function healthFromHelperResult(
  health: LocalMacOSVoiceHelperHealthResult,
  ready: { helperPath: string; modelPath: string; modelSHA256: string },
): LocalMacOSVoiceHealth {
  switch (health.status) {
    case "ready":
      return {
        helperPath: ready.helperPath,
        modelPath: ready.modelPath,
        modelSHA256: ready.modelSHA256,
        provider: localMacOSProvider,
        status: "ready",
      };
    case "missing_model":
      return missingModel(ready.modelPath, health.message);
    case "model_hash_mismatch":
      return {
        actualSHA256: health.actualSHA256,
        expectedSHA256: health.expectedSHA256,
        message: health.message,
        modelPath: ready.modelPath,
        provider: localMacOSProvider,
        status: "model_hash_mismatch",
      };
    case "helper_unavailable":
      return helperUnavailable(ready.helperPath, health.message);
    case "microphone_denied":
      return { message: health.message, provider: localMacOSProvider, status: health.status };
    case "synthesis_unavailable":
      return { message: health.message, provider: localMacOSProvider, status: health.status };
    default:
      return assertNever(health);
  }
}

function missingModel(
  modelPath: string | null,
  message: string,
): Extract<LocalMacOSVoiceUnavailableHealth, { status: "missing_model" }> {
  return {
    message,
    modelPath,
    provider: localMacOSProvider,
    status: "missing_model",
  };
}

function helperUnavailable(
  helperPath: string | null,
  message: string,
): Extract<LocalMacOSVoiceUnavailableHealth, { status: "helper_unavailable" }> {
  return {
    helperPath,
    message,
    provider: localMacOSProvider,
    status: "helper_unavailable",
  };
}

function healthFromHelperError(
  error: unknown,
  context: { helperPath: string; modelPath: string },
): LocalMacOSVoiceUnavailableHealth | null {
  if (!(error instanceof LocalMacOSVoiceHelperCommandError)) {
    return null;
  }
  switch (error.code) {
    case "helper_unavailable":
      return helperUnavailable(context.helperPath, error.message);
    case "microphone_denied":
      return { message: error.message, provider: localMacOSProvider, status: "microphone_denied" };
    case "missing_model":
      return missingModel(context.modelPath, error.message);
    case "synthesis_unavailable":
      return {
        message: error.message,
        provider: localMacOSProvider,
        status: "synthesis_unavailable",
      };
    default:
      return null;
  }
}

async function fileAccessible(path: string, mode: number): Promise<boolean> {
  try {
    await access(path, mode);
    return true;
  } catch {
    return false;
  }
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function decodeHelperResponse(value: unknown): HelperResponseEnvelope {
  const record = assertRecord(value, "LocalMacOSVoiceHelperResponse");
  assertKnownFields(record, "LocalMacOSVoiceHelperResponse", [
    "error",
    "id",
    "ok",
    "result",
    "type",
  ]);
  const type = stringField(record, "type", "LocalMacOSVoiceHelperResponse");
  if (type !== "response") {
    throw new Error("LocalMacOSVoiceHelperResponse.type is unsupported");
  }
  const ok = booleanField(record, "ok", "LocalMacOSVoiceHelperResponse");
  const response: HelperResponseEnvelope = {
    id: stringField(record, "id", "LocalMacOSVoiceHelperResponse"),
    ok,
    type,
  };
  if ("result" in record) {
    response.result = record.result;
  }
  if ("error" in record) {
    response.error = decodeHelperError(record.error);
  }
  return response;
}

function decodeHelperError(value: unknown): HelperResponseEnvelope["error"] {
  const record = assertRecord(value, "LocalMacOSVoiceHelperError");
  assertKnownFields(record, "LocalMacOSVoiceHelperError", ["code", "message"]);
  return {
    code: stringField(record, "code", "LocalMacOSVoiceHelperError"),
    message: stringField(record, "message", "LocalMacOSVoiceHelperError"),
  };
}

function decodeHealthResult(value: unknown): LocalMacOSVoiceHelperHealthResult {
  const record = assertRecord(value, "LocalMacOSVoiceHelperHealthResult");
  const status = stringField(record, "status", "LocalMacOSVoiceHelperHealthResult");
  switch (status) {
    case "ready":
      assertKnownFields(record, "LocalMacOSVoiceHelperHealthResult", ["status"]);
      return { status };
    case "helper_unavailable":
    case "microphone_denied":
    case "missing_model":
    case "synthesis_unavailable":
      assertKnownFields(record, "LocalMacOSVoiceHelperHealthResult", ["message", "status"]);
      return {
        message: stringField(record, "message", "LocalMacOSVoiceHelperHealthResult"),
        status,
      };
    case "model_hash_mismatch":
      assertKnownFields(record, "LocalMacOSVoiceHelperHealthResult", [
        "actualSHA256",
        "expectedSHA256",
        "message",
        "status",
      ]);
      return {
        actualSHA256: stringField(record, "actualSHA256", "LocalMacOSVoiceHelperHealthResult"),
        expectedSHA256: stringField(record, "expectedSHA256", "LocalMacOSVoiceHelperHealthResult"),
        message: stringField(record, "message", "LocalMacOSVoiceHelperHealthResult"),
        status,
      };
    default:
      throw new Error("LocalMacOSVoiceHelperHealthResult.status is unsupported");
  }
}

function decodeSessionResult(value: unknown, label: string): LocalMacOSVoiceCaptureStarted {
  const record = assertRecord(value, `LocalMacOSVoiceHelper.${label}`);
  assertKnownFields(record, `LocalMacOSVoiceHelper.${label}`, ["sessionId"]);
  return { sessionId: stringField(record, "sessionId", `LocalMacOSVoiceHelper.${label}`) };
}

function decodeTranscriptionResult(value: unknown): LocalMacOSVoiceTranscriptionResult {
  const record = assertRecord(value, "LocalMacOSVoiceHelper.finish_capture");
  assertKnownFields(record, "LocalMacOSVoiceHelper.finish_capture", ["sessionId", "transcript"]);
  return {
    sessionId: stringField(record, "sessionId", "LocalMacOSVoiceHelper.finish_capture"),
    transcript: stringField(record, "transcript", "LocalMacOSVoiceHelper.finish_capture"),
  };
}

function decodeSynthesisResult(value: unknown): LocalMacOSVoiceSynthesisResult {
  const record = assertRecord(value, "LocalMacOSVoiceHelper.synthesize_speech");
  assertKnownFields(record, "LocalMacOSVoiceHelper.synthesize_speech", [
    "audioBase64",
    "format",
    "mediaType",
    "operationId",
  ]);
  return {
    audioBase64: stringField(record, "audioBase64", "LocalMacOSVoiceHelper.synthesize_speech"),
    format: stringField(record, "format", "LocalMacOSVoiceHelper.synthesize_speech"),
    mediaType: stringField(record, "mediaType", "LocalMacOSVoiceHelper.synthesize_speech"),
    operationId: stringField(record, "operationId", "LocalMacOSVoiceHelper.synthesize_speech"),
  };
}

function decodeSynthesisCancelResult(
  value: unknown,
  label: string,
): LocalMacOSVoiceSynthesisCanceled {
  const record = assertRecord(value, `LocalMacOSVoiceHelper.${label}`);
  assertKnownFields(record, `LocalMacOSVoiceHelper.${label}`, ["operationId"]);
  return { operationId: stringField(record, "operationId", `LocalMacOSVoiceHelper.${label}`) };
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertKnownFields(
  record: Record<string, unknown>,
  label: string,
  fields: readonly string[],
): void {
  const known = new Set(fields);
  for (const field of Object.keys(record)) {
    if (!known.has(field)) {
      throw new Error(`${label} contains unknown field ${field}`);
    }
  }
}

function stringField(record: Record<string, unknown>, field: string, label: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`${label}.${field} must be a string`);
  }
  return value;
}

function booleanField(record: Record<string, unknown>, field: string, label: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new Error(`${label}.${field} must be a boolean`);
  }
  return value;
}

function normalizedOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }
  return value;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected local macOS voice helper value: ${JSON.stringify(value)}`);
}
