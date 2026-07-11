import type { BackendClient } from "@generated/backend";
import { validateSpeechSynthesisOperationId } from "@shared/speech-ipc";
import type { SettaAPI } from "@shared/types";

export function createSpeechWebAPI(requireClient: () => BackendClient): SettaAPI["speech"] {
  const synthesisOperations = new Map<string, AbortController>();
  return {
    cancelSynthesis: async (operationId) => {
      validateSpeechSynthesisOperationId(operationId);
      synthesisOperations.get(operationId)?.abort();
    },
    createTranscriptionSession: (request) =>
      requireClient().createSpeechTranscriptionSession(request),
    readCapabilities: () => requireClient().readSpeechCapabilities(),
    synthesizeEasyRunHighlight: (request, operationId) =>
      runSynthesisOperation(synthesisOperations, operationId, (signal) =>
        requireClient().synthesizeEasyRunHighlight(request, { signal }),
      ),
    synthesizeEasyRunSummary: (request, operationId) =>
      runSynthesisOperation(synthesisOperations, operationId, (signal) =>
        requireClient().synthesizeEasyRunSummary(request, { signal }),
      ),
  };
}

async function runSynthesisOperation<T>(
  active: Map<string, AbortController>,
  operationId: string,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  validateSpeechSynthesisOperationId(operationId);
  if (active.has(operationId)) {
    throw new Error("Speech synthesis operation is already active.");
  }
  const controller = new AbortController();
  active.set(operationId, controller);
  try {
    return await run(controller.signal);
  } finally {
    if (active.get(operationId) === controller) {
      active.delete(operationId);
    }
  }
}
