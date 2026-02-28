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
