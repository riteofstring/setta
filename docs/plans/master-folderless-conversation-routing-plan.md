# Master Folderless Conversation Routing Plan

**Date:** 2026-07-23
**Status:** Plan of record for making the master agent able to find, focus, reopen, and route to
folderless conversations.

## Product Decision

The master pane must be the app-level UX. It must be able to understand and act on references to
prior conversations even when no folder is selected and even when the target conversation has no
folder resource binding.

Folderless conversations are normal Setta conversations. They are not temporary chats, not invisible
scratch state, and not second-class records. The user should be able to say things like:

- "Open the recent conversation where I asked what folder I was in."
- "Bring me back to the conversation about the local model."
- "Send this to the pane I was just using."
- "Start a new conversation about this."

The master should use conversation content, recency, open pane state, and clarification state to find
the target. It should not ask the user for a title when the user already gave enough semantic context.

## Triggering Failure

The current broken flow:

```text
User: Bring me to the conversation I had recently. I asked what folder I was in.
Master: Which conversation would you like to open?
User: I just told you.
Master: I need the conversation's title or another identifying detail to locate it.
User: That's your job. I told you what the contents of the conversation was.
Master: Do you mean the conversation where you asked which folder you were in?
User: Yeah, exactly.
Master: Please share the conversation title so I can open it.
```

This is unacceptable. The master inferred the right target but could not execute the focus/open
action.

## Root Cause

The app has moved to pane-first UX, but the master route/index path still contains workspace-era
authority assumptions.

Current concrete problems:

- `internal/master/route_service.go` builds candidate retrieval from active workspace ids.
- If there are no active workspaces, candidate retrieval returns an empty list.
- `internal/conversation/store_topic_index.go` deletes topic index documents for conversations with
  `WorkspaceID == nil`.
- `internal/conversation/store_master_routing.go` refuses to return master route targets for
  conversations with `WorkspaceID == nil`.
- `internal/conversationindex/contracts.go` requires `workspaceId` on stored topic cards and filters
  candidates by `workspaceIds`.
- `internal/master/route_context.go`, `route_decision.go`, and `route_command.go` model route
  candidates, targets, authorities, decisions, and presentation targets as workspace-owned.
- Clarification turns do not preserve a resolved target strongly enough for "yes, that one" to
  execute the action.

The result is that an existing folderless conversation pane can be visible in the UI while remaining
invisible to the master router.

## Hard Lines

This is a cutover. Do not implement compatibility scaffolding.

- No backward compatibility shims.
- No legacy workspace-only route target support.
- No dual-read or dual-write path for old index documents.
- No migration code for old derived topic index schema.
- No synthetic workspace id for folderless conversations.
- No fallback that silently selects or creates a workspace.
- No user-facing prompt that asks the user to recover from missing route/index state.

If a derived index or route-context table is incompatible, replace it and rebuild it from canonical
conversation records. If a developer-local database cannot boot because the canonical schema changed,
reset app data during development rather than adding compatibility code.

## Target Model

The master router should reason over app-level conversation targets, not workspace targets.

Use an explicit route scope:

```text
conversation target
  conversation id
  title
  status
  content excerpts
  open pane ids
  resource scope

resource scope
  folderless
  folder resource binding
  future runtime/capability binding
```

Workspace ids may still exist internally for local folder resources, but they are not the identity
of a conversation and they are not a prerequisite for search, focus, open, or ordinary chat.

Folderless route targets must support at least:

- focusing an existing conversation pane
- reopening a closed conversation pane
- answering globally from the master when no specific conversation is needed
- creating a new folderless conversation
- routing normal non-folder work to a folderless conversation
- asking for a folder resource only when the target action requires files

## Implementation Plan

### 1. Replace Workspace-Only Candidate Contracts

Replace the candidate/index contract so a topic card has an explicit resource scope instead of a
required `workspaceId`.

Required changes:

- Replace `CandidateRequest.WorkspaceIDs` with an app-scope filter that can include folderless and
  resource-bound conversations.
- Replace `StoredTopicCard.WorkspaceID string` with a typed resource scope.
- Update validation so folderless topic cards are valid.
- Keep deterministic ordering, recency limits, excerpt limits, and open-pane metadata.
- Regenerate generated TypeScript surfaces if contract generation is affected.

Do not keep `workspaceIds` as an alias.

### 2. Index Folderless Conversations

Change topic index rebuilding so folderless conversations produce searchable topic cards.

Required changes:

- Remove the `WorkspaceID == nil` delete path from topic index rebuilding.
- Store folderless scope in the topic card.
- Include recent user requests, recent final summaries, title, topic descriptor, updated timestamp,
  active status, and open pane ids for folderless conversations.
- Keep archived conversations out of master-visible search unless a separate product decision says
  archived search is wanted.

The topic index is derived state. Rebuild it from canonical conversations after the schema cutover.

### 3. Make Master Retrieval App-Scoped

Stop using active workspaces as the gate for whether the master can retrieve candidates.

Required behavior:

