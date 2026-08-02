package director

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

func TestDirectorInstructionsPreserveNativeArtifactIntent(t *testing.T) {
	instructions := DirectorInstructions()
	for _, required := range []string{
		"setta.emit_artifact",
		"Creating artifacts needs no folder.",
		"Never turn it into a website, a Sites project, a gallery page",
		"How many artifacts to publish and what goes in each is the worker's judgment",
		"\"required\" only when the work must read or change files in the user's project",
		"\"optional\" for everything else",
		"This is app routing, not user-facing copy.",
		"Start or route actionable work promptly.",
		"the worker owns investigation, implementation details, and ordinary judgment",
		"Do not demand a complete specification",
		"Ask before starting only when no useful investigation or independent work can happen",
		"When the user answers that question in this Director conversation",
		"Do not turn the answer into a new task, queue it, or steer the run.",
		"Author each new work delivery from the current user turn.",
		"The app owns ordering and cancellation",
		"Treat steering as a patch to the active task.",
		"preserve every other requirement from the active objective",
		"Never replace an explicit value, format, or constraint with an inferred convention.",
		"call the tool before writing user-facing prose",
		"Do not preannounce routing, repeat the request, or narrate internal execution.",
	} {
		if !strings.Contains(instructions, required) {
			t.Fatalf("Director instructions do not contain %q:\n%s", required, instructions)
		}
	}
}

