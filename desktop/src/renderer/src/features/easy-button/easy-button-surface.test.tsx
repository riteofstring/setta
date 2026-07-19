import type {
  ArtifactMetadata,
  ConversationPresentationProfile,
  ConversationSnapshot,
  ConversationTurn,
  NarrationEvent,
  NarratorState,
  PermissionProfile,
  ResolvedInvocation,
  Role,
  RoleProfile,
  SideConversation,
  SideConversationEvent,
  TopicConversation,
  TrajectoryApprovalRequest,
  TrajectoryEvent,
} from "@generated/backend";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ConversationProjection } from "../../stores/conversation-projection";
import { useConversationStore } from "../../stores/conversation-store";
import {
  EasyButtonProjectionSurface,
  EasyButtonSurface,
  easyButtonConversationProjection,
  easyButtonProjectionView,
} from "./easy-button-surface";
import { ConversationApprovalPanel } from "./easy-button-approval-panel";
import { EasyButtonConversationComposer } from "./easy-button-conversation-composer";
import {
  createEasyButtonTextConversationInput,
  requestEasyButtonSpeechCapture,
  type EasyButtonConversationCommands,
} from "./easy-button-conversation-commands";
import { conversationControlAction } from "./easy-button-conversation-control";
import { statusReplyPresentationTiming } from "./easy-button-narrator-status";

const [workspaceId, timestamp] = ["workspace_topic", "2026-07-11T20:00:00Z"] as const;

