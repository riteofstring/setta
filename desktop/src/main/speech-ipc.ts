import type { IpcMain } from "electron";

import type {
  BackendClient,
  SpeechAudio,
  SynthesizeEasyRunHighlightRequest,
  SynthesizeEasyRunSummaryRequest,
} from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";
import {
  type SpeechSynthesisIpcRequest,
  validateSpeechSynthesisOperationId,
} from "@shared/speech-ipc";

interface SpeechIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerSpeechIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: SpeechIpcRegistration): void {
  const synthesisOperations = new SpeechSynthesisOperations();
  handleIpc(ipcMain, "speechCancelSynthesis", async (_event, operationId) => {
    synthesisOperations.cancel(operationId);
  });
  handleIpc(
    ipcMain,
    "speechReadCapabilities",
    async () => requireBackendClient().readSpeechCapabilities(),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechCreateTranscriptionSession",
    async (_event, request) => requireBackendClient().createSpeechTranscriptionSession(request),
    observerWithRedactedResult(ipcObserver, "speech_transcription_session"),
  );
  handleIpc(
    ipcMain,
    "speechSynthesizeEasyRunSummary",
    async (_event, operation) =>
      synthesisOperations.run(operation, (request, signal) =>
        requireBackendClient().synthesizeEasyRunSummary(request, { signal }),
      ),
    observerWithRedactedResult(ipcObserver, "speech_audio"),
  );
  handleIpc(
    ipcMain,
    "speechSynthesizeEasyRunHighlight",
    async (_event, operation) =>
      synthesisOperations.run(operation, (request, signal) =>
        requireBackendClient().synthesizeEasyRunHighlight(request, { signal }),
      ),
    observerWithRedactedResult(ipcObserver, "speech_audio"),
  );
}

type SpeechSynthesisRequest = SynthesizeEasyRunHighlightRequest | SynthesizeEasyRunSummaryRequest;

class SpeechSynthesisOperations {
  private readonly active = new Map<string, AbortController>();

  cancel(operationId: string): void {
    validateSpeechSynthesisOperationId(operationId);
    this.active.get(operationId)?.abort();
  }

  async run<TRequest extends SpeechSynthesisRequest>(
    operation: SpeechSynthesisIpcRequest<TRequest>,
    synthesize: (request: TRequest, signal: AbortSignal) => Promise<SpeechAudio>,
  ): Promise<SpeechAudio> {
    validateSpeechSynthesisOperationId(operation.operationId);
    if (this.active.has(operation.operationId)) {
      throw new Error("Speech synthesis operation is already active.");
    }
    const controller = new AbortController();
    this.active.set(operation.operationId, controller);
    try {
      return await synthesize(operation.request, controller.signal);
    } finally {
      if (this.active.get(operation.operationId) === controller) {
        this.active.delete(operation.operationId);
      }
    }
  }
}

function observerWithRedactedResult(
  observer: IpcObserver | undefined,
  resultType: "speech_audio" | "speech_transcription_session",
): IpcObserver | undefined {
  if (!observer) {
    return undefined;
  }
  return {
    failed: observer.failed,
    finished: (event) => {
      observer.finished({
        ...event,
        result: { redacted: true, type: resultType },
      });
    },
    started: observer.started,
  };
}
