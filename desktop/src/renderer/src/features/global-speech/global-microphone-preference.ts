interface GlobalMicrophonePreferenceReady {
  enabled: boolean;
  type: "ready";
}

interface GlobalMicrophonePreferenceFailed {
  message: string;
  type: "failed";
}

export type GlobalMicrophonePreference =
  | GlobalMicrophonePreferenceReady
  | GlobalMicrophonePreferenceFailed;

export interface GlobalMicrophonePreferenceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const globalMicrophonePreferenceStorageKey = "setta.global-speech.microphone-enabled.v1";

export function readGlobalMicrophonePreference(
  storage: Pick<GlobalMicrophonePreferenceStorage, "getItem">,
): GlobalMicrophonePreference {
  let value: string | null;
  try {
    value = storage.getItem(globalMicrophonePreferenceStorageKey);
  } catch {
    return preferenceFailure("The global microphone preference could not be read.");
  }
  switch (value) {
    case null:
    case "disabled":
      return { enabled: false, type: "ready" };
    case "enabled":
      return { enabled: true, type: "ready" };
    default:
      return preferenceFailure("The stored global microphone preference is invalid.");
  }
}

export function writeGlobalMicrophonePreference(
  storage: Pick<GlobalMicrophonePreferenceStorage, "setItem">,
  enabled: boolean,
): GlobalMicrophonePreference {
  try {
    storage.setItem(globalMicrophonePreferenceStorageKey, enabled ? "enabled" : "disabled");
  } catch {
    return preferenceFailure("The global microphone preference could not be saved.");
  }
  return { enabled, type: "ready" };
}

function preferenceFailure(message: string): GlobalMicrophonePreferenceFailed {
  return { message, type: "failed" };
}