func TestDirectorUserChoiceToolIsAvailableForInherentlyBlockedWork(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	execution := &recordedExecution{}
	provider := &scriptedDirectorProvider{
		reply: "Should the launch announcement target customers or investors?",
		calls: missingRequirementDirectorCall(
			"Should the launch announcement target customers or investors?",
		),
	}
	director := newDirectorConversationForTest(
		t,
		harness,
		registry,
		provider,
		execution,
		newDirectorConversationStoreForTest(),
	)

	receipt, err := director.Submit(
		context.Background(),
		directorTurnIntent("Do not start the launch announcement until I choose whether it targets customers or investors."),
	)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if len(provider.turns) != 1 {
		t.Fatalf("clarification triggered %d provider turns, want one", len(provider.turns))
	}
	visibleTools := map[string]bool{}
	for _, tool := range provider.turns[0].Tools {
		visibleTools[tool.Name] = true
	}
	if !visibleTools["request_user_choice"] {
		t.Fatalf("Director turn tools omit request_user_choice: %+v", visibleTools)
	}
	if len(receipt.ToolCalls) != 1 ||
		receipt.ToolCalls[0].Tool != "request_user_choice" ||
		!receipt.ToolCalls[0].Succeeded {
		t.Fatalf("clarification tool calls = %+v", receipt.ToolCalls)
	}
	if receipt.ReplyText != provider.reply {
		t.Fatalf("clarification reply = %q, want %q", receipt.ReplyText, provider.reply)
	}
	if len(execution.starts) != 0 || len(execution.sends) != 0 || len(execution.queues) != 0 {
		t.Fatalf("clarification started work: starts=%+v sends=%+v queues=%+v", execution.starts, execution.sends, execution.queues)
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
		calls: directorCalls(scriptedDirectorToolCall{
			tool: "create_workstream",
			arguments: map[string]any{
				"title":                "Parser rewrite",
				"workspaceId":          registryTestWorkspaceID,
				"workspaceRequirement": string(WorkspaceRequired),
				"initialInput":         nil,
			},
		}),
	}
	store := newDirectorConversationStoreForTest()
	director := newDirectorConversationForTest(t, harness, registry, provider, execution, store)

	receipt, err := director.Submit(context.Background(), directorTurnIntent("start a parser rewrite in setta"))
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

// TestDirectorRepairsAProseOnlyAppControlAnswerInTheSameConversation proves the
// product does not accept the failure mode this architecture replaced. Setta
// asks the persistent Director conversation to review a prose-only answer, and
// the repair turn performs the app action without a second router or carrier.
func TestDirectorRepairsAProseOnlyAppControlAnswerInTheSameConversation(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	execution := &publishingStartExecution{harness: harness}
	provider := &scriptedDirectorProvider{
		scripted: []scriptedDirectorTurn{
			{reply: "I created it.", model: "gpt-first-draft"},
			{
				reply: "Created and selected the parser rewrite.",
				model: "gpt-first-draft",
				calls: directorCalls(scriptedDirectorToolCall{
					tool: "create_workstream",
					arguments: map[string]any{
						"title":                "Parser rewrite",
						"workspaceId":          registryTestWorkspaceID,
						"workspaceRequirement": string(WorkspaceRequired),
						"initialInput":         nil,
					},
				}),
			},
		},
	}
	store := newDirectorConversationStoreForTest()
	director := newDirectorConversationForTest(t, harness, registry, provider, execution, store)

	receipt, err := director.Submit(
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
		calls: directorCalls(scriptedDirectorToolCall{
			tool: "create_workstream",
			arguments: map[string]any{
				"title":                "Parser rewrite",
				"workspaceId":          registryTestWorkspaceID,
				"workspaceRequirement": string(WorkspaceRequired),
				"initialInput":         nil,
			},
		}),
	}
	store := newDirectorConversationStoreForTest()
	director := newDirectorConversationForTest(t, harness, registry, provider, execution, store)

	if _, err := director.Submit(context.Background(), directorTurnIntent("start a parser rewrite in setta")); err != nil {
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

	replayed, err := director.replayHistory(context.Background())
	if err != nil {
		t.Fatalf("replayHistory: %v", err)
	}
	foundRequirement := false
	for _, item := range replayed {
		if strings.Contains(item.Text, `"workspaceRequirement":"required"`) {
			foundRequirement = true
			break
		}
	}
	if !foundRequirement {
		t.Fatalf("replayed Director history lost the workspace requirement: %+v", replayed)
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
		calls: directorCalls(scriptedDirectorToolCall{
			tool: "create_workstream",
			arguments: map[string]any{
				"title":                "Durable parser work",
				"workspaceId":          registryTestWorkspaceID,
				"workspaceRequirement": string(WorkspaceRequired),
				"initialInput":         nil,
			},
		}),
		turnErr: errors.New("provider failed after tool execution"),
	}
	store := newDirectorConversationStoreForTest()
	director := newDirectorConversationForTest(t, harness, registry, provider, execution, store)

	_, err := director.Submit(context.Background(), directorTurnIntent("start durable parser work"))
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

// TestDirectorCarrierIsReEstablishedFromDurableHistory proves the Director keeps
// its conversation across an app restart, and that the rebuilt carrier still
// carries the `setta` tools. Codex does not reattach dynamic tools to a resumed
// thread, so a Director rebuilt without them could talk and not act.
//
// A restart is modelled the way the process models it: the carrier registry is
// process-local, so the rebuilt Director looks its carrier up in an empty one,
// starts a fresh thread, and replays Setta's own history into it.
func TestDirectorCarrierIsReEstablishedFromDurableHistory(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	execution := &recordedExecution{}
	store := newDirectorConversationStoreForTest()
	carriers := conversation.NewCarrierRegistry()
	first := &scriptedDirectorProvider{reply: "A workstream is a conversation where work runs."}
	director := newDirectorConversationOnCarriers(t, harness, registry, first, execution, store, carriers)
	if _, err := director.Submit(context.Background(), directorTurnIntent("what is a workstream?")); err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if len(first.started) != 1 || len(first.started[0].History) != 0 {
		t.Fatalf("the first director carrier replayed %+v", first.started)
	}
	live, running := carriers.Lookup(DirectorConversationID)
	if !running || live.ThreadID != first.turns[0].Carrier.ThreadID {
		t.Fatalf("the director carrier registered as %+v, and the turn ran on %+v", live, first.turns[0].Carrier)
	}

	restarted := &scriptedDirectorProvider{reply: "It is also the unit shown in Setta's rails."}
	rebuilt := newDirectorConversationOnCarriers(
		t,
		harness,
		registry,
		restarted,
		execution,
		store,
		conversation.NewCarrierRegistry(),
	)
	if _, err := rebuilt.Submit(context.Background(), directorTurnIntent("tell me more")); err != nil {
		t.Fatalf("Submit after restart: %v", err)
	}

	if len(restarted.started) != 1 {
		t.Fatalf("the rebuilt director started %d carriers", len(restarted.started))
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
		t.Fatal("the rebuilt director carrier carries no setta tools")
	}
	for _, entry := range store.snapshotEntries() {
		if entry.Text == nil || entry.Text.Model == nil {
			continue
		}
		if entry.Text.Model.Provider != conversation.ProviderCodex ||
			entry.Text.Model.Model == "" {
			t.Fatalf("durable director reply attribution = %+v", entry.Text.Model)
		}
	}
}

// TestDirectorStartsAFreshCarrierAfterTheProviderLosesIt proves the Director
// recovers from a carrier Codex no longer has, the same way a workstream does:
// the turn fails with what went wrong, the dead carrier leaves the shared
// registry, and the next turn replays the durable conversation into a new one.
func TestDirectorStartsAFreshCarrierAfterTheProviderLosesIt(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	execution := &recordedExecution{}
	store := newDirectorConversationStoreForTest()
	carriers := conversation.NewCarrierRegistry()
	provider := &scriptedDirectorProvider{
		reply:   "A workstream is a conversation where work runs.",
		turnErr: fmt.Errorf("%w: the provider no longer has this thread", ErrDirectorCarrierLost),
	}
	director := newDirectorConversationOnCarriers(t, harness, registry, provider, execution, store, carriers)

	_, err := director.Submit(context.Background(), directorTurnIntent("what is a workstream?"))
	if !errors.Is(err, ErrDirectorCarrierLost) {
		t.Fatalf("Submit on a lost carrier = %v", err)
	}
	if lost, running := carriers.Lookup(DirectorConversationID); running {
		t.Fatalf("the lost director carrier is still registered as %+v", lost)
	}

	provider.turnErr = nil
	if _, err := director.Submit(context.Background(), directorTurnIntent("tell me more")); err != nil {
		t.Fatalf("Submit after the carrier was lost: %v", err)
	}
	if len(provider.started) != 2 {
		t.Fatalf("the director started %d carriers", len(provider.started))
	}
	replayed := provider.started[1].History
	if len(replayed) != 1 || replayed[0].Assistant || replayed[0].Text != "what is a workstream?" {
		t.Fatalf("history replayed into the new carrier = %+v", replayed)
	}
	live, running := carriers.Lookup(DirectorConversationID)
	if !running || live.ThreadID != provider.turns[len(provider.turns)-1].Carrier.ThreadID {
		t.Fatalf("director carrier after recovery = %+v", live)
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
		calls: directorCalls(scriptedDirectorToolCall{
			tool: "submit_work",
			arguments: map[string]any{
				"workstreamId":         "workstream-missing",
				"input":                "rewrite the parser",
				"workspaceRequirement": string(WorkspaceRequired),
			},
		}),
	}
	store := newDirectorConversationStoreForTest()
	director := newDirectorConversationForTest(t, harness, registry, provider, execution, store)

	receipt, err := director.Submit(context.Background(), directorTurnIntent("keep going on the parser"))
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
		calls: directorCalls(scriptedDirectorToolCall{
			tool: "create_workstream",
			rawArguments: json.RawMessage(`{"title":"Parser rewrite","workspaceId":null,"workspaceRequirement":"optional",` +
				`"initialInput":null,"folderPath":"/tmp/setta"}`),
		}),
	}
	store := newDirectorConversationStoreForTest()
	director := newDirectorConversationForTest(t, harness, registry, provider, execution, store)

	receipt, err := director.Submit(context.Background(), directorTurnIntent("make one in /tmp/setta"))
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
		calls: directorCalls(scriptedDirectorToolCall{
			tool:         "list_workspaces",
			rawArguments: json.RawMessage(`{} {}`),
		}),
	}
	store := newDirectorConversationStoreForTest()
	director := newDirectorConversationForTest(t, harness, registry, provider, execution, store)

	receipt, err := director.Submit(context.Background(), directorTurnIntent("list the workspaces"))
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
		calls: directorCalls(scriptedDirectorToolCall{
			tool: "resolve_approval",
			arguments: map[string]any{
				"approvalId": "approval-secret",
				"decision":   "answered",
				"answers": []map[string]any{{
					"questionId": "credential",
					"answers":    []string{privateAnswer},
				}},
			},
		}),
	}
	store := newDirectorConversationStoreForTest()
	director := newDirectorConversationForTest(
		t,
		harness,
		registry,
		provider,
		&recordedExecution{},
		store,
	)

	receipt, err := director.Submit(
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
	director := newDirectorConversationForTest(
		t,
		harness,
		registry,
		provider,
		&recordedExecution{},
		store,
	)

	first := directorTurnIntent("Explain the first thing.")
	if _, err := director.Submit(context.Background(), first); err != nil {
		t.Fatalf("first Submit: %v", err)
	}
	provider.model = "gpt-director-two"
	second := directorTurnIntent("Explain the second thing.")
	second.ID = "director-intent-2"
	if _, err := director.Submit(context.Background(), second); err != nil {
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
	director := newDirectorConversationForTest(
		t,
		harness,
		registry,
		&scriptedDirectorProvider{},
		&recordedExecution{},
		store,
	)

	_, err := director.Submit(context.Background(), directorTurnIntent("hello"))
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
	director := newDirectorConversationForTest(
		t,
		harness,
		registry,
		provider,
		&recordedExecution{},
		newDirectorConversationStoreForTest(),
	)

	_, err := director.Submit(context.Background(), SubmittedIntent{Text: "do the work"})
	if !errors.Is(err, ErrDirectorIntentRejected) {
		t.Fatalf("unaccepted intent returned %v", err)
	}
	if len(provider.started)+len(provider.turns) != 0 {
		t.Fatalf("an unaccepted intent reached the provider: %+v", provider)
	}
}
