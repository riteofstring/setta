import {
  callOpenAPI,
  getErrorCode,
  getErrorDetail,
  res200,
} from "@setta/app-subsystem-frontend-sdk";

import {
  appendTranscriptionAudio as apiAppendTranscriptionAudio,
  cancelTranscriptionSession as apiCancelTranscriptionSession,
  createAgentProfile as apiCreateAgentProfile,
  createExternalAgentConfig as apiCreateExternalAgentConfig,
  createPromptTemplate as apiCreatePromptTemplate,
  createTranscriptionProfile as apiCreateTranscriptionProfile,
  deleteAgentProfile as apiDeleteAgentProfile,
  deleteExternalAgentConfig as apiDeleteExternalAgentConfig,
  deletePromptTemplate as apiDeletePromptTemplate,
  deleteTranscriptionProfile as apiDeleteTranscriptionProfile,
  startTranscriptionSession as apiStartTranscriptionSession,
  stopTranscriptionSession as apiStopTranscriptionSession,
  updateAgentProfile as apiUpdateAgentProfile,
  updateExternalAgentConfig as apiUpdateExternalAgentConfig,
  updatePromptTemplate as apiUpdatePromptTemplate,
  updateTranscriptionProfile as apiUpdateTranscriptionProfile,
  getLlmApiKeys,
  getLlmConfig,
  setLlmConfig,
  type AgentprofilesProfile,
  type AgentrunsEngineConfig,
  type ExternalagentconfigsConfig,
  type HttpapiExternalAgentPreflightStatus,
  type HttpapiLlmapiKeysSnapshot,
  type HttpapiStartTranscriptionSessionResponse,
  type LlmconfigAllConfigs,
  type PrompttemplatesTemplate,
  type TranscriptionprofilesProfile,
  type TranscriptionsessionsDelta,
} from "openapi/http";

import { addTemporaryNotification } from "state/actions/notifications";

import { useAIStore } from "state/definitions";

import { C } from "utils/c";

import {
  AgentProfile,
  AllConfigs,
  ChatPermissionMode,
  ChatPermissionModeEnum,
  EngineConfig,
  ExternalAgentConfig,
  NotificationTypeEnum,
  Template,
  TranscriptionProfile,
} from "utils/generatedTypes";

import { ProviderTranscriptionError } from "utils/transcriptionErrors";

import { isRecord } from "./streamingChunksAndTools";

export type ExternalAgentHealthStatus = HttpapiExternalAgentPreflightStatus;

export type ManagedApiKeysSnapshot = HttpapiLlmapiKeysSnapshot;

export type APIKeys = ManagedApiKeysSnapshot["apiKeys"];

export type AIStateSnapshot = ReturnType<typeof useAIStore.getState>;

export const scopeViolationToastTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

export let llmConfigLoadPromise: Promise<void> | null = null;

export let llmApiKeysLoadPromise: Promise<void> | null = null;

export const stopEligibleAssistantMessageIdByChatId = new Map<string, string>();

export const MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE =
  "managed_api_keys_revision_conflict";

export const MANAGED_API_KEYS_CORRUPT_ERROR_CODE =
  "managed_api_keys_store_corrupt";

export const MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE =
  "managed_api_keys_store_unavailable";

export const AGENT_RUNS_RETRY_DELAYS_MS = [300, 1000, 2500] as const;

export type APIKeysMutation = (currentApiKeys: APIKeys) => APIKeys;

export type ChatExecutionSettings = {
  permissionMode: ChatPermissionMode;
  searchEnabled: boolean;
};

export type CreateAgentProfileBody = NonNullable<
  Parameters<typeof apiCreateAgentProfile>[0]["body"]
>;

export type UpdateAgentProfileBody = NonNullable<
  Parameters<typeof apiUpdateAgentProfile>[0]["body"]
>;

export type DeleteAgentProfileBody = NonNullable<
  Parameters<typeof apiDeleteAgentProfile>[0]["body"]
>;

export type CreateTranscriptionProfileBody = NonNullable<
  Parameters<typeof apiCreateTranscriptionProfile>[0]["body"]
>;

export type UpdateTranscriptionProfileBody = NonNullable<
  Parameters<typeof apiUpdateTranscriptionProfile>[0]["body"]
