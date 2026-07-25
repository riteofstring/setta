import { describe, expect, test, vi } from "vitest";

import type { EasyButtonConversationCommands } from "./easy-button-conversation-commands";
import { conversationControlAction } from "./easy-button-conversation-control";

describe("Easy Button conversation voice control", () => {
  test("keeps the giant control the voice/talk affordance whenever it is not listening", () => {
    const requestVoiceCapture = vi.fn();
    const commands: EasyButtonConversationCommands = {
      ...archivedConversationCommands(),
      requestVoiceCapture,
      routingFailure: null,
      workspaceCommandsAvailable: true,
    };

    const action = conversationControlAction(commands, false, null);

    expect(action.mode).toBe("talk");
    expect(action.disabled).toBe(false);
    expect(action.label).toBe("Start a voice request for this conversation");
    action.onClick?.();
    expect(requestVoiceCapture).toHaveBeenCalledOnce();
  });

  test("keeps the giant voice control enabled for folderless input-ready panes", () => {
    const requestVoiceCapture = vi.fn();
    const commands: EasyButtonConversationCommands = {
      ...archivedConversationCommands(),
      inputAvailable: true,
      requestVoiceCapture,
      routingFailure: null,
      workspaceCommandsAvailable: false,
    };

    const action = conversationControlAction(commands, false, null);

    expect(action.mode).toBe("talk");
    expect(action.disabled).toBe(false);
    action.onClick?.();
    expect(requestVoiceCapture).toHaveBeenCalledOnce();
  });

  test("routes the giant control to voice setup when credentials are missing", () => {
    const openVoiceCredentialSettings = vi.fn();
    const requestVoiceCapture = vi.fn();
    const commands: EasyButtonConversationCommands = {
      ...archivedConversationCommands(),
      requestVoiceCapture,
      routingFailure: null,
      workspaceCommandsAvailable: true,
    };
    const action = conversationControlAction(
      commands,
      true,
      {
        activityKind: null,
        activityLabel: null,
        captureScope: "none",
        captureState: "unavailable",
        playbackScope: "none",
        playbackState: "idle",
        speakingSourceEventId: null,
        transcriptPreview: null,
        voiceControlDisabled: false,
        voiceControlLabel: "Open voice settings",
        voiceControlSetupAction: "open_voice_credential_settings",
      },
      { onOpenVoiceCredentialSettings: openVoiceCredentialSettings },
    );

    expect(action.mode).toBe("talk");
    expect(action.disabled).toBe(false);
    expect(action.label).toBe("Open voice settings");
    action.onClick?.();
    expect(openVoiceCredentialSettings).toHaveBeenCalledOnce();
    expect(requestVoiceCapture).not.toHaveBeenCalled();
  });

  test("flips the giant control to finish this pane's dictation while it is listening", () => {
    const requestVoiceCapture = vi.fn();
    const commands: EasyButtonConversationCommands = {
      ...archivedConversationCommands(),
      pending: true,
      requestVoiceCapture,
      routingFailure: null,
      workspaceCommandsAvailable: true,
    };

    const recordingSpeech = {
      activityKind: "capture",
      activityLabel: "Listening",
      captureScope: "this_pane",
      captureState: "recording",
      playbackScope: "none",
      playbackState: "idle",
      speakingSourceEventId: null,
      transcriptPreview: "Keep listening",
      voiceControlDisabled: false,
      voiceControlLabel: "Finish this voice request",
      voiceControlSetupAction: null,
    } as const;

    const action = conversationControlAction(commands, false, recordingSpeech);
    expect(action.mode).toBe("stop-listening");
    expect(action.disabled).toBe(false);
    expect(action.label).toBe("Finish this voice request");
    action.onClick?.();
    expect(requestVoiceCapture).toHaveBeenCalledOnce();
    const draining = conversationControlAction(commands, false, {
      ...recordingSpeech,
      activityLabel: "Finishing captured audio",
      captureState: "draining",
      voiceControlDisabled: true,
      voiceControlLabel: "Finishing captured audio for this conversation",
    });
    expect(draining.mode).toBe("stop-listening");
    expect(draining.disabled).toBe(true);
    expect(draining.label).toBe("Finishing captured audio for this conversation");
    expect(draining.onClick).toBeUndefined();
  });

  test("read-only panes cannot talk through the giant control", () => {
    const requestVoiceCapture = vi.fn();
    const commands: EasyButtonConversationCommands = {
      ...archivedConversationCommands(),
      requestVoiceCapture,
      routingFailure: null,
      workspaceCommandsAvailable: true,
    };

    const action = conversationControlAction(commands, true, null);

    expect(action.mode).toBe("talk");
    expect(action.disabled).toBe(true);
    expect(action.onClick).toBeUndefined();
  });
});

function archivedConversationCommands(): EasyButtonConversationCommands {
  return {
    canSubmit: false,
    clarificationQuestion: null,
    discardFailedInput: vi.fn(),
    disposeSide: vi.fn(),
    error: null,
    folderResourceRequest: null,
    input: "",
    inputAvailable: false,
    pending: false,
    pendingAcceptedInput: null,
    presentRelatedConversation: vi.fn(),
    requestVoiceCapture: undefined,
    retryFailedInput: vi.fn(),
    routingFailure: { message: "Routing failed before archive", retryable: true },
    sendSide: vi.fn(async () => false),
    setInput: vi.fn(),
    stop: vi.fn(),
    submit: vi.fn(),
    submitApproval: vi.fn(),
    workspaceCommandsAvailable: false,
  };
}
