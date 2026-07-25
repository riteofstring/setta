package director

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"setta/internal/conversation"
)

// The Director conversation is the product's front door, so these tests are
// written the way the user meets it: say something, and then ask what the app
// did about it. Nothing here names a schema, a router, or a decision the user
// never made.

func directorTurnIntent(text string) SubmittedIntent {
	return SubmittedIntent{
		ID:          "director-intent-1",
		Text:        text,
		Modality:    DecisionIntentModalityText,
		SubmittedAt: "2026-07-25T12:00:00Z",
	}
}

// TestDirectorToolCallCreatesAndSelectsAWorkstream is the plan's exit criterion:
// asking for a new conversation causes a Setta tool call, a durable workstream,
// and a visible selection — not prose claiming it happened.
func TestDirectorToolCallCreatesAndSelectsAWorkstream(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	execution := &publishingStartExecution{harness: harness}
	provider := &scriptedDirectorProvider{
		reply: "Started it in setta.",
		calls: []scriptedDirectorToolCall{{
			tool: "create_workstream",
			arguments: map[string]any{
				"title":        "Parser rewrite",
				"workspaceId":  registryTestWorkspaceID,
				"initialInput": nil,
			},
		}},
	}
	store := newDirectorConversationStoreForTest()
	thread := newDirectorThreadForTest(t, harness, registry, provider, execution, store)

	receipt, err := thread.Submit(context.Background(), directorTurnIntent("start a parser rewrite in setta"))
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}

	if len(receipt.ToolCalls) != 1 || !receipt.ToolCalls[0].Succeeded {
		t.Fatalf("director tool calls = %+v", receipt.ToolCalls)
	}
	created := receipt.ToolCalls[0]
	if created.WorkstreamID == nil {
		t.Fatalf("create receipt names no workstream: %+v", created)
	}
	if created.SelectedWorkstreamID == nil || *created.SelectedWorkstreamID != *created.WorkstreamID {
		t.Fatalf("the created workstream is not the selected one: %+v", created)
	}
	if len(execution.starts) != 1 || execution.starts[0].Title != "Parser rewrite" {
		t.Fatalf("execution starts = %+v", execution.starts)
	}
	// No initial input was supplied, so the workstream exists and is idle. A
	// created workstream that silently started work would be the app doing
	// something the user did not ask for.
	if len(execution.sends) != 0 {
		t.Fatalf("creating an idle workstream sent work: %+v", execution.sends)
	}
	snapshot, err := registry.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if snapshot.SelectedWorkstreamID == nil || *snapshot.SelectedWorkstreamID != *created.WorkstreamID {
		t.Fatalf("app-wide selection = %v, want %s", snapshot.SelectedWorkstreamID, *created.WorkstreamID)
	}
}

// TestDirectorRepairsAProseOnlyAppControlAnswerInTheSameThread proves the
// product does not accept the failure mode this architecture replaced. Setta
// asks the persistent Director conversation to review a prose-only answer, and
// the repair turn performs the app action without a second router or thread.
func TestDirectorRepairsAProseOnlyAppControlAnswerInTheSameThread(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	execution := &publishingStartExecution{harness: harness}
	provider := &scriptedDirectorProvider{
		scripted: []scriptedDirectorTurn{
			{reply: "I created it.", model: "gpt-first-draft"},
			{
				reply: "Created and selected the parser rewrite.",
				model: "gpt-first-draft",
				calls: []scriptedDirectorToolCall{{
					tool: "create_workstream",
					arguments: map[string]any{
						"title":        "Parser rewrite",
						"workspaceId":  registryTestWorkspaceID,
						"initialInput": nil,
					},
				}},
			},
		},
	}
	store := newDirectorConversationStoreForTest()
	thread := newDirectorThreadForTest(t, harness, registry, provider, execution, store)

	receipt, err := thread.Submit(
		context.Background(),
		directorTurnIntent("Create a new conversation in setta."),
	)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if len(provider.turns) != 2 || provider.turns[1].Text != directorToolUseReview {
		t.Fatalf("Director repair turns = %+v", provider.turns)
	}
	if len(receipt.ToolCalls) != 1 || !receipt.ToolCalls[0].Succeeded {
		t.Fatalf("Director repair tool calls = %+v", receipt.ToolCalls)
	}
	if len(execution.starts) != 1 {
		t.Fatalf("Director repair starts = %+v", execution.starts)
	}
	for _, entry := range store.snapshotEntries() {
		if entry.Kind == conversation.DirectorConversationAssistantText &&
			entry.Text.Text == "I created it." {
			t.Fatal("the unverified prose claim became durable")
		}
	}
}

