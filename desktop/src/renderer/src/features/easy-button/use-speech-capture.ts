import type { SpeechCapabilities } from "@generated/backend";

import {
  browserSpeechCaptureSupport,
  type SpeechCaptureContext,
  type SpeechCaptureFailureCode,
} from "./speech-capture-controller";

export type SpeechCaptureAvailability =
  | { type: "loading" }
  | { capabilities: SpeechCapabilities; type: "configured" }
  | { message: string; type: "not_configured" }
  | {
      capabilities: SpeechCapabilities;
      code: Extract<SpeechCaptureFailureCode, "insecure_context" | "unsupported_browser">;
      message: string;
      type: "unsupported";
    }
  | { message: string; type: "failed" };

export function sameCaptureContext(
  captureContext: SpeechCaptureContext,
  currentContext: SpeechCaptureContext | null,
): boolean {
  return (
    currentContext !== null &&
    captureContext.runtimeId === currentContext.runtimeId &&
    captureContext.workspaceId === currentContext.workspaceId
  );
}

export function speechAvailabilityForCapabilities(
  capabilities: SpeechCapabilities,
  support = browserSpeechCaptureSupport(),
): SpeechCaptureAvailability {
  if (!support.supported) {
    return { ...support, capabilities, type: "unsupported" };
  }
  if (capabilities.providerStatus === "not_configured") {
    return {
      message: "Voice needs OPENAI_API_KEY on the runtime. Typed requests still work.",
      type: "not_configured",
    };
  }
  return { capabilities, type: "configured" };
}
