import { Check, Sparkles, Square, X } from "lucide-react";
import { type FormEvent, type RefObject, useEffect, useRef, useState } from "react";

import {
  type Artifact,
  type ConversationPaletteID,
  type ConversationApprovalAnswer,
  type ConversationSnapshot,
  type ConversationTurn,
  type NarrationEvent,
  type NarratorState,
  type Subagent,
  type TopicConversation,
  type TrajectoryApprovalDecision,
  type TrajectoryApprovalRequest,
  type TrajectoryEvent,
} from "@generated/backend";

import type { ConversationProjection } from "../../stores/conversation-projection";
import { useConversationStore } from "../../stores/conversation-store";
import {
  hydrateConversationProjectionSnapshot,
  retainConversationProjection,
} from "../../stores/conversation-projection-runtime";
import { setHostPaneChromeTitle } from "../../workspace-layout/pane-title-metadata";
import { conversationPaletteStyle } from "./conversation-palette-style";
import { ConversationApprovalPanel } from "./easy-button-approval-panel";
import { EasyButtonConversationComposer } from "./easy-button-conversation-composer";
import { ArtifactRail, HighlightRail, type EasyButtonMilestone } from "./easy-button-rails";
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
  workspaceId?: string | null;
}

interface PendingConversationApproval {
  approval: TrajectoryApprovalRequest;
  turnId: string;
}

export interface EasyButtonProjectionView {
  activeAgentCount: number;
  agentText: string;
  artifacts: Artifact[];
  conversationId: string | null;
  currentFocus: string;
  error: string | null;
  focusStatus: EasyButtonFocusStatus;
  helperCopy: string;
  milestones: EasyButtonMilestone[];
  narratorDegradation: string | null;
  paletteId: ConversationPaletteID | null;
  pendingApproval: PendingConversationApproval | null;
  projectionStatus: EasyButtonProjectionStatus;
  queuedTurnCount: number;
  statusTone: EasyButtonStatusTone;
  terminalSummary: EasyButtonTerminalSummaryRecord | null;
  title: string;
  viewState: EasyButtonViewState;
}

export function EasyButtonSurface({ conversationId, workspaceId }: EasyButtonSurfaceProps) {
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
    projection,
  );
  const projectedView = easyButtonProjectionView(conversationId, projection);
  const view = commands.error ? { ...projectedView, error: commands.error } : projectedView;
  return <EasyButtonProjectionSurface commands={commands} view={view} />;
}

export function easyButtonConversationProjection(
  conversations: ReadonlyMap<string, ConversationProjection>,
  conversationId: string | null,
): ConversationProjection | undefined {
  return conversationId ? conversations.get(conversationId) : undefined;
}

interface EasyButtonConversationCommands {
  available: boolean;
  canSubmit: boolean;
  error: string | null;
  input: string;
  pending: boolean;
  setInput: (input: string) => void;
  steer: () => void;
  stop: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  submitApproval: (
    approval: TrajectoryApprovalRequest,
    decision: TrajectoryApprovalDecision,
    answers: ConversationApprovalAnswer[],
  ) => void;
}

function useEasyButtonConversationCommands(
  workspaceId: string | null,
  conversationId: string | null,
  projection: ConversationProjection | undefined,
): EasyButtonConversationCommands {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = Boolean(
    workspaceId &&
    conversationId &&
    projection?.status === "ready" &&
    projection.snapshot &&
    !projection.resync,
  );
  const canSubmit = available && !pending && input.trim() !== "";

  async function run(
    command: () => Promise<ConversationSnapshot>,
    clearInput: boolean,
  ): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const snapshot = await command();
      hydrateConversationProjectionSnapshot(snapshot);
      if (clearInput) {
        setInput("");
      }
    } catch (commandError) {
      setError(errorMessage(commandError));
    } finally {
      setPending(false);
    }
  }

  function requireTarget(): { conversationId: string; workspaceId: string } {
    if (!available || !conversationId || !workspaceId) {
      throw new Error("Conversation commands require a ready topic conversation.");
    }
    return { conversationId, workspaceId };
  }

  return {
    available,
    canSubmit,
    error,
    input,
    pending,
    setInput,
    steer: () => {
      if (!canSubmit) {
        return;
      }
      const target = requireTarget();
      void run(() => window.setta.conversations.steer({ ...target, text: input.trim() }), true);
    },
    stop: () => {
      if (!available || pending) {
        return;
      }
      const target = requireTarget();
      void run(() => window.setta.conversations.stop(target), false);
    },
    submit: (event) => {
      event.preventDefault();
      if (!canSubmit) {
        return;
      }
      const target = requireTarget();
      const text = input.trim();
      const active =
        projection?.snapshot?.conversation.status === "working" ||
        projection?.snapshot?.conversation.status === "waiting_for_approval";
      void run(
        () =>
          active
            ? window.setta.conversations.queue({ ...target, text })
            : window.setta.conversations.send({ ...target, text }),
        true,
      );
    },
    submitApproval: (approval, decision, answers) => {
      if (!available || pending) {
        return;
      }
      const target = requireTarget();
      void run(
        () =>
          window.setta.conversations.submitApproval({
            ...target,
            response: {
              answers,
              approvalId: approval.id,
              decision,
              response: decision === "denied" ? "Denied in Easy Button" : "",
            },
          }),
        false,
      );
    },
  };
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
  return view.viewState === "working" ? "Queue or steer more work…" : "Ask this topic agent…";
}

