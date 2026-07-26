import type { ConversationRouteDecisionKind, DirectorIntent } from "@generated/backend";
import type { SettaAPI } from "@shared/types";

/**
 * Submitting what you typed to the view you are looking at.
 *
 * On the Director's view that is a Director intent, as it has always been. On a
 * workstream's view it is that conversation's own input, and the router decides
 * what it means — send, steer, queue, answer, or ask for clarification.
 *
 * The router's choice is reported rather than assumed. A user typing at a
 * running workstream may mean "change what you are doing" or "do this next",
 * and a silent wrong guess is worse than the old design's inability to guess at
 * all, so the decision is waited for and named.
 */
export type DirectorViewSubmitResult = {
  /** What to show the reader about where their words went. */
  readonly receiptText: string;
};

const routeDecisionReceipts = {
  send_to_parent: "Sent to",
  queue_parent_turn: "Queued behind the run in",
  steer_parent_turn: "Steered",
  answer_as_narrator: "Answered from",
  create_side_conversation: "Opened a side thread beside",
  fork_conversation: "Forked",
  clarify: "Needs one clarification in",
} as const satisfies Record<ConversationRouteDecisionKind, string>;

export function directorRouteReceiptText(
  kind: ConversationRouteDecisionKind,
  workstreamTitle: string,
): string {
  return `${routeDecisionReceipts[kind]} “${workstreamTitle}”.`;
}

/**
 * Hands one submission to the conversation a workstream's work runs in.
 *
 * The wait is not politeness: the routing decision is the whole reason this is
 * safe to offer, so the caller does not report success until the router has
 * said what it did.
 */
export async function submitToWorkstreamConversation({
  conversationId,
  newInputId,
  now,
  setta,
  text,
  workstreamTitle,
}: {
  conversationId: string;
  newInputId: () => string;
  now: () => string;
  setta: SettaAPI;
  text: string;
  workstreamTitle: string;
}): Promise<DirectorViewSubmitResult> {
  const submitInput = setta.conversations.submitInput;
  const waitInputState = setta.conversations.waitInputState;
  if (submitInput === undefined || waitInputState === undefined) {
    throw new Error("this build cannot send input to a conversation");
  }
  const accepted = await submitInput({
    input: {
      conversationId,
      id: newInputId(),
      modality: "text",
      replyToInputId: null,
      submittedAt: now(),
      text,
    },
  });
  const routed = await waitInputState({
    conversationId,
    inputId: accepted.input.id,
    workspaceId: null,
  });
  const decision = routed.decisions.at(-1);
  if (decision === undefined) {
    // Routing that produced no decision is a failure to report, not a success
    // to summarize: the words were accepted and nothing has been decided about
    // them yet.
    return { receiptText: `Sent to “${workstreamTitle}”. Waiting on routing.` };
  }
  return { receiptText: directorRouteReceiptText(decision.decision.kind, workstreamTitle) };
}

/**
 * A fresh id for one submission.
 *
 * The conversation input contract is idempotent on this id, so it names one
 * submission rather than one conversation: a retry of the same words is a new
 * submission unless the caller deliberately reuses the id.
 */
export function directorConversationInputId(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `input_${random.replace(/[^A-Za-z0-9]/gu, "")}`;
}

/** The Director's own view keeps the intent it has always dispatched. */
export function directorSubmitIntent(text: string): DirectorIntent {
  return {
    cancelRun: null,
    createWorkstream: null,
    kind: "submit",
    moveSelection: null,
    resolveApproval: null,
    resolveResourceRequest: null,
    selectWorkstream: null,
    submit: { modality: "text", text },
  };
}
