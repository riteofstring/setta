import { useAIStore } from "state/stores/aiStores";
import { getErrorCode, getErrorDetail, res200 } from "utils/endpointUtils";
import { route_get_llm_api_keys } from "utils/generatedEndpoints";
import { type ManagedAPIKeysResponse } from "utils/generatedTypes";

let llmApiKeysLoadPromise: Promise<void> | null = null;

export const MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE =
  "managed_api_keys_revision_conflict";
export const MANAGED_API_KEYS_CORRUPT_ERROR_CODE =
  "managed_api_keys_store_corrupt";
export const MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE =
  "managed_api_keys_store_unavailable";

export type ManagedAPIKeysSnapshotPayload = ManagedAPIKeysResponse & {
  corrupt?: boolean;
  errorCode?: string | null;
  message?: string | null;
};

export type ManagedAPIKeysErrorDetails = {
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

export async function refreshLLMApiKeysSnapshotFromServer(): Promise<boolean> {
  const res = await route_get_llm_api_keys();
  if (res200(res)) {
    receiveLLMApiKeysSnapshotUpdate(res.data);
    return true;
  }
  applyManagedApiKeysReadFailure(res.data);
  return false;
}

export async function loadLLMApiKeys(): Promise<void> {
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

export function receiveLLMApiKeysSnapshotUpdate(
  payload: ManagedAPIKeysSnapshotPayload,
): void {
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
