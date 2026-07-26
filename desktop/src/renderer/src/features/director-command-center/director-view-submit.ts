import type { DirectorIntent } from "@generated/backend";

/**
 * Submitting what you typed.
 *
 * Every view submits to the Director. It briefly did not: input from a
 * workstream's view went to that conversation and the conversation router
 * decided what it meant. The router can reach outcomes this app has no surface
 * to finish — a clarification with nowhere to reply, a narrator answer nothing
 * renders, a side conversation with no viewer — and an unfinished clarification
 * is not merely lost. The backend routes the oldest unresolved input first, so
 * one of them wedges that conversation permanently.
 *
 * Steering a workstream is still reachable, through the Director's own
 * steer_work rather than through a second decision-maker.
 */
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
