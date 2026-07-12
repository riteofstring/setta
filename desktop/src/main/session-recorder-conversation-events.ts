import type { ConversationEvent } from "@generated/backend";

export const recordedConversationEventTypes = {
  "conversation.artifact.created": true,
  "conversation.branch.created": true,
  "conversation.invocation_attempted": true,
  "conversation.narration.created": true,
  "conversation.narrator_state.updated": true,
  "conversation.presentation_profile.updated": true,
  "conversation.queue.updated": true,
  "conversation.resync_required": true,
  "conversation.role_profile_override.removed": true,
  "conversation.role_profile_override.updated": true,
  "conversation.side_conversation.updated": true,
  "conversation.side_event.appended": true,
  "conversation.thread_binding.updated": true,
  "conversation.trajectory.appended": true,
  "conversation.turn.updated": true,
  "conversation.updated": true,
} satisfies Record<ConversationEvent["payload"]["type"], true>;