describe("Easy Button topic conversation projection", () => {
  beforeEach(() => {
    useConversationStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("selects only the conversation bound to the pane", () => {
    const working = workingSnapshot("conversation_alpha", "Alpha topic", "violet");
    const completed = completedSnapshot("conversation_beta", "Beta topic", "amber");
    useConversationStore.getState().hydrateSnapshot(workspaceId, working.conversation.id, working);
    useConversationStore
      .getState()
      .hydrateSnapshot(workspaceId, completed.conversation.id, completed);

    const projections = useConversationStore.getState().conversations;
    const alpha = renderToString(
      <EasyButtonProjectionSurface
        view={easyButtonProjectionView(
          working.conversation.id,
          easyButtonConversationProjection(projections, working.conversation.id),
        )}
      />,
    );
    const beta = renderToString(
      <EasyButtonProjectionSurface
        view={easyButtonProjectionView(
          completed.conversation.id,
          easyButtonConversationProjection(projections, completed.conversation.id),
        )}
      />,
    );

    expect(alpha).toContain('data-conversation-id="conversation_alpha"');
    expect(alpha).toContain('data-conversation-palette="violet"');
    expect(alpha).toContain("--conversation-accent-dark:oklch(0.76 0.125 290)");
    expect(alpha).toContain("--conversation-accent-light:oklch(0.48 0.14 290)");
    expect(alpha).toContain('data-easy-button-state="working"');
    expect(alpha).toContain("Implement Alpha topic");
    expect(alpha).toContain("Alpha topic milestone");
    expect(alpha).toContain("Alpha topic artifact");
    expect(alpha).not.toContain("Beta topic is complete");

    expect(beta).toContain('data-conversation-id="conversation_beta"');
    expect(beta).toContain('data-conversation-palette="amber"');
    expect(beta).toContain("--conversation-accent-dark:oklch(0.82 0.135 78)");
    expect(beta).toContain('data-easy-button-state="complete"');
    expect(beta).toContain("Beta topic is complete");
    expect(beta).not.toContain("Alpha topic milestone");
  });

  test("reports an unloaded bound pane without reading selected-workspace state", () => {
    const unloaded = renderToString(<EasyButtonSurface conversationId="conversation_unloaded" />);

    expect(unloaded).toContain('data-conversation-id="conversation_unloaded"');
    expect(unloaded).toContain('data-easy-button-projection="unloaded"');
    expect(unloaded).toContain("Conversation projection is not loaded");
  });

  test("keeps an archived conversation projection visible but read-only", () => {
    const snapshot = completedSnapshot("conversation_archived", "Archived topic", "sky");
    snapshot.conversation.archivedAt = "2026-07-11T20:01:00Z";
    snapshot.conversation.updatedAt = snapshot.conversation.archivedAt;
    useConversationStore
      .getState()
      .hydrateSnapshot(workspaceId, snapshot.conversation.id, snapshot);

    const view = easyButtonProjectionView(
      snapshot.conversation.id,
      easyButtonConversationProjection(
        useConversationStore.getState().conversations,
        snapshot.conversation.id,
      ),
    );
    const commands = archivedConversationCommands();
    const html = renderToString(<EasyButtonProjectionSurface commands={commands} view={view} />);

    expect(view.archived).toBe(true);
    expect(view.helperCopy).toBe("Conversation archived");
    expect(html).toContain('data-easy-button-archived="true"');
    expect(html).toContain("Conversation archived");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Retry routing");
    expect(html).not.toContain("Discard request");
  });

  test("routes a pane voice request through the bound conversation and source pane", async () => {
    const start = vi.fn(async () => {});

    await requestEasyButtonSpeechCapture(
      { start },
      "workspace_voice",
      "conversation_voice",
      "pane_voice",
    );

    expect(start).toHaveBeenCalledWith({
      destination: {
        conversationId: "conversation_voice",
        type: "conversation",
        workspaceId: "workspace_voice",
      },
      sourcePaneId: "pane_voice",
    });
  });

  test("creates one routed pane text input without changing the authored text", () => {
    expect(
      createEasyButtonTextConversationInput({
        conversationId: "conversation_text",
        id: "input_text",
        paneId: "pane_text",
        submittedAt: timestamp,
        text: "Keep this request exact",
      }),
    ).toEqual({
      conversationId: "conversation_text",
      id: "input_text",
      modality: "text",
      replyToInputId: null,
      sourcePaneId: "pane_text",
      submittedAt: timestamp,
      text: "Keep this request exact",
    });
  });

  test("canonicalizes generated pane text timestamps for durable receipt comparison", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-12T18:00:00.120Z"));

      expect(
        createEasyButtonTextConversationInput({
          conversationId: "conversation_text",
          id: "input_timestamp",
          paneId: "pane_text",
          text: "Keep this request exact",
        }).submittedAt,
      ).toBe("2026-07-12T18:00:00.12Z");
    } finally {
      vi.useRealTimers();
    }
  });

  test("keeps a working turn out of the terminal narration channel", () => {
    const snapshot = workingSnapshot("conversation_working", "Working topic", "sky");
    snapshot.narration.events.unshift(
      finalSummaryEvent("conversation_working", "turn_previous", "Stale prior summary", 1),
    );
    snapshot.trajectory.events.push(agentTextDelta(snapshot, "The agent is preparing details."));
    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));
    const html = renderToString(<EasyButtonProjectionSurface view={view} />);

    expect(view.viewState).toBe("working");
    expect(view.statusTone).toBe("none");
    expect(view.terminalSummary).toBeNull();
    expect(view.helperCopy).toBe("");
    expect(view.currentFocus).toBe("Implement Working topic");
    expect(html).toContain('data-easy-button-state="working"');
    expect(html).toContain("Implement Working topic");
    expect(html).not.toContain('data-testid="easy-button-helper"');
    expect(html).not.toContain('data-testid="easy-button-agent-text"');
    expect(html).not.toContain("The agent is preparing details.");
  });

  test("shows only a compact terminal fallback while waiting for narrator summary", () => {
    const snapshot = completedSnapshot("conversation_raw_done", "Raw done", "amber");
    snapshot.narration.events = [];
    snapshot.trajectory.events.push(
      agentMessageCompletedTrajectory(
        snapshot,
        "The repo contains 267,153 physical source lines across 846 files. Largest languages: Go, TypeScript, JavaScript, Rust, CSS. The full breakdown is in the emitted table.",
      ),
    );

    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));
    const html = renderToString(<EasyButtonProjectionSurface view={view} />);

    expect(view.terminalSummary?.id).toBe(`turn:${snapshot.turns.turns[0]!.id}`);
    expect(view.terminalSummary?.text).toBe("Work completed.");
    expect(html).toContain("Work completed.");
    expect(html).not.toContain("267,153 physical source lines");
  });

  test("renders the latest explicit narrator status reply without changing working state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T20:00:10Z"));
    const snapshot = workingSnapshot("conversation_status", "Status topic", "sky");
    snapshot.narration.events.push(
      statusReplyEvent(
        snapshot.conversation.id,
        snapshot.turns.turns[0]!.id,
        "What is happening?",
        "The topic agent is still implementing the requested change.",
        2,
      ),
    );

    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));
    const html = renderToString(<EasyButtonProjectionSurface view={view} />);

    expect(view.viewState).toBe("working");
    expect(view.statusReply).toEqual({
      createdAt: "2026-07-11T20:00:08Z",
      id: "status_conversation_status_2",
      question: "What is happening?",
      sourceSequenceEnd: 1,
      streamSequence: 2,
      text: "The topic agent is still implementing the requested change.",
    });
    expect(html).toContain('data-testid="easy-button-status-reply"');
    expect(html).toContain("STATUS");
    expect(html).not.toContain("What is happening?");
    expect(html).toContain("The topic agent is still implementing the requested change.");
    expect(html.indexOf('data-testid="easy-button-status-reply"')).toBeLessThan(
      html.indexOf('data-testid="easy-button-highlights"'),
    );
    vi.useRealTimers();
  });

  test("derives status reply presentation timing from the event timestamp", () => {
    const createdAt = "2026-07-11T20:00:08Z";

    expect(statusReplyPresentationTiming(createdAt, Date.parse("2026-07-11T20:00:10Z"))).toEqual({
      elapsedMs: 2_000,
      lifetimeMs: 20_000,
      remainingMs: 18_000,
    });
    expect(statusReplyPresentationTiming(createdAt, Date.parse("2026-07-11T20:00:28Z"))).toEqual({
      elapsedMs: 20_000,
      lifetimeMs: 20_000,
      remainingMs: 0,
    });
    expect(
      statusReplyPresentationTiming("not a timestamp", Date.parse("2026-07-11T20:00:10Z")),
    ).toBeNull();
  });

  test("replaces and expires explicit narrator status replies without adding NOW entries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T20:00:16Z"));
    const snapshot = workingSnapshot("conversation_status_replace", "Status replace", "sky");
    snapshot.narration.events.push(
      statusReplyEvent(
        snapshot.conversation.id,
        snapshot.turns.turns[0]!.id,
        "First status?",
        "The first status reply is stale.",
        2,
      ),
      {
        ...statusReplyEvent(
          snapshot.conversation.id,
          snapshot.turns.turns[0]!.id,
          "Second status?",
          "The second status reply is current.",
          3,
        ),
        createdAt: "2026-07-11T20:00:15Z",
        id: "status_latest",
      },
    );

    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));
    const html = renderToString(<EasyButtonProjectionSurface view={view} />);

    expect(view.statusReply?.id).toBe("status_latest");
    expect(view.milestones).toHaveLength(1);
    expect(html).toContain("The second status reply is current.");
    expect(html).not.toContain("The first status reply is stale.");

    vi.setSystemTime(new Date("2026-07-11T20:00:36Z"));
    const expired = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));

    expect(expired.statusReply).toBeNull();
    vi.useRealTimers();
  });

  test("treats later work narration as making a status reply stale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T20:00:10Z"));
    const snapshot = workingSnapshot("conversation_status_stale", "Status stale", "sky");
    snapshot.narration.events.push(
      statusReplyEvent(
        snapshot.conversation.id,
        snapshot.turns.turns[0]!.id,
        "Status?",
        "The status reply is about to become stale.",
        2,
      ),
      {
        ...milestoneEvent(
          snapshot.conversation.id,
          snapshot.turns.turns[0]!.id,
          "New work milestone",
          3,
        ),
        createdAt: "2026-07-11T20:00:09Z",
        id: "milestone_after_status",
      },
    );

    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));
    const html = renderToString(<EasyButtonProjectionSurface view={view} />);

    expect(view.statusReply).toBeNull();
    expect(html).not.toContain('data-testid="easy-button-status-reply"');
    expect(html).toContain("New work milestone");
    vi.useRealTimers();
  });

  test("uses the central intent slot for pending initial input until focus resolves", () => {
    const snapshot = workingSnapshot("conversation_pending_initial", "Initial request", "sky");
    snapshot.narratorState.currentFocus = "";
    snapshot.narratorState.currentFocusRevision = 0;
    snapshot.narratorState.currentFocusSourceSequence = 0;
    snapshot.narratorState.topicDescriptor = "";

    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));
    const html = renderToString(<EasyButtonProjectionSurface view={view} />);

    expect(view.intentSlot).toEqual({
      label: "You asked",
      state: "pending_initial",
      text: "Work on Initial request",
    });
    expect(html).toContain('data-easy-button-intent="pending_initial"');
    expect(html).toContain('data-easy-button-intent-state="pending_initial"');
    expect(html).toContain("You asked");
    expect(html).toContain("Work on Initial request");
  });

  test("restores the stable focus after the focus source covers the latest input", () => {
    const snapshot = workingSnapshot("conversation_stable_focus", "Stable topic", "sky");
    snapshot.narratorState.currentFocusSourceSequence = 1;

    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));

    expect(view.intentSlot).toEqual({
      label: "Current focus",
      state: "stable",
      text: "Implement Stable topic",
    });
  });

  test("uses the central intent slot for live follow-up transcription", () => {
    const snapshot = completedSnapshot("conversation_live_followup", "Live follow-up", "teal");
    snapshot.narratorState.currentFocusSourceSequence = 1;
    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));
    const html = renderToString(
      <EasyButtonProjectionSurface
        speech={{
          activityKind: "capture",
          activityLabel: "Listening for Live follow-up",
          captureScope: "this_pane",
          captureState: "recording",
          playbackScope: "none",
          playbackState: "idle",
          speakingSourceEventId: null,
          transcriptPreview: "Can you also compare CSS?",
          voiceControlDisabled: false,
          voiceControlLabel: "Finish this voice request",
          voiceControlSetupAction: null,
        }}
        view={view}
      />,
    );

    expect(html).toContain('data-easy-button-intent="capturing_followup"');
    expect(html).toContain("Listening to follow-up");
    expect(html).toContain("Can you also compare CSS?");
  });

  test("uses the central intent slot for accepted routed input until routing settles", () => {
    const snapshot = workingSnapshot("conversation_pending_route", "Pending route", "sky");
    snapshot.narratorState.currentFocusSourceSequence = 1;
    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));
    const commands: EasyButtonConversationCommands = {
      ...archivedConversationCommands(),
      pendingAcceptedInput: "What is the current status?",
    };

    const html = renderToString(<EasyButtonProjectionSurface commands={commands} view={view} />);

    expect(html).toContain('data-easy-button-intent="pending_followup"');
    expect(html).toContain("Follow-up");
    expect(html).toContain("What is the current status?");
    expect(html).not.toContain("Implement Pending route");
  });

  test("renders only the latest five milestones in the fading NOW window", () => {
    const snapshot = workingSnapshot("conversation_many_milestones", "Many milestones", "sky");
    snapshot.narration.events = Array.from({ length: 7 }, (_, index) =>
      milestoneEvent(
        snapshot.conversation.id,
        snapshot.turns.turns[0]!.id,
        `Milestone ${index + 1}`,
        index + 1,
      ),
    );
    snapshot.narration.events.forEach((event, index) => {
      event.id = `milestone_${index + 1}`;
      event.createdAt = `2026-07-11T20:00:${String(index + 1).padStart(2, "0")}Z`;
    });

    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));
    const html = renderToString(<EasyButtonProjectionSurface view={view} />);

    expect(view.milestones).toHaveLength(7);
    expect(html).toContain('data-easy-button-highlight-window-size="5"');
    expect(html).not.toContain("Milestone 1");
    expect(html).not.toContain("Milestone 2");
    expect(html).toContain("Milestone 3");
    expect(html).toContain('data-easy-button-highlight-age="4"');
    expect(html).toContain('data-easy-button-highlight-age="0"');
  });

  test("presents an isolated pane-scoped side conversation while retaining parent status", () => {
    const snapshot = workingSnapshot("conversation_side", "Parent topic", "sky");
    const side = sideConversation(snapshot, "pane_side");
    snapshot.sideConversations = [side];
    snapshot.sideEvents.events = sideConversationEvents(side);

    const boundView = easyButtonProjectionView(
      snapshot.conversation.id,
      readyProjection(snapshot),
      "pane_side",
    );
    const html = renderToString(<EasyButtonProjectionSurface view={boundView} />);

    expect(boundView.side).toMatchObject({
      id: side.id,
      parentStatus: "working",
      status: "active",
    });
    expect(boundView.side?.messages).toEqual([
      {
        id: "side_turn:user",
        role: "user",
        text: "Investigate the tangent",
        turnId: "side_turn",
      },
      {
        id: "side_turn:assistant",
        role: "assistant",
        text: "The tangent is isolated.",
        turnId: "side_turn",
      },
    ]);
    expect(html).toContain('data-testid="easy-button-side-conversation"');
    expect(html).toContain('data-parent-conversation-status="working"');
    expect(html).toContain("Parent:");
    expect(html).toContain("Working");
    expect(html).toContain("The tangent is isolated.");
    expect(html).not.toContain("Parent topic milestone");
  });

  test("presents a typed side-turn failure without failing the parent conversation", () => {
    const snapshot = workingSnapshot("conversation_side_failure", "Parent topic", "sky");
    const side = sideConversation(snapshot, "pane_side_failure");
    side.lastEventSequence = 2;
    snapshot.sideConversations = [side];
    snapshot.sideEvents.events = sideConversationFailureEvents(side);

    const view = easyButtonProjectionView(
      snapshot.conversation.id,
      readyProjection(snapshot),
      side.parentPaneId,
    );
    const html = renderToString(<EasyButtonProjectionSurface view={view} />);

    expect(view.viewState).toBe("working");
    expect(view.side).toMatchObject({ status: "active", turnActive: false });
    expect(view.side?.messages.at(-1)).toEqual({
      id: "side_turn:status",
      role: "status",
      text: "The side agent could not inspect that resource.",
      turnId: "side_turn",
    });
    expect(html).toContain('data-side-message-role="status"');
    expect(html).toContain("Turn status");
    expect(html).toContain("The side agent could not inspect that resource.");
  });

  test("bounds a long side transcript while preserving its earlier-activity signal", () => {
    const snapshot = workingSnapshot("conversation_long_side", "Long side", "sky");
    const side = sideConversation(snapshot, "pane_long_side");
    const eventLimit = snapshot.sideEvents.limit;
    side.lastEventSequence = eventLimit + 1;
    snapshot.sideConversations = [side];
    snapshot.sideEvents.hasEarlier = true;
    snapshot.sideEvents.events = Array.from({ length: eventLimit }, (_, index) => {
      const sequence = index + 2;
      const event = userInputTrajectory(
        side.id,
        `side_turn_${sequence}`,
        `side request ${sequence}`,
      );
      event.id = `side_trajectory_${sequence}`;
      event.sequence = sequence;
      return {
        event,
        parentConversationId: side.parentConversationId,
        sideConversationId: side.id,
        streamSequence: sequence,
      };
    });

    const view = easyButtonProjectionView(
      snapshot.conversation.id,
      readyProjection(snapshot),
      side.parentPaneId,
    );

    expect(view.side?.hasEarlierEvents).toBe(true);
    expect(view.side?.messages).toHaveLength(eventLimit);
    expect(view.side?.messages[0]?.text).toBe("Work on side request 2");
  });

  test("renders durable-fork lineage with a parent presentation control", () => {
    const snapshot = completedSnapshot("conversation_child", "Child topic", "amber");
    snapshot.branch = {
      childConversationId: snapshot.conversation.id,
      createdAt: timestamp,
      decisionSource: "conversation_router",
      forkedAtTurnId: "turn_parent",
      kind: "fork",
      parentConversationId: "conversation_parent",
      providerMetadata: {},
      sourceTrajectorySequence: 9,
    };
    const view = easyButtonProjectionView(
      snapshot.conversation.id,
      readyProjection(snapshot),
      null,
      "Parent topic",
    );
    const html = renderToString(<EasyButtonProjectionSurface view={view} />);

    expect(view.lineage).toMatchObject({
      parentConversationId: "conversation_parent",
      parentTitle: "Parent topic",
    });
    expect(html).toContain('data-testid="easy-button-fork-lineage"');
    expect(html).toContain('data-fork-parent-conversation-id="conversation_parent"');
    expect(html).toContain("Durable fork of");
    expect(html).toContain("Parent topic");
  });

  test("renders source-attributed global speech state in the bound pane", () => {
    const snapshot = workingSnapshot("conversation_speaking", "Speaking topic", "sky");
    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));
    const html = renderToString(
      <EasyButtonProjectionSurface
        speech={{
          activityKind: "speaking",
          activityLabel: "Narrator speaking",
          captureScope: "none",
          captureState: "idle",
          playbackScope: "this_conversation",
          playbackState: "speaking",
          speakingSourceEventId: "milestone_conversation_speaking",
          transcriptPreview: null,
          voiceControlDisabled: false,
          voiceControlLabel: "Start a voice request for this conversation",
          voiceControlSetupAction: null,
        }}
        view={view}
      />,
    );

    expect(html).toContain('data-easy-button-capture="idle"');
    expect(html).toContain('data-easy-button-playback="speaking"');
    expect(html).toContain('data-easy-button-playback-scope="this_conversation"');
    expect(html).toContain('data-easy-button-highlight-speaking="true"');
    expect(html).toContain('data-speech-activity="speaking"');
    expect(html).toContain("Narrator speaking");
  });

  test("stops a working run through the small composer control, not the giant button", () => {
    const stop = vi.fn();
    const working = renderToString(
      <EasyButtonConversationComposer
        available
        canSubmit
        input=""
        onInput={() => {}}
        onStop={stop}
        onSubmit={undefined}
        placeholder="Send another request…"
        showStop
        speech={null}
      />,
    );
    const idle = renderToString(
      <EasyButtonConversationComposer
        available
        canSubmit
        input=""
        onInput={() => {}}
        onSubmit={undefined}
        placeholder="Ask this topic agent…"
        speech={null}
      />,
    );

    expect(working).toContain('data-testid="easy-button-stop-run"');
    expect(working).toContain("Stop");
    expect(idle).not.toContain('data-testid="easy-button-stop-run"');
  });

  test("keeps the giant control the voice/talk affordance whenever it is not listening", () => {
    const requestVoiceCapture = vi.fn();
    const commands: EasyButtonConversationCommands = {
      ...archivedConversationCommands(),
      available: true,
      requestVoiceCapture,
      routingFailure: null,
    };

    const action = conversationControlAction(commands, false, null);

    expect(action.mode).toBe("talk");
    expect(action.disabled).toBe(false);
    expect(action.label).toBe("Start a voice request for this conversation");
    action.onClick?.();
    expect(requestVoiceCapture).toHaveBeenCalledOnce();
  });

  test("routes the giant control to voice setup when credentials are missing", () => {
    const openVoiceCredentialSettings = vi.fn();
    const requestVoiceCapture = vi.fn();
    const commands: EasyButtonConversationCommands = {
      ...archivedConversationCommands(),
      available: true,
      requestVoiceCapture,
      routingFailure: null,
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
      available: true,
      pending: true,
      requestVoiceCapture,
      routingFailure: null,
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
      available: true,
      requestVoiceCapture,
      routingFailure: null,
    };

    const action = conversationControlAction(commands, true, null);

    expect(action.mode).toBe("talk");
    expect(action.disabled).toBe(true);
    expect(action.onClick).toBeUndefined();
  });

  test("renders one Send action and no longer hosts a voice control in the composer", () => {
    const html = renderToString(
      <EasyButtonConversationComposer
        available
        canSubmit
        input="Investigate a tangent"
        onInput={() => {}}
        onSubmit={undefined}
        placeholder="Ask this topic agent…"
        speech={null}
      />,
    );

    expect(html).toContain('data-testid="easy-button-submit"');
    expect(html.match(/>Send<\/button>/g)).toHaveLength(1);
    expect(html).not.toMatch(/easy-button-(queue|steer|side-start|fork-start|status-request)/);
    expect(html).not.toContain('data-testid="easy-button-voice-capture"');
  });

  test("presents a local router clarification as a linked reply", () => {
    const html = renderToString(
      <EasyButtonConversationComposer
        available
        canSubmit
        clarificationQuestion="Which exact pane request should I send?"
        input="Send the clarified request"
        onInput={() => {}}
        onSubmit={() => {}}
        placeholder="Answer the narrator’s clarification…"
        speech={null}
      />,
    );

    expect(html).toContain('data-testid="easy-button-clarification"');
    expect(html).toContain("Which exact pane request should I send?");
    expect(html).toContain(">Send</button>");
    expect(html).not.toContain('data-testid="easy-button-voice-capture"');
  });

  test("projects approval, degradation, and resynchronization explicitly", () => {
    const snapshot = workingSnapshot("conversation_approval", "Approval topic", "teal");
    snapshot.conversation.status = "waiting_for_approval";
    snapshot.narratorState = {
      ...snapshot.narratorState,
      degradation: {
        code: "narrator_unavailable",
        degradedAt: timestamp,
        diagnosticReference: "diagnostic:narrator",
        message: "Narrator model is unavailable.",
        retryable: true,
      },
      status: "degraded",
    };
    const projection: ConversationProjection = {
      ...readyProjection(snapshot),
      resync: {
        detail: "event sequence gap",
        minimumCursor: { sequence: 2, streamId: conversationStreamId(snapshot.conversation.id) },
        reason: "event_sequence_gap",
      },
    };
    const view = easyButtonProjectionView(snapshot.conversation.id, projection);

    expect(view.projectionStatus).toBe("resyncing");
    expect(view.helperCopy).toBe("Refreshing conversation…");
    expect(view.focusStatus).toBe("stale");
    expect(view.narratorDegradation).toBe("Narrator model is unavailable.");
    expect(view.activeAgentCount).toBe(1);

    const html = renderToString(<EasyButtonProjectionSurface view={view} />);
    expect(html).toContain('data-testid="easy-button-narrator-status"');
    expect(html).toContain("Narrator model is unavailable.");
    expect(html).toContain("Implement Approval topic");
    expect(html).not.toContain("Narration degraded");
  });

  test("keeps loading and failed refresh state explicit while retaining a snapshot", () => {
    const snapshot = workingSnapshot("conversation_refresh", "Refresh topic", "green");
    const loading = easyButtonProjectionView(snapshot.conversation.id, {
      ...readyProjection(snapshot),
      status: "loading",
    });
    const failed = easyButtonProjectionView(snapshot.conversation.id, {
      ...readyProjection(snapshot),
      error: "Snapshot refresh failed.",
      status: "error",
    });

    expect(loading.projectionStatus).toBe("loading");
    expect(loading.helperCopy).toBe("Loading conversation…");
    expect(failed.projectionStatus).toBe("error");
    expect(failed.helperCopy).toBe("Conversation could not be loaded");
    expect(failed.error).toBe("Snapshot refresh failed.");
  });

  test("presents cancellation without success affordances", () => {
    const snapshot = completedSnapshot("conversation_cancelled", "Cancelled topic", "blue");
    snapshot.turns.turns[0] = {
      ...snapshot.turns.turns[0]!,
      resolvedInvocation: resolvedInvocation("agent", "cancelled"),
      status: "cancelled",
    };

    const html = renderToString(
      <EasyButtonProjectionSurface
        view={easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot))}
      />,
    );

    expect(html).toContain('data-easy-button-status="stopped"');
    expect(html).toContain('data-easy-button-glyph="cancelled"');
    expect(html).toContain('data-easy-button-control-mode="talk"');
    expect(html).toContain("Work cancelled");
    expect(html).not.toContain('data-easy-button-glyph="completed"');
  });

  test("does not present an unresolved approval from a terminal prior turn", () => {
    const snapshot = completedSnapshot("conversation_stale_approval", "Stale approval", "teal");
    const request = approvalRequest("approval_stale", true);
    snapshot.trajectory.events.push(
      approvalRequestedTrajectory(snapshot.conversation.id, snapshot.turns.turns[0]!.id, request),
    );
    snapshot.conversation.lastTrajectorySequence = 2;

    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));

    expect(view.pendingApproval).toBeNull();
  });

  test("renders secret structured input with a password control", () => {
    const approval = approvalRequest("approval_secret", true);
    approval.questions[0] = {
      ...approval.questions[0]!,
      allowsOther: false,
      options: ["fixed-secret"],
    };
    const html = renderToString(
      <ConversationApprovalPanel approval={approval} pending={false} submit={() => {}} />,
    );

    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="off"');
    expect(html).not.toContain("<select");
  });

  test("counts subagents only for the currently running turn", () => {
    const snapshot = workingSnapshot("conversation_subagent_scope", "Subagent scope", "teal");
    const running = snapshot.turns.turns[0]!;
    const prior = {
      ...running,
      endedAt: timestamp,
      id: "turn_prior",
      providerTurnId: "provider_turn_prior",
      resolvedInvocation: resolvedInvocation("agent", "succeeded"),
      status: "completed" as const,
    };
    snapshot.turns.turns = [prior, running];
    snapshot.trajectory.events.push(
      subagentStartedTrajectory(snapshot.conversation.id, prior.id, "subagent_prior", 2),
    );
    snapshot.conversation.lastTrajectorySequence = 2;

    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));

    expect(view.activeAgentCount).toBe(1);
  });
});

