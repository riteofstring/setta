import { useAIStore } from "state/stores/aiStores";
import { getErrorCode, getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_llm_api_keys,
  route_get_llm_config,
  route_set_llm_api_keys,
  route_set_llm_config,
} from "utils/generatedEndpoints";
import { type AllLLMConfigs, type APIKeys } from "utils/generatedTypes";

let llmConfigLoadPromise: Promise<void> | null = null;
let llmApiKeysLoadPromise: Promise<void> | null = null;
let llmApiKeysSaveQueue: Promise<void> = Promise.resolve();

const MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE =
  "managed_api_keys_revision_conflict";
const MANAGED_API_KEYS_CORRUPT_ERROR_CODE = "managed_api_keys_store_corrupt";
const MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE =
  "managed_api_keys_store_unavailable";

type APIKeysMutation = (currentApiKeys: APIKeys) => APIKeys;

type ManagedAPIKeysSnapshotPayload = {
  apiKeys: APIKeys;
  revision: number;
  corrupt?: boolean;
  errorCode?: string | null;
  message?: string | null;
};

type ManagedAPIKeysErrorDetails = {
  detail: string | null;
  revision: number | null;
  errorCode: string | null;
  isCorrupt: boolean;
  isUnavailable: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

async function refreshLLMApiKeysSnapshotFromServer(): Promise<boolean> {
  const res = await route_get_llm_api_keys();
  if (res200(res)) {
    receiveLLMApiKeysSnapshotUpdate(res.data);
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
    const res = await route_set_llm_api_keys({
      apiKeys: nextApiKeys,
      expectedRevision: state.apiKeysRevision,
    });
    if (res200(res)) {
      receiveLLMApiKeysSnapshotUpdate(res.data);
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

export async function loadLLMConfig() {
  if (llmConfigLoadPromise) {
    await llmConfigLoadPromise;
    return;
  }
  llmConfigLoadPromise = (async () => {
    const res = await route_get_llm_config();
    if (res200(res)) {
      receiveLLMConfigUpdate(res.data);
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
  config: AllLLMConfigs,
): Promise<AllLLMConfigs | null> {
  const res = await route_set_llm_config(config);
  if (!res200(res)) {
    useAIStore.setState({
      allLLMConfigsInitialLoadComplete: true,
      allLLMConfigsLoadError: "Failed to save LLM config",
    });
    return null;
  }
  receiveLLMConfigUpdate(res.data);
  return res.data;
}

export async function loadLLMApiKeys() {
  if (llmApiKeysLoadPromise) {
    await llmApiKeysLoadPromise;
    return;
  }
  llmApiKeysLoadPromise = (async () => {
    const res = await route_get_llm_api_keys();
    if (res200(res)) {
      receiveLLMApiKeysSnapshotUpdate(res.data);
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

export function receiveLLMConfigUpdate(payload: AllLLMConfigs) {
  useAIStore.setState({
    allLLMConfigs: payload,
    allLLMConfigsInitialLoadComplete: true,
    allLLMConfigsLoadError: null,
  });
}

export function receiveLLMApiKeysSnapshotUpdate(
  payload: ManagedAPIKeysSnapshotPayload,
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
