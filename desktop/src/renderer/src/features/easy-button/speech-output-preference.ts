import { useSyncExternalStore } from "react";

export type SpeechOutputMode = "final" | "highlights_and_final" | "off";

const speechOutputModeStorageKey = "setta.easy-button.speech-output-mode.v1";
const speechOutputModeChangedEvent = "setta:easy-button-speech-output-mode-changed";

export function useSpeechOutputMode(): [SpeechOutputMode, (mode: SpeechOutputMode) => void] {
  const mode = useSyncExternalStore(
    subscribeToSpeechOutputMode,
    currentSpeechOutputMode,
    (): SpeechOutputMode => "off",
  );
  return [mode, setSpeechOutputMode];
}

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

function currentSpeechOutputMode(): SpeechOutputMode {
  return readSpeechOutputMode(window.localStorage);
}

function setSpeechOutputMode(mode: SpeechOutputMode): void {
  writeSpeechOutputMode(window.localStorage, mode);
  window.dispatchEvent(new Event(speechOutputModeChangedEvent));
}

function subscribeToSpeechOutputMode(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === speechOutputModeStorageKey) {
      onStoreChange();
    }
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(speechOutputModeChangedEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(speechOutputModeChangedEvent, onStoreChange);
  };
}

function isSpeechOutputMode(value: string | null): value is SpeechOutputMode {
  return value === "off" || value === "final" || value === "highlights_and_final";
}
