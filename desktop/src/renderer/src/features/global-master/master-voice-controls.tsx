import type { AppearanceMasterVoiceShortcut } from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";
import { CircleAlert, LoaderCircle, Mic, RotateCcw, Square } from "lucide-react";

import type { AppShellSpeechCaptureContextValue } from "../global-speech/app-shell-speech-capture";
import type {
  AppShellSpeechCaptureController,
  AppShellSpeechCaptureSnapshot,
  SpeechCaptureState,
} from "../global-speech/app-shell-speech-capture-controller";
import { voiceProviderSetupActionLabel } from "../global-speech/speech-capture-availability";
import { masterVoiceShortcutLabel } from "./master-shortcuts";

type MasterVoiceAction =
  | "cancel"
  | "commit"
  | "open_voice_credential_settings"
  | "retry_master"
  | "start";

interface MasterVoiceModel {
  action: MasterVoiceAction | null;
  controlLabel: string;
  controller: AppShellSpeechCaptureController | null;
  state:
    | "committing"
    | "draining"
    | "failed"
    | "idle"
    | "requesting_permission"
    | "submitting"
    | "unavailable"
    | "recording";
  statusLabel: string | null;
  transcript: string | null;
}

type ActiveSpeechCaptureState = Extract<
  SpeechCaptureState,
  { type: "committing" | "draining" | "recording" | "requesting_permission" }
>;

type MasterSubmissionState = AppShellSpeechCaptureSnapshot["masterSubmission"];
type SpeechCaptureAvailability = AppShellSpeechCaptureSnapshot["availability"];

const activeCaptureTypes = new Set<SpeechCaptureState["type"]>([
  "committing",
  "draining",
  "recording",
  "requesting_permission",
]);

export function createMasterVoiceModel(
  context: AppShellSpeechCaptureContextValue | null,
  platform: DesktopPlatform,
  shortcut: AppearanceMasterVoiceShortcut,
): MasterVoiceModel {
  const shortcutLabel = masterVoiceShortcutLabel(platform, shortcut);
  if (!context) {
    return unavailableMasterVoiceModel(null, "Global master voice is unavailable", null);
  }
  const { controller, snapshot } = context;
  const activeMaster = activeMasterCapture(snapshot.capture);
  if (activeMaster) {
    return activeMasterVoiceModel(controller, activeMaster, shortcutLabel);
  }
  return inactiveMasterVoiceModel(controller, snapshot, shortcutLabel);
}

export function MasterVoiceStatus({ model }: { model: MasterVoiceModel }) {
  if (!model.statusLabel && !model.transcript) {
    return null;
  }
  return (
    <div
      className="setta-master-pane-voice-status"
      data-master-voice-state={model.state}
      data-testid="master-pane-voice-status"
      role={model.state === "failed" ? "alert" : "status"}
    >
      <MasterVoiceStatusGlyph state={model.state} />
      <span className="setta-master-pane-voice-status-text">
        {model.statusLabel}
        {model.transcript ? (
          <span className="setta-master-overlay-voice-transcript">"{model.transcript}"</span>
        ) : null}
      </span>
    </div>
  );
}

export function MasterVoiceButton({
  className = "setta-master-overlay-voice-button",
  model,
  onOpenVoiceCredentialSettings,
  testId = "master-pane-voice-capture",
}: {
  className?: string;
  model: MasterVoiceModel;
  onOpenVoiceCredentialSettings?: () => void;
  testId?: string;
}) {
  const disabled =
    model.action === null ||
    (model.action === "open_voice_credential_settings" && !onOpenVoiceCredentialSettings);
  return (
    <button
      aria-label={model.controlLabel}
      className={className}
      data-master-voice-state={model.state}
      data-testid={testId}
      disabled={disabled}
      onClick={() => executeMasterVoiceAction(model, onOpenVoiceCredentialSettings)}
      title={model.controlLabel}
      type="button"
    >
      <MasterVoiceButtonGlyph model={model} />
    </button>
  );
}

