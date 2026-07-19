import {
  requestLocalMacOSAlwaysListeningSettings,
  requestOpenAIVoiceConnectionSettings,
  requestVoiceProviderSelectionSettings,
} from "../stores/settings-navigation-store";
import type { VoiceProviderSetupAction } from "../features/global-speech/speech-capture-availability";

export function openVoiceSettings(action: VoiceProviderSetupAction): void {
  switch (action) {
    case "open_always_listening_settings":
      requestLocalMacOSAlwaysListeningSettings();
      return;
    case "open_voice_credential_settings":
      requestVoiceProviderSelectionSettings();
      return;
    default:
      return assertNever(action);
  }
}

export function openAIVoiceConnectionSettings(): void {
  requestOpenAIVoiceConnectionSettings();
}

function assertNever(value: never): never {
  throw new Error(`Unsupported voice settings action: ${JSON.stringify(value)}`);
}
