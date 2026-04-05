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
  getExternalAgentChat as apiGetExternalAgentChat,
  getLlmChat as apiGetLlmChat,
  getLlmResponse as apiGetLlmResponse,
  respondExternalAgentApproval as apiRespondExternalAgentApproval,
  respondExternalAgentQuestion as apiRespondExternalAgentQuestion,
  startTranscriptionSession as apiStartTranscriptionSession,
  stopExternalAgentRun as apiStopExternalAgentRun,
  stopLlmChat as apiStopLlmChat,
  stopTranscriptionSession as apiStopTranscriptionSession,
  updateAgentProfile as apiUpdateAgentProfile,
  updateEngineConfig as apiUpdateEngineConfig,
  updateExternalAgentConfig as apiUpdateExternalAgentConfig,
  updatePromptTemplate as apiUpdatePromptTemplate,
  updateTranscriptionProfile as apiUpdateTranscriptionProfile,
  getAgentProfiles,
  getEngineConfigs,
  getExternalAgentConfigs,
  getExternalAgentHealth,
  getLlmApiKeys,
  getLlmConfig,
  getPromptTemplates,
  getTranscriptionProfiles,
  setLlmApiKeys,
  setLlmConfig,
  type AgentprofilesProfile,
  type AgentrunsEngineConfig,
  type ExternalagentconfigsConfig,
  type HttpapiExternalAgentChatResponse,
  type HttpapiExternalAgentPreflightStatus,
  type HttpapiLlmapiKeysSnapshot,
  type HttpapiLlmChatResponse,
  type HttpapiStartTranscriptionSessionResponse,
  type HttpapiStopLlmChatResponse,
  type LlmconfigAllConfigs,
  type PrompttemplatesTemplate,
  type TranscriptionprofilesProfile,
  type TranscriptionsessionsDelta,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  clearAIFollowToolArgumentsForChat,
  getAIFollowToolArgumentsSnapshot,
  receiveAgenticScopeViolationEdges,
  restoreAIFollowToolArgumentsSnapshot,
  SCOPE_VIOLATION_TIMEOUT_MS,
  type AIFollowIdsByType,
} from "state/actions/aiFollow";
import { waitForFrontendAffinityToken } from "state/actions/frontendWebsocketAffinity";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  isManagedChatSection,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  clearChatStreamActive,
  isChatStreamActive,
  markChatStreamActive,
  recordFinalizedMessage,
  shouldPersistOnMessageStop,
} from "state/aiStreamingTracker";
import {
  applyAppSpecPatchPreviewDelta,
  clearAllAppSpecPatchStreams,
  clearAppSpecPatchStream,
} from "state/appSpecPatchStreaming";
import {
  ChatDetails,
  ToolArgumentPreviewEntry,
  ToolArgumentPreviewProjectState,
  useAIStore,
  useAppDefinition,
  useAppPreview,
  useProjectState,
  useToolArgumentPreview,
} from "state/definitions";
import {
  collectChatAppGenerationDetailsByChatId,
  getDefaultChatAppGenerationDetails,
  mergeChatAppGenerationDetails,
  mergeChatAppGenerationDetailsByChatId,
  normalizeChatAppGenerationContext,
  retainChatAppGenerationDetailsForMessages,
  serializeChatAppGenerationByMessageId,
  setChatAppGenerationForMessage,
  type ChatAppGenerationContext,
  type ChatAppGenerationDetails,
} from "state/utils/chatAppGeneration";
import { C } from "utils/c";
import { getErrorCode, getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_agent_runs,
  route_set_chat_section_chat_id,
} from "utils/generatedEndpoints";
import {
  AgentProfile,
  AgentRun,
  AllConfigs,
  AppDefinition,
  AssistantChatMessage,
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatPermissionMode,
  ChatPermissionModeEnum,
  ChatRoleEnum,
  ChatSectionState,
  CreateAgentProfileRequest,
  CreateExternalAgentConfigRequest,
  createMessageTextContent,
  CreatePromptTemplateRequest,
  CreateTranscriptionProfileRequest,
  DeleteAgentProfileRequest,
  DeleteExternalAgentConfigRequest,
  DeletePromptTemplateRequest,
  DeleteTranscriptionProfileRequest,
  EngineConfig,
  ExternalAgentConfig,
  ExternalAgentPreflightStatus,
  LLMAPIKeysSnapshot,
  LLMStreamingResponseContent,
  MessageDeltaEvent,
  MessageFinalizedEvent,
  MessageStartEvent,
  NotificationTypeEnum,
  RunStatusEnum,
  StreamingEventTypeEnum,
  Template,
  ToolArgumentPreviewDeltaEvent,
  ToolCallDeltaEvent,
  ToolChatMessage,
  ToolResultEvent,
  TranscriptionProfile,
  UpdateAgentProfileRequest,
  UpdateEngineConfigRequest,
  UpdateExternalAgentConfigRequest,
  UpdatePromptTemplateRequest,
  UpdateTranscriptionProfileRequest,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { ProviderTranscriptionError } from "utils/transcriptionErrors";
import { getRunInputString, getRunLastUpdatedMs } from "./agentRunUtils";
import { extractAgenticScopeViolation } from "./agenticScopeViolation";
import { buildEditedMessageHistory } from "./chatBranches";
import { applyHydratedChatDetailsToStore } from "./chatDetailsAuthority";
import {
  applyHydratedChatDetailsToSectionState,
  persistChatSectionState,
} from "./chatSectionAuthority";
import {
  applyChatSectionStreamDelta,
  resolveSectionIdForChatId,
} from "./chatSectionStreaming";
import {
  applyStreamDeltaToChatDetails,
  createToolCallPlaceholder,
  resolveFinalizedAssistantMessageUpdate,
  shouldIgnoreResponsePlaceholderChunk,
  updateMessageById,
} from "./chatStreamState";

type APIKeys = LLMAPIKeysSnapshot["apiKeys"];

export { persistChatSectionState };

const scopeViolationToastTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
let llmConfigLoadPromise: Promise<void> | null = null;
let llmApiKeysLoadPromise: Promise<void> | null = null;
let llmApiKeysSaveQueue: Promise<void> = Promise.resolve();
let agentRunsLoadPromise: Promise<void> | null = null;
let agentRunsRetryTimer: ReturnType<typeof setTimeout> | null = null;
let agentRunsTransientFailureCount = 0;
const stopEligibleAssistantMessageIdByChatId = new Map<string, string>();
const MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE =
  "managed_api_keys_revision_conflict";
const MANAGED_API_KEYS_CORRUPT_ERROR_CODE = "managed_api_keys_store_corrupt";
const MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE =
  "managed_api_keys_store_unavailable";
const AGENT_RUNS_RETRY_DELAYS_MS = [300, 1000, 2500] as const;

type APIKeysMutation = (currentApiKeys: APIKeys) => APIKeys;

type ChatExecutionSettings = {
  permissionMode: ChatPermissionMode;
  searchEnabled: boolean;
};

const DEFAULT_CHAT_EXECUTION_SETTINGS: ChatExecutionSettings = {
  permissionMode: ChatPermissionModeEnum.minimal,
  searchEnabled: true,
};

function requireNonNull<T>(
  value: T | null | undefined,
  message: string,
): NonNullable<T> {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

function normalizeLLMConfigPayload(payload: LlmconfigAllConfigs): AllConfigs {
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

function normalizeLLMApiKeysSnapshot(
  payload: HttpapiLlmapiKeysSnapshot,
): LLMAPIKeysSnapshot {
  return payload;
}

function normalizeAgentProfile(profile: AgentprofilesProfile): AgentProfile {
  return {
    ...profile,
    toolAllowlist: profile.toolAllowlist ?? [],
  };
}

function normalizePromptTemplate(template: PrompttemplatesTemplate): Template {
  return template as Template;
}

function normalizeExternalAgentConfig(
  config: ExternalagentconfigsConfig,
): ExternalAgentConfig {
  return {
    ...config,
    approvalPolicy: config.approvalPolicy ?? null,
    baseUrl: config.baseUrl ?? null,
    codexSkipGitRepoCheck: config.codexSkipGitRepoCheck ?? null,
    commandPath: config.commandPath ?? null,
    defaultModel: config.defaultModel ?? null,
    envVarWhitelist: config.envVarWhitelist ?? [],
    sandboxPolicy: config.sandboxPolicy ?? null,
    settingsFilePath: config.settingsFilePath ?? null,
    settingsManagedBlock: config.settingsManagedBlock ?? null,
    settingsSources: config.settingsSources ?? [],
    workingDir: config.workingDir ?? null,
  } as ExternalAgentConfig;
}

function normalizeExternalAgentHealth(
  status: HttpapiExternalAgentPreflightStatus,
): ExternalAgentPreflightStatus {
  return {
    ...status,
    envVars: {
      missing: status.envVars.missing ?? [],
      present: status.envVars.present ?? [],
    },
    issues: status.issues ?? [],
  } as ExternalAgentPreflightStatus;
}

function normalizeEngineConfig(config: AgentrunsEngineConfig): EngineConfig {
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

function normalizeTranscriptionProfile(
  profile: TranscriptionprofilesProfile,
): TranscriptionProfile {
  return {
    ...profile,
    language: profile.language ?? null,
  } as TranscriptionProfile;
}

function refreshAgentRunsAfterSubmit(): void {
  void loadAgentRuns();
}

function encodeArrayBufferBase64(buffer: ArrayBuffer): string {
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
    }),
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
    }),
  );
  if (!res200(res)) {
    return handleTranscriptionEndpointError(res.data, res.status, options);
  }
  return res.data;
}

async function stopTranscriptionSession(
  sessionId: string,
  options: TranscriptionRequestOptions = {},
): Promise<TranscriptionsessionsDelta | null> {
  if (!sessionId) {
    return null;
  }
  const res = await callOpenAPI(
    apiStopTranscriptionSession({
      body: { sessionId },
    }),
  );
  if (!res200(res)) {
    return handleTranscriptionEndpointError(res.data, res.status, options);
  }
  return res.data;
}

async function cancelTranscriptionSession(sessionId: string): Promise<boolean> {
  if (!sessionId) {
    return true;
  }
  const res = await callOpenAPI(
    apiCancelTranscriptionSession({
      body: { sessionId },
    }),
  );
  return res200(res);
}

type DictationPcmPayload = {
  audioPcm16: Int16Array;
  sampleRateHz: number;
  channels: number;
};

type ProviderDictationTranscriptionResult =
  | {
      kind: "ok";
      transcript: string;
    }
  | {
      kind: "no_speech";
    };

const PCM16_BYTES_PER_SAMPLE = 2;
const REALTIME_TRANSCRIPTION_SAMPLE_RATE_HZ = 24_000;
const TRANSCRIPTION_APPEND_MAX_BYTES =
  C.REALTIME_BINARY_MAX_BYTES > 0
    ? C.REALTIME_BINARY_MAX_BYTES
    : 10 * 1024 * 1024;

type TranscriptionRequestOptions = {
  suppressNotification?: boolean;
  throwOnError?: boolean;
};

function handleTranscriptionEndpointError(
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

function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

export function resampleMonoPcm16ToSampleRate(
  input: Int16Array,
  sourceSampleRateHz: number,
  targetSampleRateHz: number,
): Int16Array {
  if (sourceSampleRateHz <= 0 || targetSampleRateHz <= 0) {
    throw new Error("Provider transcription requires a positive sample rate.");
  }
  if (
    !Number.isFinite(sourceSampleRateHz) ||
    !Number.isFinite(targetSampleRateHz)
  ) {
    throw new Error("Provider transcription requires a finite sample rate.");
  }
  if (input.length === 0 || sourceSampleRateHz === targetSampleRateHz) {
    return input;
  }
  const outputLength = Math.max(
    1,
    Math.round((input.length * targetSampleRateHz) / sourceSampleRateHz),
  );
  const output = new Int16Array(outputLength);
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourcePosition =
      (outputIndex * sourceSampleRateHz) / targetSampleRateHz;
    const sourceIndex = Math.floor(sourcePosition);
    const nextSourceIndex = Math.min(sourceIndex + 1, input.length - 1);
    const lerpWeight = sourcePosition - sourceIndex;
    const leftSample = input[sourceIndex] ?? 0;
    const rightSample = input[nextSourceIndex] ?? leftSample;
    const interpolatedSample =
      leftSample * (1 - lerpWeight) + rightSample * lerpWeight;
    const clamped = Math.max(
      -0x8000,
      Math.min(0x7fff, Math.round(interpolatedSample)),
    );
    output[outputIndex] = clamped;
  }
  return output;
}