function archivedConversationCommands(): EasyButtonConversationCommands {
  return {
    available: false,
    canSubmit: false,
    clarificationQuestion: null,
    discardFailedInput: vi.fn(),
    disposeSide: vi.fn(),
    error: null,
    folderResourceRequest: null,
    input: "",
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
  };
}

function workingSnapshot(
  conversationId: string,
  title: string,
  palette: ConversationPresentationProfile["resolvedPaletteId"],
): ConversationSnapshot {
  const turn = conversationTurn(conversationId, "running");
  return conversationSnapshot(conversationId, title, palette, {
    artifacts: [artifact(conversationId, turn.id, title)],
    conversationStatus: "working",
    focus: `Implement ${title}`,
    narration: [milestoneEvent(conversationId, turn.id, `${title} milestone`, 1)],
    narratorStatus: "running",
    turn,
  });
}

function completedSnapshot(
  conversationId: string,
  title: string,
  palette: ConversationPresentationProfile["resolvedPaletteId"],
): ConversationSnapshot {
  const turn = conversationTurn(conversationId, "completed");
  return conversationSnapshot(conversationId, title, palette, {
    artifacts: [],
    conversationStatus: "idle",
    focus: `Completed ${title}`,
    narration: [finalSummaryEvent(conversationId, turn.id, `${title} is complete`, 1)],
    narratorStatus: "ready",
    turn,
  });
}

