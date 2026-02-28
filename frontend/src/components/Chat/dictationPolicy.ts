import { ProviderTranscriptionError } from "utils/transcriptionErrors";

type DictationMode = "auto" | "browser" | "provider";
export type DictationProviderFailurePhase =
  | "capture_start"
  | "capture_runtime"
  | "transcription";
export type DictationProviderFailureClass =
  | "unsupported_model"
  | "missing_api_key"
  | "profile_not_found"
  | "session_not_found"
  | "invalid_request"
  | "audio_payload_too_large"
  | "provider_failure"
  | "unknown";

type DictationSource = "provider" | "browser";
type ProviderFailureDecision = "fallback_to_browser" | "surface_error";
type DictationProviderFailurePolicy = Record<
  DictationProviderFailurePhase,
  Record<DictationProviderFailureClass, ProviderFailureDecision>
>;

const DICTATION_SOURCE_CHAIN_BY_MODE: Record<DictationMode, DictationSource[]> =
  {
    auto: ["provider", "browser"],
    browser: ["browser"],
    provider: ["provider"],
  };

const ALL_PROVIDER_FAILURE_CLASSES: Array<DictationProviderFailureClass> = [
  "unsupported_model",
  "missing_api_key",
  "profile_not_found",
  "session_not_found",
  "invalid_request",
  "audio_payload_too_large",
  "provider_failure",
  "unknown",
];

const PROVIDER_FAILURE_PHASES: Array<DictationProviderFailurePhase> = [
  "capture_start",
  "capture_runtime",
  "transcription",
];

function buildProviderFailurePolicy(
  decision: ProviderFailureDecision,
): DictationProviderFailurePolicy {
  const byClass = Object.fromEntries(
    ALL_PROVIDER_FAILURE_CLASSES.map((failureClass) => [
      failureClass,
      decision,
    ]),
  ) as Record<DictationProviderFailureClass, ProviderFailureDecision>;
  return Object.fromEntries(
    PROVIDER_FAILURE_PHASES.map((phase) => [phase, { ...byClass }]),
  ) as DictationProviderFailurePolicy;
}

const DICTATION_PROVIDER_FAILURE_POLICY: Record<
  DictationMode,
  DictationProviderFailurePolicy
> = {
  auto: buildProviderFailurePolicy("fallback_to_browser"),
  browser: buildProviderFailurePolicy("surface_error"),
  provider: buildProviderFailurePolicy("surface_error"),
};

function formatDictationSource(source: DictationSource): string {
  if (source === "provider") {
    return "provider";
  }
  return "browser/OS";
}

export function getProjectDictationModeOptionLabel({
  mode,
  providerModeAvailable,
}: {
  mode: DictationMode;
  providerModeAvailable: boolean;
}): string {
  if (mode === "auto") {
    const chain = DICTATION_SOURCE_CHAIN_BY_MODE.auto
      .map((source) => formatDictationSource(source))
      .join(", then ");
    return `Auto (${chain})`;
  }
  if (mode === "provider") {
    return providerModeAvailable
      ? "Always provider"
      : "Always provider (requires transcription profile)";
  }
  return "Always browser / OS";
}

export function classifyProviderDictationFailureClass(
  value: unknown,
): DictationProviderFailureClass {
  if (!(value instanceof ProviderTranscriptionError)) {
    return "unknown";
  }
  if (
    value.code === "unsupported_model" ||
    value.code === "missing_api_key" ||
    value.code === "profile_not_found" ||
    value.code === "session_not_found" ||
    value.code === "invalid_request" ||
    value.code === "audio_payload_too_large" ||
    value.code === "provider_failure"
  ) {
    return value.code;
  }
  return "unknown";
}

export function shouldFallbackToBrowserAfterProviderFailure({
  mode,
  phase,
  failureClass,
}: {
  mode: DictationMode;
  phase: DictationProviderFailurePhase;
  failureClass: DictationProviderFailureClass;
}): boolean {
  const sourceChain = DICTATION_SOURCE_CHAIN_BY_MODE[mode];
  if (!sourceChain.includes("browser")) {
    return false;
  }
  const decision = DICTATION_PROVIDER_FAILURE_POLICY[mode][phase][failureClass];
  return decision === "fallback_to_browser";
}