export function executeMasterVoiceCommand(
  controller: AppShellSpeechCaptureController | null,
  onOpenVoiceCredentialSettings?: () => void,
): void {
  if (!controller) {
    return;
  }
  const snapshot = controller.getSnapshot();
  const activeMaster = activeMasterCapture(snapshot.capture);
  if (activeMaster?.type === "recording") {
    controller.commit();
    return;
  }
  if (activeMaster) {
    return;
  }
  if (snapshot.availability.type === "not_configured") {
    onOpenVoiceCredentialSettings?.();
    return;
  }
  void controller.startMasterCapture();
}

export function cancelMasterCaptureIfActive(
  controller: AppShellSpeechCaptureController | null,
): boolean {
  if (!controller || activeMasterCapture(controller.getSnapshot().capture) === null) {
    return false;
  }
  controller.cancel();
  return true;
}

function inactiveMasterVoiceModel(
  controller: AppShellSpeechCaptureController,
  snapshot: AppShellSpeechCaptureSnapshot,
  shortcutLabel: string,
): MasterVoiceModel {
  const submissionModel = masterSubmissionVoiceModel(controller, snapshot.masterSubmission);
  if (submissionModel) {
    return submissionModel;
  }
  const failedCaptureModel = failedCaptureVoiceModel(controller, snapshot.capture, shortcutLabel);
  return (
    failedCaptureModel ?? availabilityVoiceModel(controller, snapshot.availability, shortcutLabel)
  );
}

function masterSubmissionVoiceModel(
  controller: AppShellSpeechCaptureController,
  submission: MasterSubmissionState,
): MasterVoiceModel | null {
  switch (submission.type) {
    case "submitting":
      return {
        action: null,
        controlLabel: "Sending Global master voice request",
        controller,
        state: "submitting",
        statusLabel: "Sending voice request to Setta",
        transcript: null,
      };
    case "failed":
      return {
        action: "retry_master",
        controlLabel: "Retry Global master voice request",
        controller,
        state: "failed",
        statusLabel: submission.message,
        transcript: null,
      };
    case "accepted":
    case "idle":
      return null;
    default:
      return assertNever(submission);
  }
}

function failedCaptureVoiceModel(
  controller: AppShellSpeechCaptureController,
  capture: SpeechCaptureState,
  shortcutLabel: string,
): MasterVoiceModel | null {
  if (capture.type !== "failed") {
    return null;
  }
  return {
    action: "start",
    controlLabel: `Retry Global master voice capture (${shortcutLabel})`,
    controller,
    state: "failed",
    statusLabel: capture.message,
    transcript: null,
  };
}

function availabilityVoiceModel(
  controller: AppShellSpeechCaptureController,
  availability: SpeechCaptureAvailability,
  shortcutLabel: string,
): MasterVoiceModel {
  switch (availability.type) {
    case "configured":
      return {
        action: "start",
        controlLabel: `Start Global master voice (${shortcutLabel})`,
        controller,
        state: "idle",
        statusLabel: null,
        transcript: null,
      };
    case "disconnected":
      return unavailableMasterVoiceModel(controller, "Connect a Setta runtime to use voice", null);
    case "loading":
      return unavailableMasterVoiceModel(controller, "Voice capture is loading", null);
    case "failed":
    case "unsupported":
      return unavailableMasterVoiceModel(controller, availability.message, null);
    case "not_configured":
      return {
        action: "open_voice_credential_settings",
        controlLabel: voiceProviderSetupActionLabel(availability.setupAction),
        controller,
        state: "unavailable",
        statusLabel: availability.message,
        transcript: null,
      };
    default:
      return assertNever(availability);
  }
}

