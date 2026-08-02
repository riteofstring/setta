package director

import (
	"context"
	"errors"
	"testing"

	"setta/internal/conversation"
)

// The command center is the shell's only surface, so these tests are written
// the way the shell uses it: dispatch an intent, then read what the app-scoped
// snapshot and its pushed stream say. Nothing here names a pane, a conversation,
// or a provider, because the boundary exposes none of them.

// silentDirectorProvider belongs to every dispatch that must not consult the
// Director. Selection is app state the registry owns, so a selection that
// reached a provider would be a routing path the product never asked for.
type silentDirectorProvider struct{}

func (silentDirectorProvider) StartDirectorCarrier(
	context.Context,
	DirectorCarrierRequest,
) (string, error) {
	return "", errors.New("this dispatch must not reach the director conversation")
}

func (silentDirectorProvider) RunDirectorTurn(
	context.Context,
	DirectorTurnRequest,
) (DirectorProviderTurn, error) {
	return DirectorProviderTurn{}, errors.New("this dispatch must not reach the director conversation")
}

func newTestCommandCenter(t *testing.T, harness *registryHarness, registry *Registry) *CommandCenter {
	t.Helper()
	return newSubmittingCommandCenter(t, harness, registry, silentDirectorProvider{}, &recordedExecution{})
}

// newSubmittingCommandCenter assembles the boundary the way the runtime does:
// the registry is trusted state, a submitted request becomes one turn of the
// Director conversation, and the executor carries its tool calls out through
// the execution port.
func newSubmittingCommandCenter(
	t *testing.T,
	harness *registryHarness,
	registry *Registry,
	provider DirectorCarrierPort,
	execution WorkstreamExecution,
) *CommandCenter {
	t.Helper()
	directorConversation, err := NewDirectorConversation(
		registry,
		newExecutorForTest(t, harness, registry, execution),
		newDirectorConversationStoreForTest(),
		conversation.NewCarrierRegistry(),
		provider,
		stubDirectorNarrator{},
		WithDirectorConversationClock(harness.clock),
		WithDirectorConversationIdentity(harness.identity),
	)
	if err != nil {
		t.Fatalf("NewDirectorConversation: %v", err)
	}
	center, err := NewCommandCenter(
		registry,
		directorConversation,
		newExecutorForTest(t, harness, registry, execution),
		WithCommandCenterClock(harness.clock),
		WithCommandCenterIdentity(harness.identity),
	)
	if err != nil {
		t.Fatalf("NewCommandCenter: %v", err)
	}
	return center
}

func submit(text string, modality DecisionIntentModality) DirectorIntent {
	return DirectorIntent{
		Kind:   DirectorIntentSubmit,
		Submit: &DirectorSubmitIntent{Text: text, Modality: modality},
	}
}

func createWorkstream(workspaceID string, title string) DirectorIntent {
	return DirectorIntent{
		CreateWorkstream: &DirectorCreateWorkstreamIntent{WorkspaceID: workspaceID, Title: title},
		Kind:             DirectorIntentCreateWorkstream,
	}
}

func dispatch(t *testing.T, center *CommandCenter, intent DirectorIntent) DirectorReceipt {
	t.Helper()
	receipt, err := center.Dispatch(context.Background(), intent)
	if err != nil {
		t.Fatalf("Dispatch %s: %v", intent.Kind, err)
	}
	return receipt
}

func selectWorkstream(workstreamID string) DirectorIntent {
	return DirectorIntent{
		Kind:             DirectorIntentSelectWorkstream,
		SelectWorkstream: &DirectorSelectWorkstreamIntent{WorkstreamID: stringPointer(workstreamID)},
	}
}

func moveSelection(direction DirectorSelectionDirection) DirectorIntent {
	return DirectorIntent{
		Kind:          DirectorIntentMoveSelection,
		MoveSelection: &DirectorMoveSelectionIntent{Direction: direction},
	}
}

type publishingStartExecution struct {
	recordedExecution
	harness *registryHarness
}

func (execution *publishingStartExecution) StartWorkstream(
	ctx context.Context,
	request WorkstreamStartRequest,
) error {
	if err := execution.recordedExecution.StartWorkstream(ctx, request); err != nil {
		return err
	}
	execution.harness.createConversation(request.ConversationID, request.Title, request.WorkspaceID)
	return nil
}

