The app feels like one global assistant managing multiple durable topic conversations, each with its own lightweight narrator and heavy working agent.

### Starting from the app shell

The left sidebar lists every durable conversation, grouped by workspace. There is one row per conversation, whether it has zero, one, or several open panes.

At the top is `Ask Setta`. It opens the global master action overlay, which can
also be reached through a keyboard shortcut or app-chrome control. The fixed
shell microphone starts a voice request to the same master and opens the same
active interaction.

You can say or type:

> Bring up my recent conversation about speech routing.

The master searches your conversations, focuses an existing pane or opens one,
and tells you what it did. If multiple conversations might match, it asks a
clarification and keeps the overlay open.

The overlay is not a master chat and does not contain a list of previous master
requests. It shows only the current request, its progress, an unresolved
clarification when one exists, and the immediate result. A successful action
that opens or focuses a conversation clears the interaction and dismisses the
overlay so the destination is visible. An informational result remains only
until it is dismissed or replaced by a new request. Completed interactions do
not reappear as scrollback when the overlay is reopened.

Closing the overlay does not cancel routing. An unresolved clarification
survives close, reload, and restart and calls attention back to the overlay.
The hidden master session, inputs, route decisions, and audit records remain
durable without becoming user-facing transcript history.

### Working inside an Easy Button

Once a conversation is open, ordinary text or voice goes to that conversation’s lightweight narrator/router—not directly to the global master or heavy agent.

The narrator reads the conversation context and decides what the input means:

- Continue the current work.
- Queue a separate turn to run afterward.
- Steer the active turn in a new direction.
- Answer a status question itself.
- Open a temporary side conversation.
- Create a durable fork.
- Escalate an unrelated topic to the global master.
- Ask you to clarify.

You do not normally need to select one of these modes first. Explicit Send, Queue, Steer, Status, Side, and Fork actions remain available when you want guaranteed behavior.

### Queue versus steer

If the underlying agent is already working:

- “After that, also add tests” would normally be queued.
- “Stop using SQLite; use Postgres instead” would normally steer the current turn.

The narrator makes that semantic decision. If it genuinely cannot tell, it asks instead of silently guessing. Explicit Queue and Steer controls override the AI.

### Side conversations

A side conversation is for a related, temporary tangent:

> While it works, investigate whether Codex `/side` inherits the parent model.

The narrator can decide this belongs in `/side`. A separate side agent opens temporarily within the current pane while the parent agent continues working.

The side interaction:

- Receives relevant parent context.
- Cannot contaminate or steer the parent.
- Does not appear as a normal row in the conversation navigator.
- Is disposed when you leave it.
- Keeps the parent’s status visible.

The global master can also choose a side conversation. It first focuses or opens the relevant parent pane, then starts the side interaction there.

### Forked conversations

A fork is for a related direction that should become independent and permanent:

> Turn the speech-routing work into a separate architecture project.

The narrator or global master can decide this should be a fork. The fork inherits parent history through a validated completed turn, then becomes a full topic conversation with:

- Its own heavy agent.
- Its own narrator.
- Its own voice and color palette.
- Its own navigator row.
- Its own panes, underlying trajectory, and visible projection.

The parent and fork can continue concurrently without affecting each other.

### Switching to an unrelated topic

Suppose you say inside the speech-routing pane:

> Also, bring up the conversation where we planned the billing system.

The local narrator recognizes that this is not part of the current topic and escalates it to the global master. The master searches globally, focuses or opens the billing conversation, or asks a clarification.

The response appears back at the originating pane as needed, but it still uses
the one global master session—there is no separate per-pane master and the
escalation does not populate a master-history surface.

### What an Easy Button preserves and shows

The underlying topic conversation durably preserves all accepted inputs,
turns, steering, queueing, agent trajectory, narrator state, and provider
references for execution and reconstruction. That underlying history is not a
user-facing message transcript.

The Easy Button restores an evolving topic projection:

- The conversation title and identity.
- The narrator-controlled `Current focus`, initially derived from the first
  request and revised as later work changes the active objective.
- Accumulated NOW milestones and artifacts.
- Current work, queue, approval, error, and side-conversation state.
- The latest narrator status answer and latest terminal summary.

Later requests, queued inputs, and steering instructions do not appear as
message bubbles or a scrollback list. Their effects become visible through the
updated focus and projection. The worker, narrator, master, side agent, and
provider sessions do not receive separate transcript UIs.

The master is a coordinator. If an exchange becomes substantive enough to
need durable work, the master creates or routes to a topic conversation so its
result is represented by that topic's projection instead of a separate global
chat.

### Status and narration

While the heavy agent works, the narrator observes its authoritative trajectory and produces:

- Sparse NOW milestones when something meaningfully changes.
- Artifacts and approval states.
- A final summary.
- Immediate status answers when asked.

You can close every pane showing a conversation and its work continues. Reopening it restores the current projection.

### Voice behavior

Voice follows the surface where capture begins:

- Shell microphone → global master.
- Easy Button microphone → that conversation’s narrator/router.

One app-level speech controller owns the actual microphone, transcription, and
playback resources. “Global microphone” describes ownership and availability;
it does not mean every utterance goes to the master.

For this plan, the explicit shell interaction is click-to-talk: click the
fixed shell microphone control to enable it when necessary, open the active
master interaction, and begin capture; click the same control again to finish
and submit. The active transcript preview belongs to that one request. A
microphone started inside an Easy Button instead remains visibly bound to that
conversation.

The master has a stable voice, and every conversation narrator receives a stable, preferably distinct voice. Conversations also receive distinct color palettes, while duplicate panes showing the same conversation share its voice and palette.

Wake phrase and continuous-listening behavior remain future decisions. Merely
enabling the global microphone does not make the app continuously listen.
