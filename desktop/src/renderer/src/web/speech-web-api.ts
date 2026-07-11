import type { BackendClient } from "@generated/backend";
import type { SettaAPI } from "@shared/types";

export function createSpeechWebAPI(requireClient: () => BackendClient): SettaAPI["speech"] {
  return {
    createTranscriptionSession: (request) =>
      requireClient().createSpeechTranscriptionSession(request),
    readCapabilities: () => requireClient().readSpeechCapabilities(),
    synthesizeEasyRunHighlight: (request) => requireClient().synthesizeEasyRunHighlight(request),
    synthesizeEasyRunSummary: (request) => requireClient().synthesizeEasyRunSummary(request),
  };
}