function activeMasterVoiceModel(
  controller: AppShellSpeechCaptureController,
  capture: ActiveSpeechCaptureState,
  shortcutLabel: string,
): MasterVoiceModel {
  const transcript = capture.transcript.trim() === "" ? null : capture.transcript.trim();
  switch (capture.type) {
    case "requesting_permission":
      return {
        action: "cancel",
        controlLabel: "Cancel Global master voice capture",
        controller,
        state: capture.type,
        statusLabel: "Requesting microphone access for Setta",
        transcript,
      };
    case "recording":
      return {
        action: "commit",
        controlLabel: `Finish Global master voice request (${shortcutLabel})`,
        controller,
        state: capture.type,
        statusLabel: "Listening for Setta",
        transcript,
      };
    case "draining":
      return {
        action: null,
        controlLabel: "Finishing captured Global master audio",
        controller,
        state: capture.type,
        statusLabel: "Finishing captured audio for Setta",
        transcript,
      };
    case "committing":
      return {
        action: null,
        controlLabel: "Finishing Global master voice request",
        controller,
        state: capture.type,
        statusLabel: "Finishing voice request for Setta",
        transcript,
      };
    default:
      return assertNever(capture);
  }
}

function unavailableMasterVoiceModel(
  controller: AppShellSpeechCaptureController | null,
  controlLabel: string,
  statusLabel: string | null,
): MasterVoiceModel {
  return {
    action: null,
    controlLabel,
    controller,
    state: "unavailable",
    statusLabel,
    transcript: null,
  };
}

function activeMasterCapture(capture: SpeechCaptureState): ActiveSpeechCaptureState | null {
  if (!isActiveSpeechCapture(capture)) {
    return null;
  }
  return capture.request.destination.type === "master" ? capture : null;
}

function isActiveSpeechCapture(capture: SpeechCaptureState): capture is ActiveSpeechCaptureState {
  return activeCaptureTypes.has(capture.type);
}

function executeMasterVoiceAction(
  model: MasterVoiceModel,
  onOpenVoiceCredentialSettings: (() => void) | undefined,
): void {
  if (!model.controller || model.action === null) {
    return;
  }
  switch (model.action) {
    case "cancel":
      model.controller.cancel();
      return;
    case "commit":
      model.controller.commit();
      return;
    case "open_voice_credential_settings":
      onOpenVoiceCredentialSettings?.();
      return;
    case "retry_master":
      model.controller.retryMasterSubmission();
      return;
    case "start":
      void model.controller.startMasterCapture();
      return;
    default:
      assertNever(model.action);
  }
}

function MasterVoiceStatusGlyph({ state }: { state: MasterVoiceModel["state"] }) {
  switch (state) {
    case "requesting_permission":
    case "draining":
    case "committing":
    case "submitting":
      return <LoaderCircle aria-hidden="true" className="setta-master-overlay-spinner" />;
    case "failed":
      return <CircleAlert aria-hidden="true" />;
    case "recording":
    case "idle":
    case "unavailable":
      return <Mic aria-hidden="true" />;
    default:
      return assertNever(state);
  }
}

function MasterVoiceButtonGlyph({ model }: { model: MasterVoiceModel }) {
  switch (model.action) {
    case "cancel":
      return <Square aria-hidden="true" />;
    case "commit":
      return <Square aria-hidden="true" />;
    case "open_voice_credential_settings":
      return <Mic aria-hidden="true" />;
    case "retry_master":
      return <RotateCcw aria-hidden="true" />;
    case "start":
      return <Mic aria-hidden="true" />;
    case null:
      return inactiveMasterVoiceButtonGlyph(model.state);
    default:
      return assertNever(model.action);
  }
}

function inactiveMasterVoiceButtonGlyph(state: MasterVoiceModel["state"]) {
  switch (state) {
    case "failed":
      return <CircleAlert aria-hidden="true" />;
    case "unavailable":
      return <Mic aria-hidden="true" />;
    default:
      return <LoaderCircle aria-hidden="true" className="setta-master-overlay-spinner" />;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported master voice value: ${JSON.stringify(value)}`);
}
