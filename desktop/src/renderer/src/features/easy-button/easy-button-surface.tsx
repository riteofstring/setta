import { Check, Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef } from "react";

import {
  type Artifact,
  type ConversationPaletteID,
  type ConversationSnapshot,
  type ConversationTurn,
  type NarrationEvent,
  type NarratorState,
  type Subagent,
  type TopicConversation,
  type TrajectoryEvent,
} from "@generated/backend";

import type { ConversationProjection } from "../../stores/conversation-projection";
import { useConversationNavigatorStore } from "../../stores/conversation-navigator-store";
import { usePaneSpeechPresentation } from "../global-speech/app-shell-speech-status";
import type {
  GlobalSpeechPresentationSource,
  PaneSpeechPresentation,
} from "../global-speech/global-speech-presentation";
import type { SpeechCaptureRequester } from "../global-speech/speech-capture-destination";
import { useConversationStore } from "../../stores/conversation-store";
import { retainConversationProjection } from "../../stores/conversation-projection-runtime";
import { conversationPaletteStyle } from "./conversation-palette-style";
import { ConversationApprovalPanel } from "./easy-button-approval-panel";
import {
  pendingConversationApproval,
  type PendingConversationApproval,
} from "./easy-button-approval-projection";
import {
  EasyButtonConversationComposer,
  type EasyButtonForkPoint,
} from "./easy-button-conversation-composer";
import {
  type EasyButtonConversationCommands,
  useEasyButtonConversationCommands,
} from "./easy-button-conversation-commands";
import { conversationComposerBindings } from "./easy-button-conversation-composer-bindings";
import {
  type EasyButtonNarratorStatusReply,
  latestNarratorStatusReply,
  NarratorDegradationStatus,
  narratorDegradationMessage,
  NarratorStatusReply,
} from "./easy-button-narrator-status";
import {
  EasyButtonForkLineageBanner,
  forkLineage,
  type EasyButtonForkLineage,
} from "./easy-button-lineage";
import { useEasyButtonPaneTitle } from "./easy-button-pane-title";
import { ArtifactRail, HighlightRail, type EasyButtonMilestone } from "./easy-button-rails";
import { EasyButtonSideConversation } from "./easy-button-side-conversation";
import { easyButtonSideView, type EasyButtonSideView } from "./easy-button-side-projection";
import {
  EasyButtonTerminalSummary,
  type EasyButtonTerminalSummaryRecord,
} from "./easy-button-terminal-summary";

type EasyButtonViewState = "idle" | "working" | "complete";
type EasyButtonStatusTone = "none" | "completed" | "failed" | "stopped";
type EasyButtonFocusStatus = "none" | "current" | "updating" | "stale";
type EasyButtonProjectionStatus =
  | "binding_required"
  | "unloaded"
  | "loading"
  | "ready"
  | "error"
  | "resyncing";
interface EasyButtonSurfaceProps {
  conversationId: string | null;
  paneId?: string | null;
  speechCapture?: SpeechCaptureRequester;
  speechPresentation?: GlobalSpeechPresentationSource;
  workspaceId?: string | null;
}

export interface EasyButtonProjectionView {
  activeAgentCount: number;
  agentText: string;
  artifacts: Artifact[];
  conversationId: string | null;
  currentFocus: string;
  error: string | null;
  focusStatus: EasyButtonFocusStatus;
  forkPoints: EasyButtonForkPoint[];
  helperCopy: string;
  lineage: EasyButtonForkLineage | null;
  milestones: EasyButtonMilestone[];
  narratorDegradation: string | null;
  paletteId: ConversationPaletteID | null;
  pendingApproval: PendingConversationApproval | null;
  projectionStatus: EasyButtonProjectionStatus;
  queuedTurnCount: number;
  statusTone: EasyButtonStatusTone;
  statusReply: EasyButtonNarratorStatusReply | null;
  side: EasyButtonSideView | null;
  terminalSummary: EasyButtonTerminalSummaryRecord | null;
  title: string;
  viewState: EasyButtonViewState;
}