// ForkWorkstream publishes the branch the same way StartWorkstream publishes a
// creation, so the registry learns about the child from durable conversation
// records rather than from the decision that asked for it.
func (execution *publishingStartExecution) ForkWorkstream(
	ctx context.Context,
	request WorkstreamForkRequest,
) error {
	if err := execution.recordedExecution.ForkWorkstream(ctx, request); err != nil {
		return err
	}
	execution.harness.forkConversation(
		request.ParentConversationID,
		request.ConversationID,
		request.Title,
		request.ForkedAtRunID,
		request.WorkspaceID,
	)
	return nil
}

func TestCommandCenterCreatesAndSelectsWorkspaceWorkstream(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	execution := &publishingStartExecution{harness: harness}
	center := newSubmittingCommandCenter(t, harness, registry, silentDirectorProvider{}, execution)
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	receipt := dispatch(t, center, createWorkstream(registryTestWorkspaceID, "Setta"))
	if receipt.Kind != DirectorIntentCreateWorkstream {
		t.Fatalf("receipt kind = %q", receipt.Kind)
	}
	if len(execution.starts) != 1 {
		t.Fatalf("start requests = %+v", execution.starts)
	}
	start := execution.starts[0]
	if start.WorkspaceID == nil || *start.WorkspaceID != registryTestWorkspaceID {
		t.Fatalf("created workstream workspace = %v", start.WorkspaceID)
	}
	if start.Title != "Setta" {
		t.Fatalf("created workstream request = %+v", start)
	}
	createdWorkstreamID, err := WorkstreamIDForConversation(start.ConversationID)
	if err != nil {
		t.Fatalf("WorkstreamIDForConversation: %v", err)
	}
	requireSelection(t, receipt, createdWorkstreamID)

	awaitSnapshotSelection(t, center, subscription, createdWorkstreamID)
	snapshot, err := center.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	entry := findEntry(t, snapshot, createdWorkstreamID)
	if entry.Workstream.ResourceScope.Kind != WorkstreamResourceScopeFolder ||
		entry.Workstream.ResourceScope.Folder == nil ||
		entry.Workstream.ResourceScope.Folder.WorkspaceID != registryTestWorkspaceID {
		t.Fatalf("created workstream scope = %+v", entry.Workstream.ResourceScope)
	}
}

// TestCommandCenterSelectsWithoutPaneIdentity proves the primary presentation
// intent is expressible with a workstream id alone: the dispatch commits durable
// selection and the change arrives on the pushed stream, with no pane to resolve
// and nothing to refresh.
func TestCommandCenterSelectsWithoutPaneIdentity(t *testing.T) {
	harness := newRegistryHarness(t)
	harness.createConversation("conversation-first", "First", nil)
	second := harness.createConversation("conversation-second", "Second", nil)
	registry := harness.start()
	center := newTestCommandCenter(t, harness, registry)
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	receipt := dispatch(t, center, selectWorkstream(second))
	if receipt.Kind != DirectorIntentSelectWorkstream {
		t.Fatalf("receipt kind = %q", receipt.Kind)
	}
	if receipt.SelectedWorkstreamID == nil || *receipt.SelectedWorkstreamID != second {
		t.Fatalf("receipt selection = %v, want %q", receipt.SelectedWorkstreamID, second)
	}

	event := awaitEvent(t, subscription, DirectorEventSelectionChanged)
	if event.SelectionChanged.SelectedWorkstreamID == nil ||
		*event.SelectionChanged.SelectedWorkstreamID != second {
		t.Fatalf("pushed selection = %+v", event.SelectionChanged)
	}
	snapshot, err := center.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if snapshot.SelectedWorkstreamID == nil || *snapshot.SelectedWorkstreamID != second {
		t.Fatalf("snapshot selection = %v", snapshot.SelectedWorkstreamID)
	}
	if findEntry(t, snapshot, second).DetailLevel != WorkstreamDetailSelected {
		t.Fatalf("selected workstream is not projected at the selected detail level")
	}
}

