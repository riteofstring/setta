package narration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"setta/internal/conversation"
)

const (
	narratorCallStarted = "2026-07-12T12:01:00Z"
	narratorCallEnded   = "2026-07-12T12:02:00Z"
)

func TestOutputCommitterPreparesEverySuccessfulNarratorChannel(t *testing.T) {
	t.Run("working milestones and topic descriptor", testPrepareWorkingOutputCommit)
	t.Run("terminal final summary", testPrepareTerminalOutputCommit)
	t.Run("read-only status reply", testPrepareStatusOutputCommit)
	t.Run("checkpoint maintenance", testPrepareCheckpointOutputCommit)
}

func testPrepareWorkingOutputCommit(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	bundle := materializeCallerProjection(t, source, conversation.NarrationTriggerPlanChanged)
	provider := &recordingFreshStructuredProvider{output: json.RawMessage(`{
		"kind":"working_projection",
		"observedThroughSequence":3,
		"currentFocus":"Committing the validated narrator projection.",
		"milestones":["The narrator output boundary is durable."],
		"topicDescriptor":"Narrator output persistence"
	}`)}
	caller := newTimedTestCaller(t, provider)
	callRequest := CallRequest{
		ID:            "working-output-call",
		Generation:    7,
		WorkspaceRoot: t.TempDir(),
		Projection:    &bundle,
	}
	result := runNarratorCall(t, caller, callRequest)
	store := &recordingNarratorOutputStore{}
	committer := newRecordingOutputCommitter(t, store)
	commit, err := committer.Prepare(callRequest, result)
	if err != nil {
		t.Fatalf("prepare working output commit: %v", err)
	}
	if len(store.projections) != 0 {
		t.Fatal("working output mutated store during prepare")
	}

	result.NarratorOutput.WorkingProjection.CurrentFocus = "mutated after prepare"
	result.Model.Settings.ModelID = "mutated-model"
	bundle.PreCallCursor.ObservedThroughSequence = 99
	if err := commit(context.Background()); err != nil {
		t.Fatalf("commit working output: %v", err)
	}
	if len(store.projections) != 1 {
		t.Fatalf("working projection commits = %d, want 1", len(store.projections))
	}
	request := store.projections[0]
	if request.ObservedThroughSequence != 3 || request.CurrentFocus != "Committing the validated narrator projection." ||
		request.Expected.ObservedThroughSequence != 0 || request.Expected.UpdatedAt != narratorContextTestTime {
		t.Fatalf("working projection commit = %+v", request)
	}
	if len(request.Milestones) != 1 || request.Milestones[0].Text != "The narrator output boundary is durable." {
		t.Fatalf("working milestone commits = %+v", request.Milestones)
	}
	if request.TopicDescriptor == nil || request.TopicDescriptor.Text != "Narrator output persistence" ||
		request.ConversationCommittedID == nil {
		t.Fatalf("working topic descriptor commit = %+v", request.TopicDescriptor)
	}
	assertCommittedNarratorInvocation(t, request.ResolvedInvocation, result)
	assertDistinctOutputCommitIDs(t, request)
}

func testPrepareTerminalOutputCommit(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	bundle := materializeCallerProjection(t, source, conversation.NarrationTriggerTurnTerminal)
	provider := &recordingFreshStructuredProvider{output: json.RawMessage(`{
		"kind":"terminal_projection",
		"observedThroughSequence":3,
		"currentFocus":"The narrator output boundary is complete.",
		"milestones":[],
		"finalSummary":"The terminal narrator projection is ready for atomic persistence.",
		"topicDescriptor":null
	}`)}
	caller := newTimedTestCaller(t, provider)
	callRequest := CallRequest{
		ID:            "terminal-output-call",
		Generation:    8,
		WorkspaceRoot: t.TempDir(),
		Projection:    &bundle,
	}
	result := runNarratorCall(t, caller, callRequest)
	store := &recordingNarratorOutputStore{}
	committer := newRecordingOutputCommitter(t, store)
	commit, err := committer.Prepare(callRequest, result)
	if err != nil {
		t.Fatalf("prepare terminal output commit: %v", err)
	}
	if err := commit(context.Background()); err != nil {
		t.Fatalf("commit terminal output: %v", err)
	}
	request := store.projections[0]
	if request.Trigger != conversation.NarrationTriggerTurnTerminal || request.FinalSummary == nil ||
		request.FinalSummary.Text != "The terminal narrator projection is ready for atomic persistence." {
		t.Fatalf("terminal projection commit = %+v", request)
	}
	if request.TopicDescriptor != nil || request.ConversationCommittedID != nil || request.Milestones == nil {
		t.Fatalf("terminal optional output shape = %+v", request)
	}
}

