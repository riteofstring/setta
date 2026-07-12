import type {
  AcceptedMasterInput,
  ShellInteractionState,
  SubmitMasterInputRequest,
} from "@generated/backend";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { AppShellMasterController } from "./app-shell-master-controller";
import {
  AppShellMasterSurface,
  isMasterOverlayShortcut,
  masterOverlayShortcutLabel,
  MasterSidebarLauncher,
} from "./app-shell-master-surface";

describe("app-shell master surface", () => {
  test("renders one active routing interaction without completed-request history", async () => {
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

    controller.submitText("Open the latest narrator conversation");
    await flushPromises();
    html = renderSurface(controller);

    expect(html).toContain("Open the latest narrator conversation");
    expect(html).toContain('data-testid="master-active-request"');
    expect(html).toContain('data-master-result-kind="answer_global"');
    expect(html).toContain("The global router is ready.");
    expect(html).not.toContain("Recent master exchanges");
    expect(html).not.toContain("master-overlay-history");
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

  test("renders the compact sidebar launcher as a distinct entry point", () => {
    const html = renderToString(<MasterSidebarLauncher disabled={false} onOpen={() => {}} />);

    expect(html).toContain('data-testid="master-sidebar-launcher"');
    expect(html).toContain('aria-label="Open Ask Setta"');
    expect(html).toContain("Ask Setta");
  });

  test("accepts the primary-modifier shortcut without stealing modified variants", () => {
    expect(shortcut({ ctrlKey: true })).toBe(true);
    expect(shortcut({ metaKey: true })).toBe(true);
    expect(shortcut({ altKey: true, metaKey: true })).toBe(false);
    expect(shortcut({ ctrlKey: true, shiftKey: true })).toBe(false);
    expect(shortcut({ ctrlKey: true, key: "j" })).toBe(false);
    expect(masterOverlayShortcutLabel("darwin")).toBe("⌘K");
    expect(masterOverlayShortcutLabel("win32")).toBe("Ctrl+K");
  });
});

function renderSurface(controller: AppShellMasterController): string {
  return renderToString(
    <AppShellMasterSurface controller={controller} platform="linux">
      {(overlayOpen) => <main data-overlay-open={overlayOpen} />}
    </AppShellMasterSurface>,
  );
}

function masterController(restored: ShellInteractionState | null = null): AppShellMasterController {
  let inputOrdinal = 0;
  return new AppShellMasterController({
    createInputId: () => `master_input_${++inputOrdinal}`,
    now: () => new Date("2026-07-13T20:00:00Z"),
    readActiveInteraction: async () => ({ state: restored }),
    readFocusHints: () => ({
      focusedConversationId: null,
      focusedPaneId: null,
      focusedWorkspaceId: "workspace_alpha",
    }),
    submitMasterInput: async (request) => acceptedInput(request, inputOrdinal),
    waitShellInteraction: async ({ inputId }) =>
      answerState(
        acceptedInput(
          {
            input: masterInput(inputId, "Open the latest narrator conversation"),
          },
          inputOrdinal,
        ),
      ),
  });
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

function shortcut(overrides: Partial<Parameters<typeof isMasterOverlayShortcut>[0]>) {
  return isMasterOverlayShortcut({
    altKey: false,
    ctrlKey: false,
    key: "k",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