export function EasyButtonProjectionSurface({
  commands,
  view,
}: {
  commands?: EasyButtonConversationCommands;
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
      data-easy-button-projection={view.projectionStatus}
      data-easy-button-queue-count={view.queuedTurnCount}
      data-easy-button-state={view.viewState}
      data-easy-button-status={view.statusTone}
      data-testid="easy-button-surface"
      ref={rootRef}
      style={conversationPaletteStyle(view.paletteId)}
    >
      <HighlightRail milestones={view.milestones} />
      <main className="easy-button-stage">
        <div className="easy-button-center">
          <div className="easy-button-agent-chip-slot">
            <AgentChip activeAgentCount={view.activeAgentCount} viewState={view.viewState} />
          </div>
          <ConversationControl commands={commands} view={view} />
          <CaptionSlot view={view} />
          <ConversationActionSlot commands={commands} view={view} />
        </div>
      </main>
      <ArtifactRail artifacts={view.artifacts} />
      <ConversationComposer commands={commands} view={view} />
    </section>
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
  view,
}: {
  commands: EasyButtonConversationCommands | undefined;
  view: EasyButtonProjectionView;
}) {
  const available = Boolean(commands && commands.available && !commands.pending);
  const input = commands ? commands.input : "";
  return (
    <EasyButtonConversationComposer
      available={available}
      canSubmit={commands ? commands.canSubmit : false}
      input={input}
      onInput={commands ? commands.setInput : undefined}
      onSteer={commands ? commands.steer : undefined}
      onSubmit={commands ? commands.submit : undefined}
      placeholder={composerPlaceholder(view, commands)}
      working={view.viewState === "working"}
    />
  );
}

export function easyButtonProjectionView(
  conversationId: string | null,
  projection: ConversationProjection | undefined,
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
  return projectConversationSnapshot(projection.snapshot, projection, projectionStatus);
}

function projectConversationSnapshot(
  snapshot: ConversationSnapshot,
  projection: ConversationProjection,
  projectionStatus: EasyButtonProjectionStatus,
): EasyButtonProjectionView {
  const latestTurn = latestConversationTurn(snapshot.turns.turns);
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
    helperCopy: conversationHelperCopy(snapshot.conversation, latestTurn, projectionStatus),
    milestones: milestoneViews(snapshot.narration.events, snapshot.turns.turns),
    narratorDegradation: narratorDegradationMessage(snapshot.narratorState),
    paletteId: snapshot.presentationProfile.resolvedPaletteId,
    pendingApproval: pendingConversationApproval(snapshot.trajectory.events),
    projectionStatus,
    queuedTurnCount: snapshot.queue.length,
    statusTone,
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

function narratorDegradationMessage(state: NarratorState): string | null {
  return state.degradation ? state.degradation.message : null;
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
    helperCopy: options.helperCopy,
    milestones: [],
    narratorDegradation: null,
    paletteId: null,
    pendingApproval: null,
    projectionStatus: options.projectionStatus,
    queuedTurnCount: 0,
    statusTone: "none",
    terminalSummary: null,
    title: "Easy Button",
    viewState: "idle",
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

function pendingConversationApproval(
  trajectory: readonly TrajectoryEvent[],
): PendingConversationApproval | null {
  const resolved = new Set<string>();
  for (let index = trajectory.length - 1; index >= 0; index -= 1) {
    const event = trajectory[index];
    if (!event) {
      continue;
    }
    const resolution = event.approvalResolved ? event.approvalResolved.resolution : null;
    if (resolution) {
      resolved.add(resolution.approvalId);
    }
    const approval = event.approvalRequested ? event.approvalRequested.approval : null;
    if (approval && event.turnId && !resolved.has(approval.id)) {
      return { approval, turnId: event.turnId };
    }
  }
  return null;
}

function activeAgentCount(snapshot: ConversationSnapshot, viewState: EasyButtonViewState): number {
  if (viewState !== "working") {
    return 0;
  }
  const subagents = latestSubagents(snapshot.trajectory.events);
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

function latestSubagents(events: readonly TrajectoryEvent[]): Map<string, Subagent> {
  const subagents = new Map<string, Subagent>();
  for (const event of events) {
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
      <EasyButtonTerminalSummary summary={view.terminalSummary} />
      <NarratorStatus message={view.narratorDegradation} />
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

function NarratorStatus({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return <p className="easy-button-narrator-status">Narration degraded — {message}</p>;
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

function useEasyButtonPaneTitle(
  rootRef: RefObject<HTMLElement | null>,
  view: EasyButtonProjectionView,
) {
  useEffect(() => {
    const host = rootRef.current?.closest<HTMLElement>('[data-testid="workspace-pane-host"]');
    if (!host) {
      return;
    }
    const suffix = paneTitleSuffix(view);
    const title = suffix ? `${view.title} · ${suffix}` : view.title;
    setHostPaneChromeTitle(host, {
      fullTitle: title,
      title,
      truncation: "end",
    });
  }, [rootRef, view]);
}

function paneTitleSuffix(view: EasyButtonProjectionView): string {
  if (view.projectionStatus === "binding_required") {
    return "conversation required";
  }
  if (view.projectionStatus === "loading" || view.projectionStatus === "resyncing") {
    return "loading";
  }
  switch (view.viewState) {
    case "working":
      return "working";
    case "complete":
      return "complete";
    case "idle":
      return "";
  }
}

function agentLabel(activeAgentCount: number): string {
  return activeAgentCount === 1 ? "1 agent" : `${activeAgentCount} agents`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Conversation command failed";
}
