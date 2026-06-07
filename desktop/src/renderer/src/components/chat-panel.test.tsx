import type { KeyboardEvent } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import {
  CommandSuggestions,
  commandSuggestions,
  commandTextToExecute,
  ComposerButton,
  ConversationBody,
  goalEditorDraft,
  goalReplacementExecutionOptions,
  handleComposerKeyDown,
  modelPickerOptionSelected,
  reasoningEffortOptionSelected,
} from "./chat-panel";

type ConversationBodyProps = Parameters<typeof ConversationBody>[0];

describe("composer keyboard behavior", () => {
  test("queues on Tab and preserves composer focus", () => {
    vi.useFakeTimers();
    const focus = vi.fn();
    const event = keyboardEvent("Tab", { focus });
    const queueDraft = vi.fn();
    const sendDraft = vi.fn();
    const stopRun = vi.fn();

    try {
      handleComposerKeyDown(event, {
        completeCommand: vi.fn(),
        draftEmpty: false,
        dismissModelPicker: vi.fn(),
        hasPendingSteering: false,
        modelPickerOpen: false,
        queueDraft,
        running: false,
        sendImmediateSteering: vi.fn(),
        sendDraft,
        slashDraft: false,
        stopRun,
      });
      vi.runOnlyPendingTimers();

      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(queueDraft).toHaveBeenCalledOnce();
      expect(focus).toHaveBeenCalledOnce();
      expect(sendDraft).not.toHaveBeenCalled();
      expect(stopRun).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("submits once on Enter and preserves composer focus", () => {
    vi.useFakeTimers();
    const focus = vi.fn();
    const event = keyboardEvent("Enter", { focus });
    const sendDraft = vi.fn();

    try {
      handleComposerKeyDown(event, {
        completeCommand: vi.fn(),
        draftEmpty: false,
        dismissModelPicker: vi.fn(),
        hasPendingSteering: false,
        modelPickerOpen: false,
        queueDraft: vi.fn(),
        running: false,
        sendImmediateSteering: vi.fn(),
        sendDraft,
        slashDraft: false,
        stopRun: vi.fn(),
      });
      vi.runOnlyPendingTimers();

      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(sendDraft).toHaveBeenCalledOnce();
      expect(focus).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  test("stops an active run on Ctrl+C when no text is selected", () => {
    const event = keyboardEvent("c", { ctrlKey: true });
    const stopRun = vi.fn();

    handleComposerKeyDown(event, {
      completeCommand: vi.fn(),
      draftEmpty: false,
      dismissModelPicker: vi.fn(),
      hasPendingSteering: false,
      modelPickerOpen: false,
      queueDraft: vi.fn(),
      running: true,
      sendImmediateSteering: vi.fn(),
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
      draftEmpty: false,
      dismissModelPicker: vi.fn(),
      hasPendingSteering: false,
      modelPickerOpen: false,
      queueDraft,
      running: false,
      sendImmediateSteering: vi.fn(),
      sendDraft: vi.fn(),
      slashDraft: true,
      stopRun: vi.fn(),
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(completeCommand).toHaveBeenCalledOnce();
    expect(queueDraft).not.toHaveBeenCalled();
  });

  test("dismisses the model picker on Escape", () => {
    const event = keyboardEvent("Escape");
    const dismissModelPicker = vi.fn();

    handleComposerKeyDown(event, {
      completeCommand: vi.fn(),
      draftEmpty: true,
      dismissModelPicker,
      hasPendingSteering: true,
      modelPickerOpen: true,
      queueDraft: vi.fn(),
      running: false,
      sendImmediateSteering: vi.fn(),
      sendDraft: vi.fn(),
      slashDraft: false,
      stopRun: vi.fn(),
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(dismissModelPicker).toHaveBeenCalledOnce();
  });

  test("sends pending steering immediately on Escape when the composer is empty", () => {
    const event = keyboardEvent("Escape");
    const sendImmediateSteering = vi.fn();

    handleComposerKeyDown(event, {
      completeCommand: vi.fn(),
      draftEmpty: true,
      dismissModelPicker: vi.fn(),
      hasPendingSteering: true,
      modelPickerOpen: false,
      queueDraft: vi.fn(),
      running: true,
      sendImmediateSteering,
      sendDraft: vi.fn(),
      slashDraft: false,
      stopRun: vi.fn(),
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(sendImmediateSteering).toHaveBeenCalledOnce();
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
        onDismissModelPicker={vi.fn()}
        onPickCommand={vi.fn()}
        onPickModel={vi.fn()}
        onPickReasoningEffort={vi.fn()}
        selectedSuggestion={null}
        suggestions={[]}
      />,
    );

    expect(html).toBe("");
  });

  test("shows slash command discovery failures while drafting a command", () => {
    const html = renderToString(
      <CommandSuggestions
        commandListError="command registry failed"
        draft="/"
        modelPicker={null}
        onDismissModelPicker={vi.fn()}
        onPickCommand={vi.fn()}
        onPickModel={vi.fn()}
        onPickReasoningEffort={vi.fn()}
        selectedSuggestion={null}
        suggestions={[]}
      />,
    );

    expect(html).toContain("Slash commands unavailable");
    expect(html).toContain("command registry failed");
  });

  test("enters selected command only when the draft is the command token", () => {
    const goal = commandCapability("/goal", true);

    expect(commandTextToExecute("/g", goal)).toBe("/goal");
    expect(commandTextToExecute("/g finish", goal)).toBe("/goal finish");
    expect(commandTextToExecute("/goal finish", goal)).toBe("/goal finish");
    expect(commandTextToExecute("/unknown", null)).toBe("/unknown");
  });

  test("confirms before replacing a non-terminal goal", () => {
    const confirm = vi.fn(() => true);

    expect(
      goalReplacementExecutionOptions(
        "/goal replacement",
        goalState("existing", "active"),
        confirm,
      ),
    ).toEqual({ confirmGoalReplacement: true });
    expect(confirm).toHaveBeenCalledWith("Replace the current goal?");
  });

  test("keeps the draft when replacement is cancelled", () => {
    const confirm = vi.fn(() => false);

    expect(
      goalReplacementExecutionOptions(
        "/goal replacement",
        goalState("existing", "paused"),
        confirm,
      ),
    ).toBeNull();
  });

  test("does not confirm same-objective or completed goals", () => {
    const confirm = vi.fn();

    expect(
      goalReplacementExecutionOptions("/goal existing", goalState("existing", "active"), confirm),
    ).toEqual({});
    expect(
      goalReplacementExecutionOptions("/goal replacement", goalState("done", "complete"), confirm),
    ).toEqual({});
    expect(confirm).not.toHaveBeenCalled();
  });

  test("builds the first-pass goal editor draft", () => {
    expect(goalEditorDraft(goalState("finish renderer tests", "active"))).toBe(
      "/goal finish renderer tests",
    );
    expect(goalEditorDraft(null)).toBe("/goal ");
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
                  defaultReasoningEffort: "medium",
                  supportedReasoningEfforts: [
                    {
                      description: "Balances speed and reasoning depth.",
                      displayName: "Medium",
                      effort: "medium",
                      isDefault: true,
                    },
                    {
                      description: "Greater reasoning depth.",
                      displayName: "High",
                      effort: "high",
                      isDefault: false,
                    },
                  ],
                },
              ],
              reasoningEfforts: [
                {
                  description: "Balances speed and reasoning depth.",
                  displayName: "Medium",
                  effort: "medium",
                  isDefault: true,
                },
                {
                  description: "Greater reasoning depth.",
                  displayName: "High",
                  effort: "high",
                  isDefault: false,
                },
              ],
              raw: "/model",
              selectedReasoningEffort: null,
              selectedModel: "",
              title: "Model",
            },
          } as unknown as Parameters<typeof CommandSuggestions>[0]["modelPicker"]
        }
        onDismissModelPicker={vi.fn()}
        onPickCommand={vi.fn()}
        onPickModel={vi.fn()}
        onPickReasoningEffort={vi.fn()}
        selectedSuggestion={null}
        suggestions={[]}
      />,
    );

    expect(html).toContain("Close model picker");
    expect(html).toContain("scripted-fast");
    expect(html).toContain("Reasoning");
    expect(html).toContain("High");
    expect(html).not.toContain("scripted-fast-catalog-id");
  });

  test("prefers the selected model over the catalog default", () => {
    const defaultModel = {
      isDefault: true,
      model: "scripted-fast",
    };
    const selectedModel = {
      isDefault: false,
      model: "scripted-careful",
    };

    expect(modelPickerOptionSelected(defaultModel, "")).toBe(true);
    expect(modelPickerOptionSelected(defaultModel, "scripted-careful")).toBe(false);
    expect(modelPickerOptionSelected(selectedModel, "scripted-careful")).toBe(true);
  });

  test("prefers the selected reasoning effort over the model default", () => {
    const defaultEffort = {
      effort: "medium",
      isDefault: true,
    } as const;
    const selectedEffort = {
      effort: "high",
      isDefault: false,
    } as const;

    expect(reasoningEffortOptionSelected(defaultEffort, null)).toBe(true);
    expect(reasoningEffortOptionSelected(defaultEffort, "high")).toBe(false);
    expect(reasoningEffortOptionSelected(selectedEffort, "high")).toBe(true);
  });
});

describe("composer controls", () => {
  test("hides queue controls while idle", () => {
    const html = renderToString(
      <ComposerButton
        canSend
        canSendImmediately={false}
        chat={composerButtonChat()}
        queueDraft={async () => {}}
        running={false}
        sendImmediateSteering={async () => {}}
      />,
    );

    expect(html).toContain("Send message");
    expect(html).not.toContain("Queue follow-up");
    expect(html).not.toContain("Stop run");
  });

  test("shows separate steering queue and stop controls while running", () => {
    const html = renderToString(
      <ComposerButton
        canSend
        canSendImmediately
        chat={composerButtonChat()}
        queueDraft={async () => {}}
        running
        sendImmediateSteering={async () => {}}
      />,
    );

    expect(html).toContain("Send steering message");
    expect(html).toContain("Queue follow-up");
    expect(html).toContain("Interrupt and send pending steering");
    expect(html).toContain("Stop run");
  });
});

describe("conversation body states", () => {
  test("shows corrupt-state load errors instead of empty chat actions", () => {
    const html = renderToString(
      <ConversationBody
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

    expect(html).toContain("Chat state is corrupt");
    expect(html).toContain("malformed chat state /tmp/run.json");
    expect(html).not.toContain("New Chat");
  });

  test("renders empty chat copy without a duplicate composer", () => {
    const html = renderToString(
      <ConversationBody
        chat={
          {
            error: null,
            selectedConversation: null,
            status: "ready",
          } as ConversationBodyProps["chat"]
        }
        searchOpen={false}
        setSearchOpen={() => {}}
      />,
    );

    expect(html).toContain("Start a conversation for this workspace.");
    expect(html).not.toContain("What should we build in setta?");
  });

  test("renders workspace switching as loading instead of empty chat actions", () => {
    const html = renderToString(
      <ConversationBody
        chat={
          {
            error: null,
            selectedConversation: null,
            status: "ready",
          } as ConversationBodyProps["chat"]
        }
        searchOpen={false}
        setSearchOpen={() => {}}
        switchingWorkspace
      />,
    );

    expect(html).toContain("Loading workspace chats.");
    expect(html).not.toContain("What should we build in setta?");
  });
});

function keyboardEvent(
  key: string,
  options: {
    ctrlKey?: boolean;
    focus?: () => void;
    selectionEnd?: number;
    selectionStart?: number;
  } = {},
) {
  return {
    altKey: false,
    ctrlKey: options.ctrlKey ?? false,
    currentTarget: {
      ...(options.focus ? { focus: options.focus } : {}),
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

function goalState(objective: string, status: string) {
  return {
    createdAt: 0,
    objective,
    status,
    threadId: "thread_fake",
    timeUsedSeconds: 0,
    tokenBudget: null,
    tokensUsed: 0,
    updatedAt: 0,
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
