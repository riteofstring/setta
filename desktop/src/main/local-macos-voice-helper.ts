import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access, constants } from "node:fs/promises";

import type { SpeechVoiceCatalog, SpeechVoiceID } from "@generated/backend";
import type { LocalMacOSVoiceHealth } from "@shared/speech-ipc";
import { localMacOSSpeechProviderID } from "@shared/speech-providers";
import {
  decodeHealthResult,
  decodeHelperOutputEnvelope,
  decodeSessionResult,
  decodeSynthesisCancelResult,
  decodeSynthesisResult,
  decodeTranscriptionResult,
  decodeVoiceCatalogResult,
  type HelperResponseEnvelope,
} from "./local-macos-voice-helper-decoders";
import {
  decodeListenerLifecycleResult,
  type LocalMacOSVoiceHelperStartListenerRequest,
  type LocalMacOSVoiceListenerEventHandler,
  type LocalMacOSVoiceListenerPaused,
  type LocalMacOSVoiceListenerResumed,
  type LocalMacOSVoiceListenerStarted,
  type LocalMacOSVoiceListenerStopped,
  type LocalMacOSVoicePauseListenerRequest,
  type LocalMacOSVoiceResumeListenerRequest,
  type LocalMacOSVoiceStartListenerRequest,
  type LocalMacOSVoiceStopListenerRequest,
} from "./local-macos-voice-helper-listener";
import type { HelperListenerEventEnvelope } from "./local-macos-voice-helper-listener";
import {
  resolveLocalMacOSVoiceHelperConfiguration,
  type LocalMacOSVoiceEnvironmentOptions,
} from "./local-macos-voice-resources";
import { sha256File } from "./file-hash";
import type { LocalMacOSVoiceListenerEngineEvent } from "./local-macos-voice-listener";

export type {
  LocalMacOSVoiceHelperStartListenerRequest,
  LocalMacOSVoiceListenerEventHandler,
  LocalMacOSVoiceListenerPaused,
  LocalMacOSVoiceListenerResumed,
  LocalMacOSVoiceListenerStarted,
  LocalMacOSVoiceListenerStopped,
  LocalMacOSVoicePauseListenerRequest,
  LocalMacOSVoiceResumeListenerRequest,
  LocalMacOSVoiceStartListenerRequest,
  LocalMacOSVoiceStopListenerRequest,
} from "./local-macos-voice-helper-listener";

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
  listVoices: () => Promise<SpeechVoiceCatalog>;
  pauseListener: (
    request: LocalMacOSVoicePauseListenerRequest,
  ) => Promise<LocalMacOSVoiceListenerPaused>;
  readHealth: () => Promise<LocalMacOSVoiceHealth>;
  resumeListener: (
    request: LocalMacOSVoiceResumeListenerRequest,
  ) => Promise<LocalMacOSVoiceListenerResumed>;
  shutdown: () => void;
  startCapture: (
    request: Omit<LocalMacOSVoiceStartCaptureRequest, "modelPath">,
  ) => Promise<LocalMacOSVoiceCaptureStarted>;
  startListener: (
    request: LocalMacOSVoiceStartListenerRequest,
    onEvent: LocalMacOSVoiceListenerEventHandler,
  ) => Promise<LocalMacOSVoiceListenerStarted>;
  stopListener: (
    request: LocalMacOSVoiceStopListenerRequest,
  ) => Promise<LocalMacOSVoiceListenerStopped>;
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
  configurationFailure?: LocalMacOSVoiceUnavailableHealth;
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
  listVoices: () => Promise<LocalMacOSVoiceCatalogResult>;
  readHealth: (
    request: LocalMacOSVoiceHelperHealthRequest,
  ) => Promise<LocalMacOSVoiceHelperHealthResult>;
  pauseListener: (
    request: LocalMacOSVoicePauseListenerRequest,
  ) => Promise<LocalMacOSVoiceListenerPaused>;
  resumeListener: (
    request: LocalMacOSVoiceResumeListenerRequest,
  ) => Promise<LocalMacOSVoiceListenerResumed>;
  shutdown: () => void;
  startCapture: (
    request: LocalMacOSVoiceStartCaptureRequest,
  ) => Promise<LocalMacOSVoiceCaptureStarted>;
  startListener: (
    request: LocalMacOSVoiceHelperStartListenerRequest,
    onEvent: LocalMacOSVoiceListenerEventHandler,
  ) => Promise<LocalMacOSVoiceListenerStarted>;
  stopListener: (
    request: LocalMacOSVoiceStopListenerRequest,
  ) => Promise<LocalMacOSVoiceListenerStopped>;
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

