import { Check, FolderOpen, Sparkles, Square, X } from "lucide-react";
import { useRef } from "react";

import {
  type ArtifactMetadata,
  type ConversationPaletteID,
  type ConversationPresentationProfile,
  type ConversationSnapshot,
  type ConversationTurn,
  type NarrationEvent,
  type NarratorState,
  type Subagent,
  type TopicConversation,
  type TrajectoryEvent,
} from "@generated/backend";

import { openVoiceProviderSelectionSettings } from "../../components/settings-navigation";
import type { ConversationProjection } from "../../stores/conversation-projection";
import type { PaneSpeechPresentation } from "../global-speech/global-speech-presentation";
import { conversationPaletteStyle } from "./conversation-palette-style";
import { ConversationApprovalPanel } from "./easy-button-approval-panel";
import {
  pendingConversationApproval,
  type PendingConversationApproval,
} from "./easy-button-approval-projection";
import { EasyButtonConversationComposer } from "./easy-button-conversation-composer";
import type { EasyButtonConversationCommands } from "./easy-button-conversation-commands";
import { conversationComposerBindings } from "./easy-button-conversation-composer-bindings";
import {
  conversationControlAction,
  type EasyButtonControlMode,
} from "./easy-button-conversation-control";
import {
  type EasyButtonNarratorStatusReply,
  latestNarratorStatusReply,
  NarratorDegradationStatus,
  narratorDegradationMessage,
} from "./easy-button-narrator-status";
import {
  EasyButtonForkLineageBanner,
  forkLineage,
  type EasyButtonForkLineage,
} from "./easy-button-lineage";
import {
  acceptedInputIntentSlot,
  conversationIntentSlot,
  type EasyButtonFocusStatus,
  type EasyButtonIntentSlot,
  IntentSlot,
  visibleIntentSlot,
} from "./easy-button-intent-slot";
import { useEasyButtonPaneTitle } from "./easy-button-pane-title";
import { EasyButtonPresentationChrome } from "./easy-button-presentation-chrome";
import { ArtifactRail, HighlightRail, type EasyButtonMilestone } from "./easy-button-rails";
import { EasyButtonSideConversation } from "./easy-button-side-conversation";
import { easyButtonSideView, type EasyButtonSideView } from "./easy-button-side-projection";
import {
  EasyButtonTerminalSummary,
  type EasyButtonTerminalSummaryRecord,
} from "./easy-button-terminal-summary";

type EasyButtonViewState = "idle" | "working" | "complete";
type EasyButtonStatusTone = "none" | "completed" | "failed" | "stopped";
type EasyButtonProjectionStatus = "unloaded" | "loading" | "ready" | "error" | "resyncing";

export interface EasyButtonProjectionView {
  activeAgentCount: number;
  archived: boolean;
  artifacts: ArtifactMetadata[];
  conversationId: string;
  currentFocus: string;
  error: string | null;
  eventCursorSequence: number;
  focusStatus: EasyButtonFocusStatus;
  helperCopy: string;
  intentSlot: EasyButtonIntentSlot;
  lineage: EasyButtonForkLineage | null;
  milestones: EasyButtonMilestone[];
  narratorDegradation: string | null;
  paletteId: ConversationPaletteID | null;
  pendingApproval: PendingConversationApproval | null;
  presentationProfile: ConversationPresentationProfile | null;
  projectionStatus: EasyButtonProjectionStatus;
  queuedTurnCount: number;
  statusTone: EasyButtonStatusTone;
  statusReply: EasyButtonNarratorStatusReply | null;
  side: EasyButtonSideView | null;
  terminalSummary: EasyButtonTerminalSummaryRecord | null;
  title: string;
  trajectoryEventCount: number;
  trajectoryHasEarlier: boolean;
  viewState: EasyButtonViewState;
  workspaceId: string | null;
}

export function easyButtonConversationProjection(
  conversations: ReadonlyMap<string, ConversationProjection>,
  conversationId: string,
): ConversationProjection | undefined {
  return conversations.get(conversationId);
}

