import { Check, Sparkles, Square, X } from "lucide-react";
import { type CSSProperties, type RefObject, useEffect, useRef } from "react";

import {
  conversationPaletteCatalog,
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
import { useConversationStore } from "../../stores/conversation-store";
import { setHostPaneChromeTitle } from "../../workspace-layout/pane-title-metadata";
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
type ConversationPaletteStyle = CSSProperties & {
  "--conversation-accent-dark": string;
  "--conversation-accent-foreground-dark": string;
  "--conversation-accent-foreground-light": string;
  "--conversation-accent-light": string;
  "--conversation-focus-ring-dark": string;
  "--conversation-focus-ring-light": string;
};

interface EasyButtonSurfaceProps {
  conversationId: string | null;
}

export interface EasyButtonProjectionView {
  activeAgentCount: number;
  artifacts: Artifact[];
  conversationId: string | null;
  currentFocus: string;
  error: string | null;
  focusStatus: EasyButtonFocusStatus;
  helperCopy: string;
  milestones: EasyButtonMilestone[];
  narratorDegradation: string | null;
  paletteId: ConversationPaletteID | null;
  projectionStatus: EasyButtonProjectionStatus;
  statusTone: EasyButtonStatusTone;
  terminalSummary: EasyButtonTerminalSummaryRecord | null;
  title: string;
  viewState: EasyButtonViewState;
}

export function EasyButtonSurface({ conversationId }: EasyButtonSurfaceProps) {
  const projection = useConversationStore((state) =>
    easyButtonConversationProjection(state.conversations, conversationId),
  );
  const view = easyButtonProjectionView(conversationId, projection);
  return <EasyButtonProjectionSurface view={view} />;
}

export function easyButtonConversationProjection(
  conversations: ReadonlyMap<string, ConversationProjection>,
  conversationId: string | null,
): ConversationProjection | undefined {
  return conversationId ? conversations.get(conversationId) : undefined;
}

export function EasyButtonProjectionSurface({ view }: { view: EasyButtonProjectionView }) {
  const rootRef = useRef<HTMLElement | null>(null);
  useEasyButtonPaneTitle(rootRef, view);

  return (
    <section
      aria-label={`Easy Button: ${view.title}`}
      className="easy-button-surface"
      data-conversation-id={view.conversationId ?? undefined}
      data-conversation-palette={view.paletteId ?? undefined}
      data-easy-button-focus={view.focusStatus}
      data-easy-button-projection={view.projectionStatus}
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
          <div className="easy-button-button-well">
            <SwirlField />
            <button
              aria-label={conversationControlLabel(view)}
              className="easy-button-control"
              data-testid="easy-button-control"
              disabled
              type="button"
            >
              <ControlGlyph statusTone={view.statusTone} viewState={view.viewState} />
            </button>
          </div>
          <CaptionSlot view={view} />
          <div className="easy-button-action-slot" />
        </div>
      </main>
      <ArtifactRail artifacts={view.artifacts} />
      <div className="easy-button-footer">
        <div className="easy-button-input-wrap">
          <input
            aria-label="Easy Button request"
            className="easy-button-input"
            data-testid="easy-button-input"
            disabled
            placeholder="Conversation commands are unavailable"
            type="text"
          />
        </div>
      </div>
    </section>
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
  const latestTurn = snapshot.turns.turns.at(-1) ?? null;
  const viewState = conversationViewState(snapshot.conversation, latestTurn);
  const statusTone = conversationStatusTone(snapshot.conversation, latestTurn);
  return {
    activeAgentCount: activeAgentCount(snapshot, viewState),
    artifacts: snapshot.artifacts.artifacts,
    conversationId: snapshot.conversation.id,
    currentFocus: snapshot.narratorState.currentFocus,
    error: projection.error ?? latestTurn?.error?.message ?? null,
    focusStatus: narratorFocusStatus(snapshot.narratorState),
    helperCopy: conversationHelperCopy(snapshot.conversation, latestTurn, projectionStatus),
    milestones: milestoneViews(snapshot.narration.events, snapshot.turns.turns),
    narratorDegradation: snapshot.narratorState.degradation?.message ?? null,
    paletteId: snapshot.presentationProfile.resolvedPaletteId,
    projectionStatus,
    statusTone,
    terminalSummary: terminalSummary(snapshot.narration.events, latestTurn, viewState),
    title: snapshot.conversation.title,
    viewState,
  };
}

function unavailableView(options: {
  conversationId: string | null;
  error: string | null;
  helperCopy: string;
  projectionStatus: EasyButtonProjectionStatus;
}): EasyButtonProjectionView {
  return {
    activeAgentCount: 0,
    artifacts: [],
    conversationId: options.conversationId,
    currentFocus: "",
    error: options.error,
    focusStatus: "none",
    helperCopy: options.helperCopy,
    milestones: [],
    narratorDegradation: null,
    paletteId: null,
    projectionStatus: options.projectionStatus,
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
  latestTurn: ConversationTurn | null,
  viewState: EasyButtonViewState,
): EasyButtonTerminalSummaryRecord | null {
  if (!latestTurn || viewState !== "complete" || !terminalTurn(latestTurn)) {
    return null;
  }
  for (let index = narration.length - 1; index >= 0; index -= 1) {
    const event = narration[index];
    if (event?.kind === "final_summary" && event.turnId === latestTurn.id && event.finalSummary) {
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

function conversationPaletteStyle(
  paletteId: ConversationPaletteID | null,
): ConversationPaletteStyle | undefined {
  if (!paletteId) {
    return undefined;
  }
  const palette = conversationPaletteCatalog[paletteId];
  return {
    "--conversation-accent-dark": palette.dark.conversationAccent,
    "--conversation-accent-foreground-dark": palette.dark.conversationAccentForeground,
    "--conversation-accent-foreground-light": palette.light.conversationAccentForeground,
    "--conversation-accent-light": palette.light.conversationAccent,
    "--conversation-focus-ring-dark": palette.dark.conversationFocusRing,
    "--conversation-focus-ring-light": palette.light.conversationFocusRing,
  };
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