// TestCommandCenterMovesSelectionThroughTheVisibleOrder proves previous/next
// steps through the order the snapshot draws and clamps at both ends, so holding
// the key stops at the end of the list instead of wrapping the app around.
func TestCommandCenterMovesSelectionThroughTheVisibleOrder(t *testing.T) {
	harness := newRegistryHarness(t)
	oldest := harness.createConversation("conversation-oldest", "Oldest", nil)
	middle := harness.createConversation("conversation-middle", "Middle", nil)
	newest := harness.createConversation("conversation-newest", "Newest", nil)
	registry := harness.start()
	center := newTestCommandCenter(t, harness, registry)
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	// The app opens on the Director, which is position 0 rather than the absence
	// of a selection. Stepping forward from it reaches the most recent
	// workstream, and stepping back from that one returns to it.
	first := dispatch(t, center, moveSelection(DirectorSelectionNext))
	requireSelection(t, first, newest)

	requireSelection(t, dispatch(t, center, moveSelection(DirectorSelectionNext)), middle)
	requireSelection(t, dispatch(t, center, moveSelection(DirectorSelectionNext)), oldest)
	requireSelection(t, dispatch(t, center, moveSelection(DirectorSelectionNext)), oldest)
	requireSelection(t, dispatch(t, center, moveSelection(DirectorSelectionPrevious)), middle)
	requireSelection(t, dispatch(t, center, moveSelection(DirectorSelectionPrevious)), newest)
	requireDirectorSelection(t, dispatch(t, center, moveSelection(DirectorSelectionPrevious)))
	// And it clamps there rather than wrapping to the far end.
	requireDirectorSelection(t, dispatch(t, center, moveSelection(DirectorSelectionPrevious)))
	requireSelection(t, dispatch(t, center, moveSelection(DirectorSelectionNext)), newest)

	// A dispatch reports what the app decided; the durable selection arrives
	// through the pushed stream like every other change.
	awaitSnapshotSelection(t, center, subscription, newest)
	if order := snapshotOrder(t, center); order != [3]string{newest, middle, oldest} {
		t.Fatalf("navigating reordered the list the user navigates: %v", order)
	}
}

// snapshotOrder is the order the shell draws the workstream strip in. Selection
// must not change it.
func snapshotOrder(t *testing.T, center *CommandCenter) [3]string {
	t.Helper()
	snapshot, err := center.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if len(snapshot.Workstreams) != 3 {
		t.Fatalf("snapshot holds %d workstreams, want 3", len(snapshot.Workstreams))
	}
	return [3]string{
		snapshot.Workstreams[0].Workstream.ID,
		snapshot.Workstreams[1].Workstream.ID,
		snapshot.Workstreams[2].Workstream.ID,
	}
}

// awaitSnapshotSelection blocks on the pushed stream until the app-scoped
// snapshot reports the selection the dispatch reported.
func awaitSnapshotSelection(
	t *testing.T,
	center *CommandCenter,
	subscription DirectorEventSubscription,
	workstreamID string,
) {
	t.Helper()
	for {
		snapshot, err := center.Snapshot()
		if err != nil {
			t.Fatalf("Snapshot: %v", err)
		}
		if snapshot.SelectedWorkstreamID != nil && *snapshot.SelectedWorkstreamID == workstreamID {
			return
		}
		awaitEvent(t, subscription, DirectorEventSelectionChanged)
	}
}

// TestCommandCenterMoveSelectionWithNoWorkstreams proves the empty app is a real
// product state rather than an error: there is nothing to select, and the
// dispatch says so instead of failing.
func TestCommandCenterMoveSelectionWithNoWorkstreams(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	center := newTestCommandCenter(t, harness, registry)

	receipt := dispatch(t, center, moveSelection(DirectorSelectionNext))
	if receipt.SelectedWorkstreamID != nil {
		t.Fatalf("empty registry selected %q", *receipt.SelectedWorkstreamID)
	}
}

