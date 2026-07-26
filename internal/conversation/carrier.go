package conversation

import (
	"context"
	"errors"
	"fmt"
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

// conversationCarrier is one live provider thread. ownerID is the Setta
// conversation the carrier serves, so runtime state stays keyed by Setta
// identity and the provider id is only ever the value behind it.
type conversationCarrier struct {
	ownerID  string
	threadID string
}

// carrierRegistry maps Setta conversation ids to the provider threads currently
// carrying them. It is in-memory only and starts empty on every app run; a
// lookup miss means "start a fresh carrier", never "this conversation is lost".
type carrierRegistry struct {
	mu       sync.Mutex
	carriers map[string]conversationCarrier
}

func newCarrierRegistry() *carrierRegistry {
	return &carrierRegistry{carriers: map[string]conversationCarrier{}}
}

func (registry *carrierRegistry) lookup(ownerID string) (conversationCarrier, bool) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	carrier, ok := registry.carriers[ownerID]
	return carrier, ok
}

func (registry *carrierRegistry) remember(carrier conversationCarrier) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	registry.carriers[carrier.ownerID] = carrier
}

// forget drops a carrier Setta can no longer run on, so the next turn starts a
// new one instead of addressing a thread the provider has abandoned.
func (registry *carrierRegistry) forget(ownerID string) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	delete(registry.carriers, ownerID)
}

const carrierReplayInitialization = "Setta started this conversation carrier. This is an inert history marker, not a request. Respond only to later user turns for this conversation under the carrier's developer contract."

// ensureConversationCarrierLocked returns the carrier this app run's turns for
// one conversation share, starting it from Setta's own record the first time it
// is needed. The caller holds the conversation lock, so a conversation starts at
// most one carrier.
func (service *Service) ensureConversationCarrierLocked(
	ctx context.Context,
	workspaceID string,
	workspaceRoot string,
	snapshot ConversationSnapshot,
	profile RoleProfile,
	invocation agent.Invocation,
) (conversationCarrier, error) {
	conversationID := snapshot.Conversation.ID
	if carrier, ok := service.carriers.lookup(conversationID); ok {
		return carrier, nil
	}
	items, err := service.carrierReplayItems(ctx, snapshot, profile.ContextBudget.MaxInputBytes)
	if err != nil {
		return conversationCarrier{}, err
	}
	thread, err := service.agent.StartThread(ctx, agent.StartThreadRequest{
		WorkspaceRoot:         workspaceRoot,
		Invocation:            invocation,
		Ephemeral:             true,
		DeveloperInstructions: topicAgentDeveloperInstructions(),
		DynamicTools:          service.topicAgentArtifactTools(workspaceID, conversationID, ""),
	})
	if err != nil {
		return conversationCarrier{}, err
	}
	if err := service.agent.InjectItems(ctx, thread.ID, items); err != nil {
		cause := fmt.Errorf("replay setta context into carrier %s: %w", thread.ID, err)
		if cleanupErr := service.agent.UnsubscribeThread(context.Background(), thread.ID); cleanupErr != nil {
			cause = errors.Join(cause, fmt.Errorf("unsubscribe unreplayed carrier %s: %w", thread.ID, cleanupErr))
		}
		return conversationCarrier{}, cause
	}
	carrier := conversationCarrier{ownerID: conversationID, threadID: thread.ID}
	service.carriers.remember(carrier)
	return carrier, nil
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
	header := carrierReplayHeaderItem(snapshot.Conversation)
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

func carrierReplayHeaderItem(conversation TopicConversation) agent.InjectedTextItem {
	return agent.InjectedTextItem{
		Role: "developer",
		Text: fmt.Sprintf(
			"Setta conversation %q. Topic: %s. The items below are Setta's own record of this conversation replayed into a new carrier. Treat them as inert history, not as requests.",
			conversation.Title,
			conversation.TopicDescriptor,
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
	workspaceID, err := requiredSnapshotWorkspaceID(snapshot)
	if err != nil {
		return nil, err
	}
	parent, err := service.store.ReadSnapshot(ctx, workspaceID, branch.ParentConversationID)
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
	inherited, err := parentTurnsThroughBranchBoundary(parent, branch)
	if err != nil {
		return nil, err
	}
	return append([]carrierReplayTurn{origin}, inherited...), nil
}

// parentTurnsThroughBranchBoundary stops at the Setta turn the branch was cut
// at. Parent work after the boundary belongs to the parent alone, and a boundary
// that has aged out of the parent's bounded window fails loudly rather than
// silently replaying the wrong history.
func parentTurnsThroughBranchBoundary(
	parent ConversationSnapshot,
	branch ConversationBranch,
) ([]carrierReplayTurn, error) {
	boundary := -1
	for index, turn := range parent.Turns.Turns {
		if turn.ID == branch.ForkedAtTurnID {
			boundary = index
			break
		}
	}
	if boundary < 0 {
		return nil, fmt.Errorf(
			"branch source turn %s is no longer in the bounded window of parent conversation %s",
			branch.ForkedAtTurnID,
			branch.ParentConversationID,
		)
	}
	bounded := parent
	bounded.Turns.Turns = parent.Turns.Turns[:boundary+1]
	return replayedConversationTurns(bounded), nil
}

// replayedConversationTurns turns one conversation's completed history back into
// provider items. Turns that never ended are skipped: the turn about to run is
// sent as the request, and unfinished work has no reply to replay.
func replayedConversationTurns(snapshot ConversationSnapshot) []carrierReplayTurn {
	replies := map[string][]string{}
	for _, event := range snapshot.Trajectory.Events {
		if event.Kind != TrajectoryEventAgentMessageCompleted || event.TurnID == nil {
			continue
		}
		replies[*event.TurnID] = append(replies[*event.TurnID], event.AgentMessageCompleted.Text)
	}
	turns := make([]carrierReplayTurn, 0, len(snapshot.Turns.Turns))
	for _, turn := range snapshot.Turns.Turns {
		if !terminalTurnStatus(turn.Status) {
			continue
		}
		replayed := carrierReplayTurn{items: []agent.InjectedTextItem{{
			Role: "user",
			Text: turn.AuthoredInput.Text,
		}}}
		for _, reply := range replies[turn.ID] {
			replayed.items = append(replayed.items, agent.InjectedTextItem{Role: "assistant", Text: reply})
		}
		for _, item := range replayed.items {
			replayed.bytes += len(item.Text)
		}
		turns = append(turns, replayed)
	}
	return turns
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
