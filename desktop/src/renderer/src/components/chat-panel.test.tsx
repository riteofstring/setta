import type { KeyboardEvent } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import {
  ChatPanel,
  CommandSuggestions,
  commandSuggestions,
  commandTextToExecute,
  ComposerButton,
  ConversationBody,
  type ChatView,
  handleComposerKeyDown,
  modelSelectionCommand,
} from "./chat-panel";

type ConversationBodyProps = Parameters<typeof ConversationBody>[0];

describe("composer keyboard behavior", () => {
  test("queues on Tab", () => {
    const event = keyboardEvent("Tab");
    const queueDraft = vi.fn();
    const sendDraft = vi.fn();
    const stopRun = vi.fn();

    handleComposerKeyDown(event, {
      completeCommand: vi.fn(),
      queueDraft,
      running: false,
      sendDraft,
      slashDraft: false,
      stopRun,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(queueDraft).toHaveBeenCalledOnce();
    expect(sendDraft).not.toHaveBeenCalled();
    expect(stopRun).not.toHaveBeenCalled();
  });

  test("submits once on Enter", () => {
    const event = keyboardEvent("Enter");
    const sendDraft = vi.fn();

    handleComposerKeyDown(event, {
      completeCommand: vi.fn(),
      queueDraft: vi.fn(),
      running: false,
      sendDraft,
      slashDraft: false,
      stopRun: vi.fn(),
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(sendDraft).toHaveBeenCalledOnce();
  });

  test("stops an active run on Ctrl+C when no text is selected", () => {
    const event = keyboardEvent("c", { ctrlKey: true });
    const stopRun = vi.fn();

    handleComposerKeyDown(event, {
      completeCommand: vi.fn(),
      queueDraft: vi.fn(),
      running: true,
      sendDraft: vi.fn(),
      slashDraft: false,
      stopRun,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(stopRun).toHaveBeenCalledOnce();
  });

  test("does not queue slash drafts on Tab", () => {
    const event = keyboardEvent("Tab");
    const completeCommand = vi.fn();
    const queueDraft = vi.fn();

    handleComposerKeyDown(event, {
      completeCommand,
      queueDraft,
      running: false,
      sendDraft: vi.fn(),
      slashDraft: true,
      stopRun: vi.fn(),
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(completeCommand).toHaveBeenCalledOnce();
    expect(queueDraft).not.toHaveBeenCalled();
  });
});

describe("composer command helpers", () => {
  test("shows command suggestions only for slash-prefixed drafts", () => {
    const commands = [commandCapability("/goal", true), commandCapability("/model", true)];

    expect(commandSuggestions(commands, "/g").map((command) => command.name)).toEqual(["/goal"]);
    expect(commandSuggestions(commands, "hello")).toEqual([]);
  });

  test("does not render static slash commands when the backend has no suggestions", () => {
    const html = renderToString(
      <CommandSuggestions
        draft="/"
        modelPicker={null}
        onPickCommand={vi.fn()}
        onPickModel={vi.fn()}
        selectedSuggestion={null}
        suggestions={[]}
      />,
    );

    expect(html).toBe("");
  });

  test("enters selected command only when the draft is the command token", () => {
    const goal = commandCapability("/goal", true);

    expect(commandTextToExecute("/g", goal)).toBe("/goal");
    expect(commandTextToExecute("/g finish", goal)).toBe("/goal finish");
    expect(commandTextToExecute("/goal finish", goal)).toBe("/goal finish");
    expect(commandTextToExecute("/unknown", null)).toBe("/unknown");
  });

  test("keeps model picker visible after the slash draft is submitted", () => {
    const html = renderToString(
      <CommandSuggestions
        draft=""
        modelPicker={
          {
            conversation: null,
            message: null,
            page: null,
            result: {
              action: "model_picker",
              goal: null,
              kind: "model",
              message: "Choose a model.",
              models: [
                {
                  description: "Fast scripted test model.",
                  displayName: "Scripted Fast",
                  hidden: false,
                  id: "scripted-fast-catalog-id",
                  isDefault: true,
                  model: "scripted-fast",
                },
              ],
              raw: "/model",
              selectedModel: "",
              title: "Model",
            },
          } as unknown as Parameters<typeof CommandSuggestions>[0]["modelPicker"]
        }
        onPickCommand={vi.fn()}
        onPickModel={vi.fn()}
        selectedSuggestion={null}
        suggestions={[]}
      />,
    );

    expect(html).toContain('data-testid="model-picker"');
    expect(html).toContain("scripted-fast");
    expect(html).not.toContain("scripted-fast-catalog-id");
  });

  test("uses the model value when selecting from the model picker", () => {
    expect(
      modelSelectionCommand({
        description: "Catalog id differs from the model setting.",
        displayName: "GPT Test",
        hidden: false,
        id: "catalog-row-gpt-test",
        isDefault: false,
        model: "gpt-test",
      }),
    ).toBe("/model gpt-test");
  });
});

describe("composer controls", () => {
  test("hides queue controls while idle", () => {
    const html = renderToString(
      <ComposerButton
        canSend
        chat={composerButtonChat()}
        queueDraft={async () => {}}
        running={false}
      />,
    );

    expect(html).toContain("Send message");
    expect(html).not.toContain("Queue follow-up");
    expect(html).not.toContain("Stop run");
  });

  test("shows separate steering queue and stop controls while running", () => {
    const html = renderToString(
      <ComposerButton canSend chat={composerButtonChat()} queueDraft={async () => {}} running />,
    );

    expect(html).toContain("Send steering message");
    expect(html).toContain("Queue follow-up");
    expect(html).toContain("Stop run");
  });
});

describe("conversation body states", () => {
  test("shows corrupt-state load errors instead of empty chat actions", () => {
    const html = renderToString(
      <ConversationBody
        busy={false}
        chat={
          {
            createConversation: async () => {},
            error: "malformed chat state /tmp/run.json",
            selectedConversation: null,
          } as ConversationBodyProps["chat"]
        }
        searchOpen={false}
        setSearchOpen={() => {}}
      />,
    );

    expect(html).toContain('data-testid="chat-load-error"');
    expect(html).toContain("Chat state is corrupt");
    expect(html).toContain("malformed chat state /tmp/run.json");
    expect(html).not.toContain("New Chat");
  });
});

describe("chat state status", () => {
  test("uses a compact status icon without repair actions", () => {
    const html = renderToString(
      <ChatPanel
        chat={
          {
            activeRun: null,
            corruption: {
              byKind: [{ count: 1, key: "run" }],
              bySeverity: [{ count: 1, key: "critical" }],
              hasCorruption: true,
              total: 1,
            },
            diagnostics: [
              {
                code: "corrupt_chat_state",
                context: { path: "/tmp/run.json" },
                conversationId: "conversation_api",
                id: "diagnostic_api",
                message: "run run_api assistant message message_missing was not found",
                occurredAt: "2026-05-29T20:00:00Z",
                runId: "run_api",
                schemaVersion: 1,
                severity: "critical",
                source: "chat",
                workspaceId: "workspace_api",
              },
            ],
            error: null,
            operation: null,
            selectedConversation: null,
            status: "ready",
          } as unknown as ChatView
        }
        searchOpen={false}
        setSearchOpen={() => {}}
        workspace={{
          displayName: "Workspace",
          id: "workspace_api",
          lastOpenedAt: "2026-05-29T20:00:00Z",
          rootPath: "/tmp/workspace",
        }}
      />,
    );

    expect(html).toContain('data-testid="workspace-corruption-status"');
    expect(html).toContain("1 corrupt chat record detected");
    expect(html).toContain("message_missing was not found");
    expect(html).not.toContain("Quarantine");
    expect(html).not.toContain("Reset workspace chat state");
  });
});

function keyboardEvent(
  key: string,
  options: { ctrlKey?: boolean; selectionEnd?: number; selectionStart?: number } = {},
) {
  return {
    altKey: false,
    ctrlKey: options.ctrlKey ?? false,
    currentTarget: {
      selectionEnd: options.selectionEnd ?? 0,
      selectionStart: options.selectionStart ?? 0,
    },
    key,
    nativeEvent: { isComposing: false },
    preventDefault: vi.fn(),
    shiftKey: false,
  } as unknown as KeyboardEvent<HTMLTextAreaElement>;
}

function composerButtonChat() {
  return {
    operation: null,
    stopActiveRun: async () => {},
  };
}

function commandCapability(name: "/goal" | "/model", available: boolean) {
  return {
    available,
    description: name,
    kind: name === "/goal" ? "goal" : "model",
    name,
    unavailableReason: available ? "" : "unavailable",
    usage: name,
  } as const;
}
