import type { ConversationSnapshot, ConversationTurn, TrajectoryEvent } from "@generated/backend";

import type { PaneSpeechPresentation } from "../global-speech/global-speech-presentation";

export type EasyButtonFocusStatus = "none" | "current" | "updating" | "stale";

type EasyButtonIntentSlotState =
  | "stable"
  | "capturing_initial"
  | "pending_initial"
  | "capturing_followup"
  | "pending_followup";

export interface EasyButtonIntentSlot {
  label: string;
  state: EasyButtonIntentSlotState;
  text: string;
}

interface EasyButtonIntentInput {
  sequence: number;
  text: string;
}

export function conversationIntentSlot(
  snapshot: ConversationSnapshot,
  focusStatus: EasyButtonFocusStatus,
): EasyButtonIntentSlot {
  const latestInput = latestIntentInput(snapshot);
  if (latestInput && latestInput.sequence > snapshot.narratorState.currentFocusSourceSequence) {
    const pendingState =
      snapshot.narratorState.currentFocusRevision === 0 ? "pending_initial" : "pending_followup";
    return {
      label: intentSlotLabel(pendingState),
      state: pendingState,
      text: latestInput.text,
    };
  }
  return {
    label: "Current focus",
    state: "stable",
    text: focusStatus === "none" ? "" : snapshot.narratorState.currentFocus,
  };
}

export function visibleIntentSlot(
  currentFocus: string,
  intentSlot: EasyButtonIntentSlot,
  speech: PaneSpeechPresentation | null | undefined,
): EasyButtonIntentSlot {
  if (speech?.captureScope !== "this_pane" || !activeTopicCaptureStates.has(speech.captureState)) {
    return intentSlot;
  }
  const state = currentFocus.trim() ? "capturing_followup" : "capturing_initial";
  return {
    label: intentSlotLabel(state),
    state,
    text: speech.transcriptPreview ?? "",
  };
}

export function acceptedInputIntentSlot(currentFocus: string, text: string): EasyButtonIntentSlot {
  const state = currentFocus.trim() ? "pending_followup" : "pending_initial";
  return {
    label: intentSlotLabel(state),
    state,
    text,
  };
}

export function IntentSlot({ slot }: { slot: EasyButtonIntentSlot }) {
  return (
    <div
      aria-live="polite"
      className="easy-button-focus-block"
      data-easy-button-intent-state={slot.state}
      data-testid="easy-button-intent-slot"
    >
      <p className="easy-button-focus-label" data-testid="easy-button-focus-label">
        {slot.label}
      </p>
      <p className="easy-button-current-focus" data-testid="easy-button-current-focus">
        {slot.text}
      </p>
    </div>
  );
}

function latestIntentInput(snapshot: ConversationSnapshot): EasyButtonIntentInput | null {
  return (
    latestTrajectoryIntentInput(snapshot.trajectory.events) ??
    initialTurnIntentFallback(snapshot.turns.turns, snapshot.narratorState.currentFocusRevision)
  );
}

function latestTrajectoryIntentInput(
  events: readonly TrajectoryEvent[],
): EasyButtonIntentInput | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const candidate = trajectoryIntentInput(events[index]);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function trajectoryIntentInput(event: TrajectoryEvent | undefined): EasyButtonIntentInput | null {
  if (!event) {
    return null;
  }
  const text = trajectoryInputText(event).trim();
  if (!text) {
    return null;
  }
  return { sequence: event.sequence, text };
}

function trajectoryInputText(event: TrajectoryEvent): string {
  return event.turnSteered?.input.text ?? event.userInputAccepted?.input.text ?? "";
}

function initialTurnIntentFallback(
  turns: readonly ConversationTurn[],
  currentFocusRevision: number,
): EasyButtonIntentInput | null {
  if (currentFocusRevision !== 0) {
    return null;
  }
  const text = turns[turns.length - 1]?.authoredInput.text.trim() ?? "";
  if (!text) {
    return null;
  }
  return { sequence: Number.MAX_SAFE_INTEGER, text };
}

const activeTopicCaptureStates = new Set<PaneSpeechPresentation["captureState"]>([
  "committing",
  "draining",
  "recording",
  "requesting_permission",
]);

function intentSlotLabel(state: EasyButtonIntentSlotState): string {
  switch (state) {
    case "stable":
      return "Current focus";
    case "capturing_initial":
      return "Listening";
    case "pending_initial":
      return "You asked";
    case "capturing_followup":
      return "Listening to follow-up";
    case "pending_followup":
      return "Follow-up";
  }
}