>;

export type DeleteTranscriptionProfileBody = NonNullable<
  Parameters<typeof apiDeleteTranscriptionProfile>[0]["body"]
>;

export type CreatePromptTemplateBody = NonNullable<
  Parameters<typeof apiCreatePromptTemplate>[0]["body"]
>;

export type UpdatePromptTemplateBody = NonNullable<
  Parameters<typeof apiUpdatePromptTemplate>[0]["body"]
>;

export type DeletePromptTemplateBody = NonNullable<
  Parameters<typeof apiDeletePromptTemplate>[0]["body"]
>;

export type CreateExternalAgentConfigBody = NonNullable<
  Parameters<typeof apiCreateExternalAgentConfig>[0]["body"]
>;

export type UpdateExternalAgentConfigBody = NonNullable<
  Parameters<typeof apiUpdateExternalAgentConfig>[0]["body"]
>;

export type DeleteExternalAgentConfigBody = NonNullable<
  Parameters<typeof apiDeleteExternalAgentConfig>[0]["body"]
>;

export const DEFAULT_CHAT_EXECUTION_SETTINGS: ChatExecutionSettings = {
  permissionMode: ChatPermissionModeEnum.minimal,
  searchEnabled: true,
};

export function valueOrNull<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

export function arrayOrEmpty<T>(value: T[] | null | undefined): T[] {
  return value ?? [];
}

export function requireNonNull<T>(
  value: T | null | undefined,
  message: string,
): NonNullable<T> {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

export function normalizeLLMConfigPayload(
  payload: LlmconfigAllConfigs,
): AllConfigs {
  return {
    ...payload,
    configs: Object.fromEntries(
      Object.entries(payload.configs).map(([id, config]) => [
        id,
        {
          ...config,
          mcpServerIds: config.mcpServerIds ?? [],
        },
      ]),
    ),
    defaultMcpServerIds: payload.defaultMcpServerIds ?? [],
    mcpServers: Object.fromEntries(
      Object.entries(payload.mcpServers).map(([id, server]) => [
        id,
        {
          ...server,
          args: server.args ?? [],
        },
      ]),
    ),
  } as AllConfigs;
}

export function normalizeLLMApiKeysSnapshot(
  payload: ManagedApiKeysSnapshot,
): ManagedApiKeysSnapshot {
  return payload;
}

export function normalizeAgentProfile(
  profile: AgentprofilesProfile,
): AgentProfile {
  return {
    ...profile,
    toolAllowlist: profile.toolAllowlist ?? [],
  };
}

export function normalizePromptTemplate(
  template: PrompttemplatesTemplate,
): Template {
  return template as Template;
}

export function normalizeExternalAgentConfig(
  config: ExternalagentconfigsConfig,
): ExternalAgentConfig {
  return {
    ...config,
    approvalPolicy: valueOrNull(config.approvalPolicy),
    baseUrl: valueOrNull(config.baseUrl),
    codexSkipGitRepoCheck: valueOrNull(config.codexSkipGitRepoCheck),
    commandPath: valueOrNull(config.commandPath),
    defaultModel: valueOrNull(config.defaultModel),
    envVarWhitelist: arrayOrEmpty(config.envVarWhitelist),
    sandboxPolicy: valueOrNull(config.sandboxPolicy),
    settingsFilePath: valueOrNull(config.settingsFilePath),
    settingsManagedBlock: valueOrNull(config.settingsManagedBlock),
    settingsSources: arrayOrEmpty(config.settingsSources),
    workingDir: valueOrNull(config.workingDir),
  } as ExternalAgentConfig;
}

export function normalizeExternalAgentHealth(
  status: ExternalAgentHealthStatus,
): ExternalAgentHealthStatus {
  return {
    ...status,
    envVars: {
      missing: status.envVars.missing ?? [],
      present: status.envVars.present ?? [],
    },
    issues: status.issues ?? [],
  } as ExternalAgentHealthStatus;
}

export function normalizeEngineConfig(
  config: AgentrunsEngineConfig,
): EngineConfig {
  return {
    ...config,
    defaults: {
      thinking: config.defaults?.thinking ?? null,
    },
    externalAgentConfigId: config.externalAgentConfigId ?? null,
    runtimeSupport: config.runtimeSupport ?? null,
    settaLlmConfigId: config.settaLlmConfigId ?? null,
  } as EngineConfig;
}

export function normalizeTranscriptionProfile(
  profile: TranscriptionprofilesProfile,
): TranscriptionProfile {
  return {
    ...profile,
    language: profile.language ?? null,
  } as TranscriptionProfile;
}

export function encodeArrayBufferBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) {
    return "";
  }
  const CHUNK_SIZE = 0x8000;
  const binaryChunks: string[] = [];
  for (let index = 0; index < bytes.length; index += CHUNK_SIZE) {
    const chunk = bytes.subarray(index, index + CHUNK_SIZE);
    binaryChunks.push(String.fromCharCode(...chunk));
  }
  return btoa(binaryChunks.join(""));
}

