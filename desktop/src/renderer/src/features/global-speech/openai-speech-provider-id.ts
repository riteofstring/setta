import { decodeSpeechProvider, type SpeechProvider } from "@generated/backend";

export function openAISpeechProviderID(): SpeechProvider {
  return decodeSpeechProvider("openai", "OpenAI speech provider");
}
