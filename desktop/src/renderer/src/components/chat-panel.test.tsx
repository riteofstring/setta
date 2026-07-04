import type { ChatCommandDescriptor } from "@generated/backend";
import type { KeyboardEvent } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { activityDetails, queuedChatMessage } from "../App.test.fixtures";
import type { ActiveRunPresentation } from "../lib/chat-run-liveness";
import {
  activityBlock,
  assistantTextBlock,
  backgroundTerminalOutput,
  backgroundTerminalProcess,
  userMessageBlock,
} from "../stores/chat-store-events.test.helpers";
import { testRun } from "../stores/chat-store.test.fixtures";
import { BackgroundTerminalMonitor } from "./chat-background-terminal-monitor";
import { Composer } from "./chat-composer";
import {
  selectedChatComposerActions,
  selectedChatComposerViewModel,
} from "./chat-composer-selected-adapter";
import { commandComposerState } from "./chat-command-composer-controller";
import {
  canDismissCompletedCurrentPlan,
  currentPlanFromTranscript,
  nextCurrentPlanSurfaceModel,
} from "./chat-current-plan-surface";
import {
  CommandPalette,
  commandSuggestions,
  ComposerButton,
  ChatPanel,
  ConversationBody,
  handleComposerKeyDown,
  ModelPickerButton,
  PermissionConfirmationDialog,
  PermissionPickerButton,
  modelPickerOptionSelected,
  permissionPresetSelected,
  reasoningEffortOptionSelected,
} from "./chat-panel";
import { ChatSearchBar, type TranscriptSearchController } from "./chat-transcript-search";
import { ChatTranscript, type ChatTranscriptProps } from "./chat-transcript";

