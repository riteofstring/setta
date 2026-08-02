/**
 * The one durable fact of the mute toggle: whether the user turned the
 * Director's voice off. It is a renderer preference — it changes what this
 * window does with audio it already received, not what the backend produces —
 * so it lives in the renderer's own storage rather than behind an IPC channel.
 */

const speechPlaybackMuteStorageKey = "setta.speech-playback.muted";

type MutePreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function readSpeechPlaybackMutePreference(
  storage: MutePreferenceStorage | null | undefined,
): boolean {
  return storage?.getItem(speechPlaybackMuteStorageKey) === "true";
}

export function writeSpeechPlaybackMutePreference(
  storage: MutePreferenceStorage | null | undefined,
  muted: boolean,
): void {
  storage?.setItem(speechPlaybackMuteStorageKey, muted ? "true" : "false");
}