function conversationSnapshot(
  conversationId: string,
  title: string,
  palette: ConversationPresentationProfile["resolvedPaletteId"],
  options: {
    artifacts: ArtifactMetadata[];
    conversationStatus: TopicConversation["status"];
    focus: string;
    narration: NarrationEvent[];
    narratorStatus: NarratorState["status"];
    turn: ConversationTurn;
  },
): ConversationSnapshot {
  return {
    artifacts: { artifacts: options.artifacts, hasEarlier: false },
    branch: null,
    conversation: {
      archivedAt: null,
      createdAt: timestamp,
      id: conversationId,
      lastTrajectorySequence: 1,
      status: options.conversationStatus,
      title,
      topicDescriptor: `${title} descriptor`,
      updatedAt: timestamp,
      workspaceId,
    },
    eventCursor: { sequence: 0, streamId: conversationStreamId(conversationId) },
    narration: { events: options.narration, hasEarlier: false },
    narratorState: narratorState(conversationId, options.focus, options.narratorStatus),
    presentationProfile: presentationProfile(conversationId, palette),
    queue: [],
    roleProfileOverrides: [],
    schemaVersion: 1,
    sideConversations: [],
    sideEvents: { events: [], hasEarlier: false, limit: 200 },
    threadBinding: null,
    trajectory: {
      events: [userInputTrajectory(conversationId, options.turn.id, title)],
      hasEarlier: false,
    },
    turns: { hasEarlier: false, turns: [options.turn] },
  };
}