function resolveProviderTranscriptionPcmPayloadForSession(
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

async function decodeDictationBlobToPcm16(
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

function asProviderDictationTranscriptionError(
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
  const res = await callOpenAPI(setLlmConfig({ body: config }));
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

type ManagedAPIKeysErrorDetails = {
  detail: string | null;
  revision: number | null;
  errorCode: string | null;
  isCorrupt: boolean;
  isUnavailable: boolean;
};

function resolveManagedApiKeysErrorDetails(
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

function applyManagedApiKeysReadFailure(payload: unknown): void {
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

function applyManagedApiKeysWriteFailure({
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

export function receiveLLMApiKeysSnapshotUpdate(payload: LLMAPIKeysSnapshot) {
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

function extractApiKeysRevisionFromErrorPayload(value: unknown): number | null {
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

async function refreshLLMApiKeysSnapshotFromServer(): Promise<boolean> {
  const res = await callOpenAPI(getLlmApiKeys());
  if (res200(res)) {
    receiveLLMApiKeysSnapshotUpdate(normalizeLLMApiKeysSnapshot(res.data));
    return true;
  }
  applyManagedApiKeysReadFailure(res.data);
  return false;
}

async function persistLLMApiKeysMutation(
  mutation: APIKeysMutation,
): Promise<boolean> {
  const MAX_RETRIES = 3;
  for (let retryCount = 0; retryCount < MAX_RETRIES; retryCount += 1) {
    const state = useAIStore.getState();
    const nextApiKeys = mutation(state.apiKeys);
    const res = await callOpenAPI(
      setLlmApiKeys({
        body: {
          apiKeys: nextApiKeys,
          expectedRevision: state.apiKeysRevision,
        },
      }),
    );
    if (res200(res)) {
      receiveLLMApiKeysSnapshotUpdate(normalizeLLMApiKeysSnapshot(res.data));
      return true;
    }
    const errorCode = getErrorCode(res.data);
    if (
      res.status === 409 &&
      errorCode === MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE
    ) {
      const refreshed = await refreshLLMApiKeysSnapshotFromServer();
      if (!refreshed) {
        return false;
      }
      continue;
    }
    if (
      res.status === 409 &&
      errorCode === MANAGED_API_KEYS_CORRUPT_ERROR_CODE
    ) {
      const writeFailureResult = applyManagedApiKeysWriteFailure({
        payload: res.data,
        fallbackMessage: "Managed API key store is corrupt.",
        fallbackAuthoritative: false,
      });
      if (!writeFailureResult.shouldRetryCorruptWrite) {
        return false;
      }
      continue;
    }
    if (
      res.status === 503 &&
      errorCode === MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE
    ) {
      applyManagedApiKeysWriteFailure({
        payload: res.data,
        fallbackMessage: "Managed API key store is unavailable.",
        fallbackAuthoritative: false,
      });
      return false;
    }
    applyManagedApiKeysWriteFailure({
      payload: res.data,
      fallbackMessage: "Failed to save LLM API keys",
      fallbackAuthoritative: false,
    });
    return false;
  }
  useAIStore.setState({
    apiKeysAuthoritative: false,
    apiKeysInitialLoadComplete: true,
    apiKeysLoadError: "Failed to save LLM API keys after retrying conflicts.",
  });
  return false;
}

export async function mutateAndSaveLLMApiKeys(
  mutation: APIKeysMutation,
): Promise<boolean> {
  let didPersist = false;
  const runMutation = async () => {
    didPersist = await persistLLMApiKeysMutation(mutation);
  };
  llmApiKeysSaveQueue = llmApiKeysSaveQueue.then(runMutation, runMutation);
  await llmApiKeysSaveQueue;
  return didPersist;
}

export async function loadAgentProfiles(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.agentProfilesLoading) {
    return;
  }
  if (!force && state.agentProfilesInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ agentProfilesLoading: true });
  const res = await callOpenAPI(getAgentProfiles());
  if (res200(res)) {
    receiveAgentProfilesUpdate((res.data ?? []).map(normalizeAgentProfile));
  } else {
    useAIStore.setState({
      agentProfilesInitialLoadComplete: true,
      agentProfilesLoadError: "Failed to load agent profiles",
      agentProfilesLoading: false,
    });
  }
}

export function receiveAgentProfilesUpdate(payload: Array<AgentProfile>) {
  useAIStore.setState({
    agentProfiles: payload,
    agentProfilesInitialLoadComplete: true,
    agentProfilesLoadError: null,
    agentProfilesLoading: false,
  });
}

function clearScheduledAgentRunsRetry(): void {
  if (!agentRunsRetryTimer) {
    return;
  }
  clearTimeout(agentRunsRetryTimer);
  agentRunsRetryTimer = null;
}

function scheduleAgentRunsRetry(transientFailureCount: number): void {
  if (agentRunsRetryTimer) {
    return;
  }
  const delayIndex = Math.max(
    0,
    Math.min(transientFailureCount - 1, AGENT_RUNS_RETRY_DELAYS_MS.length - 1),
  );
  const delayMs = AGENT_RUNS_RETRY_DELAYS_MS[delayIndex] ?? 2500;
  agentRunsRetryTimer = setTimeout(() => {
    agentRunsRetryTimer = null;
    void loadAgentRuns();
  }, delayMs);
}

export async function loadAgentRuns() {
  if (agentRunsLoadPromise) {
    await agentRunsLoadPromise;
    return;
  }
  const currentState = useAIStore.getState();
  if (
    currentState.agentRunsAuthorityState === "loading" &&
    !currentState.agentRunsInitialLoadComplete &&
    currentState.agentRunsLoadError === null
  ) {
    agentRunsTransientFailureCount = 0;
    clearScheduledAgentRunsRetry();
  }
  const currentAuthorityState = currentState.agentRunsAuthorityState;
  if (currentAuthorityState === "terminal_error") {
    agentRunsTransientFailureCount = 0;
    clearScheduledAgentRunsRetry();
  }
  if (currentAuthorityState !== "ready") {
    useAIStore.setState({
      agentRunsAuthorityState: "loading",
      agentRunsInitialLoadComplete: false,
    });
  }
  agentRunsLoadPromise = (async () => {
    const res = await route_get_agent_runs();
    if (res200(res)) {
      receiveAgentRunsUpdate(res.data);
    } else {
      agentRunsTransientFailureCount += 1;
      if (agentRunsTransientFailureCount <= AGENT_RUNS_RETRY_DELAYS_MS.length) {
        useAIStore.setState({
          agentRunsAuthorityState: "transient_error",
          agentRunsInitialLoadComplete: false,
          agentRunsLoadError: "Failed to load agent runs",
        });
        scheduleAgentRunsRetry(agentRunsTransientFailureCount);
        return;
      }
      clearScheduledAgentRunsRetry();
      useAIStore.setState({
        agentRunsAuthorityState: "terminal_error",
        agentRunsInitialLoadComplete: true,
        agentRunsLoadError: "Failed to load agent runs",
      });
    }
  })();
  try {
    await agentRunsLoadPromise;
  } finally {
    agentRunsLoadPromise = null;
  }
}

export function receiveAgentRunUpdate(payload: AgentRun) {
  useAIStore.setState((state) => {
    const existingIndex = state.agentRuns.findIndex(
      (candidate) => candidate.id === payload.id,
    );
    if (existingIndex === -1) {
      return {
        agentRuns: [payload, ...state.agentRuns],
      };
    }
    const nextRuns = state.agentRuns.slice();
    nextRuns[existingIndex] = payload;
    return {
      agentRuns: nextRuns,
    };
  });
}

function receiveAgentRunsUpdate(payload: Array<AgentRun>) {
  clearScheduledAgentRunsRetry();
  agentRunsTransientFailureCount = 0;
  useAIStore.setState((state) => ({
    agentRuns: payload,
    chatAppGenerationDetailsByChatId: mergeChatAppGenerationDetailsByChatId(
      state.chatAppGenerationDetailsByChatId,
      collectChatAppGenerationDetailsByChatId(payload),
    ),
    agentRunsAuthorityState: "ready",
    agentRunsInitialLoadComplete: true,
    agentRunsLoadError: null,
  }));
}

export async function loadPromptTemplates(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.promptTemplatesLoading) {
    return;
  }
  if (!force && state.promptTemplatesInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ promptTemplatesLoading: true });
  const res = await callOpenAPI(getPromptTemplates());
  if (res200(res)) {
    receivePromptTemplatesUpdate((res.data ?? []).map(normalizePromptTemplate));
  } else {
    useAIStore.setState({
      promptTemplatesInitialLoadComplete: true,
      promptTemplatesLoadError: "Failed to load prompt templates",
      promptTemplatesLoading: false,
    });
  }
}

export function receivePromptTemplatesUpdate(payload: Array<Template>) {
  useAIStore.setState({
    promptTemplates: payload,
    promptTemplatesInitialLoadComplete: true,
    promptTemplatesLoadError: null,
    promptTemplatesLoading: false,
  });
}

export async function loadExternalAgentConfigs(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.externalAgentConfigsLoading) {
    return;
  }
  if (!force && state.externalAgentConfigsInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ externalAgentConfigsLoading: true });
  const res = await callOpenAPI(getExternalAgentConfigs());
  if (res200(res)) {
    receiveExternalAgentConfigsUpdate(
      (res.data ?? []).map(normalizeExternalAgentConfig),
    );
  } else {
    useAIStore.setState({
      externalAgentConfigsInitialLoadComplete: true,
      externalAgentConfigsLoadError: "Failed to load external agent configs",
      externalAgentConfigsLoading: false,
    });
  }
}

export async function loadExternalAgentHealth(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.externalAgentHealthLoading) {
    return;
  }
  if (!force && state.externalAgentHealthInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ externalAgentHealthLoading: true });
  const res = await callOpenAPI(getExternalAgentHealth());
  if (res200(res)) {
    receiveExternalAgentHealthUpdate(
      (res.data ?? []).map(normalizeExternalAgentHealth),
    );
  } else {
    useAIStore.setState({
      externalAgentHealthInitialLoadComplete: true,
      externalAgentHealthLoadError: "Failed to load external agent health",
      externalAgentHealthLoading: false,
    });
  }
}

export function receiveExternalAgentConfigsUpdate(
  payload: Array<ExternalAgentConfig>,
) {
  useAIStore.setState({
    externalAgentConfigs: payload,
    externalAgentConfigsInitialLoadComplete: true,
    externalAgentConfigsLoadError: null,
    externalAgentConfigsLoading: false,
  });
  void loadExternalAgentHealth(true);
}

function receiveExternalAgentHealthUpdate(
  payload: Array<ExternalAgentPreflightStatus>,
) {
  useAIStore.setState({
    externalAgentHealth: payload,
    externalAgentHealthInitialLoadComplete: true,
    externalAgentHealthLoadError: null,
    externalAgentHealthLoading: false,
  });
}

export async function loadEngineConfigs(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.engineConfigsLoading) {
    return;
  }
  if (!force && state.engineConfigsInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ engineConfigsLoading: true });
  const res = await callOpenAPI(getEngineConfigs());
  if (res200(res)) {
    receiveEngineConfigsUpdate((res.data ?? []).map(normalizeEngineConfig));
  } else {
    useAIStore.setState({
      engineConfigsInitialLoadComplete: true,
      engineConfigsLoadError: "Failed to load engine configs",
      engineConfigsLoading: false,
    });
  }
}

export function receiveEngineConfigsUpdate(payload: Array<EngineConfig>) {
  useAIStore.setState({
    engineConfigs: payload,
    engineConfigsInitialLoadComplete: true,
    engineConfigsLoadError: null,
    engineConfigsLoading: false,
  });
}

export async function loadTranscriptionProfiles(force: boolean = false) {
  const state = useAIStore.getState();
  if (state.transcriptionProfilesLoading) {
    return;
  }
  if (!force && state.transcriptionProfilesInitialLoadComplete) {
    return;
  }
  useAIStore.setState({ transcriptionProfilesLoading: true });
  const res = await callOpenAPI(getTranscriptionProfiles());
  if (res200(res)) {
    receiveTranscriptionProfilesUpdate(
      (res.data ?? []).map(normalizeTranscriptionProfile),
    );
  } else {
    useAIStore.setState({
      transcriptionProfilesInitialLoadComplete: true,
      transcriptionProfilesLoadError: "Failed to load transcription profiles",
      transcriptionProfilesLoading: false,
    });
  }
}

export function receiveTranscriptionProfilesUpdate(
  payload: Array<TranscriptionProfile>,
) {
  useAIStore.setState({
    transcriptionProfiles: payload,
    transcriptionProfilesInitialLoadComplete: true,
    transcriptionProfilesLoadError: null,
    transcriptionProfilesLoading: false,
  });
}

type HasId = { id: string };

function upsertById<T extends HasId>(items: Array<T>, entry: T): Array<T> {
  const index = items.findIndex((item) => item.id === entry.id);
  if (index === -1) {
    return [...items, entry];
  }
  const next = [...items];
  next[index] = entry;
  return next;
}

function removeById<T extends HasId>(items: Array<T>, id: string): Array<T> {
  return items.filter((item) => item.id !== id);
}

