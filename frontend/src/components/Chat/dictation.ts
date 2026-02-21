export type DictationState = "idle" | "listening" | "transcribing" | "error";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
const PROVIDER_RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/wav",
];

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const withSpeech = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  if (withSpeech.SpeechRecognition) {
    return withSpeech.SpeechRecognition;
  }
  if (withSpeech.webkitSpeechRecognition) {
    return withSpeech.webkitSpeechRecognition;
  }
  return null;
}

export function isDictationAvailable(hasEnvironmentSupport: boolean): boolean {
  return hasEnvironmentSupport;
}

export function insertTextAtSelection(
  value: string,
  insertText: string,
  selectionStart: number,
  selectionEnd: number,
): { value: string; nextCaret: number } {
  const prefix = value.slice(0, selectionStart);
  const suffix = value.slice(selectionEnd);
  const nextValue = `${prefix}${insertText}${suffix}`;
  return {
    value: nextValue,
    nextCaret: selectionStart + insertText.length,
  };
}

export function mapDictationError(errorCode: string | undefined): string {
  if (!errorCode) {
    return "Dictation failed.";
  }
  if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
    return "Microphone access was denied.";
  }
  if (errorCode === "audio-capture") {
    return "No microphone input was detected.";
  }
  if (errorCode === "network") {
    return "Dictation failed due to a network error.";
  }
  if (errorCode === "no-speech") {
    return "No speech was detected.";
  }
  return "Dictation failed.";
}

export function pickProviderRecorderMimeType(
  isTypeSupported: ((mimeType: string) => boolean) | undefined,
): string | null {
  if (!isTypeSupported) {
    return null;
  }
  for (const candidate of PROVIDER_RECORDER_MIME_CANDIDATES) {
    if (isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return null;
}