function conversationTurn(
  conversationId: string,
  status: Extract<ConversationTurn["status"], "running" | "completed">,
): ConversationTurn {
  const turnId = `turn_${conversationId}`;
  const invocation = resolvedInvocation("agent", status === "running" ? "running" : "succeeded");
  invocation.providerReferences.turnId = `provider_${turnId}`;
  return {
    acceptedAt: timestamp,
    authoredInput: { text: `Work on ${conversationId}` },
    conversationId,
    delivery: "normal",
    endedAt: status === "completed" ? timestamp : null,
    error: null,
    id: turnId,
    providerTurnId: invocation.providerReferences.turnId,
    requestedRoleProfile: invocation.requested,
    resolvedInvocation: invocation,
    startedAt: timestamp,
    status,
  };
}

function sideConversation(snapshot: ConversationSnapshot, parentPaneId: string): SideConversation {
  const invocation = resolvedInvocation("side_agent", "running");
  invocation.providerReferences.threadId = "provider_side_thread";
  return {
    activeProviderTurnId: null,
    activeTurnId: null,
    createdAt: timestamp,
    decisionSource: "conversation_router",
    disposedAt: null,
    failure: null,
    id: "side_conversation",
    lastEventSequence: 3,
    parentConversationId: snapshot.conversation.id,
    parentPaneId,
    parentStatus: snapshot.conversation.status,
    providerThreadId: "provider_side_thread",
    resolvedSideAgentInvocation: invocation,
    sourceProviderThreadId: "provider_parent_thread",
    sourceProviderTurnId: snapshot.turns.turns.at(-1)?.providerTurnId ?? null,
    sourceTrajectorySequence: snapshot.conversation.lastTrajectorySequence,
    status: "active",
    updatedAt: timestamp,
  };
}