export async function startTranscriptionSession(
  transcriptionProfileId: string,
  language: string | null = null,
  options: TranscriptionRequestOptions = {},
): Promise<HttpapiStartTranscriptionSessionResponse | null> {
  if (!transcriptionProfileId) {
    return null;
  }
  const res = await callOpenAPI(
    apiStartTranscriptionSession({
      body: {
        transcriptionProfileId,
        language,
      },
    } as Parameters<typeof apiStartTranscriptionSession>[0]),
  );
  if (!res200(res)) {
    return handleTranscriptionEndpointError(res.data, res.status, options);
  }
  return res.data;
}

export async function appendTranscriptionAudio(
  sessionId: string,
  audioPcm16: ArrayBuffer,
  sampleRateHz: number,
  channels: number,
  options: TranscriptionRequestOptions = {},
): Promise<TranscriptionsessionsDelta | null> {
  if (!sessionId || audioPcm16.byteLength === 0) {
    return null;
  }
  const res = await callOpenAPI(
    apiAppendTranscriptionAudio({
      body: {
        sessionId,
        audioPcm16Base64: encodeArrayBufferBase64(audioPcm16),
        sampleRateHz,
        channels,
      },
    } as Parameters<typeof apiAppendTranscriptionAudio>[0]),
  );
  if (!res200(res)) {
    return handleTranscriptionEndpointError(res.data, res.status, options);
  }
  return res.data;
}

export async function stopTranscriptionSession(
  sessionId: string,
  options: TranscriptionRequestOptions = {},
): Promise<TranscriptionsessionsDelta | null> {
  if (!sessionId) {
    return null;
  }
  const res = await callOpenAPI(
    apiStopTranscriptionSession({
      body: { sessionId },
    } as Parameters<typeof apiStopTranscriptionSession>[0]),
  );
  if (!res200(res)) {
    return handleTranscriptionEndpointError(res.data, res.status, options);
  }
  return res.data;
}

export async function cancelTranscriptionSession(
  sessionId: string,
): Promise<boolean> {
  if (!sessionId) {
    return true;
  }
  const res = await callOpenAPI(
    apiCancelTranscriptionSession({
      body: { sessionId },
    } as Parameters<typeof apiCancelTranscriptionSession>[0]),
  );
  return res200(res);
}

export type DictationPcmPayload = {
  audioPcm16: Int16Array;
  sampleRateHz: number;
  channels: number;
};

export type ProviderDictationTranscriptionResult =
  | {
      kind: "ok";
      transcript: string;
    }
  | {
      kind: "no_speech";
    };

export const PCM16_BYTES_PER_SAMPLE = 2;

export const REALTIME_TRANSCRIPTION_SAMPLE_RATE_HZ = 24000;

export const TRANSCRIPTION_APPEND_MAX_BYTES =
  C.REALTIME_BINARY_MAX_BYTES > 0
    ? C.REALTIME_BINARY_MAX_BYTES
    : 10 * 1024 * 1024;

export type TranscriptionRequestOptions = {
  suppressNotification?: boolean;
  throwOnError?: boolean;
};

