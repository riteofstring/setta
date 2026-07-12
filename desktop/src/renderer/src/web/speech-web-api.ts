import type { BackendClient } from "@generated/backend";
import type { SettaAPI } from "@shared/types";

export function createSpeechWebAPI(requireClient: () => BackendClient): SettaAPI["speech"] {
  return {
    createTranscriptionSession: () => requireClient().createSpeechTranscriptionSession({}),
    readCapabilities: () => requireClient().readSpeechCapabilities(),
  };
}