export function EasyButtonSurface({
  conversationId,
  paneId = null,
  speechCapture,
  speechPresentation,
  workspaceId,
}: EasyButtonSurfaceProps) {
  const projection = useConversationStore((state) =>
    easyButtonConversationProjection(state.conversations, conversationId),
  );
  useEffect(() => {
    if (!conversationId || !workspaceId) {
      return;
    }
    return retainConversationProjection(workspaceId, conversationId);
  }, [conversationId, workspaceId]);
  const commands = useEasyButtonConversationCommands(
    workspaceId ?? null,
    conversationId,
    paneId,
    projection,
    speechCapture,
  );
  const speech = usePaneSpeechPresentation(conversationId, paneId, speechPresentation);
  const parentTitle = useConversationNavigatorStore((state) => {
    const parentConversationId = projection?.snapshot?.branch?.parentConversationId;
    if (!workspaceId || !parentConversationId) {
      return null;
    }
    return (
      state.workspaces[workspaceId]?.items.find(
        (item) => item.conversation.id === parentConversationId,
      )?.conversation.title ?? null
    );
  });
  const projectedView = easyButtonProjectionView(conversationId, projection, paneId, parentTitle);
  const view = commands.error ? { ...projectedView, error: commands.error } : projectedView;
  return <EasyButtonProjectionSurface commands={commands} speech={speech} view={view} />;
}

export function easyButtonConversationProjection(
  conversations: ReadonlyMap<string, ConversationProjection>,
  conversationId: string | null,
): ConversationProjection | undefined {
  return conversationId ? conversations.get(conversationId) : undefined;
}

function composerPlaceholder(
  view: EasyButtonProjectionView,
  commands: EasyButtonConversationCommands | undefined,
): string {
  if (!commands?.available) {
    return view.projectionStatus === "loading" || view.projectionStatus === "resyncing"
      ? "Loading conversation…"
      : "Conversation commands are unavailable";
  }
  if (commands.clarificationQuestion) {
    return "Answer the narrator’s clarification…";
  }
  return view.viewState === "working" ? "Queue or steer more work…" : "Ask this topic agent…";
}