export async function createAgentProfile(
  payload: CreateAgentProfileRequest,
): Promise<AgentProfile | null> {
  const res = await callOpenAPI(apiCreateAgentProfile({ body: payload }));
  if (!res200(res)) {
    useAIStore.setState({
      agentProfilesLoadError: "Failed to create agent profile",
    });
    return null;
  }
  const profile = normalizeAgentProfile(res.data);
  useAIStore.setState((state) => ({
    agentProfiles: upsertById(state.agentProfiles, profile),
    agentProfilesInitialLoadComplete: true,
    agentProfilesLoadError: null,
  }));
  return profile;
}

export async function updateAgentProfile(
  payload: UpdateAgentProfileRequest,
): Promise<AgentProfile | null> {
  const res = await callOpenAPI(
    apiUpdateAgentProfile({
      body: {
        profile: requireNonNull(
          payload.profile,
          "updateAgentProfile requires a profile payload.",
        ),
      },
    }),
  );
  if (!res200(res)) {
    useAIStore.setState({
      agentProfilesLoadError: "Failed to update agent profile",
    });
    return null;
  }
  const profile = normalizeAgentProfile(res.data);
  useAIStore.setState((state) => ({
    agentProfiles: upsertById(state.agentProfiles, profile),
    agentProfilesInitialLoadComplete: true,
    agentProfilesLoadError: null,
  }));
  return profile;
}

export async function deleteAgentProfile(
  payload: DeleteAgentProfileRequest,
): Promise<boolean> {
  const res = await callOpenAPI(apiDeleteAgentProfile({ body: payload }));
  if (!res200(res)) {
    useAIStore.setState({
      agentProfilesLoadError: "Failed to delete agent profile",
    });
    return false;
  }
  useAIStore.setState((state) => ({
    agentProfiles: removeById(state.agentProfiles, payload.profileId),
    agentProfilesInitialLoadComplete: true,
    agentProfilesLoadError: null,
  }));
  return true;
}

export async function updateEngineConfig(
  payload: UpdateEngineConfigRequest,
): Promise<EngineConfig | null> {
  const config = requireNonNull(
    payload.config,
    "updateEngineConfig requires a config payload.",
  );
  const body = {
    config: {
      ...config,
      defaults: config.defaults ?? {},
      runtimeSupport: config.runtimeSupport ?? { thinking: false },
    },
  } as Parameters<typeof apiUpdateEngineConfig>[0]["body"];
  const res = await callOpenAPI(
    apiUpdateEngineConfig({
      body,
    }),
  );
  if (!res200(res)) {
    useAIStore.setState({
      engineConfigsLoadError: "Failed to update engine config",
    });
    return null;
  }
  const nextConfig = normalizeEngineConfig(res.data);
  useAIStore.setState((state) => ({
    engineConfigs: upsertById(state.engineConfigs, nextConfig),
    engineConfigsInitialLoadComplete: true,
    engineConfigsLoadError: null,
  }));
  return nextConfig;
}

export async function createTranscriptionProfile(
  payload: CreateTranscriptionProfileRequest,
): Promise<TranscriptionProfile | null> {
  const res = await callOpenAPI(
    apiCreateTranscriptionProfile({ body: payload }),
  );
  if (!res200(res)) {
    useAIStore.setState({
      transcriptionProfilesLoadError: "Failed to create transcription profile",
    });
    return null;
  }
  const profile = normalizeTranscriptionProfile(res.data);
  useAIStore.setState((state) => ({
    transcriptionProfiles: upsertById(state.transcriptionProfiles, profile),
    transcriptionProfilesInitialLoadComplete: true,
    transcriptionProfilesLoadError: null,
  }));
  return profile;
}

export async function updateTranscriptionProfile(
  payload: UpdateTranscriptionProfileRequest,
): Promise<TranscriptionProfile | null> {
  const res = await callOpenAPI(
    apiUpdateTranscriptionProfile({
      body: {
        profile: requireNonNull(
          payload.profile,
          "updateTranscriptionProfile requires a profile payload.",
        ),
      },
    }),
  );
  if (!res200(res)) {
    useAIStore.setState({
      transcriptionProfilesLoadError: "Failed to update transcription profile",
    });
    return null;
  }
  const profile = normalizeTranscriptionProfile(res.data);
  useAIStore.setState((state) => ({
    transcriptionProfiles: upsertById(state.transcriptionProfiles, profile),
    transcriptionProfilesInitialLoadComplete: true,
    transcriptionProfilesLoadError: null,
  }));
  return profile;
}

export async function deleteTranscriptionProfile(
  payload: DeleteTranscriptionProfileRequest,
): Promise<boolean> {
  const res = await callOpenAPI(
    apiDeleteTranscriptionProfile({ body: payload }),
  );
  if (!res200(res)) {
    useAIStore.setState({
      transcriptionProfilesLoadError: "Failed to delete transcription profile",
    });
    return false;
  }
  const profileId = requireNonNull(
    payload.profileId,
    "deleteTranscriptionProfile requires a profile id.",
  );
  useAIStore.setState((state) => ({
    transcriptionProfiles: removeById(state.transcriptionProfiles, profileId),
    transcriptionProfilesInitialLoadComplete: true,
    transcriptionProfilesLoadError: null,
    projectChatTranscriptionProfileId:
      state.projectChatTranscriptionProfileId === profileId
        ? null
        : state.projectChatTranscriptionProfileId,
  }));
  return true;
}

export async function createPromptTemplate(
  payload: CreatePromptTemplateRequest,
): Promise<Template | null> {
  const res = await callOpenAPI(apiCreatePromptTemplate({ body: payload }));
  if (!res200(res)) {
    useAIStore.setState({
      promptTemplatesLoadError: "Failed to create prompt template",
    });
    return null;
  }
  const template = normalizePromptTemplate(res.data);
  useAIStore.setState((state) => ({
    promptTemplates: upsertById(state.promptTemplates, template),
    promptTemplatesInitialLoadComplete: true,
    promptTemplatesLoadError: null,
  }));
  return template;
}

export async function updatePromptTemplate(
  payload: UpdatePromptTemplateRequest,
): Promise<Template | null> {
  const res = await callOpenAPI(
    apiUpdatePromptTemplate({
      body: {
        template: requireNonNull(
          payload.template,
          "updatePromptTemplate requires a template payload.",
        ),
      },
    }),
  );
  if (!res200(res)) {
    useAIStore.setState({
      promptTemplatesLoadError: "Failed to update prompt template",
    });
    return null;
  }
  const template = normalizePromptTemplate(res.data);
  useAIStore.setState((state) => ({
    promptTemplates: upsertById(state.promptTemplates, template),
    promptTemplatesInitialLoadComplete: true,
    promptTemplatesLoadError: null,
  }));
  return template;
}

export async function deletePromptTemplate(
  payload: DeletePromptTemplateRequest,
): Promise<boolean> {
  const res = await callOpenAPI(apiDeletePromptTemplate({ body: payload }));
  if (!res200(res)) {
    useAIStore.setState({
      promptTemplatesLoadError: "Failed to delete prompt template",
    });
    return false;
  }
  useAIStore.setState((state) => ({
    promptTemplates: removeById(state.promptTemplates, payload.templateId),
    promptTemplatesInitialLoadComplete: true,
    promptTemplatesLoadError: null,
  }));
  return true;
}

export async function createExternalAgentConfig(
  payload: CreateExternalAgentConfigRequest,
): Promise<ExternalAgentConfig | null> {
  const body = {
    ...payload,
    settingsManagedBlock: payload.settingsManagedBlock ?? {},
  } as Parameters<typeof apiCreateExternalAgentConfig>[0]["body"];
  const res = await callOpenAPI(
    apiCreateExternalAgentConfig({
      body,
    }),
  );
  if (!res200(res)) {
    useAIStore.setState({
      externalAgentConfigsLoadError: "Failed to create external agent config",
    });
    return null;
  }
  const config = normalizeExternalAgentConfig(res.data);
  useAIStore.setState((state) => ({
    externalAgentConfigs: upsertById(state.externalAgentConfigs, config),
    externalAgentConfigsInitialLoadComplete: true,
    externalAgentConfigsLoadError: null,
  }));
  return config;
}

export async function updateExternalAgentConfig(
  payload: UpdateExternalAgentConfigRequest,
): Promise<ExternalAgentConfig | null> {
  const requestedConfig = requireNonNull(
    payload.config,
    "updateExternalAgentConfig requires a config payload.",
  );
  const body = {
    config: {
      ...requestedConfig,
      envVarWhitelist: requestedConfig.envVarWhitelist ?? [],
      settingsManagedBlock: requestedConfig.settingsManagedBlock ?? undefined,
      settingsSources: requestedConfig.settingsSources ?? [],
    },
  } as Parameters<typeof apiUpdateExternalAgentConfig>[0]["body"];
  const res = await callOpenAPI(
    apiUpdateExternalAgentConfig({
      body,
    }),
  );
  if (!res200(res)) {
    useAIStore.setState({
      externalAgentConfigsLoadError: "Failed to update external agent config",
    });
    return null;
  }
  const config = normalizeExternalAgentConfig(res.data);
  useAIStore.setState((state) => ({
    externalAgentConfigs: upsertById(state.externalAgentConfigs, config),
    externalAgentConfigsInitialLoadComplete: true,
    externalAgentConfigsLoadError: null,
  }));
  return config;
}

export async function deleteExternalAgentConfig(
  payload: DeleteExternalAgentConfigRequest,
): Promise<boolean> {
  const res = await callOpenAPI(
    apiDeleteExternalAgentConfig({ body: payload }),
  );
  if (!res200(res)) {
    useAIStore.setState({
      externalAgentConfigsLoadError: "Failed to delete external agent config",
    });
    return false;
  }
  useAIStore.setState((state) => ({
    externalAgentConfigs: removeById(
      state.externalAgentConfigs,
      payload.configId,
    ),
    externalAgentConfigsInitialLoadComplete: true,
    externalAgentConfigsLoadError: null,
  }));
  return true;
}

export function getDefaultChatDetails(): ChatDetails {
  return {
    messages: [],
    toolCallArguments: {},
    waitingForResponse: false,
    llmConfig: null,
    contextUsage: null,
  };
}

function getPendingChatAppGenerationDetailsForSurface(
  state: ReturnType<typeof useAIStore.getState>,
  surfaceId: string | null | undefined,
): ChatAppGenerationDetails | null {
  return (
    state.pendingChatAppGenerationDetailsBySurfaceId[
      requirePendingChatSurfaceId(surfaceId)
    ] ?? null
  );
}

function setPendingChatAppGenerationDetailsForSurface(
  state: ReturnType<typeof useAIStore.getState>,
  surfaceId: string | null | undefined,
  nextDetails: ChatAppGenerationDetails | null,
): Partial<ReturnType<typeof useAIStore.getState>> {
  const normalizedSurfaceId = requirePendingChatSurfaceId(surfaceId);
  const currentDetails =
    state.pendingChatAppGenerationDetailsBySurfaceId[normalizedSurfaceId];
  if (currentDetails === nextDetails) {
    return state;
  }
  const nextBySurfaceId = {
    ...state.pendingChatAppGenerationDetailsBySurfaceId,
  };
  if (nextDetails === null) {
    delete nextBySurfaceId[normalizedSurfaceId];
  } else {
    nextBySurfaceId[normalizedSurfaceId] = nextDetails;
  }
  return {
    pendingChatAppGenerationDetailsBySurfaceId: nextBySurfaceId,
  };
}

function getChatAppGenerationDetailsForTarget(
  state: ReturnType<typeof useAIStore.getState>,
  chatId: string | null,
  surfaceId: string | null | undefined,
): ChatAppGenerationDetails {
  if (chatId === null) {
    return (
      getPendingChatAppGenerationDetailsForSurface(state, surfaceId) ??
      getDefaultChatAppGenerationDetails()
    );
  }
  return (
    state.chatAppGenerationDetailsByChatId[chatId] ??
    getDefaultChatAppGenerationDetails()
  );
}

function normalizePendingChatSurfaceId(
  surfaceId: string | null | undefined,
): string | null {
  if (typeof surfaceId !== "string") {
    return null;
  }
  const normalizedSurfaceId = surfaceId.trim();
  if (!normalizedSurfaceId) {
    return null;
  }
  return normalizedSurfaceId;
}

function requirePendingChatSurfaceId(
  surfaceId: string | null | undefined,
): string {
  const normalizedSurfaceId = normalizePendingChatSurfaceId(surfaceId);
  if (!normalizedSurfaceId) {
    throw new Error("Pending chat surface id is required.");
  }
  return normalizedSurfaceId;
}

function getPendingChatDetailsForSurface(
  state: ReturnType<typeof useAIStore.getState>,
  surfaceId: string | null | undefined,
): ChatDetails | null {
  return (
    state.pendingChatDetailsBySurfaceId[
      requirePendingChatSurfaceId(surfaceId)
    ] ?? null
  );
}