// TestCommandCenterRejectsUnauthorizedIntents proves the boundary validates
// before it writes: an unknown workstream, a malformed intent, and an unknown
// direction are all rejected as the caller's request rather than committed or
// repaired.
func TestCommandCenterRejectsUnauthorizedIntents(t *testing.T) {
	harness := newRegistryHarness(t)
	known := harness.createConversation("conversation-known", "Known", nil)
	registry := harness.start()
	center := newTestCommandCenter(t, harness, registry)

	for name, intent := range map[string]DirectorIntent{
		"unknown workstream": selectWorkstream("workstream:missing"),
		"unknown direction":  moveSelection(DirectorSelectionDirection("sideways")),
		"unknown workspace":  createWorkstream("workspace-missing", "Missing"),
		"empty create title": createWorkstream(registryTestWorkspaceID, " "),
		"unknown kind":       {Kind: DirectorIntentKind("open_pane")},
		"missing payload":    {Kind: DirectorIntentSelectWorkstream},
		"empty request":      submit("   ", DecisionIntentModalityText),
		"unknown modality":   submit("do the work", DecisionIntentModality("telepathy")),
		"two payloads": {
			Kind:             DirectorIntentSelectWorkstream,
			SelectWorkstream: &DirectorSelectWorkstreamIntent{WorkstreamID: stringPointer(known)},
			MoveSelection:    &DirectorMoveSelectionIntent{Direction: DirectorSelectionNext},
		},
		"submit beside a selection": {
			Kind:             DirectorIntentSubmit,
			Submit:           &DirectorSubmitIntent{Text: "do the work", Modality: DecisionIntentModalityText},
			SelectWorkstream: &DirectorSelectWorkstreamIntent{WorkstreamID: stringPointer(known)},
		},
	} {
		if _, err := center.Dispatch(context.Background(), intent); !errors.Is(err, ErrDirectorIntentRejected) {
			t.Fatalf("dispatching an intent with %s returned %v", name, err)
		}
	}

	snapshot, err := center.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if snapshot.SelectedWorkstreamID != nil {
		t.Fatalf("a rejected intent moved selection to %q", *snapshot.SelectedWorkstreamID)
	}
}

// TestCommandCenterReportsUnavailableRegistry proves the shell can tell a
// runtime condition from a bad request: a command center whose registry is not
// running is unavailable, not a rejected intent.
func TestCommandCenterReportsUnavailableRegistry(t *testing.T) {
	harness := newRegistryHarness(t)
	workstreamID := harness.createConversation("conversation-stopped", "Stopped", nil)
	registry, err := NewRegistry(harness.store, harness)
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}
	center := newTestCommandCenter(t, harness, registry)

	if _, err := center.Snapshot(); !errors.Is(err, ErrDirectorUnavailable) {
		t.Fatalf("Snapshot before start returned %v", err)
	}
	if _, err := center.Subscribe(DirectorEventCursor{}); !errors.Is(err, ErrDirectorUnavailable) {
		t.Fatalf("Subscribe before start returned %v", err)
	}
	if _, err := center.Dispatch(context.Background(), selectWorkstream(workstreamID)); !errors.Is(err, ErrDirectorUnavailable) {
		t.Fatalf("Dispatch before start returned %v", err)
	}
}

// TestCommandCenterSubmitCarriesOneRequestIntoWork proves the front door works
// end to end: the shell hands over what the user said, the app mints the
// intent's identity, the Director's tool call is authorized against durable
// state, and the work reaches the execution port addressed by Setta ids.
func TestCommandCenterSubmitCarriesOneRequestIntoWork(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	idle := harness.createConversation("conversation-idle", "Parser rewrite", &workspaceID)
	registry := harness.start()
	provider := &scriptedDirectorProvider{
		reply: "Sent it to the parser workstream.",
		calls: []scriptedDirectorToolCall{{
			tool: "submit_work",
			arguments: map[string]any{
				"workstreamId":         idle,
				"input":                "rewrite the parser",
				"workspaceRequirement": string(WorkspaceRequired),
			},
		}},
	}
	execution := &recordedExecution{}
	center := newSubmittingCommandCenter(t, harness, registry, provider, execution)

	receipt := dispatch(t, center, submit("rewrite the parser", DecisionIntentModalityVoice))

	turn := requireSubmittedOutcome(t, receipt)
	if turn.ReplyText != "Sent it to the parser workstream." {
		t.Fatalf("director reply = %q", turn.ReplyText)
	}
	if len(turn.ToolCalls) != 1 || turn.ToolCalls[0].Tool != "submit_work" || !turn.ToolCalls[0].Succeeded {
		t.Fatalf("director tool calls = %+v", turn.ToolCalls)
	}
	if turn.ToolCalls[0].WorkstreamID == nil || *turn.ToolCalls[0].WorkstreamID != idle {
		t.Fatalf("tool call workstream = %v, want %s", turn.ToolCalls[0].WorkstreamID, idle)
	}
	if len(execution.sends) != 1 ||
		execution.sends[0].ConversationID != "conversation-idle" ||
		execution.sends[0].WorkspaceID == nil ||
		*execution.sends[0].WorkspaceID != workspaceID ||
		execution.sends[0].Text != "rewrite the parser" {
		t.Fatalf("execution sends = %+v", execution.sends)
	}
	requireDirectorTurnInput(t, provider, turn, "rewrite the parser")
}