export function EasyButtonProjectionSurface({
  commands,
  speech,
  view,
}: {
  commands?: EasyButtonConversationCommands;
  speech?: PaneSpeechPresentation | null;
  view: EasyButtonProjectionView;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  useEasyButtonPaneTitle(rootRef, view);

  return (
    <section
      aria-label={`Easy Button: ${view.title}`}
      className="conversation-presentation-identity easy-button-surface"
      data-conversation-id={view.conversationId ?? undefined}
      data-conversation-palette={view.paletteId ?? undefined}
      data-easy-button-focus={view.focusStatus}
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
      data-testid="easy-button-surface"
      ref={rootRef}
      style={conversationPaletteStyle(view.paletteId)}
    >
      <EasyButtonProjectionContent commands={commands} speech={speech} view={view} />
    </section>
  );
}

function EasyButtonProjectionContent({
  commands,
  speech,
  view,
}: {
  commands: EasyButtonConversationCommands | undefined;
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
      <HighlightRail milestones={view.milestones} />
      <main className="easy-button-stage">
        <div className="easy-button-center">
          {view.lineage ? (
            <EasyButtonForkLineageBanner commands={commands} lineage={view.lineage} />
          ) : null}
          <div className="easy-button-agent-chip-slot">
            <AgentChip activeAgentCount={view.activeAgentCount} viewState={view.viewState} />
          </div>
          <ConversationControl commands={commands} view={view} />
          <CaptionSlot view={view} />
          <ConversationActionSlot commands={commands} view={view} />
        </div>
      </main>
      <ArtifactRail artifacts={view.artifacts} />
      <ConversationComposer commands={commands} speech={speech} view={view} />
    </>
  );
}

function ConversationControl({
  commands,
  view,
}: {
  commands: EasyButtonConversationCommands | undefined;
  view: EasyButtonProjectionView;
}) {
  const disabled = !commands || commands.pending || view.viewState !== "working";
  return (
    <div className="easy-button-button-well">
      <SwirlField />
      <button
        aria-label={conversationControlLabel(view)}
        className="easy-button-control"
        data-testid="easy-button-control"
        disabled={disabled}
        onClick={commands ? commands.stop : undefined}
        type="button"
      >
        <ControlGlyph statusTone={view.statusTone} viewState={view.viewState} />
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
  if (commands?.routingFailure) {
    return (
      <div className="easy-button-action-slot easy-button-routing-recovery">
        {commands.routingFailure.retryable ? (
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
  return <div className="easy-button-action-slot" />;
}

function ConversationComposer({
  commands,
  speech,
  view,
}: {
  commands: EasyButtonConversationCommands | undefined;
  speech: PaneSpeechPresentation | null | undefined;
  view: EasyButtonProjectionView;
}) {
  const bindings = conversationComposerBindings(commands);
  return (
    <EasyButtonConversationComposer
      available={bindings.available}
      canSubmit={bindings.canSubmit}
      clarificationQuestion={commands?.clarificationQuestion ?? null}
      forkPoints={view.forkPoints}
      input={bindings.input}
      onFork={bindings.onFork}
      onInput={bindings.onInput}
      onQueue={bindings.onQueue}
      onSend={bindings.onSend}
      onSide={bindings.onSide}
      onStatus={bindings.onStatus}
      onSteer={bindings.onSteer}
      onSubmit={bindings.onSubmit}
      onVoiceCapture={bindings.onVoiceCapture}
      placeholder={composerPlaceholder(view, commands)}
      speech={speech}
      working={view.viewState === "working"}
    />
  );
}

export function easyButtonProjectionView(
  conversationId: string | null,
  projection: ConversationProjection | undefined,
  paneId: string | null = null,
  parentTitle: string | null = null,
): EasyButtonProjectionView {
  if (!conversationId) {
    return unavailableView({
      conversationId: null,
      error: "This Easy Button pane is not bound to a topic conversation.",
      helperCopy: "Conversation binding required",
      projectionStatus: "binding_required",
    });
  }
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
  return {
    activeAgentCount: activeAgentCount(snapshot, viewState),
    agentText: latestAgentText(
      snapshot.trajectory.events,
      activeConversationTurnID(snapshot, latestTurn),
    ),
    artifacts: snapshot.artifacts.artifacts,
    conversationId: snapshot.conversation.id,
    currentFocus: snapshot.narratorState.currentFocus,
    error: conversationProjectionError(projection, latestTurn),
    focusStatus: narratorFocusStatus(snapshot.narratorState),
    forkPoints: completedForkPoints(snapshot.turns.turns),
    helperCopy: conversationHelperCopy(snapshot.conversation, latestTurn, projectionStatus),
    lineage: forkLineage(snapshot.branch, parentTitle),
    milestones: milestoneViews(snapshot.narration.events, snapshot.turns.turns),
    narratorDegradation: narratorDegradationMessage(snapshot.narratorState),
    paletteId: snapshot.presentationProfile.resolvedPaletteId,
    pendingApproval:
      snapshot.conversation.status === "waiting_for_approval" && runningTurnId
        ? pendingConversationApproval(snapshot.trajectory.events, runningTurnId)
        : null,
    projectionStatus,
    queuedTurnCount: snapshot.queue.length,
    statusTone,
    statusReply: latestNarratorStatusReply(snapshot.narration.events),
    side: easyButtonSideView(snapshot, paneId),
    terminalSummary: terminalSummary(
      snapshot.narration.events,
      snapshot.trajectory.events,
      latestTurn,
      viewState,
    ),
    title: snapshot.conversation.title,
    viewState,
  };
}

function latestConversationTurn(turns: readonly ConversationTurn[]): ConversationTurn | null {
  const turn = turns.at(-1);
  return turn === undefined ? null : turn;
}

function activeConversationTurnID(
  snapshot: ConversationSnapshot,
  latestTurn: ConversationTurn | null,
): string | null {
  const activeTurn = snapshot.turns.turns.findLast((turn) => turn.status === "running");
  if (activeTurn) {
    return activeTurn.id;
  }
  return latestTurn ? latestTurn.id : null;
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
  conversationId: string | null;
  error: string | null;
  helperCopy: string;
  projectionStatus: EasyButtonProjectionStatus;
}): EasyButtonProjectionView {
  return {
    activeAgentCount: 0,
    agentText: "",
    artifacts: [],
    conversationId: options.conversationId,
    currentFocus: "",
    error: options.error,
    focusStatus: "none",
    forkPoints: [],
    helperCopy: options.helperCopy,
    lineage: null,
    milestones: [],
    narratorDegradation: null,
    paletteId: null,
    pendingApproval: null,
    projectionStatus: options.projectionStatus,
    queuedTurnCount: 0,
    statusTone: "none",
    statusReply: null,
    side: null,
    terminalSummary: null,
    title: "Easy Button",
    viewState: "idle",
  };
}

function completedForkPoints(turns: readonly ConversationTurn[]): EasyButtonForkPoint[] {
  return turns
    .filter((turn) => turn.status === "completed" && turn.providerTurnId !== null)
    .toReversed()
    .map((turn) => ({
      label: forkPointLabel(turn),
      turnId: turn.id,
    }));
}

function forkPointLabel(turn: ConversationTurn): string {
  const input = turn.authoredInput.text.trim();
  if (input.length <= 72) {
    return input;
  }
  return `${input.slice(0, 69)}…`;
}

function resolvedProjectionStatus(projection: ConversationProjection): EasyButtonProjectionStatus {
  if (projection.resync) {
    return "resyncing";
  }
  return projection.status;
}

function projectionHelperCopy(status: EasyButtonProjectionStatus): string {
  switch (status) {
    case "binding_required":
      return "Conversation binding required";
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
  switch (conversation.status) {
    case "working":
      return "Working";
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
  trajectory: readonly TrajectoryEvent[],
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
  const agentMessage = agentTerminalSummary(trajectory, latestTurn);
  if (agentMessage) {
    return agentMessage;
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

function agentTerminalSummary(
  trajectory: readonly TrajectoryEvent[],
  latestTurn: ConversationTurn & {
    status: Extract<ConversationTurn["status"], "completed" | "cancelled" | "failed">;
  },
): EasyButtonTerminalSummaryRecord | null {
  for (let index = trajectory.length - 1; index >= 0; index -= 1) {
    const event = trajectory[index];
    if (
      event &&
      event.turnId === latestTurn.id &&
      event.agentMessageCompleted &&
      event.agentMessageCompleted.text.trim()
    ) {
      return {
        id: event.id,
        status: latestTurn.status,
        text: event.agentMessageCompleted.text,
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

function latestAgentText(events: readonly TrajectoryEvent[], turnId: string | null): string {
  if (!turnId) {
    return "";
  }
  let text = "";
  for (const event of events) {
    if (event.turnId !== turnId) {
      continue;
    }
    if (event.agentPublicTextDelta) {
      text += event.agentPublicTextDelta.delta;
    }
    if (event.agentMessageCompleted) {
      text = event.agentMessageCompleted.text;
    }
  }
  return text.trim();
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

function CaptionSlot({ view }: { view: EasyButtonProjectionView }) {
  return (
    <div className="easy-button-caption-slot">
      <CurrentFocus currentFocus={view.currentFocus} focusStatus={view.focusStatus} />
      <p
        aria-live="polite"
        className="easy-button-helper"
        data-testid="easy-button-helper"
        role="status"
      >
        {view.helperCopy}
      </p>
      {view.agentText ? (
        <p className="easy-button-agent-text" data-testid="easy-button-agent-text">
          {view.agentText}
        </p>
      ) : null}
      <NarratorStatusReply reply={view.statusReply} />
      <EasyButtonTerminalSummary summary={view.terminalSummary} />
      <NarratorDegradationStatus message={view.narratorDegradation} />
      <ErrorText error={view.error} />
    </div>
  );
}

function CurrentFocus({
  currentFocus,
  focusStatus,
}: Pick<EasyButtonProjectionView, "currentFocus" | "focusStatus">) {
  return (
    <div aria-live="polite" className="easy-button-focus-block">
      <p className="easy-button-focus-label" data-testid="easy-button-focus-label">
        {focusStatus === "updating" ? "Updating focus…" : "Current focus"}
      </p>
      <p className="easy-button-current-focus" data-testid="easy-button-current-focus">
        {focusStatus === "none" ? "" : currentFocus}
      </p>
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
  statusTone,
  viewState,
}: {
  statusTone: EasyButtonStatusTone;
  viewState: EasyButtonViewState;
}) {
  if (viewState === "working") {
    return (
      <Square aria-hidden="true" className="easy-button-glyph" data-easy-button-glyph="stop" />
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

function conversationControlLabel(view: EasyButtonProjectionView): string {
  if (view.viewState === "working") {
    return "Stop conversation work";
  }
  switch (view.statusTone) {
    case "completed":
      return "Conversation work completed";
    case "failed":
      return "Conversation work failed";
    case "stopped":
      return "Conversation work cancelled";
    case "none":
      return view.helperCopy;
  }
}

function agentLabel(activeAgentCount: number): string {
  return activeAgentCount === 1 ? "1 agent" : `${activeAgentCount} agents`;
}