func testPrepareStatusOutputCommit(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	materializer := newFakeContextMaterializer(t, source)
	bundle, err := materializer.Status(context.Background(), StatusContextRequest{
		ConversationID: source.conversation.ID,
		TurnID:         &source.turn.ID,
		Question:       "What is happening now?",
		Limits:         testContextLimits(3),
	})
	if err != nil {
		t.Fatalf("materialize status output context: %v", err)
	}
	provider := &recordingFreshStructuredProvider{output: json.RawMessage(`{
		"kind":"status_reply",
		"sourceThroughSequence":3,
		"statusReply":"The primary agent continues while validated narrator output is persisted."
	}`)}
	caller := newTimedTestCaller(t, provider)
	callRequest := CallRequest{
		ID:            "status-output-call",
		Generation:    9,
		WorkspaceRoot: t.TempDir(),
		Status:        &bundle,
	}
	result := runNarratorCall(t, caller, callRequest)
	store := &recordingNarratorOutputStore{}
	committer := newRecordingOutputCommitter(t, store)
	mutatedBundle := bundle
	mutatedBundle.Question = "When is happening now?"
	mutatedRequest := callRequest
	mutatedRequest.Status = &mutatedBundle
	if _, err := committer.Prepare(mutatedRequest, result); err == nil {
		t.Fatal("status output commit accepted a same-sized context mutation")
	}
	commit, err := committer.Prepare(callRequest, result)
	if err != nil {
		t.Fatalf("prepare status output commit: %v", err)
	}
	if err := commit(context.Background()); err != nil {
		t.Fatalf("commit status output: %v", err)
	}
	if len(store.statuses) != 1 || len(store.projections) != 0 {
		t.Fatalf("status/projection commits = %d/%d", len(store.statuses), len(store.projections))
	}
	request := store.statuses[0]
	if request.Expected.ObservedThroughSequence != 0 || request.Expected.CurrentFocusRevision != 0 ||
		request.SourceSequenceStart != 1 || request.SourceThroughSequence != 3 ||
		request.Question != "What is happening now?" ||
		request.Reply.Text != "The primary agent continues while validated narrator output is persisted." {
		t.Fatalf("status output commit = %+v", request)
	}
	if request.TurnID == nil || *request.TurnID != source.turn.ID {
		t.Fatalf("status output turn = %v", request.TurnID)
	}
}

func testPrepareCheckpointOutputCommit(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	source.state.ObservedThroughSequence = 3
	materializer := newFakeContextMaterializer(t, source)
	bundle, err := materializer.Checkpoint(context.Background(), CheckpointContextRequest{
		ConversationID: source.conversation.ID,
		TurnID:         &source.turn.ID,
		Limits:         testContextLimits(3),
	})
	if err != nil {
		t.Fatalf("materialize checkpoint output context: %v", err)
	}
	provider := &recordingFreshStructuredProvider{output: json.RawMessage(`{
		"coveredThroughSequence":3,
		"historicalSummary":"The validated trajectory prefix is ready for durable compaction."
	}`)}
	caller := newTimedTestCaller(t, provider)
	callRequest := CallRequest{
		ID:            "checkpoint-output-call",
		Generation:    10,
		WorkspaceRoot: t.TempDir(),
		Checkpoint:    &bundle,
	}
	result := runNarratorCall(t, caller, callRequest)
	store := &recordingNarratorOutputStore{}
	committer := newRecordingOutputCommitter(t, store)
	commit, err := committer.Prepare(callRequest, result)
	if err != nil {
		t.Fatalf("prepare checkpoint output commit: %v", err)
	}
	if err := commit(context.Background()); err != nil {
		t.Fatalf("commit checkpoint output: %v", err)
	}
	if len(store.checkpoints) != 1 {
		t.Fatalf("checkpoint commits = %d, want 1", len(store.checkpoints))
	}
	request := store.checkpoints[0]
	if request.CoveredThroughSequence != 3 ||
		request.HistoricalSummary != "The validated trajectory prefix is ready for durable compaction." ||
		request.Expected.ObservedThroughSequence != 3 {
		t.Fatalf("checkpoint output commit = %+v", request)
	}
}