function composerPlaceholder(
  view: EasyButtonProjectionView,
  commands: EasyButtonConversationCommands | undefined,
): string {
  if (commands?.folderResourceRequest) {
    return "Ask this topic agent...";
  }
  if (!commands?.available) {
    return unavailableComposerPlaceholder(view);
  }
  if (commands.clarificationQuestion) {
    return "Answer the narrator’s clarification…";
  }
  return view.viewState === "working" ? "Send another request…" : "Ask this topic agent…";
}

function unavailableComposerPlaceholder(view: EasyButtonProjectionView): string {
  if (view.archived) {
    return "Conversation archived";
  }
  return view.projectionStatus === "loading" || view.projectionStatus === "resyncing"
    ? "Loading conversation…"
    : "Conversation commands are unavailable";
}

export function EasyButtonProjectionSurface({
  commands,
  readOnly = false,
  speech,
  view,
}: {
  commands?: EasyButtonConversationCommands;
  readOnly?: boolean;
  speech?: PaneSpeechPresentation | null;
  view: EasyButtonProjectionView;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  useEasyButtonPaneTitle(rootRef, view);
  const intentSlot = projectedIntentSlot(view, commands, speech);

  return (
    <section
      aria-label={`Easy Button: ${view.title}`}
      className="conversation-presentation-identity easy-button-surface"
      data-conversation-id={view.conversationId}
      data-conversation-palette={view.paletteId ?? undefined}
      data-easy-button-archived={view.archived}
      data-easy-button-focus={view.focusStatus}
      data-easy-button-intent={intentSlot.state}
      data-easy-button-event-cursor={view.eventCursorSequence}
      data-easy-button-capture={speech?.captureState}
      data-easy-button-capture-scope={speech?.captureScope}
      data-easy-button-playback={speech?.playbackState}
      data-easy-button-playback-scope={speech?.playbackScope}
      data-easy-button-projection={view.projectionStatus}
      data-easy-button-queue-count={view.queuedTurnCount}
      data-easy-button-side-id={view.side?.id}
      data-easy-button-side-status={view.side?.status}
      data-easy-button-state={view.viewState}
      data-easy-button-status={view.statusTone}
      data-easy-button-trajectory-count={view.trajectoryEventCount}
      data-easy-button-trajectory-has-earlier={view.trajectoryHasEarlier}
      data-testid="easy-button-surface"
      ref={rootRef}
      style={conversationPaletteStyle(view.paletteId)}
    >
      <EasyButtonPresentationChrome
        archived={projectionSurfaceReadOnly(view, readOnly)}
        profile={view.presentationProfile}
        rootRef={rootRef}
        workspaceId={view.workspaceId}
      />
      <EasyButtonProjectionContent
        commands={commands}
        intentSlot={intentSlot}
        readOnly={readOnly}
        speech={speech}
        view={view}
      />
    </section>
  );
}

function projectedIntentSlot(
  view: EasyButtonProjectionView,
  commands: EasyButtonConversationCommands | undefined,
  speech: PaneSpeechPresentation | null | undefined,
): EasyButtonIntentSlot {
  const speechIntentSlot = visibleIntentSlot(view.currentFocus, view.intentSlot, speech);
  if (!commands?.pendingAcceptedInput || speechIntentSlot !== view.intentSlot) {
    return speechIntentSlot;
  }
  return acceptedInputIntentSlot(view.currentFocus, commands.pendingAcceptedInput);
}

function projectionSurfaceReadOnly(view: EasyButtonProjectionView, readOnly: boolean): boolean {
  return view.archived || readOnly;
}

function EasyButtonProjectionContent({
  commands,
  intentSlot,
  readOnly,
  speech,
  view,
}: {
  commands: EasyButtonConversationCommands | undefined;
  intentSlot: EasyButtonIntentSlot;
  readOnly: boolean;
  speech: PaneSpeechPresentation | null | undefined;
  view: EasyButtonProjectionView;
}) {
  if (view.side) {
    return (
      <EasyButtonSideConversation commands={commands} parentTitle={view.title} side={view.side} />
    );
  }
  return (
    <>
      <HighlightRail
        milestones={view.milestones}
        speakingMilestoneId={speech?.speakingSourceEventId ?? null}
        statusReply={view.statusReply}
      />
      <main className="easy-button-stage">
        <div className="easy-button-center">
          {view.lineage ? (
            <EasyButtonForkLineageBanner commands={commands} lineage={view.lineage} />
          ) : null}
          <div className="easy-button-agent-chip-slot">
            <AgentChip activeAgentCount={view.activeAgentCount} viewState={view.viewState} />
          </div>
          <ConversationControl
            commands={commands}
            readOnly={readOnly}
            speech={speech}
            view={view}
          />
          <CaptionSlot intentSlot={intentSlot} view={view} />
          <ConversationActionSlot commands={readOnly ? undefined : commands} view={view} />
        </div>
      </main>
      <ArtifactRail
        artifacts={view.artifacts}
        conversationId={view.conversationId}
        workspaceId={view.workspaceId}
      />
      <ConversationComposer commands={commands} readOnly={readOnly} speech={speech} view={view} />
    </>
  );
}

function ConversationControl({
  commands,
  readOnly,
  speech,
  view,
}: {
  commands: EasyButtonConversationCommands | undefined;
  readOnly: boolean;
  speech: PaneSpeechPresentation | null | undefined;
  view: EasyButtonProjectionView;
}) {
  const action = conversationControlAction(commands, readOnly, speech, {
    onOpenVoiceCredentialSettings: openVoiceProviderSelectionSettings,
  });
  return (
    <div className="easy-button-button-well">
      <SwirlField />
      <button
        aria-label={action.label}
        className="easy-button-control"
        data-easy-button-control-mode={action.mode}
        data-testid="easy-button-control"
        disabled={action.disabled}
        onClick={action.onClick}
        type="button"
      >
        <ControlGlyph mode={action.mode} statusTone={view.statusTone} viewState={view.viewState} />
      </button>
    </div>
  );
}

function ConversationActionSlot({
  commands,
  view,
}: {
  commands: EasyButtonConversationCommands | undefined;
  view: EasyButtonProjectionView;
}) {
  if (view.archived) {
    return <EmptyActionSlot />;
  }
  if (commands?.folderResourceRequest) {
    return (
      <FolderResourceActionSlot
        chooseFolder={commands.folderResourceRequest.chooseFolder}
        pending={commands.pending}
      />
    );
  }
  if (commands?.routingFailure) {
    return <RoutingRecoveryActionSlot commands={commands} />;
  }
  if (view.pendingApproval && commands) {
    return (
      <div className="easy-button-action-slot">
        <ConversationApprovalPanel
          approval={view.pendingApproval.approval}
          key={view.pendingApproval.approval.id}
          pending={commands.pending}
          submit={commands.submitApproval}
        />
      </div>
    );
  }
  if (view.queuedTurnCount > 0) {
    return (
      <div className="easy-button-action-slot">
        <span data-testid="easy-button-queue-count">{view.queuedTurnCount} queued</span>
      </div>
    );
  }
  return <EmptyActionSlot />;
}

function FolderResourceActionSlot({
  chooseFolder,
  pending,
}: {
  chooseFolder: () => void;
  pending: boolean;
}) {
  return (
    <div className="easy-button-action-slot easy-button-resource-request">
      <button
        data-testid="easy-button-folder-resource"
        disabled={pending}
        onClick={chooseFolder}
        type="button"
      >
        <FolderOpen aria-hidden="true" className="h-3.5 w-3.5" />
        Choose folder
      </button>
    </div>
  );
}

function RoutingRecoveryActionSlot({ commands }: { commands: EasyButtonConversationCommands }) {
  return (
    <div className="easy-button-action-slot easy-button-routing-recovery">
      {commands.routingFailure?.retryable ? (
        <button
          data-testid="easy-button-input-retry"
          disabled={commands.pending}
          onClick={commands.retryFailedInput}
          type="button"
        >
          Retry routing
        </button>
      ) : null}
      <button
        data-testid="easy-button-input-discard"
        disabled={commands.pending}
        onClick={commands.discardFailedInput}
        type="button"
      >
        Discard request
      </button>
    </div>
  );
}

function EmptyActionSlot() {
  return <div className="easy-button-action-slot" />;
}

function ConversationComposer({
  commands,
  readOnly,
  speech,
  view,
}: {
  commands: EasyButtonConversationCommands | undefined;
  readOnly: boolean;
  speech: PaneSpeechPresentation | null | undefined;
  view: EasyButtonProjectionView;
}) {
  const bindings = conversationComposerBindings(commands);
  const working = view.viewState === "working";
  const onStop = !readOnly && commands && !commands.pending ? commands.stop : undefined;
  return (
    <EasyButtonConversationComposer
      available={bindings.available}
      canSubmit={bindings.canSubmit}
      clarificationQuestion={commands?.clarificationQuestion ?? null}
      input={bindings.input}
      masterReply={commands?.masterReply ?? null}
      onInput={bindings.onInput}
      onStop={onStop}
      onSubmit={bindings.onSubmit}
      placeholder={
        readOnly
          ? "Workspace folder unavailable — conversation is read-only"
          : composerPlaceholder(view, commands)
      }
      showStop={working}
      speech={speech}
    />
  );
}

export function easyButtonProjectionView(
  conversationId: string,
  projection: ConversationProjection | undefined,
  paneId: string | null = null,
  parentTitle: string | null = null,
): EasyButtonProjectionView {
  if (!projection) {
    return unavailableView({
      conversationId,
      error: null,
      helperCopy: "Conversation projection is not loaded",
      projectionStatus: "unloaded",
    });
  }
  const projectionStatus = resolvedProjectionStatus(projection);
  if (!projection.snapshot) {
    return unavailableView({
      conversationId,
      error: projection.error,
      helperCopy: projectionHelperCopy(projectionStatus),
      projectionStatus,
    });
  }
  return projectConversationSnapshot(
    projection.snapshot,
    projection,
    projectionStatus,
    paneId,
    parentTitle,
  );
}

function projectConversationSnapshot(
  snapshot: ConversationSnapshot,
  projection: ConversationProjection,
  projectionStatus: EasyButtonProjectionStatus,
  paneId: string | null,
  parentTitle: string | null,
): EasyButtonProjectionView {
  const latestTurn = latestConversationTurn(snapshot.turns.turns);
  const runningTurnId = runningConversationTurnID(snapshot);
  const viewState = conversationViewState(snapshot.conversation, latestTurn);
  const statusTone = conversationStatusTone(snapshot.conversation, latestTurn);
  const focusStatus = narratorFocusStatus(snapshot.narratorState);
  return {
    activeAgentCount: activeAgentCount(snapshot, viewState),
    archived: snapshot.conversation.archivedAt !== null,
    artifacts: snapshot.artifacts.artifacts,
    conversationId: snapshot.conversation.id,
    currentFocus: snapshot.narratorState.currentFocus,
    error: conversationProjectionError(projection, latestTurn),
    eventCursorSequence: snapshot.eventCursor.sequence,
    focusStatus,
    helperCopy: conversationHelperCopy(snapshot.conversation, latestTurn, projectionStatus),
    intentSlot: conversationIntentSlot(snapshot, focusStatus),
    lineage: forkLineage(snapshot.branch, parentTitle),
    milestones: milestoneViews(snapshot.narration.events, snapshot.turns.turns),
    narratorDegradation: narratorDegradationMessage(snapshot.narratorState),
    paletteId: snapshot.presentationProfile.resolvedPaletteId,
    pendingApproval:
      snapshot.conversation.status === "waiting_for_approval" && runningTurnId
        ? pendingConversationApproval(snapshot.trajectory.events, runningTurnId)
        : null,
    presentationProfile: snapshot.presentationProfile,
    projectionStatus,
    queuedTurnCount: snapshot.queue.length,
    statusTone,
    statusReply: latestNarratorStatusReply(
      snapshot.narration.events,
      snapshot.conversation.lastTrajectorySequence,
    ),
    side: easyButtonSideView(snapshot, paneId),
    terminalSummary: terminalSummary(snapshot.narration.events, latestTurn, viewState),
    title: snapshot.conversation.title,
    trajectoryEventCount: snapshot.trajectory.events.length,
    trajectoryHasEarlier: snapshot.trajectory.hasEarlier,
    viewState,
    workspaceId: snapshot.conversation.workspaceId,
  };
}

function latestConversationTurn(turns: readonly ConversationTurn[]): ConversationTurn | null {
  const turn = turns.at(-1);
  return turn === undefined ? null : turn;
}

function runningConversationTurnID(snapshot: ConversationSnapshot): string | null {
  return snapshot.turns.turns.findLast((turn) => turn.status === "running")?.id ?? null;
}

function conversationProjectionError(
  projection: ConversationProjection,
  latestTurn: ConversationTurn | null,
): string | null {
  if (projection.error) {
    return projection.error;
  }
  if (latestTurn && latestTurn.error) {
    return latestTurn.error.message;
  }
  return null;
}

function unavailableView(options: {
  conversationId: string;
  error: string | null;
  helperCopy: string;
  projectionStatus: EasyButtonProjectionStatus;
}): EasyButtonProjectionView {
  return {
    activeAgentCount: 0,
    archived: false,
    artifacts: [],
    conversationId: options.conversationId,
    currentFocus: "",
    error: options.error,
    eventCursorSequence: 0,
    focusStatus: "none",
    helperCopy: options.helperCopy,
    intentSlot: {
      label: "Current focus",
      state: "stable",
      text: "",
    },
    lineage: null,
    milestones: [],
    narratorDegradation: null,
    paletteId: null,
    pendingApproval: null,
    presentationProfile: null,
    projectionStatus: options.projectionStatus,
    queuedTurnCount: 0,
    statusTone: "none",
    statusReply: null,
    side: null,
    terminalSummary: null,
    title: "Easy Button",
    trajectoryEventCount: 0,
    trajectoryHasEarlier: false,
    viewState: "idle",
    workspaceId: null,
  };
}

function resolvedProjectionStatus(projection: ConversationProjection): EasyButtonProjectionStatus {
  if (projection.resync) {
    return "resyncing";
  }
  return projection.status;
}

function projectionHelperCopy(status: EasyButtonProjectionStatus): string {
  switch (status) {
    case "unloaded":
      return "Conversation projection is not loaded";
    case "loading":
      return "Loading conversation…";
    case "ready":
      return "Conversation ready";
    case "error":
      return "Conversation could not be loaded";
    case "resyncing":
      return "Refreshing conversation…";
  }
}

function conversationViewState(
  conversation: TopicConversation,
  latestTurn: ConversationTurn | null,
): EasyButtonViewState {
  switch (conversation.status) {
    case "working":
    case "waiting_for_approval":
      return "working";
    case "failed":
      return "complete";
    case "idle":
      return latestTurn && terminalTurn(latestTurn) ? "complete" : "idle";
  }
}

function conversationStatusTone(
  conversation: TopicConversation,
  latestTurn: ConversationTurn | null,
): EasyButtonStatusTone {
  if (conversation.status === "failed" && !latestTurn) {
    return "failed";
  }
  if (!latestTurn) {
    return "none";
  }
  switch (latestTurn.status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "stopped";
    case "queued":
    case "running":
      return "none";
  }
}

function terminalTurn(turn: ConversationTurn): turn is ConversationTurn & {
  status: Extract<ConversationTurn["status"], "completed" | "cancelled" | "failed">;
} {
  switch (turn.status) {
    case "completed":
    case "cancelled":
    case "failed":
      return true;
    case "queued":
    case "running":
      return false;
  }
}

function narratorFocusStatus(state: NarratorState): EasyButtonFocusStatus {
  if (!state.currentFocus) {
    return "none";
  }
  switch (state.status) {
    case "ready":
      return "current";
    case "running":
      return "updating";
    case "degraded":
      return "stale";
  }
}

function conversationHelperCopy(
  conversation: TopicConversation,
  latestTurn: ConversationTurn | null,
  projectionStatus: EasyButtonProjectionStatus,
): string {
  if (projectionStatus !== "ready") {
    return projectionHelperCopy(projectionStatus);
  }
  if (conversation.archivedAt !== null) {
    return "Conversation archived";
  }
  switch (conversation.status) {
    case "working":
      return "";
    case "waiting_for_approval":
      return "Waiting for approval";
    case "failed":
      return "Conversation failed";
    case "idle":
      return terminalHelperCopy(latestTurn);
  }
}

function terminalHelperCopy(latestTurn: ConversationTurn | null): string {
  if (!latestTurn || !terminalTurn(latestTurn)) {
    return "Conversation ready";
  }
  switch (latestTurn.status) {
    case "completed":
      return "Ready for more work";
    case "cancelled":
      return "Work cancelled";
    case "failed":
      return "Work failed";
  }
}

function milestoneViews(
  narration: readonly NarrationEvent[],
  turns: readonly ConversationTurn[],
): EasyButtonMilestone[] {
  const startedAtByTurn = new Map(turns.map((turn) => [turn.id, turn.startedAt]));
  const milestones: EasyButtonMilestone[] = [];
  for (const event of narration) {
    if (event.kind !== "milestone" || !event.milestone) {
      continue;
    }
    milestones.push({
      at: event.createdAt,
      id: event.id,
      text: event.milestone.text,
      turnStartedAt: event.turnId ? (startedAtByTurn.get(event.turnId) ?? null) : null,
    });
  }
  return milestones;
}

function terminalSummary(
  narration: readonly NarrationEvent[],
  latestTurn: ConversationTurn | null,
  viewState: EasyButtonViewState,
): EasyButtonTerminalSummaryRecord | null {
  if (!latestTurn || viewState !== "complete" || !terminalTurn(latestTurn)) {
    return null;
  }
  const narrated = narratedTerminalSummary(narration, latestTurn);
  if (narrated) {
    return narrated;
  }
  return {
    id: `turn:${latestTurn.id}`,
    status: latestTurn.status,
    text: terminalFallbackText(latestTurn),
    turnId: latestTurn.id,
  };
}

function narratedTerminalSummary(
  narration: readonly NarrationEvent[],
  latestTurn: ConversationTurn & {
    status: Extract<ConversationTurn["status"], "completed" | "cancelled" | "failed">;
  },
): EasyButtonTerminalSummaryRecord | null {
  for (let index = narration.length - 1; index >= 0; index -= 1) {
    const event = narration[index];
    if (
      event &&
      event.kind === "final_summary" &&
      event.turnId === latestTurn.id &&
      event.finalSummary
    ) {
      return {
        id: event.id,
        status: latestTurn.status,
        text: event.finalSummary.text,
        turnId: latestTurn.id,
      };
    }
  }
  return null;
}

function terminalFallbackText(
  turn: ConversationTurn & {
    status: Extract<ConversationTurn["status"], "completed" | "cancelled" | "failed">;
  },
): string {
  switch (turn.status) {
    case "completed":
      return "Work completed.";
    case "cancelled":
      return "Work cancelled.";
    case "failed":
      return turn.error?.message ?? "Work failed.";
  }
}

function activeAgentCount(snapshot: ConversationSnapshot, viewState: EasyButtonViewState): number {
  if (viewState !== "working") {
    return 0;
  }
  const runningTurnId = runningConversationTurnID(snapshot);
  if (!runningTurnId) {
    return 0;
  }
  const subagents = latestSubagents(snapshot.trajectory.events, runningTurnId);
  let activeSubagents = 0;
  for (const subagent of subagents.values()) {
    if (subagent.status === "pending_init" || subagent.status === "running") {
      activeSubagents += 1;
    }
  }
  return 1 + activeSubagents;
}

function latestSubagents(
  events: readonly TrajectoryEvent[],
  turnId: string,
): Map<string, Subagent> {
  const subagents = new Map<string, Subagent>();
  for (const event of events) {
    if (event.turnId !== turnId) {
      continue;
    }
    const subagent = subagentFromEvent(event);
    if (subagent) {
      subagents.set(subagent.id, subagent);
    }
  }
  return subagents;
}

function subagentFromEvent(event: TrajectoryEvent): Subagent | null {
  return (
    event.subagentStarted?.subagent ??
    event.subagentUpdated?.subagent ??
    event.subagentCompleted?.subagent ??
    null
  );
}

function CaptionSlot({
  intentSlot,
  view,
}: {
  intentSlot: EasyButtonIntentSlot;
  view: EasyButtonProjectionView;
}) {
  return (
    <div className="easy-button-caption-slot">
      <IntentSlot slot={intentSlot} />
      {view.helperCopy ? (
        <p
          aria-live="polite"
          className="easy-button-helper"
          data-testid="easy-button-helper"
          role="status"
        >
          {view.helperCopy}
        </p>
      ) : null}
      <EasyButtonTerminalSummary summary={view.terminalSummary} />
      <NarratorDegradationStatus message={view.narratorDegradation} />
      <ErrorText error={view.error} />
    </div>
  );
}

function AgentChip({
  activeAgentCount,
  viewState,
}: {
  activeAgentCount: number;
  viewState: EasyButtonViewState;
}) {
  return (
    <span className="easy-button-agent-chip" data-testid="easy-button-agent-chip">
      {viewState === "working" ? agentLabel(activeAgentCount) : ""}
    </span>
  );
}

function ErrorText({ error }: Pick<EasyButtonProjectionView, "error">) {
  if (!error) {
    return null;
  }
  return (
    <p className="easy-button-error" data-testid="easy-button-error">
      {error}
    </p>
  );
}

function SwirlField() {
  return (
    <div aria-hidden="true" className="easy-button-swirl">
      <div className="easy-button-swirl-inner">
        <div className="easy-button-swirl-core" />
        <div className="easy-button-swirl-layer easy-button-swirl-layer-1" />
        <div className="easy-button-swirl-layer easy-button-swirl-layer-2" />
        <div className="easy-button-swirl-layer easy-button-swirl-layer-3" />
      </div>
    </div>
  );
}

function ControlGlyph({
  mode,
  statusTone,
  viewState,
}: {
  mode: EasyButtonControlMode;
  statusTone: EasyButtonStatusTone;
  viewState: EasyButtonViewState;
}) {
  if (mode === "stop-listening") {
    return (
      <Square
        aria-hidden="true"
        className="easy-button-glyph"
        data-easy-button-glyph="stop-listening"
      />
    );
  }
  if (viewState === "complete") {
    switch (statusTone) {
      case "completed":
        return (
          <Check
            aria-hidden="true"
            className="easy-button-glyph"
            data-easy-button-glyph="completed"
          />
        );
      case "failed":
        return (
          <X aria-hidden="true" className="easy-button-glyph" data-easy-button-glyph="failed" />
        );
      case "stopped":
        return (
          <Square
            aria-hidden="true"
            className="easy-button-glyph"
            data-easy-button-glyph="cancelled"
          />
        );
      case "none":
        return <Sparkles aria-hidden="true" className="easy-button-glyph" />;
    }
  }
  return <Sparkles aria-hidden="true" className="easy-button-glyph" />;
}
function agentLabel(activeAgentCount: number): string {
  return activeAgentCount === 1 ? "1 agent" : `${activeAgentCount} agents`;
}