function setPendingChatDetailsForSurface(
  state: ReturnType<typeof useAIStore.getState>,
  surfaceId: string | null | undefined,
  nextDetails: ChatDetails | null,
): Partial<ReturnType<typeof useAIStore.getState>> {
  const normalizedSurfaceId = requirePendingChatSurfaceId(surfaceId);
  const currentDetails =
    state.pendingChatDetailsBySurfaceId[normalizedSurfaceId];
  if (currentDetails === nextDetails) {
    return state;
  }
  const nextBySurfaceId = {
    ...state.pendingChatDetailsBySurfaceId,
  };
  if (nextDetails === null) {
    delete nextBySurfaceId[normalizedSurfaceId];
  } else {
    nextBySurfaceId[normalizedSurfaceId] = nextDetails;
  }
  return {
    pendingChatDetailsBySurfaceId: nextBySurfaceId,
  };
}

type StopChatResponseSnapshot = {
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  interruptedAssistantMessageIdsByChat: Record<string, true>;
  stopEligibleAssistantMessageId: string | null;
  followProjectConfigId: string | null;
  followToolArgumentIdsByType: AIFollowIdsByType | null;
};

function setStopEligibleAssistantMessageId(chatId: string, messageId: string) {
  const normalizedChatId = chatId.trim();
  const normalizedMessageId = messageId.trim();
  if (!normalizedChatId || !normalizedMessageId) {
    return;
  }
  stopEligibleAssistantMessageIdByChatId.set(
    normalizedChatId,
    normalizedMessageId,
  );
}

function clearStopEligibleAssistantMessageId(chatId: string) {
  const normalizedChatId = chatId.trim();
  if (!normalizedChatId) {
    return;
  }
  stopEligibleAssistantMessageIdByChatId.delete(normalizedChatId);
}

function markInterruptedAssistantMessage(chatId: string, messageId: string) {
  useAIStore.setState((state) => {
    const existingByChat =
      state.interruptedAssistantMessageIdsByChatId[chatId] ?? {};
    if (existingByChat[messageId]) {
      return state;
    }
    return {
      interruptedAssistantMessageIdsByChatId: {
        ...state.interruptedAssistantMessageIdsByChatId,
        [chatId]: {
          ...existingByChat,
          [messageId]: true,
        },
      },
    };
  });
}

function clearInterruptedAssistantMessages(
  chatId: string,
  messageIds: Array<string | null | undefined>,
) {
  const normalizedIds = messageIds.filter(
    (messageId): messageId is string => typeof messageId === "string",
  );
  if (normalizedIds.length === 0) {
    return;
  }
  useAIStore.setState((state) => {
    const existingByChat =
      state.interruptedAssistantMessageIdsByChatId[chatId] ?? {};
    let changed = false;
    const nextByChat = { ...existingByChat };
    for (const messageId of normalizedIds) {
      if (nextByChat[messageId]) {
        changed = true;
        delete nextByChat[messageId];
      }
    }
    if (!changed) {
      return state;
    }
    if (Object.keys(nextByChat).length === 0) {
      const nextByChatId = {
        ...state.interruptedAssistantMessageIdsByChatId,
      };
      delete nextByChatId[chatId];
      return {
        interruptedAssistantMessageIdsByChatId: nextByChatId,
      };
    }
    return {
      interruptedAssistantMessageIdsByChatId: {
        ...state.interruptedAssistantMessageIdsByChatId,
        [chatId]: nextByChat,
      },
    };
  });
}

function interruptedMessageMapEquals(
  left: Record<string, true>,
  right: Record<string, true>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!right[key]) {
      return false;
    }
  }
  return true;
}

function restoreInterruptedAssistantMessageSnapshot(
  chatId: string | null | undefined,
  snapshot: StopChatResponseSnapshot,
) {
  if (typeof chatId !== "string") {
    return;
  }
  useAIStore.setState((state) => {
    const currentByChat =
      state.interruptedAssistantMessageIdsByChatId[chatId] ?? {};
    const snapshotByChat = snapshot.interruptedAssistantMessageIdsByChat;
    if (interruptedMessageMapEquals(currentByChat, snapshotByChat)) {
      return state;
    }
    const nextByChatId = {
      ...state.interruptedAssistantMessageIdsByChatId,
    };
    if (Object.keys(snapshotByChat).length === 0) {
      delete nextByChatId[chatId];
    } else {
      nextByChatId[chatId] = { ...snapshotByChat };
    }
    return {
      interruptedAssistantMessageIdsByChatId: nextByChatId,
    };
  });
}

function getStopChatResponseSnapshot(
  chatId: string | null | undefined,
  pendingSurfaceId: string | null | undefined = null,
  followProjectConfigId: string | null = null,
): StopChatResponseSnapshot {
  const state = useAIStore.getState();
  const currentDetails =
    typeof chatId === "string"
      ? state.chatDetails[chatId] ?? getDefaultChatDetails()
      : getPendingChatDetailsForSurface(state, pendingSurfaceId) ??
        getDefaultChatDetails();
  const interruptedAssistantMessageIdsByChat =
    typeof chatId === "string"
      ? {
          ...(state.interruptedAssistantMessageIdsByChatId[chatId] ?? {}),
        }
      : {};
  return {
    waitingForResponse: currentDetails.waitingForResponse,
    toolCallArguments: { ...currentDetails.toolCallArguments },
    interruptedAssistantMessageIdsByChat,
    stopEligibleAssistantMessageId:
      typeof chatId === "string"
        ? stopEligibleAssistantMessageIdByChatId.get(chatId) ?? null
        : null,
    followProjectConfigId,
    followToolArgumentIdsByType:
      typeof chatId === "string" && followProjectConfigId
        ? getAIFollowToolArgumentsSnapshot(followProjectConfigId, chatId)
        : null,
  };
}

function restoreStoppedChatResponseLocally(
  chatId: string | null | undefined,
  snapshot: StopChatResponseSnapshot,
  pendingSurfaceId: string | null | undefined = null,
) {
  const restoreDetails = (details: ChatDetails): ChatDetails => ({
    ...details,
    waitingForResponse: snapshot.waitingForResponse,
    toolCallArguments: { ...snapshot.toolCallArguments },
  });
  if (typeof chatId === "string") {
    updateChatDetails(chatId, restoreDetails);
    return;
  }
  updatePendingChatDetails(restoreDetails, pendingSurfaceId);
}

function restoreStoppedChatFollowState(
  chatId: string | null | undefined,
  snapshot: StopChatResponseSnapshot,
) {
  if (typeof chatId !== "string" || !snapshot.followProjectConfigId) {
    return;
  }
  restoreAIFollowToolArgumentsSnapshot({
    projectConfigId: snapshot.followProjectConfigId,
    chatId,
    idsByType: snapshot.followToolArgumentIdsByType,
  });
}

function stopChatResponseLocally(
  chatId: string | null | undefined,
  options: {
    markInterruptedOptimistically?: boolean;
    pendingSurfaceId?: string | null;
    followProjectConfigId?: string | null;
  } = {},
): StopChatResponseSnapshot {
  const markInterruptedOptimistically =
    options.markInterruptedOptimistically ?? true;
  const pendingSurfaceId = options.pendingSurfaceId ?? null;
  const followProjectConfigId = options.followProjectConfigId ?? null;
  const snapshot = getStopChatResponseSnapshot(
    chatId,
    pendingSurfaceId,
    followProjectConfigId,
  );
  const stopDetails = (details: ChatDetails): ChatDetails => ({
    ...details,
    waitingForResponse: false,
  });
  if (typeof chatId === "string") {
    updateChatDetails(chatId, stopDetails);
    if (
      markInterruptedOptimistically &&
      snapshot.waitingForResponse &&
      snapshot.stopEligibleAssistantMessageId
    ) {
      markInterruptedAssistantMessage(
        chatId,
        snapshot.stopEligibleAssistantMessageId,
      );
    }
    if (followProjectConfigId) {
      clearAIFollowToolArgumentsForChat(followProjectConfigId, chatId);
    }
  } else {
    updatePendingChatDetails(stopDetails, pendingSurfaceId);
  }
  clearAllAppSpecPatchStreams();
  return snapshot;
}

function applyConfirmedExternalStopInterruption(
  chatId: string,
  snapshot: StopChatResponseSnapshot,
): void {
  restoreInterruptedAssistantMessageSnapshot(chatId, snapshot);
  const stoppedMessageId =
    snapshot.stopEligibleAssistantMessageId?.trim() ?? "";
  if (!stoppedMessageId) {
    return;
  }
  markInterruptedAssistantMessage(chatId, stoppedMessageId);
}

async function resolveLatestRunningExternalRunIdWithRefresh(
  chatId: string,
  projectConfigId: string | null,
): Promise<string | null> {
  let runId = await findLatestRunningExternalRunId(chatId, projectConfigId);
  if (runId) {
    return runId;
  }
  await loadAgentRuns();
  runId = await findLatestRunningExternalRunId(chatId, projectConfigId);
  return runId;
}

async function stopExternalChatResponse({
  chatId,
  projectConfigId,
  sectionId,
  failureMessage,
  localSnapshot,
}: {
  chatId: string;
  projectConfigId: string | null;
  sectionId?: string;
  failureMessage: string;
  localSnapshot: StopChatResponseSnapshot;
}): Promise<boolean> {
  const refreshChatAndResolveWaiting = async (): Promise<{
    hydrated: boolean;
    waitingForResponse: boolean;
  }> => {
    const hydrated = await getExternalAgentChat(
      chatId,
      projectConfigId,
      sectionId,
    );
    const waitingForResponse = Boolean(
      useAIStore.getState().chatDetails[chatId]?.waitingForResponse,
    );
    return { hydrated, waitingForResponse };
  };

  const runId = await resolveLatestRunningExternalRunIdWithRefresh(
    chatId,
    projectConfigId,
  );
  if (!runId) {
    const refreshState = await refreshChatAndResolveWaiting();
    if (refreshState.hydrated && !refreshState.waitingForResponse) {
      restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
      return true;
    }
    restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
    restoreStoppedChatFollowState(chatId, localSnapshot);
    if (!refreshState.hydrated) {
      restoreStoppedChatResponseLocally(chatId, localSnapshot);
    }
    addTemporaryNotification(failureMessage, NotificationTypeEnum.warning);
    return false;
  }
  const response = await callOpenAPI(
    apiStopExternalAgentRun({
      body: { runId },
    }),
  );
  if (res200(response)) {
    void loadAgentRuns();
    if (response.data?.status === RunStatusEnum.cancelled) {
      applyConfirmedExternalStopInterruption(chatId, localSnapshot);
      return true;
    }
    const refreshState = await refreshChatAndResolveWaiting();
    restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
    if (refreshState.hydrated && !refreshState.waitingForResponse) {
      return true;
    }
    restoreStoppedChatFollowState(chatId, localSnapshot);
    if (!refreshState.hydrated) {
      restoreStoppedChatResponseLocally(chatId, localSnapshot);
    }
    addTemporaryNotification(failureMessage, NotificationTypeEnum.warning);
    return false;
  }
  const refreshState = await refreshChatAndResolveWaiting();
  if (refreshState.hydrated && !refreshState.waitingForResponse) {
    restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
    return true;
  }
  restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
  restoreStoppedChatFollowState(chatId, localSnapshot);
  if (!refreshState.hydrated) {
    restoreStoppedChatResponseLocally(chatId, localSnapshot);
  }
  addTemporaryNotification(failureMessage, NotificationTypeEnum.warning);
  return false;
}

function reconcileStoppedLLMChatOutcome({
  chatId,
  localSnapshot,
  stopOutcome,
}: {
  chatId: string;
  localSnapshot: StopChatResponseSnapshot;
  stopOutcome: HttpapiStopLlmChatResponse | null | undefined;
}): void {
  if (!stopOutcome) {
    return;
  }
  if (stopOutcome.alreadyStopped) {
    restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
    return;
  }
  const stoppedMessageId = stopOutcome.stoppedMessageId?.trim() ?? "";
  if (!stoppedMessageId) {
    restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
    return;
  }
  const localStoppedMessageId =
    localSnapshot.stopEligibleAssistantMessageId?.trim() ?? "";
  if (!localStoppedMessageId) {
    restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
    return;
  }
  if (localStoppedMessageId === stoppedMessageId) {
    return;
  }
  restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
  markInterruptedAssistantMessage(chatId, stoppedMessageId);
}

