import { decodeSpeechProvider, type SpeechProvider } from "@generated/backend";
import type { DesktopPlatform } from "./types";

export function openAISpeechProviderID(): SpeechProvider {
  return decodeSpeechProvider("openai", "OpenAI speech provider");
}

export function localMacOSSpeechProviderID(): SpeechProvider {
  return decodeSpeechProvider("local_macos", "local macOS speech provider");
}

export function defaultDesktopSpeechProviderID(platform: DesktopPlatform): SpeechProvider {
  return platform === "darwin" ? localMacOSSpeechProviderID() : openAISpeechProviderID();
}

export function supportedDesktopSpeechProviderIDs(platform: DesktopPlatform): SpeechProvider[] {
  return platform === "darwin"
    ? [localMacOSSpeechProviderID(), openAISpeechProviderID()]
    : [openAISpeechProviderID()];
}