func TestOutputCommitterRejectsMismatchedMutatedOrInvalidSuccessfulResults(t *testing.T) {
	source := newFakeNarratorContextSource(2)
	bundle := materializeCallerProjection(t, source, conversation.NarrationTriggerPlanChanged)
	provider := &recordingFreshStructuredProvider{output: json.RawMessage(`{
		"kind":"working_projection",
		"observedThroughSequence":2,
		"currentFocus":"Validating the commit adapter.",
		"milestones":[],
		"topicDescriptor":null
	}`)}
	caller := newTimedTestCaller(t, provider)
	callRequest := CallRequest{
		ID:            "validate-output-call",
		Generation:    11,
		WorkspaceRoot: t.TempDir(),
		Projection:    &bundle,
	}
	result := runNarratorCall(t, caller, callRequest)
	store := &recordingNarratorOutputStore{}
	committer := newRecordingOutputCommitter(t, store)

	tests := []struct {
		name   string
		mutate func(*CallResult)
	}{
		{name: "generation", mutate: func(value *CallResult) { value.Generation++ }},
		{name: "input bytes", mutate: func(value *CallResult) { value.InputBytes++ }},
		{name: "output bytes", mutate: func(value *CallResult) { value.OutputBytes++ }},
		{name: "decoded output", mutate: func(value *CallResult) {
			value.NarratorOutput.WorkingProjection.CurrentFocus = "changed without changing structured output"
		}},
		{name: "model audit", mutate: func(value *CallResult) {
			value.Model.Settings.ModelID = "mutated-model"
		}},
		{name: "provider thread", mutate: func(value *CallResult) {
			value.ProviderThreadID = "mutated-provider-thread"
		}},
		{name: "missing end time", mutate: func(value *CallResult) { value.EndedAt = "" }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			candidate := cloneCallResultForTest(result)
			test.mutate(&candidate)
			if _, err := committer.Prepare(callRequest, candidate); err == nil {
				t.Fatalf("mutated %s result was accepted", test.name)
			}
		})
	}

	duplicateCommitter, err := NewOutputCommitter(
		store,
		WithOutputCommitterIDGenerator(func(string) (string, error) { return "duplicate-id", nil }),
	)
	if err != nil {
		t.Fatalf("new duplicate-id committer: %v", err)
	}
	if _, err := duplicateCommitter.Prepare(callRequest, result); err == nil {
		t.Fatal("output committer accepted reused record and publication ids")
	}
}

func TestOutputCommitterValidatesConstructionAndCommitErrors(t *testing.T) {
	if _, err := NewOutputCommitter(nil); err == nil {
		t.Fatal("output committer accepted nil store")
	}
	store := &recordingNarratorOutputStore{}
	if _, err := NewOutputCommitter(store, nil); err == nil {
		t.Fatal("output committer accepted nil option")
	}
	if _, err := NewOutputCommitter(store, WithOutputCommitterIDGenerator(nil)); err == nil {
		t.Fatal("output committer accepted nil id generator")
	}
	if _, err := NewCaller(
		newTestModelResolver(t, &modelResolverProfileSource{}, &modelResolverCatalog{}),
		&recordingFreshStructuredProvider{},
		WithCallerClock(nil),
	); err == nil {
		t.Fatal("caller accepted nil clock")
	}

	source := newFakeNarratorContextSource(1)
	bundle := materializeCallerProjection(t, source, conversation.NarrationTriggerPlanChanged)
	provider := &recordingFreshStructuredProvider{output: json.RawMessage(`{
		"kind":"working_projection",
		"observedThroughSequence":1,
		"currentFocus":"Propagating a store failure.",
		"milestones":[],
		"topicDescriptor":null
	}`)}
	caller := newTimedTestCaller(t, provider)
	callRequest := CallRequest{
		ID:            "store-error-call",
		Generation:    12,
		WorkspaceRoot: t.TempDir(),
		Projection:    &bundle,
	}
	result := runNarratorCall(t, caller, callRequest)
	sentinel := errors.New("store unavailable")
	store.err = sentinel
	committer := newRecordingOutputCommitter(t, store)
	commit, err := committer.Prepare(callRequest, result)
	if err != nil {
		t.Fatalf("prepare failing store commit: %v", err)
	}
	if err := commit(context.Background()); !errors.Is(err, sentinel) {
		t.Fatalf("store commit error = %v, want sentinel", err)
	}
}

type recordingNarratorOutputStore struct {
	projections []conversation.NarratorProjectionCommit
	statuses    []conversation.NarratorStatusCommit
	checkpoints []conversation.NarratorCheckpointCommit
	err         error
}

func (store *recordingNarratorOutputStore) CommitNarratorProjection(
	_ context.Context,
	request conversation.NarratorProjectionCommit,
) (conversation.NarratorProjectionCommitResult, error) {
	store.projections = append(store.projections, request)
	return conversation.NarratorProjectionCommitResult{}, store.err
}

func (store *recordingNarratorOutputStore) CommitNarratorStatus(
	_ context.Context,
	request conversation.NarratorStatusCommit,
) (conversation.NarratorStatusCommitResult, error) {
	store.statuses = append(store.statuses, request)
	return conversation.NarratorStatusCommitResult{}, store.err
}

func (store *recordingNarratorOutputStore) CommitNarratorCheckpoint(
	_ context.Context,
	request conversation.NarratorCheckpointCommit,
) (conversation.NarratorState, error) {
	store.checkpoints = append(store.checkpoints, request)
	return conversation.NarratorState{}, store.err
}