// TestDirectorTurnIsDurableInOrder proves the whole turn is kept: what the user
// said, what the Director called, what Setta reported back, and what the
// Director said about it.
func TestDirectorTurnIsDurableInOrder(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	execution := &publishingStartExecution{harness: harness}
	provider := &scriptedDirectorProvider{
		reply: "Started it in setta.",
		calls: []scriptedDirectorToolCall{{
			tool: "create_workstream",
			arguments: map[string]any{
				"title":        "Parser rewrite",
				"workspaceId":  registryTestWorkspaceID,
				"initialInput": nil,
			},
		}},
	}
	store := newDirectorConversationStoreForTest()
	thread := newDirectorThreadForTest(t, harness, registry, provider, execution, store)

	if _, err := thread.Submit(context.Background(), directorTurnIntent("start a parser rewrite in setta")); err != nil {
		t.Fatalf("Submit: %v", err)
	}

	want := []conversation.DirectorConversationEntryKind{
		conversation.DirectorConversationUserTurn,
		conversation.DirectorConversationToolCall,
		conversation.DirectorConversationToolReceipt,
		conversation.DirectorConversationAssistantText,
	}
	got := store.kinds()
	if len(got) != len(want) {
		t.Fatalf("durable director conversation = %v, want %v", got, want)
	}
	for index, kind := range want {
		if got[index] != kind {
			t.Fatalf("durable director conversation = %v, want %v", got, want)
		}
	}
}

// TestDirectorToolCallSurvivesAProviderTurnFailure proves an app action is not
// erased from the Director conversation just because the provider fails after
// the tool already ran.
func TestDirectorToolCallSurvivesAProviderTurnFailure(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	execution := &publishingStartExecution{harness: harness}
	provider := &scriptedDirectorProvider{
		calls: []scriptedDirectorToolCall{{
			tool: "create_workstream",
			arguments: map[string]any{
				"title":        "Durable parser work",
				"workspaceId":  registryTestWorkspaceID,
				"initialInput": nil,
			},
		}},
		turnErr: errors.New("provider failed after tool execution"),
	}
	store := newDirectorConversationStoreForTest()
	thread := newDirectorThreadForTest(t, harness, registry, provider, execution, store)

	_, err := thread.Submit(context.Background(), directorTurnIntent("start durable parser work"))
	if err == nil || !strings.Contains(err.Error(), "provider failed after tool execution") {
		t.Fatalf("Submit returned %v", err)
	}
	if len(execution.starts) != 1 {
		t.Fatalf("provider failure lost or repeated the executed action: %+v", execution.starts)
	}
	want := []conversation.DirectorConversationEntryKind{
		conversation.DirectorConversationUserTurn,
		conversation.DirectorConversationToolCall,
		conversation.DirectorConversationToolReceipt,
	}
	got := store.kinds()
	if len(got) != len(want) {
		t.Fatalf("durable failed Director turn = %v, want %v", got, want)
	}
	for index, kind := range want {
		if got[index] != kind {
			t.Fatalf("durable failed Director turn = %v, want %v", got, want)
		}
	}
}

// TestDirectorThreadIsReEstablishedFromDurableHistory proves the Director keeps
// its conversation across an app restart, and that the rebuilt provider thread
// still carries the `setta` tools. Codex does not reattach dynamic tools to a
// resumed thread, so a Director rebuilt without them could talk and not act.
func TestDirectorThreadIsReEstablishedFromDurableHistory(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	execution := &recordedExecution{}
	store := newDirectorConversationStoreForTest()
	first := &scriptedDirectorProvider{reply: "A workstream is a conversation where work runs."}
	thread := newDirectorThreadForTest(t, harness, registry, first, execution, store)
	if _, err := thread.Submit(context.Background(), directorTurnIntent("what is a workstream?")); err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if len(first.started) != 1 || len(first.started[0].History) != 0 {
		t.Fatalf("the first director thread replayed %+v", first.started)
	}

	restarted := &scriptedDirectorProvider{reply: "It is also the unit shown in Setta's rails."}
	rebuilt := newDirectorThreadForTest(t, harness, registry, restarted, execution, store)
	if _, err := rebuilt.Submit(context.Background(), directorTurnIntent("tell me more")); err != nil {
		t.Fatalf("Submit after restart: %v", err)
	}

	if len(restarted.started) != 1 {
		t.Fatalf("the rebuilt director started %d threads", len(restarted.started))
	}
	established := restarted.started[0]
	if len(established.History) != 2 ||
		established.History[0].Assistant ||
		established.History[0].Text != "what is a workstream?" ||
		!established.History[1].Assistant ||
		established.History[1].Text != "A workstream is a conversation where work runs." {
		t.Fatalf("replayed history = %+v", established.History)
	}
	if len(established.Tools) == 0 {
		t.Fatal("the rebuilt director thread carries no setta tools")
	}
	bound, found, err := store.ReadDirectorThread(context.Background())
	if err != nil || !found {
		t.Fatalf("ReadDirectorThread = %+v, %v, %v", bound, found, err)
	}
	if bound.ThreadID != "provider-thread-1" || bound.Provider != conversation.ProviderCodex {
		t.Fatalf("durable director thread binding = %+v", bound)
	}
}