export async function stopProjectChatResponse(
  chatId: string | null | undefined,
  isExternalEngine: boolean,
  pendingSurfaceId: string | null | undefined = null,
): Promise<boolean> {
  const followProjectConfigId =
    typeof chatId === "string" ? getCurrProjectConfigId() : null;
  const localSnapshot = stopChatResponseLocally(chatId, {
    markInterruptedOptimistically: !isExternalEngine,
    pendingSurfaceId,
    followProjectConfigId,
  });
  if (typeof chatId !== "string") {
    return true;
  }

  if (isExternalEngine) {
    return stopExternalChatResponse({
      chatId,
      projectConfigId: followProjectConfigId,
      failureMessage: "Failed to stop project chat.",
      localSnapshot,
    });
  }

  const response = await callOpenAPI(
    apiStopLlmChat({
      body: { chatId },
    }),
  );
  if (res200(response)) {
    reconcileStoppedLLMChatOutcome({
      chatId,
      localSnapshot,
      stopOutcome: response.data,
    });
    return true;
  }
  const hydrationOutcome = await getLLMChatHydrationOutcome(chatId);
  const waitingForResponse = Boolean(
    useAIStore.getState().chatDetails[chatId]?.waitingForResponse,
  );
  const hydrated = hydrationOutcome.outcome === "success";
  restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
  if (hydrated && waitingForResponse) {
    restoreStoppedChatFollowState(chatId, localSnapshot);
  }
  if (!hydrated) {
    restoreStoppedChatResponseLocally(chatId, localSnapshot, pendingSurfaceId);
    restoreStoppedChatFollowState(chatId, localSnapshot);
  }
  addTemporaryNotification(
    "Failed to stop project chat.",
    NotificationTypeEnum.warning,
  );
  return false;
}

export async function stopManagedSectionChatResponse(
  chatId: string | null | undefined,
  isExternalEngine: boolean,
  projectConfigId: string,
  sectionId: string,
  pendingSurfaceId: string | null | undefined = null,
): Promise<boolean> {
  const localSnapshot = stopChatResponseLocally(chatId, {
    markInterruptedOptimistically: !isExternalEngine,
    pendingSurfaceId,
    followProjectConfigId: projectConfigId,
  });
  if (typeof chatId !== "string") {
    return true;
  }
  if (isExternalEngine) {
    return stopExternalChatResponse({
      chatId,
      projectConfigId,
      sectionId,
      failureMessage: "Failed to stop section chat.",
      localSnapshot,
    });
  }
  const response = await callOpenAPI(
    apiStopLlmChat({
      body: { chatId },
    }),
  );
  if (res200(response)) {
    reconcileStoppedLLMChatOutcome({
      chatId,
      localSnapshot,
      stopOutcome: response.data,
    });
    return true;
  }
  const hydrationOutcome = await getLLMChatHydrationOutcome(chatId, sectionId);
  const waitingForResponse = Boolean(
    useAIStore.getState().chatDetails[chatId]?.waitingForResponse,
  );
  const hydrated = hydrationOutcome.outcome === "success";
  restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
  if (hydrated && waitingForResponse) {
    restoreStoppedChatFollowState(chatId, localSnapshot);
  }
  if (!hydrated) {
    restoreStoppedChatResponseLocally(chatId, localSnapshot, pendingSurfaceId);
    restoreStoppedChatFollowState(chatId, localSnapshot);
  }
  addTemporaryNotification(
    "Failed to stop section chat.",
    NotificationTypeEnum.warning,
  );
  return false;
}

export function initializePendingChatDetails(surfaceId: string) {
  useAIStore.setState((state) => ({
    ...setPendingChatDetailsForSurface(
      state,
      surfaceId,
      getDefaultChatDetails(),
    ),
    ...setPendingChatAppGenerationDetailsForSurface(state, surfaceId, null),
  }));
}

function initializePendingChatDetailsWithMessages(
  messages: Array<BaseChatMessageUnion>,
  waitingForResponse: boolean = true,
  surfaceId: string | null | undefined,
  appGenerationDetails: ChatAppGenerationDetails | null = null,
) {
  useAIStore.setState((state) => ({
    ...setPendingChatDetailsForSurface(state, surfaceId, {
      ...getDefaultChatDetails(),
      messages,
      waitingForResponse,
    }),
    ...setPendingChatAppGenerationDetailsForSurface(
      state,
      surfaceId,
      appGenerationDetails,
    ),
  }));
}

export function seedPendingChatDetails(
  messages: Array<BaseChatMessageUnion>,
  surfaceId: string,
  appGenerationDetails: ChatAppGenerationDetails | null = null,
) {
  initializePendingChatDetailsWithMessages(
    messages,
    false,
    surfaceId,
    appGenerationDetails,
  );
}

export function clearPendingChatDetails(surfaceId: string) {
  useAIStore.setState((state) => ({
    ...setPendingChatDetailsForSurface(state, surfaceId, null),
    ...setPendingChatAppGenerationDetailsForSurface(state, surfaceId, null),
  }));
}

export type ChatHydrationOutcomeType =
  | "success"
  | "transient_failure"
  | "terminal_failure";

export type ChatHydrationErrorCode =
  | "llm_disallowed"
  | "chat_not_found"
  | "chat_runtime_ambiguous"
  | "terminal_hydration_failure";

export type ChatHydrationOutcome = {
  outcome: ChatHydrationOutcomeType;
  status: number | undefined;
  errorCode: ChatHydrationErrorCode | null;
};

function parseChatHydrationErrorCode(
  value: string | null,
): ChatHydrationErrorCode | null {
  if (value === "llm_disallowed") {
    return "llm_disallowed";
  }
  if (value === "chat_not_found") {
    return "chat_not_found";
  }
  if (value === "chat_runtime_ambiguous") {
    return "chat_runtime_ambiguous";
  }
  return null;
}

function classifyChatHydrationOutcomeType(
  status: number | undefined,
): ChatHydrationOutcomeType {
  if (status === 403 || status === 404 || status === 409) {
    return "terminal_failure";
  }
  return "transient_failure";
}

function buildChatHydrationFailureOutcome(response: {
  status: number | undefined;
  data: unknown;
}): ChatHydrationOutcome {
  const outcome = classifyChatHydrationOutcomeType(response.status);
  const parsedErrorCode = parseChatHydrationErrorCode(
    getErrorCode(response.data),
  );
  return {
    outcome,
    status: response.status,
    errorCode:
      outcome === "terminal_failure"
        ? parsedErrorCode ??
          (response.status === 403
            ? "llm_disallowed"
            : "terminal_hydration_failure")
        : parsedErrorCode,
  };
}

type ChatHydrationProbeResult<TPayload> =
  | {
      outcome: "success";
      status: number | undefined;
      errorCode: null;
      payload: TPayload;
    }
  | {
      outcome: ChatHydrationOutcomeType;
      status: number | undefined;
      errorCode: ChatHydrationErrorCode | null;
      payload: null;
    };

async function probeLLMChatHydration(
  chatId: string,
  projectConfigId: string,
): Promise<ChatHydrationProbeResult<HttpapiLlmChatResponse>> {
  const response = await callOpenAPI(
    apiGetLlmChat({
      body: { chatId, projectConfigId },
    }),
  );
  if (!res200(response)) {
    return {
      ...buildChatHydrationFailureOutcome(response),
      payload: null,
    };
  }
  return {
    outcome: "success",
    status: response.status,
    errorCode: null,
    payload: response.data,
  };
}

async function probeExternalAgentChatHydration(
  chatId: string,
  projectConfigId: string | null,
): Promise<ChatHydrationProbeResult<HttpapiExternalAgentChatResponse>> {
  const response = await callOpenAPI(
    apiGetExternalAgentChat({
      body: {
        chatId,
        projectConfigId,
      },
    }),
  );
  if (!res200(response)) {
    return {
      ...buildChatHydrationFailureOutcome(response),
      payload: null,
    };
  }
  return {
    outcome: "success",
    status: response.status,
    errorCode: null,
    payload: response.data,
  };
}

function applyLLMChatHydrationSuccess({
  chatId,
  sectionId,
  projectConfigId,
  payload,
}: {
  chatId: string;
  sectionId?: string;
  projectConfigId: string;
  payload: HttpapiLlmChatResponse;
}): void {
  const managedHydrationPayload = payload as HttpapiLlmChatResponse & {
    toolCallArguments?: Record<string, string>;
    appGenerationByMessageId?: Record<string, string>;
  };
  const {
    messages,
    waitingForResponse,
    llmConfig,
    contextUsage,
    appGenerationByMessageId,
  } = managedHydrationPayload;
  const toolCallArguments = managedHydrationPayload.toolCallArguments ?? {};
  const nextWaitingForResponse = applyHydratedChatDetailsToStore({
    chatId,
    messages,
    waitingForResponse,
    backendToolCallArguments: toolCallArguments,
    llmConfig,
    contextUsage: contextUsage ?? null,
    serializedAppGenerationByMessageId: appGenerationByMessageId,
  });
  if (sectionId) {
    const nextState = applyHydratedChatDetailsToSectionState({
      sectionId,
      messages,
      waitingForResponse,
      toolCallArguments,
    });
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: "hydrate-llm-chat",
    });
  }
  if (!nextWaitingForResponse) {
    clearStopEligibleAssistantMessageId(chatId);
    clearAIFollowToolArgumentsForChat(projectConfigId, chatId);
  }
}

function applyExternalChatHydrationSuccess({
  chatId,
  projectConfigId,
  sectionId,
  payload,
}: {
  chatId: string;
  projectConfigId: string | null;
  sectionId?: string;
  payload: HttpapiExternalAgentChatResponse;
}): void {
  const {
    messages,
    waitingForResponse,
    toolCallArguments,
    contextUsage,
    appGenerationByMessageId,
  } = payload;
  const nextWaitingForResponse = applyHydratedChatDetailsToStore({
    chatId,
    messages,
    waitingForResponse,
    backendToolCallArguments: toolCallArguments,
    llmConfig: null,
    contextUsage: contextUsage ?? null,
    serializedAppGenerationByMessageId: appGenerationByMessageId,
  });
  if (sectionId) {
    const nextState = applyHydratedChatDetailsToSectionState({
      sectionId,
      messages,
      waitingForResponse,
      toolCallArguments,
    });
    const resolvedProjectConfigId = projectConfigId ?? getCurrProjectConfigId();
    persistChatSectionState({
      projectConfigId: resolvedProjectConfigId,
      sectionId,
      nextState,
      reason: "hydrate-external-chat",
    });
  }
  if (!nextWaitingForResponse) {
    clearStopEligibleAssistantMessageId(chatId);
    clearAIFollowToolArgumentsForChat(
      projectConfigId ?? getCurrProjectConfigId(),
      chatId,
    );
  }
}

export async function getLLMChatHydrationOutcome(
  chatId: string,
  sectionId?: string,
): Promise<ChatHydrationOutcome> {
  const projectConfigId = getCurrProjectConfigId();
  const outcome = await probeLLMChatHydration(chatId, projectConfigId);
  if (outcome.outcome === "success") {
    applyLLMChatHydrationSuccess({
      chatId,
      sectionId,
      projectConfigId,
      payload: outcome.payload,
    });
    return {
      outcome: "success",
      status: outcome.status,
      errorCode: null,
    };
  }
  return {
    outcome: outcome.outcome,
    status: outcome.status,
    errorCode: outcome.errorCode,
  };
}

export async function getLLMChat(
  chatId: string,
  sectionId?: string,
): Promise<boolean> {
  const outcome = await getLLMChatHydrationOutcome(chatId, sectionId);
  return outcome.outcome === "success";
}

export async function getExternalAgentChatHydrationOutcome(
  chatId: string,
  projectConfigId: string | null,
  sectionId?: string,
): Promise<ChatHydrationOutcome> {
  const outcome = await probeExternalAgentChatHydration(
    chatId,
    projectConfigId,
  );
  if (outcome.outcome === "success") {
    applyExternalChatHydrationSuccess({
      chatId,
      projectConfigId,
      sectionId,
      payload: outcome.payload,
    });
    return {
      outcome: "success",
      status: outcome.status,
      errorCode: null,
    };
  }
  return {
    outcome: outcome.outcome,
    status: outcome.status,
    errorCode: outcome.errorCode,
  };
}

export async function getExternalAgentChat(
  chatId: string,
  projectConfigId: string | null,
  sectionId?: string,
): Promise<boolean> {
  const outcome = await getExternalAgentChatHydrationOutcome(
    chatId,
    projectConfigId,
    sectionId,
  );
  return outcome.outcome === "success";
}

