export const PluginFrontendErrorCodeEnum = {
  RegistrationInvalid: "PLUGIN_FRONTEND_REGISTRATION_INVALID",
  ApiVersionMismatch: "PLUGIN_FRONTEND_API_VERSION_MISMATCH",
  CapabilityDenied: "PLUGIN_CAPABILITY_DENIED",
  FrontendLoadFailed: "PLUGIN_FRONTEND_LOAD_FAILED",
} as const;

export type PluginFrontendErrorCode =
  (typeof PluginFrontendErrorCodeEnum)[keyof typeof PluginFrontendErrorCodeEnum];

export class PluginRuntimeError extends Error {
  code: PluginFrontendErrorCode;

  constructor(code: PluginFrontendErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function requireNonEmptyString(
  value: unknown,
  errorMessage: string,
): string {
  if (typeof value !== "string") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      errorMessage,
    );
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      errorMessage,
    );
  }
  return trimmed;
}

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
}

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  return typeof (value as PromiseLike<unknown>).then === "function";
}