export function handleTranscriptionEndpointError(
  responseData: unknown,
  responseStatus: number | undefined,
  options: TranscriptionRequestOptions,
): null {
  const detail =
    getErrorDetail(responseData) ?? "Provider transcription failed.";
  const errorCode = getErrorCode(responseData);
  const error = new ProviderTranscriptionError({
    message: detail,
    code: errorCode,
    status: responseStatus,
  });
  if (!options.suppressNotification) {
    addTemporaryNotification(detail, NotificationTypeEnum.warning);
  }
  if (options.throwOnError) {
    throw error;
  }
  return null;
}

export function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

export function validateTranscriptionSampleRates(
  sourceSampleRateHz: number,
  targetSampleRateHz: number,
): void {
  if (sourceSampleRateHz <= 0 || targetSampleRateHz <= 0) {
    throw new Error("Provider transcription requires a positive sample rate.");
  }
  if (
    !Number.isFinite(sourceSampleRateHz) ||
    !Number.isFinite(targetSampleRateHz)
  ) {
    throw new Error("Provider transcription requires a finite sample rate.");
  }
}

export function interpolateResampledMonoPcm16Sample(
  input: Int16Array,
  outputIndex: number,
  sourceSampleRateHz: number,
  targetSampleRateHz: number,
): number {
  const sourcePosition =
    (outputIndex * sourceSampleRateHz) / targetSampleRateHz;
  const sourceIndex = Math.floor(sourcePosition);
  const nextSourceIndex = Math.min(sourceIndex + 1, input.length - 1);
  const lerpWeight = sourcePosition - sourceIndex;
  const leftSample = input[sourceIndex] ?? 0;
  const rightSample = input[nextSourceIndex] ?? leftSample;
  const interpolatedSample =
    leftSample * (1 - lerpWeight) + rightSample * lerpWeight;
  return Math.max(-0x8000, Math.min(0x7fff, Math.round(interpolatedSample)));
}

export function resampleMonoPcm16ToSampleRate(
  input: Int16Array,
  sourceSampleRateHz: number,
  targetSampleRateHz: number,
): Int16Array {
  validateTranscriptionSampleRates(sourceSampleRateHz, targetSampleRateHz);
  if (input.length === 0 || sourceSampleRateHz === targetSampleRateHz) {
    return input;
  }
  const outputLength = Math.max(
    1,
    Math.round((input.length * targetSampleRateHz) / sourceSampleRateHz),
  );
  const output = new Int16Array(outputLength);
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    output[outputIndex] = interpolateResampledMonoPcm16Sample(
      input,
      outputIndex,
      sourceSampleRateHz,
      targetSampleRateHz,
    );
  }
  return output;
}

export function resolveProviderTranscriptionPcmPayloadForSession(
  pcmPayload: DictationPcmPayload,
  session: HttpapiStartTranscriptionSessionResponse,
): DictationPcmPayload {
  if (session.resolvedTransportMode !== "realtime") {
    return pcmPayload;
  }
  if (pcmPayload.channels !== 1) {
    throw new Error("Realtime transcription requires mono PCM16 audio.");
  }
  if (
    pcmPayload.sampleRateHz <= 0 ||
    !Number.isFinite(pcmPayload.sampleRateHz)
  ) {
    throw new Error("Realtime transcription requires a valid sample rate.");
  }
  if (pcmPayload.sampleRateHz === REALTIME_TRANSCRIPTION_SAMPLE_RATE_HZ) {
    return pcmPayload;
  }
  return {
    audioPcm16: resampleMonoPcm16ToSampleRate(
      pcmPayload.audioPcm16,
      pcmPayload.sampleRateHz,
      REALTIME_TRANSCRIPTION_SAMPLE_RATE_HZ,
    ),
    sampleRateHz: REALTIME_TRANSCRIPTION_SAMPLE_RATE_HZ,
    channels: 1,
  };
}

export function resolveProviderTranscriptionChunkSampleCount({
  session,
  sampleRateHz,
  channels,
}: {
  session: HttpapiStartTranscriptionSessionResponse;
  sampleRateHz: number;
  channels: number;
}): number {
  if (sampleRateHz <= 0 || channels <= 0) {
    return 0;
  }
  const maxSamplesByPayload = Math.floor(
    TRANSCRIPTION_APPEND_MAX_BYTES / (PCM16_BYTES_PER_SAMPLE * channels),
  );
  if (maxSamplesByPayload <= 0) {
    return 0;
  }
  if (session.resolvedTransportMode !== "realtime") {
    return maxSamplesByPayload;
  }
  const chunkMs = session.chunkMs > 0 ? session.chunkMs : 200;
  const chunkSamplesByDuration = Math.floor((sampleRateHz * chunkMs) / 1000);
  if (chunkSamplesByDuration <= 0) {
    return 1;
  }
  return Math.min(chunkSamplesByDuration, maxSamplesByPayload);
}