- Candidate retrieval runs even when there are zero active workspaces.
- Folderless conversations are always eligible for app-global master search.
- Resource-bound conversations are eligible when their resource binding is available.
- Open panes are included as strong context even if their conversations do not match the lexical
  query perfectly.
- Focus hints should come from the app-level pane scene, not from selected workspace state.

`AvailableActiveWorkspaceIDs()` may still inform local folder resource availability. It must not
decide whether app-level conversation retrieval happens.

### 4. Make Route Targets Folderless-Capable

Change master route targets, candidate contexts, audits, and command validation so a target can be
folderless.

Required changes:

- Replace `RouteConversationTarget.WorkspaceID string` with explicit resource scope data.
- Replace `RouteCandidateContext.WorkspaceID string` and `WorkspaceName` assumptions with scope
  data suitable for folderless and resource-bound conversations.
- Replace target authority validation that assumes every conversation id maps to a workspace id.
- Update allowed decision kind calculation so folderless conversations can be focused, opened, and
  used for supported folderless turns.
- Preserve strict authority checks: the model may select only supplied conversation ids and allowed
  decision kinds.

Do not permit the model to invent resource bindings, workspace ids, pane ids, or filesystem paths.

### 5. Present Conversation Panes From Resource Bindings

Make master route commands and presentation intents open/focus conversation panes from trusted app
state instead of a required workspace id.

Required changes:

- Replace `ConversationPresentationTarget.WorkspaceID string` with explicit resource bindings and
  resource scope.
- Folderless presentation targets use an empty resource binding list.
- Focus prefers an existing open pane id when available.
- Reopen creates an app-level conversation pane for the existing durable conversation when no pane is
  currently open.
- Resource-bound conversations still carry their folder resource binding into the pane config.
- Topic-conversation reads/subscriptions resolve workspace ids only when a folder resource binding
  exists.

The focus/open operation must not select a workspace first.

### 6. Preserve Clarification State

Fix clarification so the master can ask a targeted question and then act on the answer.

Required behavior:

- A clarification command can carry bounded, validated candidate target ids.
- The following master input receives the unresolved clarification context.
- If the user confirms a single candidate, the router focuses/opens/routes to that candidate instead
  of asking for a title.
- If the user rejects the candidate or adds new identifying information, the router uses the new
  input plus the preserved context.
- Clarification state is durable across reload while unresolved.

Do not implement brittle keyword heuristics as the primary fix. Use typed clarification state plus
the structured router.

### 7. Keep Folder Requests On Demand

Folderless search/open/chat must not force folder selection.

Required behavior:

- "Open that conversation" works without a folder.
- "Start a new conversation about X" works without a folder.
- "What folder am I in?" can be answered product-safely without selecting a folder.
- "Edit files in this repo" from a folderless conversation asks for a folder resource only at the
  point file access is required.

The missing-folder path remains a typed resource request, not an internal error and not a blocker for
all folderless conversation UX.

### 8. Verify Through Production Paths

Because this touches master routing, topic-conversation state, pane presentation, generated
contracts, IPC/preload, renderer state, HTTP, and persistence, deterministic Electron E2E coverage is
required.

Required tests:

- Fresh app startup with no selected folder can submit to the master.
- A folderless conversation can be created without picking a folder.
- A folderless conversation containing "what folder am I in" is indexed and master-searchable.
- From the master, "open the recent conversation where I asked what folder I was in" focuses the
  existing folderless pane without asking for a title.
- The same request reopens the folderless conversation after its pane has been closed.
- If the master asks "Do you mean the conversation where you asked which folder you were in?", a
  user confirmation focuses/opens that conversation.
- Folder-dependent work from the same folderless conversation still produces a typed folder resource
  request.
- No test path selects a workspace merely to make master routing work.

Also add focused backend tests for:

- folderless topic card indexing
- app-scoped candidate retrieval with zero active workspaces
- folderless route target reads
- route authority validation for folderless targets
- clarification target preservation

Run generated contract updates where needed, then run the narrowest relevant checks first. Before
committing source changes, run `./scripts/format.sh` and `./check_quality.sh --git-changes`.

## Deletion Targets

Delete or replace these workspace-first assumptions:

- `CandidateRequest.WorkspaceIDs`
- required `StoredTopicCard.WorkspaceID`
- folderless topic index deletion
- `ReadMasterRouteTarget` returning not found for `WorkspaceID == nil`
- route target filtering by active workspace ids
- route context candidate/target workspace authority as the only valid authority shape
- route commands that require `ConversationPresentationTarget.WorkspaceID`
- clarification flows that ask for a title after a single candidate has already been confirmed

## Success Criteria

The plan is complete when:

- The master can find folderless conversations by content.
- The master can focus an existing folderless conversation pane.
- The master can reopen a closed folderless conversation pane.
- The master can act after a targeted clarification confirmation.
- The user never has to select a folder to talk to the master or to open a folderless conversation.
- Folder-required work asks for a folder only when that resource is actually needed.
- The app no longer contains master route/index code that treats workspace ownership as a
  prerequisite for conversation visibility.
