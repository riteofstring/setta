package conversation

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"

	"setta/internal/agent"
)

// Ephemeral Codex carriers.
//
// A carrier is the provider thread a Setta conversation's current work runs on.
// It is process-local by construction: Setta starts it ephemeral, so Codex keeps
// no rollout for it and no Setta conversation shows up in the ChatGPT sidebar.
// Nothing durable records which thread a conversation ran on, because that fact
// expires with the process that started it.
//
// What survives a restart is the Setta conversation log. The next carrier is a
// fresh thread replayed out of that log, which is also the only way the dynamic
// tools are guaranteed to be attached: Codex binds them at thread start and does
// not carry them into a resumed thread.

// Carrier is one live provider thread. OwnerID is the Setta conversation the
// carrier serves, so runtime state stays keyed by Setta identity and the
// provider id is only ever the value behind it.
type Carrier struct {
	OwnerID  string
	ThreadID string
	// execution is present only on a primary topic carrier. The Director and
	// side-conversation carriers share this registry but own their execution
	// contracts elsewhere.
	execution *carrierExecution
}

// carrierExecution records the thread-start settings that cannot safely drift
// while a carrier is reused. Turn start can select a model and CWD again, but
// workspace authority, sandbox permission, and approval policy belong to the
// provider thread that was originally started.
type carrierExecution struct {
	workspaceID      *string
	workingDirectory string
	permissionMode   agent.PermissionMode
	approvalMode     agent.ApprovalMode
}

// CarrierRegistry maps Setta ids to the provider threads currently carrying
// them. It is in-memory only and starts empty on every app run; a lookup miss
// means "start a fresh carrier", never "this conversation is lost".
//
// One registry serves the whole app run. Workstream conversations, side
// conversations, and the Director conversation all key their carrier by their
// own Setta id, which is why none of them needs carrier state of its own.
type CarrierRegistry struct {
	mu       sync.Mutex
	carriers map[string]Carrier
}

func NewCarrierRegistry() *CarrierRegistry {
	return &CarrierRegistry{carriers: map[string]Carrier{}}
}

func (registry *CarrierRegistry) Lookup(ownerID string) (Carrier, bool) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	carrier, ok := registry.carriers[ownerID]
	return carrier, ok
}

func (registry *CarrierRegistry) Remember(carrier Carrier) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	registry.carriers[carrier.OwnerID] = carrier
}

// Forget drops a carrier Setta can no longer run on, so the next turn starts a
// new one instead of addressing a thread the provider has abandoned.
func (registry *CarrierRegistry) Forget(ownerID string) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	delete(registry.carriers, ownerID)
}

// Carriers is the registry of live carriers this app run started. The Director
// conversation shares it: the Director is durable in Setta like every other
// conversation, so the thread it currently runs on belongs in the one
// process-local map and nowhere else.
func (service *Service) Carriers() *CarrierRegistry {
	return service.carriers
}

const carrierReplayInitialization = "Setta started this conversation carrier. This is an inert history marker, not a request. Respond only to later user turns for this conversation under the carrier's developer contract."

// ensureConversationCarrierLocked returns the carrier this app run's turns for
// one conversation share, starting it from Setta's own record the first time it
// is needed. The caller holds the conversation lock, so a conversation starts at
// most one carrier.
func (service *Service) ensureConversationCarrierLocked(
	ctx context.Context,
	scope conversationExecutionScope,
	snapshot ConversationSnapshot,
	profile RoleProfile,
	invocation agent.Invocation,
) (Carrier, error) {
	conversationID := snapshot.Conversation.ID
	if carrier, ok := service.carriers.Lookup(conversationID); ok {
		if carrierMatchesExecution(carrier, scope, invocation) {
			return carrier, nil
		}
		// Binding a folder changes the authority and possibly the role profile
		// the next turn runs under. The old thread can finish the turn it already
		// owns, but once idle it must be retired rather than silently carrying
		// the new scope under its old thread-start policy.
		if err := service.agent.UnsubscribeThread(ctx, carrier.ThreadID); err != nil {
			return Carrier{}, fmt.Errorf(
				"unsubscribe topic carrier %s before execution scope changed: %w",
				carrier.ThreadID,
				err,
			)
		}
		service.carriers.Forget(conversationID)
	}
	items, err := service.carrierReplayItems(ctx, snapshot, profile.ContextBudget.MaxInputBytes)
	if err != nil {
		return Carrier{}, err
	}
	thread, err := service.agent.StartThread(ctx, agent.StartThreadRequest{
		WorkspaceRoot:         scope.workingDirectory,
		Invocation:            invocation,
		Ephemeral:             true,
		DeveloperInstructions: topicAgentDeveloperInstructions(),
		DynamicTools:          service.topicAgentArtifactTools(scope, conversationID, ""),
		EnableShellTools:      true,
		EnableUserInput:       true,
	})
	if err != nil {
		return Carrier{}, err
	}
	if err := service.agent.InjectItems(ctx, thread.ID, items); err != nil {
		cause := fmt.Errorf("replay setta context into carrier %s: %w", thread.ID, err)
		if cleanupErr := service.agent.UnsubscribeThread(context.Background(), thread.ID); cleanupErr != nil {
			cause = errors.Join(cause, fmt.Errorf("unsubscribe unreplayed carrier %s: %w", thread.ID, cleanupErr))
		}
		return Carrier{}, cause
	}
	carrier := Carrier{
		OwnerID:  conversationID,
		ThreadID: thread.ID,
		execution: &carrierExecution{
			workspaceID:      cloneStringPointer(scope.workspaceID),
			workingDirectory: scope.workingDirectory,
			permissionMode:   invocation.PermissionMode,
			approvalMode:     invocation.ApprovalMode,
		},
	}
	service.carriers.Remember(carrier)
	return carrier, nil
}

