export type TranscriptionErrorCode =
  | "unsupported_model"
  | "missing_api_key"
  | "profile_not_found"
  | "session_not_found"
  | "invalid_request"
  | "audio_payload_too_large"
  | "provider_failure";

export class ProviderTranscriptionError extends Error {
  code: string | null;
  status: number | undefined;

  constructor({
    message,
    code,
    status,
  }: {
    message: string;
    code: string | null;
    status: number | undefined;
  }) {
    super(message);
    this.name = "ProviderTranscriptionError";
    this.code = code;
    this.status = status;
  }
}

export function isProviderTranscriptionUnsupportedModelError(
  value: unknown,
): boolean {
  if (!(value instanceof ProviderTranscriptionError)) {
    return false;
  }
  return value.code === "unsupported_model";
}