// TestDirectorToolRefusalStaysInsideTheConversation proves an unauthorized call
// is answered rather than thrown: the Director is told specifically what was
// wrong, the turn continues, and nothing reached the execution port.
func TestDirectorToolRefusalStaysInsideTheConversation(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	execution := &recordedExecution{}
	provider := &scriptedDirectorProvider{
		reply: "I could not find that workstream — which one did you mean?",
		calls: []scriptedDirectorToolCall{{
			tool: "submit_work",
			arguments: map[string]any{
				"workstreamId": "workstream-missing",
				"input":        "rewrite the parser",
			},
		}},
	}
	store := newDirectorConversationStoreForTest()
	thread := newDirectorThreadForTest(t, harness, registry, provider, execution, store)

	receipt, err := thread.Submit(context.Background(), directorTurnIntent("keep going on the parser"))
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if len(receipt.ToolCalls) != 1 || receipt.ToolCalls[0].Succeeded {
		t.Fatalf("refused tool call = %+v", receipt.ToolCalls)
	}
	if !strings.Contains(receipt.ToolCalls[0].Summary, "workstream-missing") {
		t.Fatalf("refusal does not say what was wrong: %q", receipt.ToolCalls[0].Summary)
	}
	if len(provider.receipts) != 1 || provider.receipts[0].Summary != receipt.ToolCalls[0].Summary {
		t.Fatalf("the director was not told what the refusal was: %+v", provider.receipts)
	}
	if len(execution.sends)+len(execution.queues)+len(execution.starts) != 0 {
		t.Fatalf("a refused call reached the execution port: %+v", execution)
	}
}

// TestDirectorToolsRejectUndeclaredArguments proves the tool boundary is the
// schema it published. A silently ignored argument would let the Director
// believe it constrained a call the app never saw the constraint for.
func TestDirectorToolsRejectUndeclaredArguments(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	execution := &recordedExecution{}
	provider := &scriptedDirectorProvider{
		reply: "Let me try that again.",
		calls: []scriptedDirectorToolCall{{
			tool:         "create_workstream",
			rawArguments: json.RawMessage(`{"title":"Parser rewrite","workspaceId":null,"initialInput":null,"folderPath":"/tmp/setta"}`),
		}},
	}
	store := newDirectorConversationStoreForTest()
	thread := newDirectorThreadForTest(t, harness, registry, provider, execution, store)

	receipt, err := thread.Submit(context.Background(), directorTurnIntent("make one in /tmp/setta"))
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if len(receipt.ToolCalls) != 1 || receipt.ToolCalls[0].Succeeded {
		t.Fatalf("undeclared argument was accepted: %+v", receipt.ToolCalls)
	}
	if !strings.Contains(receipt.ToolCalls[0].Summary, "folderPath") {
		t.Fatalf("refusal does not name the undeclared field: %q", receipt.ToolCalls[0].Summary)
	}
	if len(execution.starts) != 0 {
		t.Fatalf("an undeclared argument reached the execution port: %+v", execution)
	}
}

func TestDirectorToolsRejectTrailingJSONValues(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	execution := &recordedExecution{}
	provider := &scriptedDirectorProvider{
		reply: "That call was malformed.",
		calls: []scriptedDirectorToolCall{{
			tool:         "list_workspaces",
			rawArguments: json.RawMessage(`{} {}`),
		}},
	}
	store := newDirectorConversationStoreForTest()
	thread := newDirectorThreadForTest(t, harness, registry, provider, execution, store)

	receipt, err := thread.Submit(context.Background(), directorTurnIntent("list the workspaces"))
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if len(receipt.ToolCalls) != 1 || receipt.ToolCalls[0].Succeeded {
		t.Fatalf("trailing JSON value was accepted: %+v", receipt.ToolCalls)
	}
	if !strings.Contains(receipt.ToolCalls[0].Summary, "exactly one value") {
		t.Fatalf("refusal does not explain the malformed input: %q", receipt.ToolCalls[0].Summary)
	}
}

