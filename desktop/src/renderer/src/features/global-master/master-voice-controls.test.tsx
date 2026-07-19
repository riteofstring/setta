import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import type { AppShellSpeechCaptureContextValue } from "../global-speech/app-shell-speech-capture";
import type {
  AppShellSpeechCaptureController,
  AppShellSpeechCaptureSnapshot,
  SpeechCaptureState,
} from "../global-speech/app-shell-speech-capture-controller";
import {
  conversationSpeechCaptureRequest,
  masterSpeechCaptureRequest,
} from "../global-speech/speech-capture-destination";
import {
  createMasterVoiceModel,
  executeMasterVoiceCommand,
  MasterVoiceButton,
  MasterVoiceStatus,
} from "./master-voice-controls";

describe("master voice controls", () => {
  test("presents active master recording as a listening stop affordance", () => {
    const { context } = captureContext({
      captureSessionId: "capture-master",
      connection: "connecting",
      request: masterSpeechCaptureRequest(),
      transcript: "  route this from voice  ",
      type: "recording",
    });

    const model = createMasterVoiceModel(context, "linux", "ctrl_shift_k");

    expect(model).toMatchObject({
      action: "commit",
      controlLabel: "Finish Global master voice request (Ctrl+Shift+K)",
      state: "recording",
      statusLabel: "Listening for Setta",
      transcript: "route this from voice",
    });
    expect(renderToString(<MasterVoiceStatus model={model} />)).toContain(
      'data-master-voice-state="recording"',
    );
    const button = renderToString(<MasterVoiceButton model={model} />);
    expect(button).toContain('aria-label="Finish Global master voice request (Ctrl+Shift+K)"');
    expect(button).toContain("lucide-square");
    expect(button).not.toContain("lucide-check");
  });

  test("master voice shortcut finishes an active master recording", () => {
    const { commit, controller, startMasterCapture } = captureContext({
      captureSessionId: "capture-master",
      connection: "connecting",
      request: masterSpeechCaptureRequest(),
      transcript: "",
      type: "recording",
    });

    executeMasterVoiceCommand(controller);

    expect(commit).toHaveBeenCalledOnce();
    expect(startMasterCapture).not.toHaveBeenCalled();
  });

  test("master voice shortcut leaves in-flight master drain alone", () => {
    const { commit, controller, startMasterCapture } = captureContext({
      captureSessionId: "capture-master",
      connection: "connecting",
      request: masterSpeechCaptureRequest(),
      transcript: "already captured",
      type: "draining",
    });

    executeMasterVoiceCommand(controller);

    expect(commit).not.toHaveBeenCalled();
    expect(startMasterCapture).not.toHaveBeenCalled();
  });

  test("master voice shortcut still starts the existing master capture path from idle or topic capture", () => {
    const idle = captureContext({ type: "idle" });
    executeMasterVoiceCommand(idle.controller);
    expect(idle.startMasterCapture).toHaveBeenCalledOnce();

    const topic = captureContext({
      captureSessionId: "capture-topic",
      connection: "connecting",
      request: conversationSpeechCaptureRequest(
        "workspace-alpha",
        "conversation-alpha",
        "pane-alpha",
      ),
      transcript: "",
      type: "recording",
    });
    executeMasterVoiceCommand(topic.controller);
    expect(topic.startMasterCapture).toHaveBeenCalledOnce();
    expect(topic.commit).not.toHaveBeenCalled();
  });

  test("routes unavailable master voice setup when credentials are missing", () => {
    const openVoiceSettings = vi.fn();
    const { context, controller, startMasterCapture } = captureContext(
      { type: "idle" },
      {
        message: "OpenAI voice is not connected. Add an OpenAI API key in Settings -> Voices.",
        provider: "openai",
        setupAction: "open_voice_credential_settings",
        type: "not_configured",
      },
    );
    const model = createMasterVoiceModel(context, "linux", "ctrl_shift_k");

    expect(model).toMatchObject({
      action: "open_voice_credential_settings",
      controlLabel: "Open voice settings",
      state: "unavailable",
      statusLabel: "OpenAI voice is not connected. Add an OpenAI API key in Settings -> Voices.",
    });
    const button = renderToString(
      <MasterVoiceButton model={model} onOpenVoiceSettings={openVoiceSettings} />,
    );
    expect(button).toContain('aria-label="Open voice settings"');

    executeMasterVoiceCommand(controller, openVoiceSettings);
    expect(openVoiceSettings).toHaveBeenCalledWith("open_voice_credential_settings");
    expect(openVoiceSettings).toHaveBeenCalledOnce();
    expect(startMasterCapture).not.toHaveBeenCalled();
  });

  test("routes failed always-listening master voice state to voice settings", () => {
    const openVoiceSettings = vi.fn();
    const { context, controller, startMasterCapture } = captureContext(
      { type: "idle" },
      { type: "loading" },
      {
        listener: {
          availability: { status: "ready" },
          enabled: true,
          state: {
            message: "Always listening helper exited.",
            status: "engine_failed",
          },
        },
      },
    );
    const model = createMasterVoiceModel(context, "linux", "ctrl_shift_k");

    expect(model).toMatchObject({
      action: "open_always_listening_settings",
      controlLabel: "Open always listening settings",
      state: "failed",
      statusLabel: "Always listening helper exited.",
    });
    const button = renderToString(
      <MasterVoiceButton model={model} onOpenVoiceSettings={openVoiceSettings} />,
    );
    expect(button).toContain('aria-label="Open always listening settings"');

    executeMasterVoiceCommand(controller, openVoiceSettings);
    expect(openVoiceSettings).toHaveBeenCalledWith("open_always_listening_settings");
    expect(openVoiceSettings).toHaveBeenCalledOnce();
    expect(startMasterCapture).not.toHaveBeenCalled();
  });
});

function captureContext(
  capture: SpeechCaptureState,
  availability: AppShellSpeechCaptureSnapshot["availability"] = { type: "loading" },
  overrides: Partial<AppShellSpeechCaptureSnapshot> = {},
) {
  const snapshot = captureSnapshot(capture, availability, overrides);
  const commit = vi.fn();
  const startMasterCapture = vi.fn(async () => {});
  const controller = {
    commit,
    getSnapshot: () => snapshot,
    startMasterCapture,
  } as unknown as AppShellSpeechCaptureController;
  const context = { controller, snapshot } satisfies AppShellSpeechCaptureContextValue;
  return { commit, context, controller, startMasterCapture };
}

function captureSnapshot(
  capture: SpeechCaptureState,
  availability: AppShellSpeechCaptureSnapshot["availability"],
  overrides: Partial<AppShellSpeechCaptureSnapshot>,
): AppShellSpeechCaptureSnapshot {
  return {
    availability,
    capture,
    completedConversationTranscript: null,
    completedTranscript: null,
    conversationSubmission: { type: "idle" },
    listener: null,
    masterSubmission: { type: "idle" },
    runtimeId: "runtime-speech",
    ...overrides,
  };
}