function sideConversationEvents(side: SideConversation): SideConversationEvent[] {
  const user = userInputTrajectory(side.id, "side_turn", "side");
  user.userInputAccepted = {
    delivery: "normal",
    input: { text: "Investigate the tangent" },
  };
  const assistant = {
    ...user,
    actor: "agent" as const,
    agentMessageCompleted: {
      providerItemId: "provider_side_message",
      text: "The tangent is isolated.",
    },
    id: "side_trajectory_assistant",
    kind: "agent_message_completed" as const,
    sequence: 2,
    userInputAccepted: null,
  };
  const completed = {
    ...user,
    actor: "agent" as const,
    id: "side_trajectory_terminal",
    kind: "turn_completed" as const,
    sequence: 3,
    turnCompleted: {},
    userInputAccepted: null,
  };
  return [user, assistant, completed].map((event, index) => ({
    event,
    parentConversationId: side.parentConversationId,
    sideConversationId: side.id,
    streamSequence: index + 1,
  }));
}

function sideConversationFailureEvents(side: SideConversation): SideConversationEvent[] {
  const user = userInputTrajectory(side.id, "side_turn", "side");
  user.userInputAccepted = {
    delivery: "normal",
    input: { text: "Inspect the protected resource" },
  };
  const failed = {
    ...user,
    actor: "agent" as const,
    id: "side_trajectory_failed",
    kind: "turn_failed" as const,
    sequence: 2,
    turnFailed: {
      failure: {
        code: "side_turn_failed",
        diagnosticReference: "side_diagnostic",
        message: "The side agent could not inspect that resource.",
        retryable: true,
      },
    },
    userInputAccepted: null,
  };
  return [user, failed].map((event, index) => ({
    event,
    parentConversationId: side.parentConversationId,
    sideConversationId: side.id,
    streamSequence: index + 1,
  }));
}

