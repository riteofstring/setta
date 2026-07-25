import type { SettaAPI } from "@shared/types";

import { createBufferedMicrophoneCapture } from "./buffered-microphone-capture";
import { createDesktopVoiceInputProvider } from "./desktop-speech-provider-coordinator";
import { createLocalMacOSSpeechCaptureProvider } from "./local-macos-speech-capture-provider";
import { createOpenAIBrowserSpeechCaptureProvider } from "./openai-speech-capture-provider";
import { openAISpeechProviderID } from "./openai-speech-provider-id";
import { createRealtimeTranscriptionTransport } from "./realtime-transcription-transport";
import type { VoiceInputProvider } from "./voice-provider-boundary";

export function createBrowserVoiceInputProvider(setta: SettaAPI): VoiceInputProvider {
  const openAIProvider = createOpenAIBrowserSpeechCaptureProvider({
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
  const localMacOSProvider = createLocalMacOSSpeechCaptureProvider({
    cancelCapture: (request) =>
      setta.speech.cancelLocalMacOSVoiceCapture?.(request) ??
      Promise.reject(new Error("the desktop local macOS voice capture boundary is unavailable")),
    finishCapture: (request) =>
      setta.speech.finishLocalMacOSVoiceCapture?.(request) ??
      Promise.reject(new Error("the desktop local macOS voice capture boundary is unavailable")),
    readCapabilities: () => setta.speech.readCapabilities(),
    readHealth: () =>
      setta.speech.readLocalMacOSVoiceHealth?.() ??
      Promise.reject(new Error("the desktop local macOS voice health boundary is unavailable")),
    listVoices: () =>
      setta.speech.listLocalMacOSVoices?.() ??
      Promise.reject(new Error("the desktop local macOS voice catalog boundary is unavailable")),
    startCapture: (request) =>
      setta.speech.startLocalMacOSVoiceCapture?.(request) ??
      Promise.reject(new Error("the desktop local macOS voice capture boundary is unavailable")),
  });
  return createDesktopVoiceInputProvider({
    localMacOS: localMacOSProvider,
    openAI: openAIProvider,
    platform: setta.app.platform,
    readLocalMacOSVoiceHealth: setta.speech.readLocalMacOSVoiceHealth,
    readProviderSelection: setta.speech.readProviderSelection,
  });
}