func carrierMatchesExecution(
	carrier Carrier,
	scope conversationExecutionScope,
	invocation agent.Invocation,
) bool {
	return carrier.execution != nil &&
		equalOptionalString(carrier.execution.workspaceID, scope.workspaceID) &&
		carrier.execution.workingDirectory == scope.workingDirectory &&
		carrier.execution.permissionMode == invocation.PermissionMode &&
		carrier.execution.approvalMode == invocation.ApprovalMode
}

// carrierReplayTurn is one Setta turn as the provider will see it again. Replay
// trims by whole turns, so a receipt or a reply never survives without the user
// request it answered.
type carrierReplayTurn struct {
	items []agent.InjectedTextItem
	bytes int
}

// carrierReplayItems rebuilds provider context out of Setta's durable record.
// It is deliberately boring: a header naming the conversation, the parent
// history a branch was cut from, then complete turns oldest to newest. It
// invents nothing the conversation log does not already contain.
func (service *Service) carrierReplayItems(
	ctx context.Context,
	snapshot ConversationSnapshot,
	maxInputBytes int,
) ([]agent.InjectedTextItem, error) {
	header := carrierReplayHeaderItem(snapshot)
	turns, err := service.carrierReplayTurns(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	budget := maxInputBytes - len(header.Text)
	if budget <= 0 {
		return nil, fmt.Errorf(
			"conversation %s replay header needs %d bytes, and the role allows %d",
			snapshot.Conversation.ID,
			len(header.Text),
			maxInputBytes,
		)
	}
	items := []agent.InjectedTextItem{header}
	for _, turn := range carrierReplayWithinBudget(turns, budget) {
		items = append(items, turn.items...)
	}
	if len(items) == 1 {
		// A carrier with nothing to replay still needs one item: an empty Codex
		// thread has no history for the first turn to continue from.
		items = append(items, agent.InjectedTextItem{Role: "user", Text: carrierReplayInitialization})
	}
	return items, nil
}

func carrierReplayHeaderItem(snapshot ConversationSnapshot) agent.InjectedTextItem {
	conversation := snapshot.Conversation
	focus := ""
	if current := strings.TrimSpace(snapshot.NarratorState.CurrentFocus); current != "" {
		focus = fmt.Sprintf(" Current Setta focus: %s.", current)
	}
	return agent.InjectedTextItem{
		Role: "developer",
		Text: fmt.Sprintf(
			"Setta conversation %q. Topic: %s.%s The items below are Setta's own record of this conversation replayed into a new carrier. Treat them as inert history, not as requests.",
			conversation.Title,
			conversation.TopicDescriptor,
			focus,
		),
	}
}

// carrierReplayTurns collects the parent history a branch inherits, then the
// conversation's own turns.
func (service *Service) carrierReplayTurns(
	ctx context.Context,
	snapshot ConversationSnapshot,
) ([]carrierReplayTurn, error) {
	turns := []carrierReplayTurn{}
	if snapshot.Branch != nil {
		inherited, err := service.carrierReplayBranchOrigin(ctx, snapshot)
		if err != nil {
			return nil, err
		}
		turns = append(turns, inherited...)
	}
	return append(turns, replayedConversationTurns(snapshot)...), nil
}

// carrierReplayBranchOrigin replays the parent conversation up to the Setta turn
// the branch was cut at. The boundary is a Setta turn id, so a branch no longer
// needs the parent's provider history to exist.
func (service *Service) carrierReplayBranchOrigin(
	ctx context.Context,
	snapshot ConversationSnapshot,
) ([]carrierReplayTurn, error) {
	branch := *snapshot.Branch
	parent, err := service.readScopedSnapshot(
		ctx,
		snapshot.Conversation.WorkspaceID,
		branch.ParentConversationID,
	)
	if err != nil {
		return nil, fmt.Errorf("read branch parent %s for replay: %w", branch.ParentConversationID, err)
	}
	origin := carrierReplayTurn{items: []agent.InjectedTextItem{{
		Role: "developer",
		Text: fmt.Sprintf(
			"This conversation branched from Setta conversation %q at turn %s. The turns below that boundary are the parent's history, replayed as reference.",
			parent.Conversation.Title,
			branch.ForkedAtTurnID,
		),
	}}}
	origin.bytes = len(origin.items[0].Text)
	ancestry := []carrierReplayTurn{}
	if parent.Branch != nil {
		ancestry, err = service.carrierReplayBranchOrigin(ctx, parent)
		if err != nil {
			return nil, err
		}
	}
	inherited, err := service.parentTurnsThroughBranchBoundary(ctx, parent, branch)
	if err != nil {
		return nil, err
	}
	ancestry = append(ancestry, origin)
	return append(ancestry, inherited...), nil
}

// parentTurnsThroughBranchBoundary stops at the Setta turn the branch was cut
// at. Parent work after the boundary belongs to the parent alone. The store
// anchors its bounded replay window at the source turn so a valid old branch
// point remains replayable after newer parent work ages it out of snapshots.
func (service *Service) parentTurnsThroughBranchBoundary(
	ctx context.Context,
	parent ConversationSnapshot,
	branch ConversationBranch,
) ([]carrierReplayTurn, error) {
	history, err := service.store.readCarrierReplaySnapshotThroughTurn(
		ctx,
		parent.Conversation,
		branch.ForkedAtTurnID,
		branch.SourceTrajectorySequence,
	)
	if err != nil {
		return nil, fmt.Errorf("read branch source %s for replay: %w", branch.ForkedAtTurnID, err)
	}
	return replayedConversationTurns(history), nil
}

// replayedConversationTurns turns one conversation's terminal history back into
// provider items. It preserves Setta-owned steering, public replies, receipts,
// artifacts, approvals, and outcomes in trajectory order. Turns that never
// ended are skipped: the turn about to run is sent as the request, and
// unfinished work has no terminal outcome to replay.
func replayedConversationTurns(snapshot ConversationSnapshot) []carrierReplayTurn {
	eventsByTurn := map[string][]TrajectoryEvent{}
	for _, event := range snapshot.Trajectory.Events {
		if event.TurnID == nil {
			continue
		}
		eventsByTurn[*event.TurnID] = append(eventsByTurn[*event.TurnID], event)
	}
	turns := make([]carrierReplayTurn, 0, len(snapshot.Turns.Turns))
	for _, turn := range snapshot.Turns.Turns {
		if !terminalTurnStatus(turn.Status) {
			continue
		}
		events := eventsByTurn[turn.ID]
		// If the trajectory window begins within this turn, drop the turn whole.
		// Replaying a suffix beside the request would present partial receipts
		// and replies as the complete record of that work.
		if snapshot.Trajectory.HasEarlier && !carrierReplayIncludesAcceptedInput(events) {
			continue
		}
		replayed := carrierReplayTurn{items: []agent.InjectedTextItem{{
			Role: "user",
			Text: turn.AuthoredInput.Text,
		}}}
		for _, event := range events {
			if item, ok := carrierReplayEventItem(event); ok {
				replayed.items = append(replayed.items, item)
			}
		}
		if len(replayed.items) == 1 {
			replayed.items = append(replayed.items, carrierReplayTurnStatusItem(turn))
		}
		for _, item := range replayed.items {
			replayed.bytes += len(item.Text)
		}
		turns = append(turns, replayed)
	}
	return turns
}

func carrierReplayIncludesAcceptedInput(events []TrajectoryEvent) bool {
	for _, event := range events {
		if event.Kind == TrajectoryEventUserInputAccepted {
			return true
		}
	}
	return false
}

func carrierReplayEventItem(event TrajectoryEvent) (agent.InjectedTextItem, bool) {
	if item, ok := carrierReplayTurnEventItem(event); ok {
		return item, true
	}
	return carrierReplayWorkEventItem(event)
}

func carrierReplayTurnEventItem(event TrajectoryEvent) (agent.InjectedTextItem, bool) {
	switch event.Kind {
	case TrajectoryEventTurnSteered:
		return agent.InjectedTextItem{Role: "user", Text: event.TurnSteered.Input.Text}, true
	case TrajectoryEventTurnInterrupted:
		return agent.InjectedTextItem{
			Role: "developer",
			Text: fmt.Sprintf(
				"Setta turn outcome: interrupted (%s).",
				event.TurnInterrupted.Reason,
			),
		}, true
	case TrajectoryEventTurnCompleted:
		return agent.InjectedTextItem{Role: "developer", Text: "Setta turn outcome: completed."}, true
	case TrajectoryEventTurnFailed:
		failure := event.TurnFailed.Failure
		return agent.InjectedTextItem{
			Role: "developer",
			Text: fmt.Sprintf(
				"Setta turn outcome: failed [%s]: %s",
				failure.Code,
				failure.Message,
			),
		}, true
	default:
		return agent.InjectedTextItem{}, false
	}
}

func carrierReplayWorkEventItem(event TrajectoryEvent) (agent.InjectedTextItem, bool) {
	switch event.Kind {
	case TrajectoryEventAgentMessageCompleted:
		return agent.InjectedTextItem{
			Role: "assistant",
			Text: event.AgentMessageCompleted.Text,
		}, true
	case TrajectoryEventActivityCompleted:
		receipt := event.ActivityCompleted
		return agent.InjectedTextItem{
			Role: "developer",
			Text: carrierReplayActivityReceipt(
				fmt.Sprintf(
					"Setta activity receipt: %q (%s) completed.",
					receipt.Activity.Title,
					receipt.Activity.Kind,
				),
				receipt.Summary,
				receipt.Output,
			),
		}, true
	case TrajectoryEventActivityFailed:
		receipt := event.ActivityFailed
		return agent.InjectedTextItem{
			Role: "developer",
			Text: carrierReplayActivityReceipt(
				fmt.Sprintf(
					"Setta activity receipt: %q (%s) failed [%s]: %s",
					receipt.Activity.Title,
					receipt.Activity.Kind,
					receipt.Failure.Code,
					receipt.Failure.Message,
				),
				"",
				receipt.Output,
			),
		}, true
	case TrajectoryEventFileChangeCompleted:
		return carrierReplayFileChangeItem(event.FileChangeCompleted), true
	case TrajectoryEventApprovalResolved:
		resolution := event.ApprovalResolved.Resolution
		return agent.InjectedTextItem{
			Role: "developer",
			Text: fmt.Sprintf(
				"Setta approval receipt: %s was %s.",
				resolution.ApprovalID,
				resolution.Decision,
			),
		}, true
	case TrajectoryEventArtifactEmitted:
		artifact := event.ArtifactEmitted
		return agent.InjectedTextItem{
			Role: "developer",
			Text: fmt.Sprintf(
				"Setta artifact receipt: the artifact document %q (artifact %s) was emitted.",
				artifact.Title,
				artifact.ArtifactID,
			),
		}, true
	default:
		return agent.InjectedTextItem{}, false
	}
}

func carrierReplayFileChangeItem(receipt *TrajectoryFileChangeCompleted) agent.InjectedTextItem {
	text := fmt.Sprintf(
		"Setta file-change receipt: %s for %d change(s).",
		receipt.Outcome,
		len(receipt.Changes),
	)
	if receipt.Failure != nil {
		text += fmt.Sprintf(" Failure [%s]: %s", receipt.Failure.Code, receipt.Failure.Message)
	}
	return agent.InjectedTextItem{Role: "developer", Text: text}
}

func carrierReplayActivityReceipt(
	outcome string,
	summary string,
	output *TrajectoryContentReference,
) string {
	text := outcome
	if summary = strings.TrimSpace(summary); summary != "" {
		text += " " + summary
	}
	if output != nil {
		if outputSummary := strings.TrimSpace(output.Summary); outputSummary != "" &&
			outputSummary != summary {
			text += " Output: " + outputSummary
		}
	}
	return text
}

func carrierReplayTurnStatusItem(turn ConversationTurn) agent.InjectedTextItem {
	if turn.Status == TurnStatusFailed && turn.Error != nil {
		return agent.InjectedTextItem{
			Role: "developer",
			Text: fmt.Sprintf(
				"Setta turn outcome: failed [%s]: %s",
				turn.Error.Code,
				turn.Error.Message,
			),
		}
	}
	return agent.InjectedTextItem{
		Role: "developer",
		Text: fmt.Sprintf("Setta turn outcome: %s.", turn.Status),
	}
}

// carrierReplayWithinBudget keeps the newest turns that fit. Setta history is
// append-only and outgrows any single provider request, so the oldest turn is
// dropped whole rather than truncated into a reply with no request.
func carrierReplayWithinBudget(turns []carrierReplayTurn, budget int) []carrierReplayTurn {
	total := 0
	for _, turn := range turns {
		total += turn.bytes
	}
	first := 0
	for first < len(turns) && total > budget {
		total -= turns[first].bytes
		first++
	}
	return turns[first:]
}