export interface LocalMacOSVoiceCatalogResult {
  version: string;
  voiceIds: SpeechVoiceID[];
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
  | "list_voices"
  | "pause_listener"
  | "read_health"
  | "resume_listener"
  | "start_capture"
  | "start_listener"
  | "stop_listener"
  | "synthesize_speech";

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
  options: LocalMacOSVoiceEnvironmentOptions = {},
): LocalMacOSVoiceHelper {
  const configuration = resolveLocalMacOSVoiceHelperConfiguration(
    env,
    options.resourceRoots ?? [],
    options.defaultModel,
  );
  return new LocalMacOSVoiceHealthService({
    configurationFailure: configuration.configurationFailure,
    expectedModelSHA256: configuration.expectedModelSHA256,
    helperPath: configuration.helperPath,
    modelPath: configuration.modelPath,
    platform,
  });
}

export class LocalMacOSVoiceHealthService implements LocalMacOSVoiceHelper {
  private client: LocalMacOSVoiceHelperClient | null = null;
  private readonly configurationFailure: LocalMacOSVoiceUnavailableHealth | null;
  private readonly expectedModelSHA256: string | null;
  private readonly helperPath: string | null;
  private readonly modelPath: string | null;
  private readonly platform: NodeJS.Platform;

  constructor(private readonly options: LocalMacOSVoiceHealthServiceOptions) {
    this.configurationFailure = options.configurationFailure ?? null;
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

  async startListener(
    request: LocalMacOSVoiceStartListenerRequest,
    onEvent: LocalMacOSVoiceListenerEventHandler,
  ): Promise<LocalMacOSVoiceListenerStarted> {
    const preflight = await this.readReadyPreflight();
    if (preflight.status === "unavailable") {
      throw new LocalMacOSVoiceHelperUnavailableError(preflight.health);
    }
    return this.requireClient().startListener(
      {
        ...request,
        transcriptionModelPath: preflight.modelPath,
      },
      onEvent,
    );
  }

  stopListener(
    request: LocalMacOSVoiceStopListenerRequest,
  ): Promise<LocalMacOSVoiceListenerStopped> {
    return this.requireClient().stopListener(request);
  }

  pauseListener(
    request: LocalMacOSVoicePauseListenerRequest,
  ): Promise<LocalMacOSVoiceListenerPaused> {
    return this.requireClient().pauseListener(request);
  }

  resumeListener(
    request: LocalMacOSVoiceResumeListenerRequest,
  ): Promise<LocalMacOSVoiceListenerResumed> {
    return this.requireClient().resumeListener(request);
  }

  finishCapture(
    request: LocalMacOSVoiceFinishCaptureRequest,
  ): Promise<LocalMacOSVoiceTranscriptionResult> {
    return this.requireClient().finishCapture(request);
  }

  async listVoices(): Promise<SpeechVoiceCatalog> {
    const preflight = await this.readHelperPreflight();
    if (preflight.status === "unavailable") {
      throw new LocalMacOSVoiceHelperUnavailableError(preflight.health);
    }
    const catalog = await this.requireClient().listVoices();
    return {
      provider: localMacOSProvider,
      version: catalog.version,
      voiceIds: catalog.voiceIds,
    };
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
    if (this.configurationFailure !== null) {
      return {
        health: this.configurationFailure,
        status: "unavailable",
      };
    }
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
    if (this.configurationFailure !== null) {
      return {
        health: this.configurationFailure,
        status: "unavailable",
      };
    }
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
  private listenerEventHandler: LocalMacOSVoiceListenerEventHandler | null = null;
  private pending = new Map<string, PendingCommand>();
  private sequence = 0;

  constructor(private readonly options: LocalMacOSVoiceHelperProcessClientOptions) {}

  readHealth = async (
    request: LocalMacOSVoiceHelperHealthRequest,
  ): Promise<LocalMacOSVoiceHelperHealthResult> =>
    this.decodeCommandResult(await this.sendCommand("read_health", request), decodeHealthResult);

  startCapture = async (
    request: LocalMacOSVoiceStartCaptureRequest,
  ): Promise<LocalMacOSVoiceCaptureStarted> =>
    this.decodeCommandResult(await this.sendCommand("start_capture", request), (result) =>
      decodeSessionResult(result, "start_capture"),
    );

  startListener = async (
    request: LocalMacOSVoiceHelperStartListenerRequest,
    onEvent: LocalMacOSVoiceListenerEventHandler,
  ): Promise<LocalMacOSVoiceListenerStarted> => {
    const previousEventHandler = this.listenerEventHandler;
    this.listenerEventHandler = onEvent;
    try {
      return this.decodeCommandResult(await this.sendCommand("start_listener", request), (result) =>
        decodeListenerLifecycleResult(result, "start_listener", "started"),
      );
    } catch (error) {
      if (this.listenerEventHandler === onEvent) {
        this.listenerEventHandler = previousEventHandler;
      }
      throw error;
    }
  };

  stopListener = async (
    request: LocalMacOSVoiceStopListenerRequest,
  ): Promise<LocalMacOSVoiceListenerStopped> => {
    try {
      return this.decodeCommandResult(await this.sendCommand("stop_listener", request), (result) =>
        decodeListenerLifecycleResult(result, "stop_listener", "stopped"),
      );
    } finally {
      this.listenerEventHandler = null;
    }
  };

  pauseListener = async (
    request: LocalMacOSVoicePauseListenerRequest,
  ): Promise<LocalMacOSVoiceListenerPaused> =>
    this.decodeCommandResult(await this.sendCommand("pause_listener", request), (result) =>
      decodeListenerLifecycleResult(result, "pause_listener", "paused"),
    );

  resumeListener = async (
    request: LocalMacOSVoiceResumeListenerRequest,
  ): Promise<LocalMacOSVoiceListenerResumed> =>
    this.decodeCommandResult(await this.sendCommand("resume_listener", request), (result) =>
      decodeListenerLifecycleResult(result, "resume_listener", "resumed"),
    );

  finishCapture = async (
    request: LocalMacOSVoiceFinishCaptureRequest,
  ): Promise<LocalMacOSVoiceTranscriptionResult> =>
    this.decodeCommandResult(
      await this.sendCommand("finish_capture", request),
      decodeTranscriptionResult,
    );

  listVoices = async (): Promise<LocalMacOSVoiceCatalogResult> =>
    this.decodeCommandResult(await this.sendCommand("list_voices", {}), decodeVoiceCatalogResult);

  cancelCapture = async (
    request: LocalMacOSVoiceCancelCaptureRequest,
  ): Promise<LocalMacOSVoiceCaptureCanceled> =>
    this.decodeCommandResult(await this.sendCommand("cancel_capture", request), (result) =>
      decodeSessionResult(result, "cancel_capture"),
    );

  synthesizeSpeech = async (
    request: LocalMacOSVoiceSynthesisRequest,
  ): Promise<LocalMacOSVoiceSynthesisResult> =>
    this.decodeCommandResult(
      await this.sendCommand("synthesize_speech", request),
      decodeSynthesisResult,
    );

  cancelSynthesis = async (
    request: LocalMacOSVoiceCancelSynthesisRequest,
  ): Promise<LocalMacOSVoiceSynthesisCanceled> =>
    this.decodeCommandResult(await this.sendCommand("cancel_synthesis", request), (result) =>
      decodeSynthesisCancelResult(result, "cancel_synthesis"),
    );

  shutdown(): void {
    const child = this.child;
    this.child = null;
    this.listenerEventHandler = null;
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
      if (this.child !== child) {
        return;
      }
      this.child = null;
      this.failPending(
        new LocalMacOSVoiceHelperProtocolError("Local macOS voice helper failed to start.", {
          cause: error,
        }),
      );
    });
    child.once("exit", (code, signal) => {
      if (this.child !== child) {
        return;
      }
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

    let envelope: HelperResponseEnvelope | HelperListenerEventEnvelope;
    try {
      envelope = decodeHelperOutputEnvelope(decoded);
    } catch (error) {
      this.failProtocol("Local macOS voice helper returned a malformed event.", error);
      return;
    }

    if (envelope.type === "listener_event") {
      this.receiveListenerEvent(envelope.event);
      return;
    }

    const response = envelope;
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
      const error = new LocalMacOSVoiceHelperProtocolError(
        "Local macOS voice helper omitted error details.",
      );
      pending.reject(error);
      this.stopAfterProtocolError(error);
      return;
    }
    pending.reject(
      new LocalMacOSVoiceHelperCommandError(response.error.code, response.error.message),
    );
  }

  private failProtocol(message: string, cause?: unknown): void {
    this.stopAfterProtocolError(new LocalMacOSVoiceHelperProtocolError(message, { cause }));
  }

  private receiveListenerEvent(event: LocalMacOSVoiceListenerEngineEvent): void {
    if (this.listenerEventHandler === null) {
      this.failProtocol("Local macOS voice helper returned a listener event without a listener.");
      return;
    }
    try {
      this.listenerEventHandler(event);
    } catch (cause) {
      this.failProtocol("Local macOS voice listener event handler failed.", cause);
    }
  }

  private decodeCommandResult<T>(result: unknown, decode: (result: unknown) => T): T {
    try {
      return decode(result);
    } catch (cause) {
      const error = new LocalMacOSVoiceHelperProtocolError(
        "Local macOS voice helper returned a malformed event.",
        { cause },
      );
      this.stopAfterProtocolError(error);
      throw error;
    }
  }

  private stopAfterProtocolError(error: LocalMacOSVoiceHelperProtocolError): void {
    this.child?.kill();
    this.child = null;
    this.listenerEventHandler = null;
    this.failPending(error);
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

function normalizedOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }
  return value;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected local macOS voice helper value: ${JSON.stringify(value)}`);
}
