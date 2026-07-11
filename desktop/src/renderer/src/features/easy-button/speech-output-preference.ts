export type SpeechOutputMode = "final" | "highlights_and_final" | "off";

const speechOutputModeStorageKey = "setta.easy-button.speech-output-mode.v1";

export function readSpeechOutputMode(storage: Pick<Storage, "getItem">): SpeechOutputMode {
  const value = storage.getItem(speechOutputModeStorageKey);
  return isSpeechOutputMode(value) ? value : "off";
}

export function writeSpeechOutputMode(
  storage: Pick<Storage, "setItem">,
  mode: SpeechOutputMode,
): void {
  storage.setItem(speechOutputModeStorageKey, mode);
}

function isSpeechOutputMode(value: string | null): value is SpeechOutputMode {
  return value === "off" || value === "final" || value === "highlights_and_final";
}
