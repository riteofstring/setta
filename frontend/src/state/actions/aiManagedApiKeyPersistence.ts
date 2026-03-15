import { useAIStore } from "state/stores/aiStores";
import { getErrorCode, res200 } from "utils/endpointUtils";
import { route_set_llm_api_keys } from "utils/generatedEndpoints";
import { type APIKeys } from "utils/generatedTypes";

import {
  MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
  MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE,
  MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE,
  receiveLLMApiKeysSnapshotUpdate,
  refreshLLMApiKeysSnapshotFromServer,
  resolveManagedApiKeysErrorDetails,
} from "./aiManagedApiKeyState";

type APIKeysMutation = (currentApiKeys: APIKeys) => APIKeys;

let llmApiKeysSaveQueue: Promise<void> = Promise.resolve();

function applyManagedApiKeysWriteFailure({
  payload,
  fallbackMessage,
}: {
  payload: unknown;
  fallbackMessage: string;
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
    apiKeysAuthoritative: false,
    apiKeysInitialLoadComplete: true,
    apiKeysLoadError: errorDetails.detail ?? fallbackMessage,
  });
  return { shouldRetryCorruptWrite: false };
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
      });
      return false;
    }
    applyManagedApiKeysWriteFailure({
      payload: res.data,
      fallbackMessage: "Failed to save LLM API keys",
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
