import type { SettaAPI } from "@shared/types";

import { openAISpeechProviderID } from "./openai-speech-provider-id";
import type { VoiceOutputProvider } from "./voice-provider-boundary";

export function createOpenAIBackendSpeechOutputProvider(
  setta: Pick<SettaAPI, "speech">,
): VoiceOutputProvider {
  return {
    id: openAISpeechProviderID(),
    cancel: (operationId) => {
      if (!setta.speech.cancelSynthesis) {
        return Promise.reject(new Error("the desktop speech synthesis boundary is unavailable"));
      }
      return setta.speech.cancelSynthesis(operationId);
    },
    listVoices: async () => {
      const capabilities = await setta.speech.readCapabilities();
      return capabilities.voiceCatalog;
    },
    synthesize: (request, operationId) => {
      if (!setta.speech.synthesize) {
        return Promise.reject(new Error("the desktop speech synthesis boundary is unavailable"));
      }
      return setta.speech.synthesize(
        { ...request, provider: openAISpeechProviderID() },
        operationId,
      );
    },
  };
}