export async function submitMessage(
  chatId: string | null,
  message: string,
  attachments: ChatFileAttachment[],
  thinking: boolean,
  engineConfigId: string,
  isExternalEngine: boolean,
  options: {
    messageId?: string;
    agentProfileId?: string | null;
    sectionId?: string | null;
    continueFromChatId?: string | null;
    pendingSurfaceId?: string | null;
    executionSettings?: ChatExecutionSettings | null;
    appGeneration?: ChatAppGenerationContext | null;
  } = {},
): Promise<string | null> {
  const trimmed = message.trim();
  if ((!trimmed && attachments.length === 0) || !engineConfigId) {
    return null;
  }
  const resolvedPendingSurfaceId =
    chatId === null
      ? requirePendingChatSurfaceId(options.pendingSurfaceId ?? null)
      : options.pendingSurfaceId ?? null;
  const resolvedExecutionSettings =
    options.executionSettings ?? DEFAULT_CHAT_EXECUTION_SETTINGS;
  const appGeneration = normalizeChatAppGenerationContext(
    options.appGeneration ?? null,
  );
  const existingAppGenerationDetails = getChatAppGenerationDetailsForTarget(
    useAIStore.getState(),
    chatId,
    resolvedPendingSurfaceId,
  );

  // Add user message immediately for responsive UI
  const content = [];
  if (trimmed) {
    content.push(createMessageTextContent({ text: message }));
  }
  const userMessage = {
    id: options.messageId ?? createNewId(),
    role: ChatRoleEnum.user,
    content,
    attachments,
    createdAt: Date.now(),
  };
  const userMessageId = userMessage.id;
  const nextMessages =
    chatId === null
      ? [
          ...(useAIStore.getState().pendingChatDetailsBySurfaceId[
            resolvedPendingSurfaceId
          ]?.messages ?? []),
          userMessage,
        ]
      : [
          ...(useAIStore.getState().chatDetails[chatId]?.messages ?? []),
          userMessage,
        ];
  const nextAppGenerationDetails = setChatAppGenerationForMessage(
    existingAppGenerationDetails,
    nextMessages,
    userMessage.id,
    appGeneration,
  );

  applyOptimisticUserMessage(
    chatId,
    userMessage,
    resolvedPendingSurfaceId,
    appGeneration,
  );

  try {
    const projectConfigId = getCurrProjectConfigId();
    const frontendAffinityToken = await waitForFrontendAffinityToken();
    const appGenerationMode = appGeneration?.mode ?? null;
    const res = await callOpenAPI(
      apiGetLlmResponse({
        body: {
          message: userMessage,
          thinking,
          chatId,
          continueFromChatId: options.continueFromChatId ?? null,
          engineConfigId,
          agentProfileId: options.agentProfileId ?? null,
          appGenerationMode,
          appGenerationByMessageId: serializeChatAppGenerationByMessageId(
            nextAppGenerationDetails,
          ),
          projectConfigId,
          sectionId: options.sectionId ?? null,
          frontendAffinityToken,
          allowUnscoped: options.sectionId == null,
          permissionMode: resolvedExecutionSettings.permissionMode,
          searchEnabled: resolvedExecutionSettings.searchEnabled,
        },
      }),
    );
    if (res200(res)) {
      const returnedChatId = res.data;
      if (returnedChatId) {
        refreshAgentRunsAfterSubmit();
        if (isExternalEngine) {
          await getExternalAgentChat(
            returnedChatId,
            projectConfigId,
            options.sectionId ?? undefined,
          );
        } else {
          await getLLMChat(returnedChatId, options.sectionId ?? undefined);
        }
      }
      return returnedChatId;
    }
    const failureDetail =
      getErrorDetail(res.data) ??
      (typeof res.status === "number"
        ? `Chat request failed (status ${res.status}).`
        : "Chat request failed.");
    throw new Error(failureDetail);
  } catch (err) {
    const detail =
      err instanceof Error && err.message.trim()
        ? err.message
        : "AI request failed.";
    addTemporaryNotification(detail, NotificationTypeEnum.warning);
    rollbackOptimisticUserMessage(
      chatId,
      userMessageId,
      resolvedPendingSurfaceId,
    );
    throw err;
  }
}

export async function submitEditedMessage({
  parentChatId,
  messages,
  messageId,
  message,
  attachments,
  thinking,
  engineConfigId,
  isExternalEngine,
  agentProfileId,
  sectionId,
  pendingSurfaceId,
  executionSettings,
  appGeneration,
}: {
  parentChatId: string;
  messages: Array<BaseChatMessageUnion>;
  messageId: string;
  message: string;
  attachments: ChatFileAttachment[];
  thinking: boolean;
  engineConfigId: string | null;
  isExternalEngine: boolean;
  agentProfileId?: string | null;
  sectionId?: string | null;
  pendingSurfaceId?: string | null;
  executionSettings?: ChatExecutionSettings | null;
  appGeneration?: ChatAppGenerationContext | null;
}): Promise<string | null> {
  const trimmed = message.trim();
  if (!trimmed && attachments.length === 0) {
    return null;
  }
  const resolvedExecutionSettings =
    executionSettings ?? DEFAULT_CHAT_EXECUTION_SETTINGS;
  const resolvedAppGeneration = normalizeChatAppGenerationContext(
    appGeneration ?? null,
  );

  const content = [];
  if (trimmed) {
    content.push(createMessageTextContent({ text: message }));
  }
  const editedMessage = {
    id: messageId,
    role: ChatRoleEnum.user,
    content,
    attachments,
    createdAt: Date.now(),
  };
  const nextMessages = buildEditedMessageHistory(messages, editedMessage);
  if (!nextMessages) {
    return null;
  }
  const resolvedPendingSurfaceId = requirePendingChatSurfaceId(
    pendingSurfaceId ?? null,
  );
  const parentAppGenerationDetails = getChatAppGenerationDetailsForTarget(
    useAIStore.getState(),
    parentChatId,
    null,
  );
  const nextAppGenerationDetails = setChatAppGenerationForMessage(
    retainChatAppGenerationDetailsForMessages(
      parentAppGenerationDetails,
      nextMessages,
    ),
    nextMessages,
    messageId,
    resolvedAppGeneration,
  );
  const resolvedEngineConfigId = await resolveEngineConfigIdForChat(
    parentChatId,
    engineConfigId,
  );
  if (!resolvedEngineConfigId) {
    return null;
  }
  initializePendingChatDetailsWithMessages(
    nextMessages,
    true,
    resolvedPendingSurfaceId,
    nextAppGenerationDetails,
  );
  const projectConfigId = getCurrProjectConfigId();

  const setSectionChatId = async (nextChatId: string | null) => {
    if (!sectionId) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
          chatId: nextChatId,
        });
      },
      send: () =>
        route_set_chat_section_chat_id({
          projectConfigId,
          sectionId,
          chatId: nextChatId,
        }),
    });
  };

  if (sectionId) {
    await setSectionChatId(null);
  }

  try {
    const frontendAffinityToken = await waitForFrontendAffinityToken();
    const res = await callOpenAPI(
      apiGetLlmResponse({
        body: {
          message: editedMessage,
          thinking,
          chatId: null,
          engineConfigId: resolvedEngineConfigId,
          agentProfileId: agentProfileId ?? null,
          projectConfigId,
          sectionId: sectionId ?? null,
          frontendAffinityToken,
          allowUnscoped: sectionId == null,
          branchParentChatId: parentChatId,
          branchFromMessageId: messageId,
          appGenerationMode: resolvedAppGeneration?.mode ?? null,
          appGenerationByMessageId: serializeChatAppGenerationByMessageId(
            nextAppGenerationDetails,
          ),
          permissionMode: resolvedExecutionSettings.permissionMode,
          searchEnabled: resolvedExecutionSettings.searchEnabled,
        },
      }),
    );
    if (!res200(res)) {
      const detail =
        getErrorDetail(res.data) ??
        (res.status
          ? `AI request failed (status ${res.status}).`
          : "AI request failed.");
      addTemporaryNotification(detail, NotificationTypeEnum.warning);
      clearPendingChatDetails(resolvedPendingSurfaceId);
      if (sectionId) {
        await setSectionChatId(parentChatId);
      }
      return null;
    }
    const returnedChatId = res.data;
    if (returnedChatId) {
      refreshAgentRunsAfterSubmit();
      if (isExternalEngine) {
        await getExternalAgentChat(
          returnedChatId,
          projectConfigId,
          sectionId ?? undefined,
        );
      } else {
        await getLLMChat(returnedChatId, sectionId ?? undefined);
      }
      if (sectionId) {
        await setSectionChatId(returnedChatId);
        commitPendingChatDetails(returnedChatId, resolvedPendingSurfaceId);
      } else {
        commitPendingChatDetails(returnedChatId, resolvedPendingSurfaceId);
      }
    } else {
      clearPendingChatDetails(resolvedPendingSurfaceId);
    }
    return returnedChatId;
  } catch (err) {
    const detail =
      err instanceof Error && err.message.trim()
        ? err.message
        : "AI request failed.";
    addTemporaryNotification(detail, NotificationTypeEnum.warning);
    clearPendingChatDetails(resolvedPendingSurfaceId);
    if (sectionId) {
      await setSectionChatId(parentChatId);
    }
    throw err;
  }
}

export async function respondExternalAgentApproval(
  approvalId: string,
  approved: boolean,
): Promise<boolean> {
  const res = await callOpenAPI(
    apiRespondExternalAgentApproval({
      body: {
        approvalId,
        approved,
      },
    }),
  );
  return res200(res);
}

export async function respondExternalAgentQuestion(
  toolCallId: string,
  answers: Record<string, string>,
): Promise<boolean> {
  const res = await callOpenAPI(
    apiRespondExternalAgentQuestion({
      body: {
        toolCallId,
        answers,
      },
    }),
  );
  return res200(res);
}

async function findLatestRunningExternalRunId(
  chatId: string,
  projectConfigId: string | null,
): Promise<string | null> {
  let { agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState();
  if (!agentRunsInitialLoadComplete) {
    await loadAgentRuns();
    ({ agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState());
  }
  if (!agentRunsInitialLoadComplete) {
    return null;
  }
  const runs = agentRuns.filter((run) => {
    if (run.status !== RunStatusEnum.running) {
      return false;
    }
    const inputs = run.inputs ?? {};
    const runType = typeof inputs.runType === "string" ? inputs.runType : null;
    if (runType !== "external_agent") {
      return false;
    }
    const runChatId = typeof inputs.chatId === "string" ? inputs.chatId : null;
    if (runChatId !== chatId) {
      return false;
    }
    const runProjectConfigId =
      typeof inputs.projectConfigId === "string"
        ? inputs.projectConfigId
        : null;
    if (projectConfigId && runProjectConfigId !== projectConfigId) {
      return false;
    }
    return true;
  });
  if (runs.length === 0) {
    return null;
  }
  runs.sort((a, b) => getRunLastUpdatedMs(b) - getRunLastUpdatedMs(a));
  return runs[0]?.id ?? null;
}

function applyStreamingChunkToSection(
  sectionId: string,
  chunk: LLMStreamingResponseContent["chunk"],
  projectConfigId: string,
) {
  const nextState = applyChatSectionStreamDelta(sectionId, chunk);
  if (chunk.type === StreamingEventTypeEnum.tool_argument_preview_delta) {
    applyToolArgumentPreviewDeltaToPreviewStore(chunk, projectConfigId);
    return;
  }
  if (chunk.type === StreamingEventTypeEnum.tool_result) {
    maybeApplyAppDefinitionToolResult(chunk.result);
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: chunk.type,
    });
    clearToolArgumentPreviewByToolCallId(
      projectConfigId,
      chunk.result.tool_call_id,
    );
    handleAgenticScopeViolation(chunk.result, projectConfigId);
    return;
  }
  if (chunk.type === StreamingEventTypeEnum.message_finalized) {
    recordFinalizedMessage(sectionId, chunk.message.id);
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: chunk.type,
    });
    const toolCallIds =
      chunk.message.role === ChatRoleEnum.assistant
        ? chunk.message.tool_calls?.map((toolCall) => toolCall.id) ?? []
        : [];
    clearToolArgumentPreviewByToolCallIds(projectConfigId, toolCallIds);
    return;
  }
  if (chunk.type === StreamingEventTypeEnum.message_stop) {
    if (!shouldPersistOnMessageStop(sectionId, chunk.message_id)) {
      return;
    }
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: chunk.type,
    });
  }
}