type ConversationBodyProps = Parameters<typeof ConversationBody>[0];
const readableColumnAttribute = 'data-chat-readable-column="true"';

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
        canStop: false,
        completeCommand: vi.fn(),
        draftEmpty: false,
        dismissPicker: vi.fn(),
        hasPendingSteering: false,
        pickerOpen: false,
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
        canStop: false,
        completeCommand: vi.fn(),
        draftEmpty: false,
        dismissPicker: vi.fn(),
        hasPendingSteering: false,
        pickerOpen: false,
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
      canStop: true,
      completeCommand: vi.fn(),
      draftEmpty: false,
      dismissPicker: vi.fn(),
      hasPendingSteering: false,
      pickerOpen: false,
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
      canStop: false,
      completeCommand,
      draftEmpty: false,
      dismissPicker: vi.fn(),
      hasPendingSteering: false,
      pickerOpen: false,
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

  test("does not capture Tab for queueing when queue capability is absent", () => {
    const event = keyboardEvent("Tab");
    const completeCommand = vi.fn();
    const queueDraft = vi.fn();

    handleComposerKeyDown(event, {
      canQueue: false,
      canStop: false,
      completeCommand,
      draftEmpty: false,
      dismissPicker: vi.fn(),
      hasPendingSteering: false,
      pickerOpen: false,
      queueDraft,
      running: false,
      sendImmediateSteering: vi.fn(),
      sendDraft: vi.fn(),
      slashDraft: false,
      stopRun: vi.fn(),
    });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(completeCommand).not.toHaveBeenCalled();
    expect(queueDraft).not.toHaveBeenCalled();
  });

  test("dismisses the open picker on Escape", () => {
    const event = keyboardEvent("Escape");
    const dismissPicker = vi.fn();

    handleComposerKeyDown(event, {
      canStop: false,
      completeCommand: vi.fn(),
      draftEmpty: true,
      dismissPicker,
      hasPendingSteering: true,
      pickerOpen: true,
      queueDraft: vi.fn(),
      running: false,
      sendImmediateSteering: vi.fn(),
      sendDraft: vi.fn(),
      slashDraft: false,
      stopRun: vi.fn(),
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(dismissPicker).toHaveBeenCalledOnce();
  });

  test("sends pending steering immediately on Escape when the composer is empty", () => {
    const event = keyboardEvent("Escape");
    const sendImmediateSteering = vi.fn();

    handleComposerKeyDown(event, {
      canStop: false,
      completeCommand: vi.fn(),
      draftEmpty: true,
      dismissPicker: vi.fn(),
      hasPendingSteering: true,
      pickerOpen: false,
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

  test("follows the command key-handling precedence table", () => {
    const cases = [
      {
        expected: "dismissPicker",
        key: "Escape",
        name: "Escape dismisses the open picker before pending steering",
        options: {},
        overrides: {
          draftEmpty: true,
          hasPendingSteering: true,
          pickerOpen: true,
          running: true,
          slashDraft: true,
        },
      },
      {
        expected: "sendImmediateSteering",
        key: "Escape",
        name: "Escape sends pending steering when the picker is closed",
        options: {},
        overrides: {
          draftEmpty: true,
          hasPendingSteering: true,
          pickerOpen: false,
          running: true,
        },
      },
      {
        expected: "completeCommand",
        key: "Tab",
        name: "Tab completes slash commands before queueing",
        options: {},
        overrides: { slashDraft: true },
      },
      {
        expected: "queueDraft",
        key: "Tab",
        name: "Tab queues normal drafts",
        options: {},
        overrides: { slashDraft: false },
      },
      {
        expected: "stopRun",
        key: "c",
        name: "Ctrl+C stops active runs",
        options: { ctrlKey: true },
        overrides: { canStop: true, running: true },
      },
      {
        expected: "sendDraft",
        key: "Enter",
        name: "Enter sends the current draft",
        options: {},
        overrides: {},
      },
    ] as const;

    for (const testCase of cases) {
      const actions = {
        completeCommand: vi.fn(),
        dismissPicker: vi.fn(),
        queueDraft: vi.fn(),
        sendDraft: vi.fn(),
        sendImmediateSteering: vi.fn(),
        stopRun: vi.fn(),
      };
      const event = keyboardEvent(testCase.key, testCase.options);

      handleComposerKeyDown(event, {
        canStop: false,
        completeCommand: actions.completeCommand,
        draftEmpty: false,
        dismissPicker: actions.dismissPicker,
        hasPendingSteering: false,
        pickerOpen: false,
        queueDraft: actions.queueDraft,
        running: false,
        sendDraft: actions.sendDraft,
        sendImmediateSteering: actions.sendImmediateSteering,
        slashDraft: false,
        stopRun: actions.stopRun,
        ...testCase.overrides,
      });

      for (const [name, action] of Object.entries(actions)) {
        if (name === testCase.expected) {
          expect(action, testCase.name).toHaveBeenCalledOnce();
        } else {
          expect(action, testCase.name).not.toHaveBeenCalled();
        }
      }
      expect(event.preventDefault, testCase.name).toHaveBeenCalledOnce();
    }
  });
});

describe("composer command helpers", () => {
  test("shows command suggestions only for slash-prefixed drafts", () => {
    const commands = [commandCapability(true)];

    expect(commandSuggestions(commands, "/g").map((command) => command.label)).toEqual(["/goal"]);
    expect(commandSuggestions(commands, "hello")).toEqual([]);
  });

  test("renders an empty command palette when the backend has no matching descriptors", () => {
    const html = renderToString(
      <CommandPalette
        commandListStatus="loaded"
        commandState={commandComposerState("/", [])}
        draft="/"
        modelPicker={null}
        onDismissModelPicker={vi.fn()}
        onPickModel={vi.fn()}
        onPickReasoningEffort={vi.fn()}
        onPickSuggestion={vi.fn()}
        paletteVisible
        selectedSuggestionIndex={0}
      />,
    );

    expect(html).toContain("No matching slash commands");
  });

  test("shows slash command discovery failures while drafting a command", () => {
    const html = renderToString(
      <CommandPalette
        commandListError="command registry failed"
        commandListStatus="failed"
        commandState={commandComposerState("/", [])}
        draft="/"
        modelPicker={null}
        onDismissModelPicker={vi.fn()}
        onPickModel={vi.fn()}
        onPickReasoningEffort={vi.fn()}
        onPickSuggestion={vi.fn()}
        paletteVisible
        selectedSuggestionIndex={0}
      />,
    );

    expect(html).toContain("Slash commands unavailable");
    expect(html).toContain("command registry failed");
  });

  test("does not show unknown-command errors while slash command discovery is pending", () => {
    const html = renderToString(
      <CommandPalette
        commandListPending
        commandListStatus="idle"
        commandState={commandComposerState("/goal", [])}
        draft="/goal"
        modelPicker={null}
        onDismissModelPicker={vi.fn()}
        onPickModel={vi.fn()}
        onPickReasoningEffort={vi.fn()}
        onPickSuggestion={vi.fn()}
        paletteVisible
        selectedSuggestionIndex={0}
      />,
    );

    expect(html).toContain("Loading slash commands");
    expect(html).not.toContain("Invalid slash command");
    expect(html).not.toContain("Unknown slash command");
  });

  test("keeps model picker visible after the slash draft is submitted", () => {
    const html = renderToString(
      <CommandPalette
        commandListStatus="loaded"
        commandState={commandComposerState("", [])}
        draft=""
        modelPicker={
          {
            conversation: null,
            message: null,
            page: null,
            result: {
              action: "model_picker",
              composerDraft: "",
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
              raw: "model_picker",
              selectedReasoningEffort: null,
              selectedModel: "",
              title: "Model",
            },
          } as unknown as Parameters<typeof CommandPalette>[0]["modelPicker"]
        }
        onDismissModelPicker={vi.fn()}
        onPickModel={vi.fn()}
        onPickReasoningEffort={vi.fn()}
        onPickSuggestion={vi.fn()}
        paletteVisible={false}
        selectedSuggestionIndex={0}
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

  test("prefers the selected permission preset over built-in defaults", () => {
    expect(permissionPresetSelected("default", null)).toBe(false);
    expect(permissionPresetSelected("default", "full-access")).toBe(false);
    expect(permissionPresetSelected("full-access", "full-access")).toBe(true);
  });
});

describe("composer controls", () => {
  test("shows selected model and reasoning in the model picker button", () => {
    const html = renderToString(
      <ModelPickerButton
        disabled={false}
        modelPicker={null}
        onOpen={vi.fn()}
        running={false}
        selectedConversation={
          {
            codexEffectiveSettings: {
              model: "scripted-careful",
              modelDisplayName: "Scripted Careful",
              permission: defaultEffectivePermissionSettings(),
              reasoningEffort: "high",
              reasoningEffortDisplayName: "High",
              supportsImages: true,
            },
            codexSettings: {
              model: "scripted-careful",
              permission: null,
              reasoningEffort: "high",
            },
          } as Parameters<typeof ModelPickerButton>[0]["selectedConversation"]
        }
      />,
    );

    expect(html).toContain("Open model and reasoning picker");
    expect(html).toContain("Scripted Careful");
    expect(html).toContain("High");
  });

  test("shows selected permission and picker options", () => {
    const html = renderToString(
      <PermissionPickerButton
        disabled={false}
        onOpen={vi.fn()}
        onSelect={vi.fn()}
        permissionPicker={permissionPickerResult()}
        running={false}
        selectedConversation={selectedConversationWithPermission("Ask for approval")}
      />,
    );

    expect(html).toContain("Open permission mode picker");
    expect(html).toContain("Ask for approval");
    expect(html).toContain("Read Only");
    expect(html).toContain("Full Access");
    expect(html).toContain("Full filesystem access");
  });

  test("renders focused confirmation for dangerous permission presets", () => {
    const preset = permissionPickerResult()?.result.permissionPresets.find(
      (candidate) => candidate.id === "full-access",
    );
    const html = renderToString(
      <PermissionConfirmationDialog
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        preset={preset ?? null}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain("Enable Full Access?");
    expect(html).toContain("Full filesystem access removes runtime approval prompts.");
    expect(html).toContain("Use");
    expect(html).toContain("Full Access");
  });

  test("explains permission picker disabled state while a run is active", () => {
    const html = renderToString(
      <PermissionPickerButton
        disabled
        onOpen={vi.fn()}
        onSelect={vi.fn()}
        permissionPicker={null}
        running
        selectedConversation={selectedConversationWithPermission("Ask for approval")}
      />,
    );

    expect(html).toContain("Permission changes apply after the current run finishes.");
  });

  test("hides queue controls while idle", () => {
    const html = renderToString(
      <ComposerButton
        canSend
        canSendImmediately={false}
        operation={null}
        queueDraft={async () => {}}
        retryActiveRunLiveness={async () => {}}
        running={false}
        runPresentation={idleRunPresentation}
        sendImmediateSteering={async () => {}}
        stopActiveRun={async () => {}}
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
        operation={null}
        queueDraft={async () => {}}
        retryActiveRunLiveness={async () => {}}
        running
        runPresentation={workingRunPresentation}
        sendImmediateSteering={async () => {}}
        stopActiveRun={async () => {}}
      />,
    );

    expect(html).toContain("Send steering message");
    expect(html).toContain("Queue follow-up");
    expect(html).toContain("Interrupt and send pending steering");
    expect(html).toContain("Stop run");
  });

  test("shows retry and stop controls while run liveness is degraded", () => {
    const html = renderToString(
      <ComposerButton
        canSend
        canSendImmediately
        operation={null}
        queueDraft={async () => {}}
        retryActiveRunLiveness={async () => {}}
        running
        runPresentation={lostRunPresentation}
        sendImmediateSteering={async () => {}}
        stopActiveRun={async () => {}}
      />,
    );

    expect(html).toContain("Retry run liveness check");
    expect(html).toContain("Stop run");
    expect(html).not.toContain("Send steering message");
    expect(html).not.toContain("Queue follow-up");
    expect(html).not.toContain("Interrupt and send pending steering");
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
    expectReadableColumnElement(html, 'data-testid="empty-chat"');
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

  test("renders selected chat through an explicit agent trajectory scope", () => {
    const html = renderToString(
      <ConversationBody
        chat={conversationBodyChat({
          transcriptBlocks: [
            userMessageBlock({ id: "block_user", runId: "run_api", ordinal: 1, text: "hello" }),
          ],
        })}
        searchOpen={false}
        setSearchOpen={() => {}}
      />,
    );

    expect(html).toContain('data-testid="agent-trajectory-surface"');
    expect(html).toContain('data-agent-trajectory-scope="chatConversation"');
    expect(html).toContain('data-agent-trajectory-workspace-id="workspace_api"');
    expect(html).toContain('data-agent-trajectory-conversation-id="conversation_api"');
    expect(html).toContain("hello");
  });
});

describe("background terminal surface", () => {
  test("renders the active run current plan before background terminals", () => {
    const terminal = backgroundTerminalProcess("background_terminal_alpha");
    const planBlock = activityBlock({
      id: "block_plan",
      runId: "run_plan",
      ordinal: 2,
      sourceRunItemId: "run_item_plan",
      type: "plan",
      activityStatus: "running",
      hasDetails: true,
      title: "Plan updated",
      details: activityDetails({
        plan: {
          explanation: "Updating the turn plan.",
          steps: [
            { status: "completed", step: "Read the plan" },
            { status: "inProgress", step: "Render the active surface" },
            { status: "pending", step: "Add completion dwell" },
          ],
        },
      }),
    });
    const html = renderToString(
      <ChatPanel
        chat={conversationBodyChat({
          activeRun: testRun("running", "run_plan"),
          backgroundTerminalIdsByConversationId: {
            conversation_api: [terminal.id],
          },
          backgroundTerminalsById: {
            [terminal.id]: terminal,
          },
          transcriptBlocks: [planBlock],
        })}
        searchOpen={false}
        setSearchOpen={() => {}}
        workspace={{ id: "workspace_api" } as Parameters<typeof ChatPanel>[0]["workspace"]}
      />,
    );

    expect(html).toContain('data-testid="current-plan-surface"');
    expect(html).toContain('data-testid="chat-active-work-stack"');
    expect(html).toContain('data-run-id="run_plan"');
    expect(html).toContain('data-run-item-id="run_item_plan"');
    expect(html).toContain('data-plan-state="active"');
    expect(html).toContain('data-plan-completed-count="1"');
    expect(html).toContain('data-current-step="Render the active surface"');
    expect(html).toContain("Current plan");
    expect(html).toContain("1/3 done");
    expect(html).toContain("Render the active surface");
    expect(html.indexOf('data-testid="current-plan-surface"')).toBeLessThan(
      html.indexOf('data-testid="background-terminals-footer"'),
    );
    expectReadableColumnElement(html, 'data-testid="current-plan-footer"');
  });

  test("selects only typed plan details from the active run", () => {
    const stalePlan = activityBlock({
      id: "block_stale_plan",
      runId: "run_stale",
      ordinal: 10,
      type: "plan",
      details: activityDetails({
        plan: {
          explanation: "",
          steps: [{ status: "inProgress", step: "Ignore stale plan" }],
        },
      }),
    });
    const untypedPlan = activityBlock({
      id: "block_untyped_plan",
      runId: "run_plan",
      ordinal: 11,
      type: "plan",
      details: activityDetails({ summary: "legacy summary that must not be used" }),
    });
    const activePlan = activityBlock({
      id: "block_active_plan",
      runId: "run_plan",
      ordinal: 3,
      sourceRunItemId: "run_item_active_plan",
      type: "plan",
      details: activityDetails({
        plan: {
          explanation: "",
          steps: [{ status: "inProgress", step: "Use typed plan" }],
        },
      }),
    });

    const currentPlan = currentPlanFromTranscript(
      [stalePlan, untypedPlan, activePlan],
      testRun("running", "run_plan"),
    );

    expect(currentPlan?.sourceRunItemId).toBe("run_item_active_plan");
    expect(currentPlan?.plan.steps).toEqual([{ status: "inProgress", step: "Use typed plan" }]);
  });

  test("retains the last active typed plan as a completed dwell surface", () => {
    const activePlanBlock = activityBlock({
      id: "block_active_plan",
      runId: "run_plan",
      ordinal: 3,
      sourceRunItemId: "run_item_active_plan",
      type: "plan",
      details: activityDetails({
        plan: {
          explanation: "",
          steps: [{ status: "completed", step: "Use typed plan" }],
        },
      }),
    });
    const activePlan = currentPlanFromTranscript([activePlanBlock], testRun("running", "run_plan"));
    if (activePlan === null) {
      throw new Error("expected active typed plan");
    }

    const activeSurface = nextCurrentPlanSurfaceModel(null, "conversation_api", activePlan);
    expect(activeSurface?.phase).toBe("active");

    const completedSurface = nextCurrentPlanSurfaceModel(
      activeSurface,
      "conversation_api",
      null,
      "completed",
    );
    expect(completedSurface?.phase).toBe("complete");
    expect(completedSurface?.sourceRunItemId).toBe("run_item_active_plan");
    expect(completedSurface?.plan.steps).toEqual(activePlan.plan.steps);

    expect(nextCurrentPlanSurfaceModel(completedSurface, "conversation_other", null)).toBeNull();
  });

  test("does not keep a completed plan surface for cancelled runs", () => {
    const activePlanBlock = activityBlock({
      id: "block_active_plan",
      runId: "run_plan",
      ordinal: 3,
      sourceRunItemId: "run_item_active_plan",
      type: "plan",
      details: activityDetails({
        plan: {
          explanation: "",
          steps: [{ status: "inProgress", step: "Use typed plan" }],
        },
      }),
    });
    const activePlan = currentPlanFromTranscript([activePlanBlock], testRun("running", "run_plan"));
    if (activePlan === null) {
      throw new Error("expected active typed plan");
    }

    const activeSurface = nextCurrentPlanSurfaceModel(null, "conversation_api", activePlan);

    expect(
      nextCurrentPlanSurfaceModel(activeSurface, "conversation_api", null, "cancelled"),
    ).toBeNull();
  });

  test("blocks completed current-plan dismissal while the user is interacting with it", () => {
    expect(
      canDismissCompletedCurrentPlan({ expanded: false, focused: false, hovered: false }),
    ).toBe(true);
    expect(canDismissCompletedCurrentPlan({ expanded: true, focused: false, hovered: false })).toBe(
      false,
    );
    expect(canDismissCompletedCurrentPlan({ expanded: false, focused: true, hovered: false })).toBe(
      false,
    );
    expect(canDismissCompletedCurrentPlan({ expanded: false, focused: false, hovered: true })).toBe(
      false,
    );
  });

  test("renders the compact footer for active background terminals", () => {
    const terminal = backgroundTerminalProcess("background_terminal_alpha");
    const html = renderToString(
      <ChatPanel
        chat={conversationBodyChat({
          backgroundTerminalIdsByConversationId: {
            conversation_api: [terminal.id],
          },
          backgroundTerminalsById: {
            [terminal.id]: terminal,
          },
        })}
        searchOpen={false}
        setSearchOpen={() => {}}
        workspace={{ id: "workspace_api" } as Parameters<typeof ChatPanel>[0]["workspace"]}
      />,
    );

    expect(html).toContain('data-testid="background-terminals-footer"');
    expect(html).toContain("1 background terminal running");
    expect(html).toContain("Open background terminal monitor");
  });

  test("renders the compact footer for attention background terminals", () => {
    const terminal = backgroundTerminalProcess("background_terminal_lost", {
      error: "provider connection lost",
      status: "lost",
    });
    const html = renderToString(
      <ChatPanel
        chat={conversationBodyChat({
          backgroundTerminalIdsByConversationId: {
            conversation_api: [terminal.id],
          },
          backgroundTerminalsById: {
            [terminal.id]: terminal,
          },
        })}
        searchOpen={false}
        setSearchOpen={() => {}}
        workspace={{ id: "workspace_api" } as Parameters<typeof ChatPanel>[0]["workspace"]}
      />,
    );

    expect(html).toContain('data-testid="background-terminals-footer"');
    expect(html).toContain('data-terminal-surface-state="attention"');
    expect(html).toContain("1 background terminal needs attention");
    expect(html).toContain("Dismiss background terminal status");
  });

  test("renders monitor process output and per-process kill controls", () => {
    const alpha = backgroundTerminalProcess("background_terminal_alpha", {
      command: "npm run dev",
    });
    const beta = backgroundTerminalProcess("background_terminal_beta", {
      command: "vite --host 0.0.0.0",
    });
    const output = backgroundTerminalOutput("background_terminal_output_alpha_1", alpha.id);

    const html = renderToString(
      <BackgroundTerminalMonitor
        chat={conversationBodyChat({
          backgroundTerminalOutputIdsByProcessId: {
            [alpha.id]: [output.id],
          },
          backgroundTerminalOutputsById: {
            [output.id]: output,
          },
        })}
        onClose={() => {}}
        terminals={[alpha, beta]}
      />,
    );

    expect(html).toContain('data-testid="background-terminal-monitor"');
    expect(html).toContain("npm run dev");
    expect(html).toContain("vite --host 0.0.0.0");
    expect(html).toContain("dev server ready");
    expect(html).toContain("Kill background terminal npm run dev");
    expect(html).toContain("Kill all background terminals");
  });
});

describe("chat readable width contract", () => {
  test("keeps transcript states, goal chrome, search, and composer on the capped chat column", () => {
    const transcriptHtml = renderToString(
      <ChatTranscript
        {...emptyTranscriptProps()}
        hasMoreOlder
        blocks={[
          userMessageBlock({ id: "block_user", runId: "run_api", ordinal: 1, text: "hello" }),
          assistantTextBlock({
            id: "block_assistant",
            runId: "run_api",
            ordinal: 2,
            status: "complete",
            text: "hi",
          }),
          activityBlock({
            id: "block_notice",
            runId: "run_api",
            ordinal: 3,
            sourceRunItemId: "run_item_notice",
            title: "warning",
            type: "notice",
            hasDetails: true,
            details: activityDetails({ noticeKind: "warning", noticeMessage: "warning text" }),
          }),
        ]}
      />,
    );
    const standaloneStatesHtml = renderToString(
      <ChatTranscript
        {...emptyTranscriptProps()}
        blocks={[
          userMessageBlock({
            id: "block_steering",
            runId: "run_api",
            ordinal: 1,
            delivery: "steering",
            messageStatus: "pending",
            text: "Standalone steering message preview.",
          }),
          assistantTextBlock({
            id: "block_failed",
            runId: "run_api",
            ordinal: 2,
            status: "failed",
            text: "The scripted fixture failed this turn on purpose so error styling is visible.",
          }),
          assistantTextBlock({
            id: "block_cancelled",
            runId: "run_api",
            ordinal: 3,
            status: "cancelled",
            text: "The scripted fixture cancelled this turn on purpose so cancelled styling is visible.",
          }),
        ]}
        queuedMessages={[
          queuedChatMessage(
            "message_queued",
            "run_queue",
            "Queued follow-up preview that is not attached to a live queue.",
          ),
        ]}
      />,
    );
    const emptyTranscriptHtml = renderToString(<ChatTranscript {...emptyTranscriptProps()} />);
    const searchHtml = renderToString(<ChatSearchBar search={openSearchController()} />);
    const composerHtml = renderToString(
      <Composer
        actions={selectedChatComposerActions(composerChat())}
        busy={false}
        running={false}
        runPresentation={idleRunPresentation}
        viewModel={selectedChatComposerViewModel(composerChat())}
      />,
    );
    const goalHtml = renderToString(
      <ConversationBody
        chat={conversationBodyChat({ goal: goalState("keep chat chrome narrow", "active") })}
        searchOpen={false}
        setSearchOpen={() => {}}
      />,
    );
    const chatErrorHtml = renderToString(
      <ChatPanel
        chat={conversationBodyChat({ error: "temporary chat error" })}
        searchOpen={false}
        setSearchOpen={() => {}}
        workspace={{ id: "workspace_api" } as Parameters<typeof ChatPanel>[0]["workspace"]}
      />,
    );

    expectReadableColumnElement(transcriptHtml, 'data-testid="chat-transcript-header"');
    expectReadableColumnElement(
      transcriptHtml,
      'data-chat-message="true"',
      'data-message-id="block_assistant"',
    );
    expect(transcriptHtml).toContain('data-testid="activity-group-header"');
    expect(transcriptHtml).toContain('data-activity-group-expanded="false"');
    expect(transcriptHtml).not.toContain('data-testid="run-activity-row"');
    expect(transcriptHtml).not.toContain('data-testid="run-activity-group"');
    for (const id of [
      "message_queued",
      "block_steering_message",
      "block_failed",
      "block_cancelled",
    ]) {
      expectReadableColumnElement(standaloneStatesHtml, `data-message-id="${id}"`);
    }
    expect(standaloneStatesHtml).toContain("Queued");
    expect(standaloneStatesHtml).toContain("Steering pending");
    expect(standaloneStatesHtml).toContain("error");
    expect(standaloneStatesHtml).toContain("cancelled");
    expectReadableColumnElement(goalHtml, 'data-testid="chat-goal-status"');
    expect(goalHtml).toContain("Goal active");
    const pendingGoalHtml = renderToString(
      <ConversationBody
        chat={conversationBodyChat({
          goal: goalState("existing goal", "active"),
          pendingGoalSubmission: {
            conversationId: "conversation_api",
            objective: "finish pending goal",
          },
        })}
        searchOpen={false}
        setSearchOpen={() => {}}
      />,
    );
    expectReadableColumnElement(
      pendingGoalHtml,
      'data-testid="chat-goal-status"',
      'data-goal-status="submitting"',
    );
    expect(pendingGoalHtml).toContain("Goal submitting");
    expect(pendingGoalHtml).toContain("finish pending goal");
    expectReadableColumnElement(chatErrorHtml);
    expect(chatErrorHtml).toContain("temporary chat error");
    expectReadableColumnElement(emptyTranscriptHtml, 'data-testid="empty-chat"');
    expectReadableColumnElement(searchHtml);
    expectReadableColumnElement(composerHtml);
  });
});

function expectReadableColumnElement(html: string, ...attributes: string[]) {
  const attributeLookaheads = [readableColumnAttribute, ...attributes]
    .map((attribute) => `(?=[^>]*${escapeRegExp(attribute)})`)
    .join("");
  expect(html).toMatch(new RegExp(`<[^>]*${attributeLookaheads}[^>]*>`, "u"));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

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
    retryActiveRunLiveness: async () => {},
    stopActiveRun: async () => {},
  };
}

function composerChat() {
  return {
    ...composerButtonChat(),
    activeRun: null,
    commandListError: null,
    commandListStatus: "ready",
    executeCommand: async () => {
      throw new Error("unexpected command execution in SSR test");
    },
    goal: null,
    listCommands: async () => ({ commands: [] }),
    openCodexModelPicker: async () => {
      throw new Error("unexpected model picker open in SSR test");
    },
    pendingSteeringMessageIds: [],
    queueMessage: async () => {},
    selectedConversation: {
      archivedAt: "",
      codexEffectiveSettings: {
        model: "scripted-fast",
        modelDisplayName: "Scripted Fast",
        permission: defaultEffectivePermissionSettings(),
        reasoningEffort: "medium",
        reasoningEffortDisplayName: "Medium",
        supportsImages: true,
      },
      codexSettings: {
        model: "scripted-fast",
        permission: null,
        reasoningEffort: "medium",
      },
      createdAt: "2026-05-29T20:00:00Z",
      harnessRefs: [],
      id: "conversation_api",
      internal: false,
      schemaVersion: 1,
      title: "API chat",
      updatedAt: "2026-05-29T20:00:00Z",
      workflow: null,
      workspaceId: "workspace_api",
      conversation: {
        id: "conversation_api",
      },
    },
    sendMessage: async () => {},
    sendSteeringImmediately: async () => {},
    status: "ready",
    steerMessage: async () => {},
  } as unknown as ConversationBodyProps["chat"];
}

function conversationBodyChat(
  overrides: Partial<ConversationBodyProps["chat"]> = {},
): ConversationBodyProps["chat"] {
  const chat = composerChat();
  return {
    ...chat,
    ...emptyTranscriptProps(),
    backgroundTerminalIdsByConversationId: {},
    backgroundTerminalOutputIdsByProcessId: {},
    backgroundTerminalOutputPagesByProcessId: {},
    backgroundTerminalOutputsById: {},
    backgroundTerminalsById: {},
    createConversation: async () => {},
    error: null,
    goal: null,
    pendingGoalSubmission: null,
    killAllBackgroundTerminals: async () => {},
    killBackgroundTerminal: async () => {},
    loadBackgroundTerminalOutput: async () => {},
    refreshBackgroundTerminals: async () => {},
    selectedConversation: chat.selectedConversation,
    status: "ready",
    transcriptBlocks: [],
    workspaceId: "workspace_api",
    ...overrides,
  } as unknown as ConversationBodyProps["chat"];
}

function emptyTranscriptProps(): ChatTranscriptProps {
  return {
    activeRun: null,
    activeRunLiveness: null,
    blocks: [],
    editQueuedMessage: async () => {},
    editingQueuedMessageId: null,
    hasMoreOlder: false,
    loadOlder: async () => {},
    loadRunItemOutput: async () => {},
    messages: [],
    operation: null,
    queuedMessages: [],
    removeQueuedMessage: async () => {},
    removingQueuedMessageId: null,
    runItemOutputIdsByRunItemId: {},
    runItemOutputPagesByRunItemId: {},
    runItemOutputsById: {},
    sendSteeringImmediately: async () => {},
    submitApproval: async () => {},
  };
}

const idleRunPresentation = {
  canRetry: false,
  canSteer: false,
  canStop: false,
  kind: "idle",
  liveness: null,
  running: false,
} satisfies ActiveRunPresentation;

const workingRunPresentation = {
  canRetry: false,
  canSteer: true,
  canStop: true,
  kind: "working",
  liveness: null,
  running: true,
} satisfies ActiveRunPresentation;

const lostRunPresentation = {
  canRetry: true,
  canSteer: false,
  canStop: true,
  kind: "lost",
  liveness: null,
  running: true,
} satisfies ActiveRunPresentation;

function defaultEffectivePermissionSettings() {
  return {
    activePermissionProfileExtends: "",
    activePermissionProfileId: ":workspace",
    approvalPolicy: "on-request",
    builtIn: true,
    displayLabel: "Ask for approval",
    preset: "default" as const,
  };
}

function selectedConversationWithPermission(displayLabel: string) {
  return {
    archivedAt: "",
    codexEffectiveSettings: {
      model: "scripted-fast",
      modelDisplayName: "Scripted Fast",
      permission: {
        ...defaultEffectivePermissionSettings(),
        activePermissionProfileId: ":workspace",
        builtIn: true,
        displayLabel,
        preset: "default",
      },
      reasoningEffort: "medium",
      reasoningEffortDisplayName: "Medium",
      supportsImages: true,
    },
    codexSettings: {
      model: "scripted-fast",
      permission: {
        approvalPolicy: "on-request",
        permissions: ":workspace",
        preset: "default",
      },
      reasoningEffort: "medium",
    },
    createdAt: "2026-05-29T20:00:00Z",
    harnessRefs: [],
    id: "conversation_api",
    internal: false,
    schemaVersion: 1,
    title: "API chat",
    updatedAt: "2026-05-29T20:00:00Z",
    workflow: null,
    workspaceId: "workspace_api",
  } as Parameters<typeof PermissionPickerButton>[0]["selectedConversation"];
}

function permissionPickerResult() {
  return {
    conversation: selectedConversationWithPermission("Ask for approval"),
    message: null,
    page: {
      blocks: [],
      conversation: selectedConversationWithPermission("Ask for approval"),
      goal: null,
      hasMoreOlder: false,
      messages: [],
      olderBeforeBlockOrdinal: 0,
      queue: { messages: [], runs: [] },
    },
    result: {
      action: "permission_picker",
      composerDraft: "",
      currentPermission: {
        ...defaultEffectivePermissionSettings(),
        activePermissionProfileId: ":workspace",
        builtIn: true,
        displayLabel: "Ask for approval",
        preset: "default",
      },
      goal: null,
      kind: "permission",
      message: "Choose a permission mode.",
      models: [],
      permissionPresets: [
        {
          activePermissionProfileId: ":read-only",
          approvalPolicy: "on-request",
          danger: null,
          disabled: false,
          disabledReason: "",
          id: "read-only",
          label: "Read Only",
          shortDescription: "Read files and ask before changes.",
        },
        {
          activePermissionProfileId: ":workspace",
          approvalPolicy: "on-request",
          danger: null,
          disabled: false,
          disabledReason: "",
          id: "default",
          label: "Ask for approval",
          shortDescription: "Ask before external writes.",
        },
        {
          activePermissionProfileId: ":danger-full-access",
          approvalPolicy: "never",
          danger: {
            confirmationBody: "Full filesystem access removes runtime approval prompts.",
            confirmationTitle: "Enable Full Access?",
            requiresConfirmation: true,
          },
          disabled: false,
          disabledReason: "",
          id: "full-access",
          label: "Full Access",
          shortDescription: "Full filesystem access.",
        },
      ],
      raw: "permission_picker",
      reasoningEfforts: [],
      selectedModel: "",
      selectedPermissionPreset: "default",
      selectedReasoningEffort: null,
      title: "Permission",
    },
  } as Parameters<typeof PermissionPickerButton>[0]["permissionPicker"];
}

function openSearchController(): TranscriptSearchController {
  return {
    activeIndex: 0,
    activeSearchId: null,
    close: () => {},
    inputRef: { current: null },
    matchCount: 0,
    next: () => {},
    open: true,
    previous: () => {},
    query: "hello",
    setQuery: () => {},
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

function commandCapability(available: boolean): ChatCommandDescriptor {
  return {
    available,
    description: "/goal",
    grammar: {
      arguments: [
        { description: "Open editor", kind: "literal", token: "edit" },
        {
          description: "Set objective",
          kind: "free_text",
          maxRunes: 4000,
          name: "objective",
          required: false,
        },
      ],
      literalMatch: "exact",
      summary: "/goal [objective|edit]",
    },
    kind: "goal",
    name: "/goal",
    unavailableReason: available ? "" : "unavailable",
  };
}
