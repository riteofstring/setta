import type {
  ConversationSnapshot,
  SideConversation,
  SideConversationEvent,
  TrajectoryEvent,
} from "@generated/backend";

type EasyButtonSideMessageRole = "assistant" | "user";
type EasyButtonSideTurnStatus = "working" | "completed" | "cancelled" | "failed";

interface EasyButtonSideMessage {
  id: string;
  role: EasyButtonSideMessageRole;
  text: string;
  turnId: string;
}

interface EasyButtonSideTurn {
  assistantText: string;
  id: string;
  status: EasyButtonSideTurnStatus;
  userText: string;
}

export interface EasyButtonSideView {
  failure: string | null;
  hasEarlierEvents: boolean;
  id: string;
  messages: EasyButtonSideMessage[];
  parentStatus: SideConversation["parentStatus"];
  status: SideConversation["status"];
  turnActive: boolean;
}

const maximumPresentedSideMessages = 200;

export function openSideConversationForPane(
  snapshot: ConversationSnapshot,
  paneId: string | null,
): SideConversation | null {
  if (!paneId) {
    return null;
  }
  let selected: SideConversation | null = null;
  for (const side of snapshot.sideConversations) {
    if (side.parentPaneId !== paneId || side.disposedAt !== null) {
      continue;
    }
    if (
      !selected ||
      side.updatedAt.localeCompare(selected.updatedAt) > 0 ||
      (side.updatedAt === selected.updatedAt && side.id.localeCompare(selected.id) > 0)
    ) {
      selected = side;
    }
  }
  return selected;
}

export function easyButtonSideView(
  snapshot: ConversationSnapshot,
  paneId: string | null,
): EasyButtonSideView | null {
  const side = openSideConversationForPane(snapshot, paneId);
  if (!side) {
    return null;
  }
  const events = snapshot.sideEvents.events.filter((event) => event.sideConversationId === side.id);
  const messages = sideMessages(events);
  return {
    failure: side.failure?.message ?? null,
    hasEarlierEvents:
      messages.length > maximumPresentedSideMessages ||
      (snapshot.sideEvents.hasEarlier && sideHasEarlierProjectedEvents(side, events)),
    id: side.id,
    messages: messages.slice(-maximumPresentedSideMessages),
    parentStatus: side.parentStatus,
    status: side.status,
    turnActive: side.activeTurnId !== null,
  };
}

function sideHasEarlierProjectedEvents(
  side: SideConversation,
  events: readonly SideConversationEvent[],
): boolean {
  const firstSequence = events[0]?.event.sequence;
  return firstSequence === undefined ? side.lastEventSequence > 0 : firstSequence > 1;
}

function sideMessages(events: readonly SideConversationEvent[]): EasyButtonSideMessage[] {
  const turns = sideTurns(events);
  const messages: EasyButtonSideMessage[] = [];
  for (const turn of turns) {
    if (turn.userText) {
      messages.push({
        id: `${turn.id}:user`,
        role: "user",
        text: turn.userText,
        turnId: turn.id,
      });
    }
    if (turn.assistantText) {
      messages.push({
        id: `${turn.id}:assistant`,
        role: "assistant",
        text: turn.assistantText,
        turnId: turn.id,
      });
    }
  }
  return messages;
}

function sideTurns(events: readonly SideConversationEvent[]): EasyButtonSideTurn[] {
  const turns = new Map<string, EasyButtonSideTurn>();
  for (const envelope of events) {
    const event = envelope.event;
    if (!event.turnId) {
      continue;
    }
    const turn = turns.get(event.turnId) ?? {
      assistantText: "",
      id: event.turnId,
      status: "working" as const,
      userText: "",
    };
    applySideEvent(turn, event);
    turns.set(turn.id, turn);
  }
  return [...turns.values()];
}

type SideEventHandler = (turn: EasyButtonSideTurn, event: TrajectoryEvent) => void;

const sideEventHandlers = {
  activity_completed: ignoreSideEvent,
  activity_failed: ignoreSideEvent,
  activity_progressed: ignoreSideEvent,
  activity_started: ignoreSideEvent,
  agent_liveness_changed: ignoreSideEvent,
  agent_message_completed(turn, event) {
    turn.assistantText = event.agentMessageCompleted?.text ?? turn.assistantText;
  },
  agent_public_text_delta(turn, event) {
    turn.assistantText += event.agentPublicTextDelta?.delta ?? "";
  },
  approval_requested: ignoreSideEvent,
  approval_resolved: ignoreSideEvent,
  artifact_emitted: ignoreSideEvent,
  file_change_completed: ignoreSideEvent,
  file_change_proposed: ignoreSideEvent,
  model_rerouted: ignoreSideEvent,
  plan_changed: ignoreSideEvent,
  provider_lifecycle_changed: ignoreSideEvent,
  public_reasoning_summary_updated: ignoreSideEvent,
  subagent_completed: ignoreSideEvent,
  subagent_started: ignoreSideEvent,
  subagent_updated: ignoreSideEvent,
  turn_completed(turn) {
    turn.status = "completed";
  },
  turn_failed(turn) {
    turn.status = "failed";
  },
  turn_interrupted(turn) {
    turn.status = "cancelled";
  },
  turn_promoted: ignoreSideEvent,
  turn_queued: ignoreSideEvent,
  turn_started: ignoreSideEvent,
  turn_steered: ignoreSideEvent,
  user_input_accepted(turn, event) {
    turn.userText = event.userInputAccepted?.input.text ?? turn.userText;
  },
} satisfies Record<TrajectoryEvent["kind"], SideEventHandler>;

function applySideEvent(turn: EasyButtonSideTurn, event: TrajectoryEvent): void {
  sideEventHandlers[event.kind](turn, event);
}

function ignoreSideEvent(): void {
  return;
}