export function receiveLLMResponseChunk(msg: LLMStreamingResponseContent) {
  const { chatId, chunk } = msg;
  const projectConfigId = msg.projectConfigId ?? getCurrProjectConfigId();
  let sectionId = msg.sectionId;
  if (shouldIgnoreResponsePlaceholderChunk(chunk)) {
    return;
  }
  if (!sectionId && chatId) {
    sectionId = resolveSectionIdForChatId(chatId);
  }
  const isManagedSection = sectionId
    ? isManagedChatSection(useProjectState.getState(), sectionId)
    : false;
  const shouldUpdateChatDetails = !sectionId || isManagedSection;

  const shouldMarkActive =
    chunk.type === StreamingEventTypeEnum.message_start ||
    chunk.type === StreamingEventTypeEnum.delta ||
    chunk.type === StreamingEventTypeEnum.tool_call_delta ||
    chunk.type === StreamingEventTypeEnum.tool_argument_preview_delta;
  if (shouldMarkActive) {
    markChatStreamActive(chatId, sectionId);
  }
  if (
    chunk.type === StreamingEventTypeEnum.message_stop ||
    chunk.type === StreamingEventTypeEnum.message_finalized
  ) {
    clearChatStreamActive(chatId, sectionId);
  }
  if (sectionId) {
    applyStreamingChunkToSection(sectionId, chunk, projectConfigId);
  }
  if (shouldUpdateChatDetails) {
    switch (chunk.type) {
      case StreamingEventTypeEnum.message_start:
        handleMessageStart(chatId, chunk);
        return;
      case StreamingEventTypeEnum.delta:
        handleMessageDelta(chatId, chunk);
        return;
      case StreamingEventTypeEnum.tool_call_delta:
        handleToolCallDelta(chatId, chunk);
        return;
      case StreamingEventTypeEnum.tool_argument_preview_delta:
        if (sectionId) {
          applyStreamingChunkToChatDetails(chatId, chunk);
          return;
        }
        handleToolArgumentPreviewDelta(chatId, chunk, projectConfigId);
        return;
      case StreamingEventTypeEnum.tool_result:
        if (sectionId) {
          applyStreamingChunkToChatDetails(chatId, chunk);
          clearToolArgumentPreviewByToolCallId(
            projectConfigId,
            chunk.result.tool_call_id,
          );
          return;
        }
        handleToolResult(chatId, chunk, projectConfigId);
        return;
      case StreamingEventTypeEnum.message_stop:
        handleMessageStop(chatId, projectConfigId);
        return;
      case StreamingEventTypeEnum.message_finalized:
        handleMessageFinalized(chatId, chunk, projectConfigId);
        return;
      default:
        return chunk satisfies never;
    }
  }
}
type RunPayload = Record<string, unknown>;

function buildChatStateFromAgentRun(run: AgentRun): ChatSectionState {
  const outputMessages = extractRunMessages(run.outputs);
  if (outputMessages) {
    return buildChatSectionState(
      outputMessages,
      run.status === RunStatusEnum.running,
    );
  }

  const inputMessages = extractRunMessages(run.inputs) ?? [];
  return buildChatSectionState(
    inputMessages,
    run.status === RunStatusEnum.running,
  );
}

function buildChatSectionState(
  messages: Array<BaseChatMessageUnion>,
  waitingForResponse: boolean,
): ChatSectionState {
  return {
    messages: [...messages],
    inputText: "",
    waitingForResponse,
    toolCallArguments: {},
  };
}

function extractRunMessages(
  payload: RunPayload | null,
): Array<BaseChatMessageUnion> | null {
  if (!payload) {
    return null;
  }
  const raw = payload.messages;
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw as Array<BaseChatMessageUnion>;
}

async function resolveEngineConfigIdForChat(
  chatId: string,
  engineConfigId: string | null,
): Promise<string | null> {
  if (engineConfigId) {
    return engineConfigId;
  }
  const resolveFromRuns = (runs: AgentRun[]): string | null => {
    const matchingRuns = runs.filter(
      (run) => getRunInputString(run, "chatId") === chatId,
    );
    const runsWithEngine = matchingRuns.filter((run) =>
      getRunInputString(run, "engineConfigId"),
    );
    if (runsWithEngine.length === 0) {
      return null;
    }
    const [latestRun] = [...runsWithEngine].sort(
      (a, b) => getRunLastUpdatedMs(b) - getRunLastUpdatedMs(a),
    );
    return latestRun ? getRunInputString(latestRun, "engineConfigId") : null;
  };

  let { agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState();
  if (!agentRunsInitialLoadComplete) {
    await loadAgentRuns();
    ({ agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState());
  }
  if (!agentRunsInitialLoadComplete) {
    return null;
  }
  let resolved = resolveFromRuns(agentRuns);
  if (!resolved) {
    await loadAgentRuns();
    ({ agentRuns } = useAIStore.getState());
    resolved = resolveFromRuns(agentRuns);
  }
  if (resolved) {
    return resolved;
  }
  const { chatDetails, engineConfigs } = useAIStore.getState();
  const llmConfigId = chatDetails[chatId]?.llmConfig?.id ?? null;
  if (!llmConfigId) {
    return null;
  }
  const matchingEngine = engineConfigs.find(
    (config) => config.settaLlmConfigId === llmConfigId,
  );
  return matchingEngine?.id ?? null;
}

function handleMessageStart(chatId: string, chunk: MessageStartEvent) {
  if (chunk.message.role === ChatRoleEnum.assistant) {
    setStopEligibleAssistantMessageId(chatId, chunk.message.id);
    clearInterruptedAssistantMessages(chatId, [chunk.message.id]);
  }
  applyStreamingChunkToChatDetails(chatId, chunk);
}

function handleMessageDelta(chatId: string, chunk: MessageDeltaEvent) {
  applyStreamingChunkToChatDetails(chatId, chunk);
}

function handleToolCallDelta(chatId: string, chunk: ToolCallDeltaEvent) {
  applyStreamingChunkToChatDetails(chatId, chunk);
}

function handleAgenticScopeViolation(
  toolResult: ToolResultEvent["result"],
  projectConfigId: string,
): void {
  const violation = extractAgenticScopeViolation(toolResult);
  if (!violation) {
    return;
  }
  receiveAgenticScopeViolationEdges({
    projectConfigId,
    edges: violation.edges,
  });
  const existingTimeout = scopeViolationToastTimeouts.get(projectConfigId);
  if (existingTimeout !== undefined) {
    globalThis.clearTimeout(existingTimeout);
    const timeoutId = globalThis.setTimeout(() => {
      scopeViolationToastTimeouts.delete(projectConfigId);
    }, SCOPE_VIOLATION_TIMEOUT_MS);
    scopeViolationToastTimeouts.set(projectConfigId, timeoutId);
    return;
  }
  const notice = `${violation.message} Add the missing agentic edge(s) shown on the canvas. Use Project Chat for full access.`;
  addTemporaryNotification(notice, NotificationTypeEnum.warning);
  const timeoutId = globalThis.setTimeout(() => {
    scopeViolationToastTimeouts.delete(projectConfigId);
  }, SCOPE_VIOLATION_TIMEOUT_MS);
  scopeViolationToastTimeouts.set(projectConfigId, timeoutId);
}

const APP_DEFINITION_TOOL_NAMES = new Set([
  "setta__set_app_definition",
  "setta__update_app_definition",
  "setta__stream_app_definition",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractToolStructuredContent(
  toolResult: unknown,
): Record<string, unknown> | null {
  if (!isRecord(toolResult)) {
    return null;
  }
  const structured = toolResult.structuredContent;
  if (!structured) {
    return null;
  }
  if (!isRecord(structured)) {
    return null;
  }
  return structured;
}

function maybeApplyAppDefinitionToolResult(toolMessage: ToolChatMessage): void {
  const toolName =
    typeof toolMessage.tool_name === "string" ? toolMessage.tool_name : null;
  if (!toolName || !APP_DEFINITION_TOOL_NAMES.has(toolName)) {
    return;
  }
  if (toolMessage.is_error) {
    if (toolName === "setta__stream_app_definition") {
      clearAppSpecPatchStream(toolMessage.tool_call_id);
      // Keep the last streamed preview visible even if the tool call fails validation.
      // Otherwise the preview disappears while the AI iterates on fixes.
    }
    return;
  }
  const structured = extractToolStructuredContent(toolMessage.result);
  if (!structured) {
    return;
  }
  const hasSpec = Object.prototype.hasOwnProperty.call(structured, "appSpec");
  const hasDefinition = Object.prototype.hasOwnProperty.call(
    structured,
    "appDefinition",
  );
  if (!hasSpec && !hasDefinition) {
    return;
  }

  const nextSpec = hasSpec ? (structured.appSpec as unknown) : undefined;
  const nextDefinition = hasDefinition
    ? (structured.appDefinition as unknown)
    : undefined;

  useAppDefinition.setState((state) => ({
    appSpec: nextSpec === undefined ? state.appSpec : nextSpec ?? null,
    appDefinition:
      nextDefinition === undefined
        ? state.appDefinition
        : ((nextDefinition ?? null) as AppDefinition | null),
  }));
  useAppPreview.setState({
    previewSpecOverride: undefined,
    aiPreviewSpecOverride: undefined,
    previewThemeOverride: undefined,
    previewAssetsOverride: undefined,
  });
  if (toolName === "setta__stream_app_definition") {
    clearAppSpecPatchStream(toolMessage.tool_call_id);
  }
  addTemporaryNotification("App spec updated.");
}

function handleToolResult(
  chatId: string,
  chunk: ToolResultEvent,
  projectConfigId: string,
) {
  applyStreamingChunkToChatDetails(chatId, chunk);
  clearToolArgumentPreviewByToolCallId(
    projectConfigId,
    chunk.result.tool_call_id,
  );
  handleAgenticScopeViolation(chunk.result, projectConfigId);
  maybeApplyAppDefinitionToolResult(chunk.result);
}

function handleMessageStop(chatId: string, projectConfigId: string) {
  clearStopEligibleAssistantMessageId(chatId);
  applyStreamingChunkToChatDetails(chatId, {
    type: StreamingEventTypeEnum.message_stop,
    message_id: "",
  });
  clearAIFollowToolArgumentsForChat(projectConfigId, chatId);
  clearAllAppSpecPatchStreams();
}

function handleMessageFinalized(
  chatId: string,
  chunk: MessageFinalizedEvent,
  projectConfigId: string,
) {
  let resolvedTargetId: string | null = chunk.message.id;
  updateChatDetails(chatId, (details) => {
    if (chunk.message.role === ChatRoleEnum.assistant) {
      resolvedTargetId = resolveFinalizedAssistantMessageUpdate(
        details.messages,
        chunk.message as AssistantChatMessage,
      ).targetId;
    }
    return applyStreamDeltaToChatDetails(details, chunk);
  });
  if (chunk.message.role === ChatRoleEnum.assistant) {
    clearStopEligibleAssistantMessageId(chatId);
    clearInterruptedAssistantMessages(chatId, [
      resolvedTargetId,
      chunk.message.id,
    ]);
  }
  clearAIFollowToolArgumentsForChat(projectConfigId, chatId);
  const toolCallIds: string[] =
    chunk.message.role === "assistant"
      ? chunk.message.tool_calls?.map((toolCall) => toolCall.id) ?? []
      : [];
  clearToolArgumentPreviewByToolCallIds(projectConfigId, toolCallIds);
}

function handleToolArgumentPreviewDelta(
  chatId: string,
  chunk: ToolArgumentPreviewDeltaEvent,
  projectConfigId: string,
) {
  if (chunk.preview_kind === "appSpecPatch") {
    // For app spec patch streaming, the `arguments_delta` includes the entire JSON tool
    // arguments payload (including the growing patches string). Updating chatDetails on
    // every tiny delta can overwhelm React. We only need the patch preview for live
    // rendering, so keep chat updates minimal.
    ensureToolCallPlaceholder(chatId, chunk);
    applyToolArgumentPreviewDeltaToPreviewStore(chunk);
    return;
  }

  applyStreamingChunkToChatDetails(chatId, chunk);
  applyToolArgumentPreviewDeltaToPreviewStore(chunk, projectConfigId);
}

function applyStreamingChunkToChatDetails(
  chatId: string,
  chunk: LLMStreamingResponseContent["chunk"],
) {
  updateChatDetails(chatId, (details) =>
    applyStreamDeltaToChatDetails(details, chunk),
  );
}

function ensureToolCallPlaceholder(
  chatId: string,
  chunk: ToolArgumentPreviewDeltaEvent,
) {
  useAIStore.setState((state) => {
    const existingDetails = state.chatDetails[chatId];
    if (!existingDetails) {
      return state;
    }
    const { messages, changed } = updateMessageById(
      existingDetails.messages,
      chunk.message_id,
      (message) => {
        const toolCalls = [...(message.tool_calls ?? [])];
        const existingIndex = toolCalls.findIndex(
          (entry) => entry.id === chunk.tool_call_id,
        );
        if (existingIndex !== -1) {
          const existingCall = toolCalls[existingIndex];
          if (existingCall.function.name === chunk.tool_name) {
            return null;
          }
          toolCalls[existingIndex] = {
            ...existingCall,
            function: {
              ...existingCall.function,
              name: chunk.tool_name,
            },
          };
          return { ...message, tool_calls: toolCalls };
        }
        toolCalls.push(
          createToolCallPlaceholder({
            tool_call_id: chunk.tool_call_id,
            tool_name: chunk.tool_name,
          }),
        );
        return { ...message, tool_calls: toolCalls };
      },
    );
    if (!changed) {
      return state;
    }
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...existingDetails,
          messages,
        },
      },
    };
  });
}

function applyToolArgumentPreviewDeltaToPreviewStore(
  chunk: ToolArgumentPreviewDeltaEvent,
  projectConfigId?: string,
) {
  if (chunk.preview_kind === "appSpecPatch") {
    const nextSpec = applyAppSpecPatchPreviewDelta({
      toolCallId: chunk.tool_call_id,
      previewValueDelta: chunk.preview_value_delta,
    });
    if (nextSpec) {
      useAppPreview.setState({ aiPreviewSpecOverride: nextSpec });
    }
    return;
  }
  const resolvedProjectConfigId = projectConfigId ?? getCurrProjectConfigId();
  useToolArgumentPreview.setState((state) => {
    const previewState =
      state.byProjectConfigId[resolvedProjectConfigId] ??
      (state.byProjectConfigId[resolvedProjectConfigId] =
        createToolArgumentPreviewProjectState());
    const previewDelta = chunk.preview_value_delta;
    const toolCallId = chunk.tool_call_id;
    switch (chunk.preview_kind) {
      case "code": {
        const sectionIds = chunk.target_ids_by_type.section ?? [];
        for (const sectionId of sectionIds) {
          const existing = previewState.previewCodeBySectionId[sectionId];
          previewState.previewCodeBySectionId[sectionId] = applyPreviewDelta(
            existing,
            previewDelta,
            toolCallId,
          );
        }
        return;
      }
      case "paramValue": {
        const sectionIds = chunk.target_ids_by_type.section ?? [];
        const paramIds = chunk.target_ids_by_type.codeObj ?? [];
        if (sectionIds.length === 0 || paramIds.length === 0) {
          return;
        }
        for (const sectionId of sectionIds) {
          const paramEntries =
            previewState.previewParamValueBySectionAndParamId[sectionId] ??
            (previewState.previewParamValueBySectionAndParamId[sectionId] = {});
          for (const paramInfoId of paramIds) {
            const existing = paramEntries[paramInfoId];
            paramEntries[paramInfoId] = applyPreviewDelta(
              existing,
              previewDelta,
              toolCallId,
            );
          }
        }
        return;
      }
      case "callableName": {
        const sectionIds = chunk.target_ids_by_type.section ?? [];
        for (const sectionId of sectionIds) {
          const existing =
            previewState.previewCallableNameBySectionId[sectionId];
          previewState.previewCallableNameBySectionId[sectionId] =
            applyPreviewDelta(existing, previewDelta, toolCallId);
        }
        return;
      }
      default: {
        chunk.preview_kind satisfies never;
        return;
      }
    }
  });
}

function createToolArgumentPreviewProjectState(): ToolArgumentPreviewProjectState {
  return {
    previewCodeBySectionId: {},
    previewParamValueBySectionAndParamId: {},
    previewCallableNameBySectionId: {},
  };
}

function applyPreviewDelta(
  existing: ToolArgumentPreviewEntry | undefined,
  previewDelta: string,
  toolCallId: string,
): ToolArgumentPreviewEntry {
  if (!existing || existing.toolCallId !== toolCallId) {
    return { value: previewDelta, toolCallId };
  }
  if (!previewDelta) {
    return existing;
  }
  return { value: existing.value + previewDelta, toolCallId };
}

function clearToolArgumentPreviewByToolCallId(
  projectConfigId: string,
  toolCallId: string,
) {
  clearToolArgumentPreviewByToolCallIds(projectConfigId, [toolCallId]);
}

function clearToolArgumentPreviewByToolCallIds(
  projectConfigId: string,
  toolCallIds: string[],
) {
  if (toolCallIds.length === 0) {
    return;
  }
  const toolCallIdSet = new Set(toolCallIds);
  useToolArgumentPreview.setState((state) => {
    const previewState = state.byProjectConfigId[projectConfigId];
    if (!previewState) {
      return;
    }
    for (const [sectionId, entry] of Object.entries(
      previewState.previewCodeBySectionId,
    )) {
      if (toolCallIdSet.has(entry.toolCallId)) {
        delete previewState.previewCodeBySectionId[sectionId];
      }
    }
    for (const [sectionId, entry] of Object.entries(
      previewState.previewCallableNameBySectionId,
    )) {
      if (toolCallIdSet.has(entry.toolCallId)) {
        delete previewState.previewCallableNameBySectionId[sectionId];
      }
    }
    for (const [sectionId, paramEntries] of Object.entries(
      previewState.previewParamValueBySectionAndParamId,
    )) {
      for (const [paramInfoId, entry] of Object.entries(paramEntries)) {
        if (toolCallIdSet.has(entry.toolCallId)) {
          delete paramEntries[paramInfoId];
        }
      }
      if (Object.keys(paramEntries).length === 0) {
        delete previewState.previewParamValueBySectionAndParamId[sectionId];
      }
    }
    if (
      Object.keys(previewState.previewCodeBySectionId).length === 0 &&
      Object.keys(previewState.previewCallableNameBySectionId).length === 0 &&
      Object.keys(previewState.previewParamValueBySectionAndParamId).length ===
        0
    ) {
      delete state.byProjectConfigId[projectConfigId];
    }
  });
}

function updateChatDetails(
  chatId: string,
  updater: (details: ChatDetails) => ChatDetails | null,
) {
  useAIStore.setState((state) => {
    const baseDetails: ChatDetails = {
      ...getDefaultChatDetails(),
      ...(state.chatDetails[chatId] ?? {}),
    };
    const nextDetails = updater(baseDetails);
    if (!nextDetails) {
      return state;
    }
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: nextDetails,
      },
    };
  });
}

