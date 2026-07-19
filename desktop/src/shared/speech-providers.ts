import { decodeSpeechProvider, type SpeechProvider } from "@generated/backend";

export function openAISpeechProviderID(): SpeechProvider {
  return decodeSpeechProvider("openai", "OpenAI speech provider");
}

export function localMacOSSpeechProviderID(): SpeechProvider {
  return decodeSpeechProvider("local_macos", "local macOS speech provider");
}
