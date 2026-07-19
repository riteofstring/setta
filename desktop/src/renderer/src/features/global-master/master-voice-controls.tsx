import type { AppearanceMasterVoiceShortcut } from "@generated/backend";
import type { LocalMacOSVoiceListenerSettings } from "@shared/speech-ipc";
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
    | "listener_armed"
    | "listener_arming"
    | "listener_paused"
    | "requesting_permission"
    | "submitting"
    | "unavailable"
    | "wake_detected"
    | "wake_finalizing"
    | "wake_recording"
    | "recording";
  statusLabel: string | null;
  transcript: string | null;
}

type ActiveSpeechCaptureState = Extract<
  SpeechCaptureState,
  { type: "committing" | "draining" | "recording" | "requesting_permission" }
>;

type ListenerState = LocalMacOSVoiceListenerSettings["state"];
type ListenerStatus = ListenerState["status"];
type ListenerVoiceModelFactory = (
  controller: AppShellSpeechCaptureController,
  state: ListenerState,
  shortcutLabel: string,
) => MasterVoiceModel | null;

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
      className="setta-master-overlay-voice-status"
      data-master-voice-state={model.state}
      data-testid="master-overlay-voice-status"
      role={model.state === "failed" ? "alert" : "status"}
    >
      <MasterVoiceStatusGlyph state={model.state} />
      <span className="setta-master-overlay-voice-status-text">
        {model.statusLabel}
        {model.transcript ? (
          <span className="setta-master-overlay-voice-transcript">"{model.transcript}"</span>
        ) : null}
      </span>
    </div>
  );
}

export function MasterVoiceButton({
  model,
  onOpenVoiceCredentialSettings,
}: {
  model: MasterVoiceModel;
  onOpenVoiceCredentialSettings?: () => void;
}) {
  const disabled =
    model.action === null ||
    (model.action === "open_voice_credential_settings" && !onOpenVoiceCredentialSettings);
  return (
    <button
      aria-label={model.controlLabel}
      className="setta-master-overlay-voice-button"
      data-testid="master-overlay-voice-capture"
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
  if (listenerBlocksManualCapture(snapshot.listener)) {
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
    failedCaptureModel ??
    listenerVoiceModel(controller, snapshot.listener, shortcutLabel) ??
    availabilityVoiceModel(controller, snapshot.availability, shortcutLabel)
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

function listenerVoiceModel(
  controller: AppShellSpeechCaptureController,
  listener: LocalMacOSVoiceListenerSettings | null,
  shortcutLabel: string,
): MasterVoiceModel | null {
  if (!listener?.enabled) {
    return null;
  }
  return listenerVoiceModelFactories[listener.state.status](
    controller,
    listener.state,
    shortcutLabel,
  );
}

const listenerVoiceModelFactories = {
  armed: (controller, _state, shortcutLabel) => ({
    action: "start",
    controlLabel: `Start Global master voice (${shortcutLabel})`,
    controller,
    state: "listener_armed",
    statusLabel: "Always listening armed",
    transcript: null,
  }),
  arming: (controller) =>
    listenerMasterVoiceModel(
      controller,
      "listener_arming",
      "Starting always listening",
      "Starting always listening",
    ),
  candidate_end: (controller) =>
    listenerMasterVoiceModel(
      controller,
      "wake_recording",
      "Recording wake request",
      "Listening after wake",
    ),
  capturing: (controller) =>
    listenerMasterVoiceModel(
      controller,
      "wake_recording",
      "Recording wake request",
      "Listening after wake",
    ),
  disabled: () => null,
  engine_failed: listenerFailureVoiceModel,
  finalizing: (controller) =>
    listenerMasterVoiceModel(
      controller,
      "wake_finalizing",
      "Finalizing wake request",
      "Finalizing wake request",
    ),
  local_voice_not_ready: listenerFailureVoiceModel,
  microphone_denied: listenerFailureVoiceModel,
  paused_for_manual_capture: (controller) =>
    listenerMasterVoiceModel(
      controller,
      "listener_paused",
      "Always listening is paused",
      "Always listening paused",
    ),
  paused_for_playback: (controller) =>
    listenerMasterVoiceModel(
      controller,
      "listener_paused",
      "Always listening is paused",
      "Always listening paused",
    ),
  submitting: (controller) => ({
    action: null,
    controlLabel: "Sending Global master voice request",
    controller,
    state: "submitting",
    statusLabel: "Sending voice request to Setta",
    transcript: null,
  }),
  waiting_for_message_speech: (controller) =>
    listenerMasterVoiceModel(
      controller,
      "wake_detected",
      "Wake phrase detected",
      "Wake phrase detected",
    ),
  wake_detected: (controller) =>
    listenerMasterVoiceModel(
      controller,
      "wake_detected",
      "Wake phrase detected",
      "Wake phrase detected",
    ),
} satisfies Record<ListenerStatus, ListenerVoiceModelFactory>;

function listenerFailureVoiceModel(
  controller: AppShellSpeechCaptureController,
  state: ListenerState,
  shortcutLabel: string,
): MasterVoiceModel {
  return {
    action: "start",
    controlLabel: `Retry Global master voice capture (${shortcutLabel})`,
    controller,
    state: "failed",
    statusLabel: "message" in state ? state.message : "Always listening failed.",
    transcript: null,
  };
}

function listenerMasterVoiceModel(
  controller: AppShellSpeechCaptureController,
  state: Extract<
    MasterVoiceModel["state"],
    "listener_arming" | "listener_paused" | "wake_detected" | "wake_finalizing" | "wake_recording"
  >,
  controlLabel: string,
  statusLabel: string,
): MasterVoiceModel {
  return {
    action: null,
    controlLabel,
    controller,
    state,
    statusLabel,
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

function listenerBlocksManualCapture(listener: LocalMacOSVoiceListenerSettings | null): boolean {
  return listener?.enabled ? listenerManualCaptureBlocked[listener.state.status] : false;
}

const listenerManualCaptureBlocked = {
  armed: false,
  arming: false,
  candidate_end: true,
  capturing: true,
  disabled: false,
  engine_failed: false,
  finalizing: true,
  local_voice_not_ready: false,
  microphone_denied: false,
  paused_for_manual_capture: false,
  paused_for_playback: false,
  submitting: true,
  waiting_for_message_speech: true,
  wake_detected: true,
} satisfies Record<ListenerStatus, boolean>;

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
  const glyph = masterVoiceStatusGlyphs[state];
  if (glyph === "spinner") {
    return <LoaderCircle aria-hidden="true" className="setta-master-overlay-spinner" />;
  }
  return glyph === "alert" ? <CircleAlert aria-hidden="true" /> : <Mic aria-hidden="true" />;
}

const masterVoiceStatusGlyphs = {
  committing: "spinner",
  draining: "spinner",
  failed: "alert",
  idle: "mic",
  listener_armed: "mic",
  listener_arming: "spinner",
  listener_paused: "mic",
  recording: "mic",
  requesting_permission: "spinner",
  submitting: "spinner",
  unavailable: "mic",
  wake_detected: "mic",
  wake_finalizing: "spinner",
  wake_recording: "mic",
} satisfies Record<MasterVoiceModel["state"], "alert" | "mic" | "spinner">;

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
    case "listener_armed":
    case "unavailable":
      return <Mic aria-hidden="true" />;
    default:
      return <LoaderCircle aria-hidden="true" className="setta-master-overlay-spinner" />;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported master voice value: ${JSON.stringify(value)}`);
}
