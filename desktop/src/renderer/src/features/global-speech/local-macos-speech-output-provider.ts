import type { SettaAPI } from "@shared/types";
import { localMacOSSpeechProviderID } from "@shared/speech-providers";

import type { VoiceOutputProvider } from "./voice-provider-boundary";

export function createLocalMacOSSpeechOutputProvider(
  setta: Pick<SettaAPI, "speech">,
): VoiceOutputProvider {
  const provider = localMacOSSpeechProviderID();
  return {
    id: provider,
    cancel: (operationId) => {
      if (!setta.speech.cancelSynthesis) {
        return Promise.reject(new Error("the desktop speech synthesis boundary is unavailable"));
      }
      return setta.speech.cancelSynthesis(operationId);
    },
    listVoices: async () => {
      if (!setta.speech.listLocalMacOSVoices) {
        return Promise.reject(new Error("the desktop local macOS voice catalog is unavailable"));
      }
      return setta.speech.listLocalMacOSVoices();
    },
    synthesize: (request, operationId) => {
      if (!setta.speech.synthesize) {
        return Promise.reject(new Error("the desktop speech synthesis boundary is unavailable"));
      }
      return setta.speech.synthesize({ ...request, provider }, operationId);
    },
  };
}