func requireSubmittedOutcome(t *testing.T, receipt DirectorReceipt) DirectorTurnReceipt {
	t.Helper()
	if receipt.Kind != DirectorIntentSubmit || receipt.Submit == nil || receipt.SelectedWorkstreamID != nil {
		t.Fatalf("receipt = %+v", receipt)
	}
	return *receipt.Submit
}

// requireDirectorTurnInput proves the Director was asked about the intent the
// app accepted. The shell supplies only the words and the modality, so the id
// the turn ran under is the one product code minted.
func requireDirectorTurnInput(
	t *testing.T,
	provider *scriptedDirectorProvider,
	turn DirectorTurnReceipt,
	text string,
) {
	t.Helper()
	if len(provider.turns) != 1 {
		t.Fatalf("director ran %d turns", len(provider.turns))
	}
	ran := provider.turns[0]
	if ran.TurnID == "" || ran.TurnID != turn.IntentID {
		t.Fatalf("director turn %q does not match the receipt's %q", ran.TurnID, turn.IntentID)
	}
	if ran.Text != text {
		t.Fatalf("director turn text = %q, want %q", ran.Text, text)
	}
	if ran.Carrier.OwnerID != DirectorConversationID || ran.Carrier.ThreadID == "" || len(ran.Tools) == 0 {
		t.Fatalf("director turn ran without a carrier or tools: %+v", ran)
	}
}

// TestCommandCenterSubmitAnswersWithoutStartingWork proves an answer is an
// outcome the shell can show: the Director's words come back on the receipt and
// no workstream was touched.
func TestCommandCenterSubmitAnswersWithoutStartingWork(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	provider := &scriptedDirectorProvider{reply: "A workstream is a conversation where work runs."}
	execution := &recordedExecution{}
	center := newSubmittingCommandCenter(t, harness, registry, provider, execution)

	turn := *dispatch(t, center, submit("what is a workstream?", DecisionIntentModalityText)).Submit

	if turn.ReplyText != "A workstream is a conversation where work runs." || len(turn.ToolCalls) != 0 {
		t.Fatalf("answer = %+v", turn)
	}
	if len(execution.starts)+len(execution.sends)+len(execution.queues) != 0 {
		t.Fatalf("an answer reached the execution port: %+v", execution)
	}
}

// TestCommandCenterSubmitReportsAnUnreachableDirector proves a provider the app
// could not reach is a runtime condition rather than the caller's mistake, and
// that nothing was executed on the way to reporting it.
func TestCommandCenterSubmitReportsAnUnreachableDirector(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	execution := &recordedExecution{}
	center := newSubmittingCommandCenter(
		t,
		harness,
		registry,
		&scriptedDirectorProvider{err: errors.New("provider is not signed in")},
		execution,
	)

	_, err := center.Dispatch(context.Background(), submit("start the migration", DecisionIntentModalityText))
	if !errors.Is(err, ErrDirectorUnavailable) {
		t.Fatalf("unreachable director returned %v", err)
	}
	if errors.Is(err, ErrDirectorIntentRejected) {
		t.Fatalf("unreachable director was reported as a rejected intent: %v", err)
	}
	if len(execution.starts)+len(execution.sends) != 0 {
		t.Fatalf("an unrouted request reached the execution port: %+v", execution)
	}
}

// requireDirectorSelection asserts the receipt landed on the Director's own
// view, which is a destination rather than nothing being selected.
func requireDirectorSelection(t *testing.T, receipt DirectorReceipt) {
	t.Helper()
	if receipt.SelectedWorkstreamID != nil {
		t.Fatalf("receipt selects %q, want the Director's view", *receipt.SelectedWorkstreamID)
	}
}

func requireSelection(t *testing.T, receipt DirectorReceipt, workstreamID string) {
	t.Helper()
	if receipt.SelectedWorkstreamID == nil {
		t.Fatalf("receipt selects nothing, want %q", workstreamID)
	}
	if *receipt.SelectedWorkstreamID != workstreamID {
		t.Fatalf("receipt selects %q, want %q", *receipt.SelectedWorkstreamID, workstreamID)
	}
}