function artifact(conversationId: string, turnId: string, title: string): ArtifactMetadata {
  return {
    conversationId,
    createdAt: timestamp,
    id: `artifact_${conversationId}`,
    kind: "file",
    title: `${title} artifact`,
    trajectorySequence: 1,
    turnId,
  };
}

function narratorState(
  conversationId: string,
  currentFocus: string,
  status: NarratorState["status"],
): NarratorState {
  return {
    checkpointText: "",
    checkpointThroughSequence: 0,
    conversationId,
    currentFocus,
    currentFocusRevision: 1,
    currentFocusSourceSequence: 1,
    degradation: null,
    lastInvocationAt: timestamp,
    observedThroughSequence: 1,
    status,
    topicDescriptor: `${conversationId} descriptor`,
    updatedAt: timestamp,
  };
}

function milestoneEvent(
  conversationId: string,
  turnId: string,
  text: string,
  streamSequence: number,
): NarrationEvent {
  return {
    conversationId,
    createdAt: "2026-07-11T20:00:05Z",
    finalSummary: null,
    id: `milestone_${conversationId}`,
    kind: "milestone",
    milestone: { text },
    resolvedInvocation: resolvedInvocation("narrator", "succeeded"),
    sourceSequenceEnd: 1,
    sourceSequenceStart: 1,
    statusReply: null,
    streamSequence,
    topicDescriptor: null,
    trigger: "plan_changed",
    turnId,
  };
}

function finalSummaryEvent(
  conversationId: string,
  turnId: string,
  text: string,
  streamSequence: number,
): NarrationEvent {
  return {
    conversationId,
    createdAt: "2026-07-11T20:00:10Z",
    finalSummary: { text },
    id: `summary_${conversationId}_${turnId}`,
    kind: "final_summary",
    milestone: null,
    resolvedInvocation: resolvedInvocation("narrator", "succeeded"),
    sourceSequenceEnd: 1,
    sourceSequenceStart: 1,
    statusReply: null,
    streamSequence,
    topicDescriptor: null,
    trigger: "turn_terminal",
    turnId,
  };
}

function statusReplyEvent(
  conversationId: string,
  turnId: string,
  question: string,
  text: string,
  streamSequence: number,
): NarrationEvent {
  return {
    conversationId,
    createdAt: "2026-07-11T20:00:08Z",
    finalSummary: null,
    id: `status_${conversationId}_${streamSequence}`,
    kind: "status_reply",
    milestone: null,
    resolvedInvocation: resolvedInvocation("narrator", "succeeded"),
    sourceSequenceEnd: 1,
    sourceSequenceStart: 1,
    statusReply: { question, text },
    streamSequence,
    topicDescriptor: null,
    trigger: "explicit_status_requested",
    turnId,
  };
}

function presentationProfile(
  conversationId: string,
  resolvedPaletteId: ConversationPresentationProfile["resolvedPaletteId"],
): ConversationPresentationProfile {
  return {
    conversationId,
    narratorSpeechEnabled: true,
    narratorVoiceReuse: null,
    narratorVoiceSelection: "auto_distinct",
    paletteReuse: null,
    paletteSelection: "auto_distinct",
    requestedNarratorVoiceId: null,
    requestedPaletteId: null,
    resolvedNarratorVoiceId: "alloy",
    resolvedPaletteId,
    updatedAt: timestamp,
  };
}