export async function decodeDictationBlobToPcm16(
  audioBlob: Blob,
): Promise<DictationPcmPayload | null> {
  if (typeof window === "undefined") {
    return null;
  }
  const withWebkitAudioContext = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextCtor =
    window.AudioContext ?? withWebkitAudioContext.webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }
  const audioContext = new AudioContextCtor();
  try {
    const audioBuffer = await audioBlob.arrayBuffer();
    const decodedBuffer = await audioContext.decodeAudioData(
      audioBuffer.slice(0),
    );
    const channelCount = Math.max(decodedBuffer.numberOfChannels, 1);
    const sampleCount = decodedBuffer.length;
    const mono = new Float32Array(sampleCount);
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const channelData = decodedBuffer.getChannelData(channelIndex);
      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        const currentSample = mono[sampleIndex] ?? 0;
        const channelSample = channelData[sampleIndex] ?? 0;
        mono[sampleIndex] = currentSample + channelSample / channelCount;
      }
    }
    const pcm16 = float32ToInt16(mono);
    return {
      audioPcm16: pcm16,
      sampleRateHz: decodedBuffer.sampleRate,
      channels: 1,
    };
  } catch {
    return null;
  } finally {
    void audioContext.close();
  }
}

export function asProviderDictationTranscriptionError(
  error: unknown,
  fallbackMessage: string,
): ProviderTranscriptionError {
  if (error instanceof ProviderTranscriptionError) {
    return error;
  }
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : fallbackMessage;
  return new ProviderTranscriptionError({
    message,
    code: "provider_failure",
    status: undefined,
  });
}

// eslint-disable-next-line complexity
export async function transcribeChatAudioWithProfile(
  transcriptionProfileId: string,
  audioBlob: Blob,
): Promise<ProviderDictationTranscriptionResult> {
  if (!transcriptionProfileId) {
    throw new ProviderTranscriptionError({
      message: "Provider dictation profile is not configured.",
      code: "profile_not_found",
      status: undefined,
    });
  }
  if (audioBlob.size === 0) {
    return { kind: "no_speech" };
  }
  const pcmPayload = await decodeDictationBlobToPcm16(audioBlob);
  if (!pcmPayload) {
    throw new ProviderTranscriptionError({
      message: "Provider dictation is not available in this browser.",
      code: "provider_failure",
      status: undefined,
    });
  }
  const session = await startTranscriptionSession(
    transcriptionProfileId,
    null,
    {
      suppressNotification: true,
      throwOnError: true,
    },
  );
  if (!session) {
    throw new ProviderTranscriptionError({
      message: "Provider transcription session could not be started.",
      code: "provider_failure",
      status: undefined,
    });
  }
  const sessionId = session.sessionId;
  const sessionPcmPayload = resolveProviderTranscriptionPcmPayloadForSession(
    pcmPayload,
    session,
  );
  const chunkSampleCount = resolveProviderTranscriptionChunkSampleCount({
    session,
    sampleRateHz: sessionPcmPayload.sampleRateHz,
    channels: sessionPcmPayload.channels,
  });
  if (chunkSampleCount <= 0) {
    await cancelTranscriptionSession(sessionId);
    throw new ProviderTranscriptionError({
      message: "Provider transcription chunk size is invalid.",
      code: "provider_failure",
      status: undefined,
    });
  }
  if (sessionPcmPayload.audioPcm16.length === 0) {
    await cancelTranscriptionSession(sessionId);
    return { kind: "no_speech" };
  }
  const appendTextSegments: string[] = [];
  try {
    for (
      let offset = 0;
      offset < sessionPcmPayload.audioPcm16.length;
      offset += chunkSampleCount
    ) {
      const nextOffset = Math.min(
        offset + chunkSampleCount,
        sessionPcmPayload.audioPcm16.length,
      );
      const chunk = sessionPcmPayload.audioPcm16.slice(offset, nextOffset);
      const appendDelta = await appendTranscriptionAudio(
        sessionId,
        chunk.buffer,
        sessionPcmPayload.sampleRateHz,
        sessionPcmPayload.channels,
        {
          suppressNotification: true,
          throwOnError: true,
        },
      );
      if (!appendDelta) {
        await cancelTranscriptionSession(sessionId);
        throw new ProviderTranscriptionError({
          message: "Provider transcription append returned no result.",
          code: "provider_failure",
          status: undefined,
        });
      }
      appendTextSegments.push(appendDelta.appendText);
    }
  } catch (error) {
    await cancelTranscriptionSession(sessionId);
    throw asProviderDictationTranscriptionError(
      error,
      "Provider transcription append failed.",
    );
  }
  let stopDelta: TranscriptionsessionsDelta | null = null;
  try {
    stopDelta = await stopTranscriptionSession(sessionId, {
      suppressNotification: true,
      throwOnError: true,
    });
  } catch (error) {
    await cancelTranscriptionSession(sessionId);
    throw asProviderDictationTranscriptionError(
      error,
      "Provider transcription stop failed.",
    );
  }
  if (!stopDelta) {
    await cancelTranscriptionSession(sessionId);
    throw new ProviderTranscriptionError({
      message: "Provider transcription stop returned no result.",
      code: "provider_failure",
      status: undefined,
    });
  }
  const fullText = stopDelta.fullText.trim();
  if (fullText) {
    return { kind: "ok", transcript: fullText };
  }
  const appendText =
    `${appendTextSegments.join("")}${stopDelta.appendText}`.trim();
  if (appendText) {
    return { kind: "ok", transcript: appendText };
  }
  return { kind: "no_speech" };
}

