import {
  requestOpenAIVoiceConnectionSettings,
  requestVoiceProviderSelectionSettings,
} from "../stores/settings-navigation-store";

export function openAIVoiceConnectionSettings(): void {
  requestOpenAIVoiceConnectionSettings();
}

export function openVoiceProviderSelectionSettings(): void {
  requestVoiceProviderSelectionSettings();
}