function userInputTrajectory(
  conversationId: string,
  turnId: string,
  title: string,
): TrajectoryEvent {
  return {
    actor: "user",
    activityCompleted: null,
    activityFailed: null,
    activityProgressed: null,
    activityStarted: null,
    agentLivenessChanged: null,
    agentMessageCompleted: null,
    agentPublicTextDelta: null,
    approvalRequested: null,
    approvalResolved: null,
    artifactEmitted: null,
    conversationId,
    emittedAt: timestamp,
    fileChangeCompleted: null,
    fileChangeProposed: null,
    id: `trajectory_${conversationId}`,
    kind: "user_input_accepted",
    modelRerouted: null,
    planChanged: null,
    providerEventId: null,
    providerLifecycleChanged: null,
    providerThreadId: null,
    providerTurnId: null,
    publicReasoningSummaryUpdated: null,
    sequence: 1,
    subagentCompleted: null,
    subagentStarted: null,
    subagentUpdated: null,
    turnCompleted: null,
    turnFailed: null,
    turnId,
    turnInterrupted: null,
    turnPromoted: null,
    turnQueued: null,
    turnStarted: null,
    turnSteered: null,
    userInputAccepted: { delivery: "normal", input: { text: `Work on ${title}` } },
  };
}

function agentTextDelta(snapshot: ConversationSnapshot, text: string): TrajectoryEvent {
  const base = userInputTrajectory(
    snapshot.conversation.id,
    snapshot.turns.turns[0]!.id,
    snapshot.conversation.title,
  );
  return {
    ...base,
    actor: "agent",
    agentPublicTextDelta: {
      delta: text,
      providerItemId: "provider_agent_text",
    },
    id: `trajectory_agent_text_${snapshot.conversation.id}`,
    kind: "agent_public_text_delta",
    sequence: base.sequence + 1,
    userInputAccepted: null,
  };
}

function agentMessageCompletedTrajectory(
  snapshot: ConversationSnapshot,
  text: string,
): TrajectoryEvent {
  const base = userInputTrajectory(
    snapshot.conversation.id,
    snapshot.turns.turns[0]!.id,
    snapshot.conversation.title,
  );
  return {
    ...base,
    actor: "agent",
    agentMessageCompleted: {
      providerItemId: "provider_agent_message",
      text,
    },
    id: `trajectory_agent_message_${snapshot.conversation.id}`,
    kind: "agent_message_completed",
    sequence: base.sequence + 1,
    userInputAccepted: null,
  };
}

function approvalRequestedTrajectory(
  conversationId: string,
  turnId: string,
  approval: TrajectoryApprovalRequest,
): TrajectoryEvent {
  return {
    ...userInputTrajectory(conversationId, turnId, "approval"),
    actor: "provider",
    approvalRequested: { approval },
    id: `trajectory_${approval.id}`,
    kind: "approval_requested",
    sequence: 2,
    userInputAccepted: null,
  };
}

function subagentStartedTrajectory(
  conversationId: string,
  turnId: string,
  subagentId: string,
  sequence: number,
): TrajectoryEvent {
  return {
    ...userInputTrajectory(conversationId, turnId, "subagent"),
    actor: "agent",
    id: `trajectory_${subagentId}`,
    kind: "subagent_started",
    sequence,
    subagentStarted: {
      subagent: {
        id: subagentId,
        message: "review",
        modelId: null,
        providerThreadId: subagentId,
        reasoningEffort: null,
        status: "running",
      },
    },
    userInputAccepted: null,
  };
}

function approvalRequest(id: string, secret: boolean): TrajectoryApprovalRequest {
  return {
    body: "Provide the requested scope.",
    command: null,
    cwd: null,
    filePaths: [],
    id,
    kind: "structured_input",
    providerItemId: `provider_${id}`,
    questions: [
      {
        allowsOther: secret,
        header: "Scope",
        id: "scope",
        options: secret ? [] : ["focused"],
        question: "Which scope?",
        secret,
      },
    ],
    requestedAt: timestamp,
    requestedPermissionProfile: null,
    title: "Scope",
  };
}

function resolvedInvocation(
  role: Role,
  outcome: ResolvedInvocation["outcome"],
): ResolvedInvocation {
  const requested = roleProfile(role);
  return {
    endedAt: outcome === "running" ? null : timestamp,
    failure: null,
    id: `invocation_${role}_${outcome}`,
    modelReroutes: [],
    outcome,
    provider: "codex",
    providerReferences: {
      requestId: null,
      responseId: null,
      threadId: `thread_${role}`,
      turnId: null,
    },
    requested,
    resolved: {
      modelId: "gpt-test",
      permissionProfile: requested.permissionProfile,
      reasoningEffort: "low",
      serviceTier: null,
    },
    role,
    startedAt: timestamp,
  };
}

function roleProfile(role: Role): RoleProfile {
  return {
    contextBudget: {
      maxInputBytes: 4_096,
      maxInputTokens: 1_024,
      reservedOutputTokens: 128,
    },
    modelSelection: { mode: "exact", modelId: "gpt-test" },
    permissionProfile: permissionProfile(),
    provider: "codex",
    reasoningEffort: "low",
    role,
    serviceTier: null,
  };
}

function permissionProfile(): PermissionProfile {
  return {
    approvalPolicy: "never",
    approvals: false,
    providerPermissionProfile: "read-only",
    toolAccess: { allowedTools: [], mode: "none" },
    workspaceMutation: false,
  };
}

function readyProjection(snapshot: ConversationSnapshot): ConversationProjection {
  return {
    conversationId: snapshot.conversation.id,
    error: null,
    resync: null,
    snapshot,
    status: "ready",
    workspaceId,
  };
}

function conversationStreamId(conversationId: string): string {
  return `conversation:${conversationId}`;
}