export async function loadLLMConfig() {
  if (llmConfigLoadPromise) {
    await llmConfigLoadPromise;
    return;
  }
  llmConfigLoadPromise = (async () => {
    const res = await callOpenAPI(getLlmConfig());
    if (res200(res)) {
      receiveLLMConfigUpdate(normalizeLLMConfigPayload(res.data));
      return;
    }
    useAIStore.setState({
      allLLMConfigsInitialLoadComplete: true,
      allLLMConfigsLoadError: "Failed to load LLM config",
    });
  })();
  try {
    await llmConfigLoadPromise;
  } finally {
    llmConfigLoadPromise = null;
  }
}

export async function saveLLMConfig(
  config: AllConfigs,
): Promise<AllConfigs | null> {
  const res = await callOpenAPI(
    setLlmConfig({ body: config } as Parameters<typeof setLlmConfig>[0]),
  );
  if (!res200(res)) {
    useAIStore.setState({
      allLLMConfigsInitialLoadComplete: true,
      allLLMConfigsLoadError: "Failed to save LLM config",
    });
    return null;
  }
  const nextConfig = normalizeLLMConfigPayload(res.data);
  receiveLLMConfigUpdate(nextConfig);
  return nextConfig;
}

export type ManagedAPIKeysErrorDetails = {
  detail: string | null;
  revision: number | null;
  errorCode: string | null;
  isCorrupt: boolean;
  isUnavailable: boolean;
};

export function resolveManagedApiKeysErrorDetails(
  payload: unknown,
): ManagedAPIKeysErrorDetails {
  const detail = getErrorDetail(payload);
  const revision = extractApiKeysRevisionFromErrorPayload(payload);
  const errorCode = getErrorCode(payload);
  const isCorrupt = errorCode === MANAGED_API_KEYS_CORRUPT_ERROR_CODE;
  const isUnavailable = errorCode === MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE;
  return {
    detail,
    revision,
    errorCode,
    isCorrupt,
    isUnavailable,
  };
}

export function applyManagedApiKeysReadFailure(payload: unknown): void {
  const errorDetails = resolveManagedApiKeysErrorDetails(payload);
  useAIStore.setState((state) => ({
    apiKeys:
      errorDetails.isCorrupt || errorDetails.isUnavailable ? {} : state.apiKeys,
    apiKeysRevision: errorDetails.revision ?? state.apiKeysRevision,
    apiKeysAuthoritative: errorDetails.isCorrupt,
    apiKeysInitialLoadComplete: true,
    apiKeysLoadError: errorDetails.detail ?? "Failed to load LLM API keys",
  }));
}

