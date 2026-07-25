import type {
  AcceptedMasterInput,
  ShellInteractionState,
  SubmitMasterInputRequest,
  Transcript,
} from "@generated/backend";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { AppShellMasterController } from "./app-shell-master-controller";
import { AppShellMasterSurface } from "./app-shell-master-surface";
import { isMasterVoiceShortcut, masterVoiceShortcutLabel } from "./master-shortcuts";
import {
  isMasterPaneFocusShortcut,
  masterPaneFocusShortcutLabel,
} from "../../workspace-layout/master-pane-focus";

describe("app-shell master surface", () => {
  test("renders the active routing interaction and then durable transcript history", async () => {
    const controller = masterController();
    controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();
    controller.setDraft("Bring up the speech routing topic");
    controller.openOverlay();

    let html = renderSurface(controller);
    expect(html).toContain('data-testid="master-overlay"');
    expect(html).toContain("Bring up the speech routing topic");
    expect(html).toContain("What should Setta bring into focus?");
    expect(html).toContain("Ctrl+K");
    expect(html).toContain("Ctrl+Shift+K");
    expect(html).toContain('data-testid="master-overlay-voice-capture"');

    controller.submitText("Open the latest narrator conversation");
    await flushPromises();
    html = renderSurface(controller);

    expect(html).toContain("Open the latest narrator conversation");
    expect(html).toContain('data-testid="master-active-request"');
    expect(html).toContain('data-master-result-kind="answer_global"');
    expect(html).toContain('data-testid="master-answer-replay"');
    expect(html).toContain("The global router is ready.");

    controller.closeOverlay();
    controller.openOverlay();
    await flushPromises();
    html = renderSurface(controller);
    expect(html).toContain('data-testid="master-transcript-entry"');
    expect(html).toContain('data-master-transcript-kind="assistant_reply"');
    expect(html).toContain("Open the latest narrator conversation");
    expect(html).toContain("The global router is ready.");
  });

  test("renders a restored clarification as the only active result", async () => {
    const controller = masterController(clarificationState());
    controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();
    controller.openOverlay();

    const html = renderSurface(controller);
    expect(html).toContain('data-master-result-kind="clarify"');
    expect(html).toContain("Which topic should Setta focus?");
    expect(html).toContain("Answer Setta’s clarification…");
  });

  test("renders a durable transcript load failure instead of empty history", async () => {
    const controller = masterController(null, undefined, async () => {
      throw new Error("private transcript failure");
    });
    controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();
    controller.openOverlay();

    const html = renderSurface(controller);
    expect(html).toContain("Setta could not load the durable master transcript.");
    expect(html).toContain("Retry transcript");
    expect(html).not.toContain("What should Setta bring into focus?");
  });

  test("renders an explicit cancellation action and its immediate terminal result", async () => {
    const pending = new Promise<ShellInteractionState>(() => {});
    const controller = masterController(null, pending);
    controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();
    controller.submitText("Cancel this global route");
    await flushPromises();
    controller.openOverlay();

    let html = renderSurface(controller);
    expect(html).toContain('aria-label="Cancel active Setta request"');
    controller.cancelActiveInput();
    await flushPromises();
    html = renderSurface(controller);
    expect(html).toContain("Request cancelled");
    expect(html).toContain('data-master-routing-status="cancelled"');
  });

  test("accepts the primary-modifier shortcut without stealing modified variants", () => {
    expect(shortcut({ ctrlKey: true })).toBe(true);
    expect(shortcut({ metaKey: true })).toBe(true);
    expect(shortcut({ altKey: true, metaKey: true })).toBe(false);
    expect(shortcut({ ctrlKey: true, shiftKey: true })).toBe(false);
    expect(shortcut({ ctrlKey: true, key: "j" })).toBe(false);
    expect(masterPaneFocusShortcutLabel("darwin")).toBe("⌘K");
    expect(masterPaneFocusShortcutLabel("win32")).toBe("Ctrl+K");
  });

  test("matches the configured master voice shortcut by platform", () => {
    expect(voiceShortcut("darwin", { metaKey: true, shiftKey: true })).toBe(true);
    expect(voiceShortcut("darwin", { ctrlKey: true, shiftKey: true })).toBe(false);
    expect(voiceShortcut("linux", { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(voiceShortcut("linux", { metaKey: true, shiftKey: true })).toBe(false);
    expect(voiceShortcut("linux", { altKey: true, shiftKey: true }, "alt_shift_k")).toBe(true);
    expect(voiceShortcut("linux", { ctrlKey: true, key: "j", shiftKey: true })).toBe(false);
    expect(masterVoiceShortcutLabel("darwin")).toBe("⌘+Shift+K");
    expect(masterVoiceShortcutLabel("linux")).toBe("Ctrl+Shift+K");
  });
});

function renderSurface(controller: AppShellMasterController): string {
  return renderToString(
    <AppShellMasterSurface
      controller={controller}
      onOpenVoiceCredentialSettings={() => {}}
      platform="linux"
    >
      {(overlayOpen) => <main data-overlay-open={overlayOpen} />}
    </AppShellMasterSurface>,
  );
}

function masterController(
  restored: ShellInteractionState | null = null,
  waitedState?: Promise<ShellInteractionState>,
  readTranscript?: () => Promise<Transcript>,
): AppShellMasterController {
  let inputOrdinal = 0;
  const requests: SubmitMasterInputRequest[] = [];
  return new AppShellMasterController({
    cancelMasterInput: async ({ inputId }) => ({
      decision: null,
      failure: null,
      input: masterInput(inputId, "Cancel this global route"),
      status: "cancelled",
    }),
    createInputId: () => `master_input_${++inputOrdinal}`,
    now: () => new Date("2026-07-13T20:00:00Z"),
    presentPresentationIntent: async () => ({ paneId: "pane_alpha" }),
    readActiveInteraction: async () => ({ state: restored }),
    readFocusHints: () => ({
      focusedConversationId: null,
      focusedPaneId: null,
      focusedWorkspaceId: "workspace_alpha",
    }),
    resolvePresentationIntent: async (request) => ({
      ...request,
      resolvedAt: "2026-07-13T20:00:02Z",
    }),
    readTranscript: readTranscript ?? (async () => transcriptForRequests(requests)),
    submitMasterInput: async (request) => {
      requests.push(request);
      return acceptedInput(request, inputOrdinal);
    },
    waitShellInteraction: async ({ inputId }) =>
      waitedState ??
      answerState(
        acceptedInput(
          {
            input: masterInput(inputId, "Open the latest narrator conversation"),
          },
          inputOrdinal,
        ),
      ),
    waitPresentationIntent: async ({ inputId }) => ({
      focusExistingConversationPane: null,
      id: `master-presentation:${inputId}`,
      inputId,
      kind: "show_master_reply",
      openConversationPane: null,
      openSideConversation: null,
      originatingConversationId: null,
      originatingConversationInputId: null,
      originatingPaneId: null,
      originatingWorkspaceId: null,
      showMasterReply: { replyKind: "answer", text: "The global router is ready." },
      source: "shell",
    }),
  });
}

function transcriptForRequests(requests: SubmitMasterInputRequest[]): Transcript {
  let sequence = 0;
  const entries: Transcript["entries"] = [];
  for (const request of requests) {
    sequence += 1;
    entries.push({
      payload: {
        actionReceipt: null,
        assistantReply: null,
        cancellation: null,
        createdAt: "2026-07-13T20:00:01Z",
        failure: null,
        id: `master-transcript:user:${request.input.id}`,
        inputId: request.input.id,
        kind: "user_input",
        userInput: { modality: request.input.modality, text: request.input.text },
      },
      sequence,
    });
    sequence += 1;
    entries.push({
      payload: {
        actionReceipt: null,
        assistantReply: { replyKind: "answer", text: "The global router is ready." },
        cancellation: null,
        createdAt: "2026-07-13T20:00:02Z",
        failure: null,
        id: `master-transcript:decision:${request.input.id}`,
        inputId: request.input.id,
        kind: "assistant_reply",
        userInput: null,
      },
      sequence,
    });
  }
  return { entries, lastSequence: sequence };
}

function acceptedInput(request: SubmitMasterInputRequest, sequence: number): AcceptedMasterInput {
  return {
    acceptedAt: "2026-07-13T20:00:01Z",
    input: request.input,
    replyDelivery: {
      originatingConversationId: null,
      originatingConversationInputId: null,
      originatingPaneId: null,
      originatingWorkspaceId: null,
    },
    sequence,
  };
}

function masterInput(id: string, text: string): SubmitMasterInputRequest["input"] {
  return {
    focusedConversationId: null,
    focusedPaneId: null,
    focusedWorkspaceId: "workspace_alpha",
    id,
    modality: "text",
    originatingConversationId: null,
    originatingConversationInputId: null,
    originatingPaneId: null,
    originatingWorkspaceId: null,
    source: "shell",
    submittedAt: "2026-07-13T20:00:00Z",
    text,
  };
}

function answerState(accepted: AcceptedMasterInput): ShellInteractionState {
  return decidedState(accepted, {
    answerGlobal: { text: "The global router is ready." },
    clarify: null,
    kind: "answer_global",
  });
}

function clarificationState(): ShellInteractionState {
  return decidedState(acceptedInput({ input: masterInput("input_clarify", "Find my topic") }, 1), {
    answerGlobal: null,
    clarify: { question: "Which topic should Setta focus?" },
    kind: "clarify",
  });
}

function decidedState(
  accepted: AcceptedMasterInput,
  result: {
    answerGlobal: { text: string } | null;
    clarify: { question: string } | null;
    kind: "answer_global" | "clarify";
  },
): ShellInteractionState {
  return {
    decision: {
      answerGlobal: result.answerGlobal,
      askNarrator: null,
      clarify: result.clarify,
      createConversation: null,
      createSideConversation: null,
      focusConversation: null,
      forkConversation: null,
      kind: result.kind,
      queueAgentTurn: null,
      sendToAgent: null,
      steerActiveTurn: null,
    },
    failure: null,
    input: accepted.input,
    status: "decided",
  };
}

function shortcut(overrides: Partial<Parameters<typeof isMasterPaneFocusShortcut>[0]>) {
  return isMasterPaneFocusShortcut({
    altKey: false,
    ctrlKey: false,
    key: "k",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  });
}

function voiceShortcut(
  platform: Parameters<typeof isMasterVoiceShortcut>[1],
  overrides: Partial<Parameters<typeof isMasterVoiceShortcut>[0]>,
  configured?: Parameters<typeof isMasterVoiceShortcut>[2],
) {
  return isMasterVoiceShortcut(
    {
      altKey: false,
      ctrlKey: false,
      key: "k",
      metaKey: false,
      shiftKey: false,
      ...overrides,
    },
    platform,
    configured,
  );
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
