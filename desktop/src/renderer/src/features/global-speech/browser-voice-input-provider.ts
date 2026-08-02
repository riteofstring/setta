import type { SettaAPI } from "@shared/types";

import { createBufferedMicrophoneCapture } from "./buffered-microphone-capture";
import { createOpenAIBrowserSpeechCaptureProvider } from "./openai-speech-capture-provider";
import { openAISpeechProviderID } from "./openai-speech-provider-id";
import { createRealtimeTranscriptionTransport } from "./realtime-transcription-transport";
import type { VoiceInputProvider } from "./voice-provider-boundary";

export function createBrowserVoiceInputProvider(setta: SettaAPI): VoiceInputProvider {
  return createOpenAIBrowserSpeechCaptureProvider({
    createBufferedCapture: createBufferedMicrophoneCapture,
    createTranscriptionSession: () =>
      setta.speech.createTranscriptionSession({ provider: openAISpeechProviderID() }),
    createTransport: createRealtimeTranscriptionTransport,
    deferProviderConnection: (handler) => {
      globalThis.requestAnimationFrame(() => {
        globalThis.setTimeout(handler, 0);
      });
    },
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    readCapabilities: () => setta.speech.readCapabilities(),
  });
}