export function applyManagedApiKeysWriteFailure({
  payload,
  fallbackMessage,
  fallbackAuthoritative,
}: {
  payload: unknown;
  fallbackMessage: string;
  fallbackAuthoritative: boolean;
}): {
  shouldRetryCorruptWrite: boolean;
} {
  const errorDetails = resolveManagedApiKeysErrorDetails(payload);
  if (errorDetails.isCorrupt) {
    useAIStore.setState((state) => ({
      apiKeys: {},
      apiKeysRevision: errorDetails.revision ?? state.apiKeysRevision,
      apiKeysAuthoritative: errorDetails.revision !== null,
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError:
        errorDetails.detail ?? "Managed API key store is corrupt.",
    }));
    return {
      shouldRetryCorruptWrite: errorDetails.revision !== null,
    };
  }
  if (errorDetails.isUnavailable) {
    useAIStore.setState({
      apiKeys: {},
      apiKeysAuthoritative: false,
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError:
        errorDetails.detail ?? "Managed API key store is unavailable.",
    });
    return { shouldRetryCorruptWrite: false };
  }
  useAIStore.setState({
    apiKeysAuthoritative: fallbackAuthoritative,
    apiKeysInitialLoadComplete: true,
    apiKeysLoadError: errorDetails.detail ?? fallbackMessage,
  });
  return { shouldRetryCorruptWrite: false };
}

export async function loadLLMApiKeys() {
  if (llmApiKeysLoadPromise) {
    await llmApiKeysLoadPromise;
    return;
  }
  llmApiKeysLoadPromise = (async () => {
    const res = await callOpenAPI(getLlmApiKeys());
    if (res200(res)) {
      receiveLLMApiKeysSnapshotUpdate(normalizeLLMApiKeysSnapshot(res.data));
      return;
    }
    applyManagedApiKeysReadFailure(res.data);
  })();
  try {
    await llmApiKeysLoadPromise;
  } finally {
    llmApiKeysLoadPromise = null;
  }
}

export function receiveLLMConfigUpdate(payload: AllConfigs) {
  useAIStore.setState({
    allLLMConfigs: payload,
    allLLMConfigsInitialLoadComplete: true,
    allLLMConfigsLoadError: null,
  });
}

export function receiveLLMApiKeysSnapshotUpdate(
  payload: ManagedApiKeysSnapshot,
) {
  const isCorrupt =
    payload.corrupt === true ||
    payload.errorCode === MANAGED_API_KEYS_CORRUPT_ERROR_CODE;
  const isUnavailable =
    payload.errorCode === MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE;
  let apiKeysLoadError: string | null = null;
  if (isCorrupt) {
    apiKeysLoadError = payload.message ?? "Managed API key store is corrupt.";
  } else if (isUnavailable) {
    apiKeysLoadError =
      payload.message ?? "Managed API key store is unavailable.";
  }
  useAIStore.setState({
    apiKeys: payload.apiKeys,
    apiKeysRevision: payload.revision,
    apiKeysAuthoritative: !isUnavailable,
    apiKeysInitialLoadComplete: true,
    apiKeysLoadError,
  });
}

export function extractApiKeysRevisionFromErrorPayload(
  value: unknown,
): number | null {
  if (!isRecord(value)) {
    return null;
  }
  const revision = value.revision;
  if (
    typeof revision === "number" &&
    Number.isInteger(revision) &&
    revision >= 0
  ) {
    return revision;
  }
  return extractApiKeysRevisionFromErrorPayload(value.detail);
}

export async function refreshLLMApiKeysSnapshotFromServer(): Promise<boolean> {
  const res = await callOpenAPI(getLlmApiKeys());
  if (res200(res)) {
    receiveLLMApiKeysSnapshotUpdate(normalizeLLMApiKeysSnapshot(res.data));
    return true;
  }
  applyManagedApiKeysReadFailure(res.data);
  return false;
}
