import type { BackendClient } from "@generated/backend";
import type { SettaAPI } from "@shared/types";

export function createSpeechWebAPI(requireClient: () => BackendClient): SettaAPI["speech"] {
  return {
    createTranscriptionSession: () => requireClient().createSpeechTranscriptionSession({}),
    readCredentialSettings: async () => ({
      message: "Secure storage for speech credentials is available only in Setta Desktop.",
      status: "secure_storage_unavailable",
    }),
    readCapabilities: () => requireClient().readSpeechCapabilities(),
  };
}