function updatePendingChatDetails(
  updater: (details: ChatDetails) => ChatDetails | null,
  surfaceId: string | null | undefined,
) {
  useAIStore.setState((state) => {
    const baseDetails: ChatDetails =
      getPendingChatDetailsForSurface(state, surfaceId) ??
      getDefaultChatDetails();
    const nextDetails = updater(baseDetails);
    if (!nextDetails) {
      return state;
    }
    return setPendingChatDetailsForSurface(state, surfaceId, nextDetails);
  });
}

function mergeChatDetails(
  existingDetails: ChatDetails,
  pendingDetails: ChatDetails,
  preserveWaitingForResponse: boolean,
): ChatDetails {
  const existingMessageIds = new Set(
    existingDetails.messages.map((message) => message.id),
  );
  const promotedPendingMessages = pendingDetails.messages.filter(
    (message) => !existingMessageIds.has(message.id),
  );
  const nextWaitingForResponse = preserveWaitingForResponse
    ? pendingDetails.waitingForResponse || existingDetails.waitingForResponse
    : pendingDetails.waitingForResponse;
  return {
    ...existingDetails,
    messages:
      promotedPendingMessages.length === 0
        ? [...existingDetails.messages]
        : [...promotedPendingMessages, ...existingDetails.messages],
    toolCallArguments: {
      ...pendingDetails.toolCallArguments,
      ...existingDetails.toolCallArguments,
    },
    waitingForResponse: nextWaitingForResponse,
  };
}

export function finalizePendingChatDetails(chatId: string, surfaceId: string) {
  useAIStore.setState((state) => {
    const pendingDetails = getPendingChatDetailsForSurface(state, surfaceId);
    if (!pendingDetails) {
      return state;
    }
    const existingDetails =
      state.chatDetails[chatId] ?? getDefaultChatDetails();
    const pendingAppGeneration =
      getPendingChatAppGenerationDetailsForSurface(state, surfaceId) ??
      getDefaultChatAppGenerationDetails();
    const existingAppGeneration =
      state.chatAppGenerationDetailsByChatId[chatId] ??
      getDefaultChatAppGenerationDetails();
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: mergeChatDetails(
          existingDetails,
          pendingDetails,
          isChatStreamActive(chatId),
        ),
      },
      chatAppGenerationDetailsByChatId: {
        ...state.chatAppGenerationDetailsByChatId,
        [chatId]: mergeChatAppGenerationDetails(
          existingAppGeneration,
          pendingAppGeneration,
        ),
      },
      ...setPendingChatDetailsForSurface(state, surfaceId, null),
      ...setPendingChatAppGenerationDetailsForSurface(state, surfaceId, null),
    };
  });
}

function commitPendingChatDetails(
  chatId: string,
  surfaceId: string | null | undefined,
) {
  useAIStore.setState((state) => {
    const pendingDetails = getPendingChatDetailsForSurface(state, surfaceId);
    if (!pendingDetails) {
      return state;
    }
    const existingDetails =
      state.chatDetails[chatId] ?? getDefaultChatDetails();
    const pendingAppGeneration =
      getPendingChatAppGenerationDetailsForSurface(state, surfaceId) ??
      getDefaultChatAppGenerationDetails();
    const existingAppGeneration =
      state.chatAppGenerationDetailsByChatId[chatId] ??
      getDefaultChatAppGenerationDetails();
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: mergeChatDetails(
          existingDetails,
          pendingDetails,
          isChatStreamActive(chatId),
        ),
      },
      chatAppGenerationDetailsByChatId: {
        ...state.chatAppGenerationDetailsByChatId,
        [chatId]: mergeChatAppGenerationDetails(
          existingAppGeneration,
          pendingAppGeneration,
        ),
      },
      ...setPendingChatDetailsForSurface(state, surfaceId, null),
      ...setPendingChatAppGenerationDetailsForSurface(state, surfaceId, null),
    };
  });
}

function applyOptimisticUserMessage(
  chatId: string | null,
  userMessage: BaseChatMessageUnion,
  surfaceId: string | null | undefined = null,
  appGeneration: ChatAppGenerationContext | null = null,
) {
  const resolvedAppGeneration =
    normalizeChatAppGenerationContext(appGeneration);
  useAIStore.setState((state) => {
    if (typeof chatId === "string") {
      clearStopEligibleAssistantMessageId(chatId);
      return {
        chatDetails: {
          ...state.chatDetails,
          [chatId]: {
            ...getDefaultChatDetails(),
            ...(state.chatDetails[chatId] ?? {}),
            messages: [
              ...(state.chatDetails[chatId]?.messages ?? []),
              userMessage,
            ],
            waitingForResponse: true,
          },
        },
        chatAppGenerationDetailsByChatId: {
          ...state.chatAppGenerationDetailsByChatId,
          [chatId]: setChatAppGenerationForMessage(
            state.chatAppGenerationDetailsByChatId[chatId] ??
              getDefaultChatAppGenerationDetails(),
            [...(state.chatDetails[chatId]?.messages ?? []), userMessage],
            userMessage.id,
            resolvedAppGeneration,
          ),
        },
      };
    }
    const nextDetails = {
      ...(getPendingChatDetailsForSurface(state, surfaceId) ??
        getDefaultChatDetails()),
      messages: [
        ...(getPendingChatDetailsForSurface(state, surfaceId)?.messages ?? []),
        userMessage,
      ],
      waitingForResponse: true,
    };
    return {
      ...setPendingChatDetailsForSurface(state, surfaceId, nextDetails),
      ...setPendingChatAppGenerationDetailsForSurface(
        state,
        surfaceId,
        setChatAppGenerationForMessage(
          getPendingChatAppGenerationDetailsForSurface(state, surfaceId) ??
            getDefaultChatAppGenerationDetails(),
          nextDetails.messages,
          userMessage.id,
          resolvedAppGeneration,
        ),
      ),
    };
  });
}

function rollbackOptimisticUserMessage(
  chatId: string | null,
  userMessageId: string,
  surfaceId: string | null | undefined = null,
) {
  useAIStore.setState((state) => {
    if (chatId === null) {
      const pendingDetails =
        getPendingChatDetailsForSurface(state, surfaceId) ??
        getDefaultChatDetails();
      const nextMessages = pendingDetails.messages.filter(
        (message) => message.id !== userMessageId,
      );
      return {
        ...setPendingChatDetailsForSurface(state, surfaceId, {
          ...pendingDetails,
          messages: nextMessages,
          waitingForResponse: false,
        }),
        ...setPendingChatAppGenerationDetailsForSurface(
          state,
          surfaceId,
          setChatAppGenerationForMessage(
            getPendingChatAppGenerationDetailsForSurface(state, surfaceId) ??
              getDefaultChatAppGenerationDetails(),
            nextMessages,
            userMessageId,
            null,
          ),
        ),
      };
    }
    const currentDetails = state.chatDetails[chatId] ?? getDefaultChatDetails();
    const nextMessages = currentDetails.messages.filter(
      (message) => message.id !== userMessageId,
    );
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...currentDetails,
          messages: nextMessages,
          waitingForResponse: false,
        },
      },
      chatAppGenerationDetailsByChatId: {
        ...state.chatAppGenerationDetailsByChatId,
        [chatId]: setChatAppGenerationForMessage(
          state.chatAppGenerationDetailsByChatId[chatId] ??
            getDefaultChatAppGenerationDetails(),
          nextMessages,
          userMessageId,
          null,
        ),
      },
    };
  });
}