func TestDirectorApprovalToolArgumentsAreRedactedBeforePersistence(t *testing.T) {
	const privateAnswer = "director-invented-secret-answer"

	harness := newRegistryHarness(t)
	registry := harness.start()
	provider := &scriptedDirectorProvider{
		reply: "That approval is not available.",
		calls: []scriptedDirectorToolCall{{
			tool: "resolve_approval",
			arguments: map[string]any{
				"approvalId": "approval-secret",
				"decision":   "answered",
				"answers": []map[string]any{{
					"questionId": "credential",
					"answers":    []string{privateAnswer},
				}},
			},
		}},
	}
	store := newDirectorConversationStoreForTest()
	thread := newDirectorThreadForTest(
		t,
		harness,
		registry,
		provider,
		&recordedExecution{},
		store,
	)

	receipt, err := thread.Submit(
		context.Background(),
		directorTurnIntent("Answer the waiting secret approval."),
	)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if len(receipt.ToolCalls) != 1 || receipt.ToolCalls[0].Succeeded {
		t.Fatalf("secret approval call = %+v", receipt.ToolCalls)
	}
	entries := store.snapshotEntries()
	encoded, err := json.Marshal(entries)
	if err != nil {
		t.Fatalf("encode Director entries: %v", err)
	}
	if strings.Contains(string(encoded), privateAnswer) {
		t.Fatalf("private approval answer reached the durable Director conversation: %s", encoded)
	}
	for _, entry := range entries {
		if entry.Kind == conversation.DirectorConversationToolCall &&
			string(entry.Tool.Payload) != string(redactedDirectorApprovalArguments) {
			t.Fatalf("durable approval arguments = %s", entry.Tool.Payload)
		}
	}
}

func TestDirectorUnexpectedToolFailureDoesNotBecomePublicImplementationText(t *testing.T) {
	const privateCause = "sqlite /private/profile/setta.db is locked"

	summary := directorToolRefusal(errors.New(privateCause))

	if strings.Contains(summary, privateCause) ||
		summary != "Setta could not complete this call. Check Setta's current state before trying again." {
		t.Fatalf("unexpected tool failure summary = %q", summary)
	}
}

func TestDirectorReplyProvenanceUsesTheModelThatAuthoredEachTurn(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	provider := &scriptedDirectorProvider{reply: "A conversational answer.", model: "gpt-director-one"}
	store := newDirectorConversationStoreForTest()
	thread := newDirectorThreadForTest(
		t,
		harness,
		registry,
		provider,
		&recordedExecution{},
		store,
	)

	first := directorTurnIntent("Explain the first thing.")
	if _, err := thread.Submit(context.Background(), first); err != nil {
		t.Fatalf("first Submit: %v", err)
	}
	provider.model = "gpt-director-two"
	second := directorTurnIntent("Explain the second thing.")
	second.ID = "director-intent-2"
	if _, err := thread.Submit(context.Background(), second); err != nil {
		t.Fatalf("second Submit: %v", err)
	}

	var models []string
	for _, entry := range store.snapshotEntries() {
		if entry.Kind == conversation.DirectorConversationAssistantText {
			models = append(models, entry.Text.Model.Model)
		}
	}
	if len(models) != 2 || models[0] != "gpt-director-one" || models[1] != "gpt-director-two" {
		t.Fatalf("durable Director reply models = %v", models)
	}
}

// TestDirectorTurnRequiresAnAnswerOrAnAction proves the app never reports a
// turn that neither said anything nor did anything as a success.
func TestDirectorTurnRequiresAnAnswerOrAnAction(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	store := newDirectorConversationStoreForTest()
	thread := newDirectorThreadForTest(
		t,
		harness,
		registry,
		&scriptedDirectorProvider{},
		&recordedExecution{},
		store,
	)

	_, err := thread.Submit(context.Background(), directorTurnIntent("hello"))
	if err == nil || !strings.Contains(err.Error(), "neither answered nor acted") {
		t.Fatalf("empty director turn returned %v", err)
	}
	// The request itself stays durable: the user did ask. What the turn produced
	// — nothing — is what the app refuses to report as a success.
	kinds := store.kinds()
	if len(kinds) != 1 || kinds[0] != conversation.DirectorConversationUserTurn {
		t.Fatalf("an empty turn recorded %v, want only the request", kinds)
	}
}

// TestDirectorSubmitRejectsAnUnacceptedIntent proves the durable identity of a
// request is minted by product code: a turn with no accepted intent never
// reaches the provider.
func TestDirectorSubmitRejectsAnUnacceptedIntent(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	provider := &scriptedDirectorProvider{reply: "anything"}
	thread := newDirectorThreadForTest(
		t,
		harness,
		registry,
		provider,
		&recordedExecution{},
		newDirectorConversationStoreForTest(),
	)

	_, err := thread.Submit(context.Background(), SubmittedIntent{Text: "do the work"})
	if !errors.Is(err, ErrDirectorIntentRejected) {
		t.Fatalf("unaccepted intent returned %v", err)
	}
	if len(provider.started)+len(provider.turns) != 0 {
		t.Fatalf("an unaccepted intent reached the provider: %+v", provider)
	}
}