func newTimedTestCaller(t *testing.T, provider FreshStructuredCallProvider) *Caller {
	t.Helper()
	times := []time.Time{
		mustParseNarratorTestTime(t, narratorCallStarted),
		mustParseNarratorTestTime(t, narratorCallEnded),
	}
	index := 0
	models := newTestModelResolver(t, &modelResolverProfileSource{}, &modelResolverCatalog{})
	caller, err := NewCaller(models, provider, WithCallerClock(func() time.Time {
		if index >= len(times) {
			return times[len(times)-1]
		}
		value := times[index]
		index++
		return value
	}))
	if err != nil {
		t.Fatalf("new timed caller: %v", err)
	}
	return caller
}

func newRecordingOutputCommitter(
	t *testing.T,
	store NarratorOutputStore,
) *OutputCommitter {
	t.Helper()
	sequence := 0
	committer, err := NewOutputCommitter(
		store,
		WithOutputCommitterIDGenerator(func(prefix string) (string, error) {
			sequence++
			return fmt.Sprintf("%s-%02d", prefix, sequence), nil
		}),
	)
	if err != nil {
		t.Fatalf("new recording output committer: %v", err)
	}
	return committer
}

func runNarratorCall(t *testing.T, caller *Caller, request CallRequest) CallResult {
	t.Helper()
	result, err := caller.Call(context.Background(), request)
	if err != nil {
		t.Fatalf("run narrator call: %v", err)
	}
	if result.StartedAt != narratorCallStarted || result.EndedAt != narratorCallEnded {
		t.Fatalf("narrator call timeline = %s..%s", result.StartedAt, result.EndedAt)
	}
	return result
}

func assertCommittedNarratorInvocation(
	t *testing.T,
	invocation conversation.ResolvedInvocation,
	result CallResult,
) {
	t.Helper()
	if err := invocation.Validate(); err != nil {
		t.Fatalf("committed narrator invocation: %v", err)
	}
	if invocation.Role != conversation.RoleNarrator ||
		invocation.Outcome != conversation.InvocationOutcomeSucceeded ||
		invocation.Resolved.ModelID != "gpt-5.4-mini" ||
		invocation.ContextUsage.InputBytes != result.InputBytes ||
		invocation.ContextUsage.EstimatedInputTokens != result.InputTokens ||
		invocation.ContextUsage.OutputBytes != result.OutputBytes ||
		invocation.ContextUsage.EstimatedOutputTokens != result.OutputTokens ||
		invocation.StartedAt != narratorCallStarted || invocation.EndedAt == nil ||
		*invocation.EndedAt != narratorCallEnded {
		t.Fatalf("committed narrator invocation = %+v", invocation)
	}
	if invocation.ProviderReferences.ThreadID == nil ||
		*invocation.ProviderReferences.ThreadID != result.ProviderThreadID ||
		invocation.ProviderReferences.TurnID == nil ||
		*invocation.ProviderReferences.TurnID != result.ProviderTurnID ||
		invocation.ProviderReferences.RequestID == nil ||
		*invocation.ProviderReferences.RequestID != result.RequestID {
		t.Fatalf("committed narrator provider references = %+v", invocation.ProviderReferences)
	}
}

func assertDistinctOutputCommitIDs(t *testing.T, request conversation.NarratorProjectionCommit) {
	t.Helper()
	ids := []string{request.ResolvedInvocation.ID, request.NarratorStateCommittedID}
	if request.ConversationCommittedID != nil {
		ids = append(ids, *request.ConversationCommittedID)
	}
	for _, output := range request.Milestones {
		ids = append(ids, output.NarrationEventID, output.CommittedEventID)
	}
	if request.FinalSummary != nil {
		ids = append(ids, request.FinalSummary.NarrationEventID, request.FinalSummary.CommittedEventID)
	}
	if request.TopicDescriptor != nil {
		ids = append(ids, request.TopicDescriptor.NarrationEventID, request.TopicDescriptor.CommittedEventID)
	}
	seen := map[string]bool{}
	for _, id := range ids {
		if seen[id] {
			t.Fatalf("narrator output id %q was reused: %v", id, ids)
		}
		seen[id] = true
	}
}

func cloneCallResultForTest(result CallResult) CallResult {
	cloned := result
	cloned.Model = cloneModelResolution(result.Model)
	cloned.StructuredOutput = append([]byte{}, result.StructuredOutput...)
	if result.NarratorOutput != nil {
		output := *result.NarratorOutput
		if output.WorkingProjection != nil {
			value := *output.WorkingProjection
			value.Milestones = append([]string{}, value.Milestones...)
			value.TopicDescriptor = cloneOptionalString(value.TopicDescriptor)
			output.WorkingProjection = &value
		}
		cloned.NarratorOutput = &output
	}
	return cloned
}

func mustParseNarratorTestTime(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		t.Fatalf("parse narrator test time: %v", err)
	}
	return parsed
}
