package narration

import (
	"context"
	"encoding/json"
	"reflect"
	"sort"
	"strings"
	"testing"

	"setta/internal/agent"
	"setta/internal/conversation"
)

func TestCallerRunsFreshSchemaConstrainedCallsForEveryTypedTriggerKind(t *testing.T) {
	t.Run("focus projection", testCallerFocusProjection)
	t.Run("working projection", testCallerWorkingProjection)
	t.Run("terminal projection", testCallerTerminalProjection)
	t.Run("status reply", testCallerStatusReply)
	t.Run("checkpoint", testCallerCheckpoint)
}

func TestCallerPinsProviderDefaultToCatalogResolution(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	bundle := materializeCallerProjection(t, source, conversation.NarrationTriggerPlanChanged)
	profile := conversation.DefaultNarratorRoleProfile()
	profile.ModelSelection = conversation.ModelSelection{Mode: conversation.ModelSelectionProviderDefault}
	profiles := &modelResolverProfileSource{profile: &profile}
	catalog := &modelResolverCatalog{
		resolvedModel:       "gpt-provider-default",
		resolvedServiceTier: "standard",
	}
	models := newTestModelResolver(t, profiles, catalog)
	provider := &recordingFreshStructuredProvider{output: json.RawMessage(`{
		"kind":"working_projection",
		"observedThroughSequence":3,
		"milestones":[]
	}`)}
	caller, err := NewCaller(models, provider)
	if err != nil {
		t.Fatalf("NewCaller: %v", err)
	}

	result := callProjection(t, caller, bundle)
	invocation := provider.requests[0].Invocation
	if invocation.ModelSelectionProviderDefault || invocation.Model != "gpt-provider-default" {
		t.Fatalf("provider invocation did not pin catalog model: %+v", invocation)
	}
	if invocation.ServiceTier == nil || *invocation.ServiceTier != "standard" {
		t.Fatalf("provider invocation service tier = %v, want resolved standard", invocation.ServiceTier)
	}
	if result.Model.RequestedProfile.ModelSelection.Mode != conversation.ModelSelectionProviderDefault ||
		result.Model.Settings.ModelID != "gpt-provider-default" {
		t.Fatalf("provider-default audit resolution = %+v", result.Model)
	}
}

func testCallerFocusProjection(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	bundle := materializeCallerFocus(t, source, conversation.NarrationTriggerInputAccepted, 1)
	provider := &recordingFreshStructuredProvider{output: json.RawMessage(`{
		"kind":"focus_projection",
		"sourceThroughSequence":1,
		"currentFocus":"Implementing the narrator provider boundary.",
		"topicDescriptor":"Narrator provider calls"
	}`)}
	caller := newTestCaller(t, provider)
	result, err := caller.Call(context.Background(), CallRequest{
		ID:            "narrator-focus-call",
		Generation:    1,
		WorkspaceRoot: t.TempDir(),
		Focus:         &bundle,
	})
	if err != nil {
		t.Fatalf("focus Call: %v", err)
	}
	if result.Kind != RequestKindFocus || result.Trigger != conversation.NarrationTriggerInputAccepted ||
		result.NarratorOutput == nil || result.NarratorOutput.FocusProjection == nil {
		t.Fatalf("focus call result = %+v", result)
	}
	assertCallerProviderRequest(t, provider, bundle.InputBytes, string(CallOutputFocusProjection))
	assertSchemaProperties(t, provider.requests[0].OutputSchema,
		[]string{"currentFocus", "kind", "sourceThroughSequence", "topicDescriptor"},
	)
}

func testCallerWorkingProjection(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	bundle := materializeCallerProjection(t, source, conversation.NarrationTriggerPlanChanged)
	provider := &recordingFreshStructuredProvider{output: json.RawMessage(`{
		"kind":"working_projection",
		"observedThroughSequence":3,
		"milestones":["The provider boundary is now typed."]
	}`)}
	caller := newTestCaller(t, provider)
	result := callProjection(t, caller, bundle)
	if result.Kind != RequestKindProjection || result.Trigger != conversation.NarrationTriggerPlanChanged ||
		result.NarratorOutput == nil || result.NarratorOutput.WorkingProjection == nil {
		t.Fatalf("working call result = %+v", result)
	}
	assertCallerProviderRequest(t, provider, bundle.InputBytes, string(CallOutputWorkingProjection))
	assertSchemaProperties(t, provider.requests[0].OutputSchema,
		[]string{"kind", "milestones", "observedThroughSequence"},
	)
}

func testCallerTerminalProjection(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	bundle := materializeCallerProjection(t, source, conversation.NarrationTriggerTurnTerminal)
	provider := &recordingFreshStructuredProvider{output: json.RawMessage(`{
		"kind":"terminal_projection",
		"observedThroughSequence":3,
		"milestones":[],
		"finalSummary":"The isolated provider call completed with a strict terminal projection."
	}`)}
	caller := newTestCaller(t, provider)
	result := callProjection(t, caller, bundle)
	if result.NarratorOutput == nil || result.NarratorOutput.TerminalProjection == nil ||
		result.NarratorOutput.TerminalProjection.FinalSummary == "" {
		t.Fatalf("terminal call result = %+v", result)
	}
	assertCallerProviderRequest(t, provider, bundle.InputBytes, string(CallOutputTerminalProjection))
	assertSchemaProperties(t, provider.requests[0].OutputSchema,
		[]string{"finalSummary", "kind", "milestones", "observedThroughSequence"},
	)
	assertSchemaIntegerBounds(t, provider.requests[0].OutputSchema, "observedThroughSequence", 3, 3)
}

func TestCallerRejectsTerminalProjectionBeforeTerminalBoundary(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	bundle := materializeCallerProjection(t, source, conversation.NarrationTriggerTurnTerminal)
	provider := &recordingFreshStructuredProvider{output: json.RawMessage(`{
		"kind":"terminal_projection",
		"observedThroughSequence":2,
		"milestones":[],
		"finalSummary":"This summary cannot cover a terminal event the narrator did not observe."
	}`)}
	caller := newTestCaller(t, provider)

	_, err := caller.Call(context.Background(), CallRequest{
		ID:            "narrator-early-terminal-call",
		Generation:    1,
		WorkspaceRoot: t.TempDir(),
		Projection:    &bundle,
	})
	if err == nil || !strings.Contains(err.Error(), "must observe terminal boundary 3") {
		t.Fatalf("early terminal projection error = %v", err)
	}
}

func testCallerStatusReply(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	materializer := newFakeContextMaterializer(t, source)
	bundle, err := materializer.Status(context.Background(), StatusContextRequest{
		ConversationID: source.conversation.ID,
		TurnID:         &source.turn.ID,
		Question:       "What is happening now?",
		Limits:         testContextLimits(3),
	})
	if err != nil {
		t.Fatalf("materialize status: %v", err)
	}
	provider := &recordingFreshStructuredProvider{output: json.RawMessage(`{
		"kind":"status_reply",
		"sourceThroughSequence":3,
		"statusReply":"The narrator provider boundary is being verified."
	}`)}
	caller := newTestCaller(t, provider)
	result, err := caller.Call(context.Background(), CallRequest{
		ID:            "narrator-status-call",
		Generation:    2,
		WorkspaceRoot: t.TempDir(),
		Status:        &bundle,
	})
	if err != nil {
		t.Fatalf("status Call: %v", err)
	}
	if result.Kind != RequestKindStatus || result.Trigger != conversation.NarrationTriggerExplicitStatusRequested ||
		result.NarratorOutput == nil || result.NarratorOutput.StatusReply == nil {
		t.Fatalf("status call result = %+v", result)
	}
	assertCallerProviderRequest(t, provider, bundle.InputBytes, string(CallOutputStatusReply))
	assertSchemaProperties(t, provider.requests[0].OutputSchema,
		[]string{"kind", "sourceThroughSequence", "statusReply"},
	)
}

func testCallerCheckpoint(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	source.state.ObservedThroughSequence = 3
	materializer := newFakeContextMaterializer(t, source)
	bundle, err := materializer.Checkpoint(context.Background(), CheckpointContextRequest{
		ConversationID: source.conversation.ID,
		TurnID:         &source.turn.ID,
		Limits:         testContextLimits(3),
	})
	if err != nil {
		t.Fatalf("materialize checkpoint: %v", err)
	}
	provider := &recordingFreshStructuredProvider{output: json.RawMessage(`{
		"coveredThroughSequence":3,
		"historicalSummary":"The first three trajectory events were already evaluated."
	}`)}
	caller := newTestCaller(t, provider)
	result, err := caller.Call(context.Background(), CallRequest{
		ID:            "narrator-checkpoint-call",
		Generation:    3,
		WorkspaceRoot: t.TempDir(),
		Checkpoint:    &bundle,
	})
	if err != nil {
		t.Fatalf("checkpoint Call: %v", err)
	}
	if result.Kind != RequestKindCheckpoint || result.Trigger != conversation.NarrationTriggerCheckpointWindowExceeded ||
		result.CheckpointOutput == nil || result.NarratorOutput != nil {
		t.Fatalf("checkpoint call result = %+v", result)
	}
	assertCallerProviderRequest(t, provider, bundle.InputBytes, "")
	assertSchemaProperties(t, provider.requests[0].OutputSchema,
		[]string{"coveredThroughSequence", "historicalSummary"},
	)
}

func TestCallerRejectsMalformedOrCrossChannelNarratorOutput(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	source.milestones = []conversation.NarrationEvent{
		fakeMilestone("prior-milestone", 1, "The existing milestone remains unique."),
	}
	bundle := materializeCallerProjection(t, source, conversation.NarrationTriggerPlanChanged)
	tests := []struct {
		name    string
		output  string
		message string
	}{
		{
			name: "unknown field",
			output: `{"kind":"working_projection","observedThroughSequence":3,` +
				`"milestones":[],"finalSummary":"not allowed"}`,
			message: "unknown field",
		},
		{
			name:    "projection cannot carry focus",
			output:  `{"kind":"working_projection","observedThroughSequence":3,"currentFocus":"Working.","milestones":[]}`,
			message: "unknown field",
		},
		{
			name:    "wrong channel",
			output:  `{"kind":"terminal_projection","observedThroughSequence":3,"milestones":[]}`,
			message: "has kind",
		},
		{
			name:    "cursor outside range",
			output:  `{"kind":"working_projection","observedThroughSequence":4,"milestones":[]}`,
			message: "outside supplied evaluation range",
		},
		{
			name:    "duplicate prior milestone",
			output:  `{"kind":"working_projection","observedThroughSequence":3,"milestones":["The existing milestone remains unique."]}`,
			message: "repeated prior active-turn milestone",
		},
		{
			name:    "not voice ready",
			output:  `{"kind":"working_projection","observedThroughSequence":3,"milestones":["line one\nline two"]}`,
			message: "control characters",
		},
		{
			name:    "too many milestones",
			output:  `{"kind":"working_projection","observedThroughSequence":3,"milestones":["One.","Two."]}`,
			message: "maximum is 1",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			provider := &recordingFreshStructuredProvider{output: json.RawMessage(test.output)}
			caller := newTestCaller(t, provider)
			_, err := caller.Call(context.Background(), CallRequest{
				ID:            "narrator-invalid-output",
				Generation:    1,
				WorkspaceRoot: t.TempDir(),
				Projection:    &bundle,
			})
			if err == nil || !strings.Contains(err.Error(), test.message) {
				t.Fatalf("invalid output error = %v, want %q", err, test.message)
			}
		})
	}
}

func TestStatusOutputCannotClaimAnotherSourceSequence(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	materializer := newFakeContextMaterializer(t, source)
	bundle, err := materializer.Status(context.Background(), StatusContextRequest{
		ConversationID: source.conversation.ID,
		TurnID:         &source.turn.ID,
		Question:       "What is happening now?",
		Limits:         testContextLimits(3),
	})
	if err != nil {
		t.Fatalf("materialize status: %v", err)
	}
	_, err = decodeStatusOutput(json.RawMessage(`{
		"kind":"status_reply",
		"sourceThroughSequence":2,
		"statusReply":"Work is still in progress."
	}`), bundle)
	if err == nil || !strings.Contains(err.Error(), "must equal supplied source 3") {
		t.Fatalf("status source error = %v", err)
	}
}

func TestStatusOutputRequiresZeroSourceSequenceField(t *testing.T) {
	_, err := decodeStatusOutput(json.RawMessage(`{
		"kind":"status_reply",
		"statusReply":"No trajectory events have been recorded yet."
	}`), StatusContextBundle{
		Kind:                  ContextKindStatus,
		Trigger:               conversation.NarrationTriggerExplicitStatusRequested,
		SourceThroughSequence: 0,
	})
	if err == nil || !strings.Contains(err.Error(), "sourceThroughSequence is required") {
		t.Fatalf("missing zero source sequence error = %v", err)
	}
}

func TestCallerValidatesOutputAgainstFrozenSuppliedContext(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	bundle := materializeCallerProjection(t, source, conversation.NarrationTriggerPlanChanged)
	provider := &recordingFreshStructuredProvider{
		output: json.RawMessage(`{
			"kind":"working_projection",
			"observedThroughSequence":4,
			"milestones":[]
		}`),
		beforeReturn: func() {
			bundle.EvaluationRange.End = 4
			bundle.RequestedThroughSequence = 4
		},
	}
	caller := newTestCaller(t, provider)

	_, err := caller.Call(context.Background(), CallRequest{
		ID:            "narrator-frozen-context",
		Generation:    1,
		WorkspaceRoot: t.TempDir(),
		Projection:    &bundle,
	})
	if err == nil || !strings.Contains(err.Error(), "outside supplied evaluation range") {
		t.Fatalf("mutated post-dispatch context error = %v", err)
	}
}

func TestCallerRetainsAttemptMetadataWhenOutputValidationFails(t *testing.T) {
	source := newFakeNarratorContextSource(3)
	bundle := materializeCallerProjection(t, source, conversation.NarrationTriggerPlanChanged)
	providerOutput := json.RawMessage(`{
		"kind":"working_projection",
		"observedThroughSequence":3,
		"milestones":[],
		"finalSummary":"Cross-channel output is invalid."
	}`)
	provider := &recordingFreshStructuredProvider{output: providerOutput}
	caller := newTestCaller(t, provider)

	result, err := caller.Call(context.Background(), CallRequest{
		ID:            "narrator-invalid-output-audit",
		Generation:    7,
		WorkspaceRoot: t.TempDir(),
		Projection:    &bundle,
	})
	if err == nil || !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("invalid output error = %v", err)
	}
	if result.RequestID != "narrator-invalid-output-audit" || result.Generation != 7 ||
		result.Kind != RequestKindProjection || result.Trigger != conversation.NarrationTriggerPlanChanged ||
		result.ConversationID != source.conversation.ID || result.Model.Settings.ModelID != "gpt-5.4-mini" ||
		result.ProviderThreadID == "" || result.ProviderTurnID == "" || result.InputBytes != bundle.InputBytes ||
		result.OutputBytes != len(providerOutput) || !reflect.DeepEqual(result.StructuredOutput, providerOutput) {
		t.Fatalf("failed-call audit metadata = %+v", result)
	}
	if result.NarratorOutput != nil || result.CheckpointOutput != nil {
		t.Fatalf("failed output populated validated branches: %+v", result)
	}
}

func TestCallerValidatesTypedContextBeforeModelOrProvider(t *testing.T) {
	profiles := &modelResolverProfileSource{}
	catalog := &modelResolverCatalog{}
	models := newTestModelResolver(t, profiles, catalog)
	provider := &recordingFreshStructuredProvider{}
	caller, err := NewCaller(models, provider)
	if err != nil {
		t.Fatalf("NewCaller: %v", err)
	}

	_, err = caller.Call(context.Background(), CallRequest{
		ID:            "invalid-branch-call",
		Generation:    1,
		WorkspaceRoot: t.TempDir(),
	})
	if err == nil || !strings.Contains(err.Error(), "0 context branches") {
		t.Fatalf("missing branch error = %v", err)
	}
	if catalog.calls != 0 || len(provider.requests) != 0 {
		t.Fatalf("invalid call reached model/provider: catalog=%d provider=%d", catalog.calls, len(provider.requests))
	}

	if _, err := NewCaller(nil, provider); err == nil {
		t.Fatal("NewCaller accepted nil model resolver")
	}
	if _, err := NewCaller(models, nil); err == nil {
		t.Fatal("NewCaller accepted nil structured provider")
	}
}

type recordingFreshStructuredProvider struct {
	requests     []agent.FreshStructuredCallRequest
	output       json.RawMessage
	err          error
	beforeReturn func()
}

func (provider *recordingFreshStructuredProvider) RunFreshStructuredCall(
	_ context.Context,
	request agent.FreshStructuredCallRequest,
) (agent.FreshStructuredCallResult, error) {
	request.Input = append(json.RawMessage{}, request.Input...)
	request.OutputSchema = append(json.RawMessage{}, request.OutputSchema...)
	provider.requests = append(provider.requests, request)
	if provider.beforeReturn != nil {
		provider.beforeReturn()
	}
	if provider.err != nil {
		return agent.FreshStructuredCallResult{}, provider.err
	}
	return agent.FreshStructuredCallResult{
		ProviderThreadID: "narrator-provider-thread",
		ProviderTurnID:   "narrator-provider-turn",
		Output:           append(json.RawMessage{}, provider.output...),
	}, nil
}

func newTestCaller(t *testing.T, provider FreshStructuredCallProvider) *Caller {
	t.Helper()
	models := newTestModelResolver(t, &modelResolverProfileSource{}, &modelResolverCatalog{})
	caller, err := NewCaller(models, provider)
	if err != nil {
		t.Fatalf("NewCaller: %v", err)
	}
	return caller
}

func materializeCallerProjection(
	t *testing.T,
	source *fakeNarratorContextSource,
	trigger conversation.NarrationTrigger,
) ProjectionContextBundle {
	t.Helper()
	materializer := newFakeContextMaterializer(t, source)
	bundle, err := materializer.Projection(context.Background(), ProjectionContextRequest{
		ConversationID:  source.conversation.ID,
		TurnID:          source.turn.ID,
		Trigger:         trigger,
		ThroughSequence: source.conversation.LastTrajectorySequence,
		Limits:          testContextLimits(len(source.events)),
	})
	if err != nil {
		t.Fatalf("materialize projection: %v", err)
	}
	return bundle
}

func materializeCallerFocus(
	t *testing.T,
	source *fakeNarratorContextSource,
	trigger conversation.NarrationTrigger,
	sourceSequence int,
) FocusContextBundle {
	t.Helper()
	materializer := newFakeContextMaterializer(t, source)
	bundle, err := materializer.Focus(context.Background(), FocusContextRequest{
		ConversationID: source.conversation.ID,
		TurnID:         source.turn.ID,
		Trigger:        trigger,
		SourceSequence: sourceSequence,
		Limits:         testContextLimits(len(source.events)),
	})
	if err != nil {
		t.Fatalf("materialize focus: %v", err)
	}
	return bundle
}

func callProjection(t *testing.T, caller *Caller, bundle ProjectionContextBundle) CallResult {
	t.Helper()
	result, err := caller.Call(context.Background(), CallRequest{
		ID:            "narrator-projection-call",
		Generation:    1,
		WorkspaceRoot: t.TempDir(),
		Projection:    &bundle,
	})
	if err != nil {
		t.Fatalf("projection Call: %v", err)
	}
	return result
}

func assertCallerProviderRequest(
	t *testing.T,
	provider *recordingFreshStructuredProvider,
	wantInputBytes int,
	wantKind string,
) {
	t.Helper()
	if len(provider.requests) != 1 {
		t.Fatalf("provider requests = %d, want 1", len(provider.requests))
	}
	request := provider.requests[0]
	if err := request.Validate(); err != nil {
		t.Fatalf("provider request contract: %v", err)
	}
	if len(request.Input) != wantInputBytes {
		t.Fatalf("provider input bytes = %d, want %d", len(request.Input), wantInputBytes)
	}
	if request.Invocation.Model != "gpt-5.4-mini" || request.Invocation.ReasoningEffort != "low" ||
		request.Invocation.PermissionMode != agent.PermissionModeReadOnly || request.Invocation.ApprovalMode != agent.ApprovalModeNever {
		t.Fatalf("provider narrator invocation = %+v", request.Invocation)
	}
	var contextEnvelope map[string]any
	if err := json.Unmarshal(request.Input, &contextEnvelope); err != nil {
		t.Fatalf("decode provider input: %v", err)
	}
	if contextEnvelope["trigger"] == nil {
		t.Fatalf("provider input omitted typed trigger: %s", request.Input)
	}
	if wantKind == "" {
		return
	}
	var schema map[string]any
	if err := json.Unmarshal(request.OutputSchema, &schema); err != nil {
		t.Fatalf("decode provider schema: %v", err)
	}
	properties := schema["properties"].(map[string]any)
	kindSchema := properties["kind"].(map[string]any)
	if !reflect.DeepEqual(kindSchema["enum"], []any{wantKind}) {
		t.Fatalf("provider output kind schema = %+v, want %s", kindSchema, wantKind)
	}
}

func assertSchemaProperties(t *testing.T, raw json.RawMessage, want []string) {
	t.Helper()
	var schema map[string]any
	if err := json.Unmarshal(raw, &schema); err != nil {
		t.Fatalf("decode output schema: %v", err)
	}
	if schema["type"] != "object" || schema["additionalProperties"] != false {
		t.Fatalf("output schema is not strict: %+v", schema)
	}
	properties := schema["properties"].(map[string]any)
	got := make([]string, 0, len(properties))
	for name := range properties {
		got = append(got, name)
	}
	sort.Strings(got)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("output schema properties = %v, want %v", got, want)
	}
	required := schema["required"].([]any)
	if len(required) != len(properties) {
		t.Fatalf("output schema required = %v, properties = %v", required, got)
	}
}

func assertSchemaIntegerBounds(
	t *testing.T,
	raw json.RawMessage,
	property string,
	wantMinimum int,
	wantMaximum int,
) {
	t.Helper()
	var schema map[string]any
	if err := json.Unmarshal(raw, &schema); err != nil {
		t.Fatalf("decode output schema: %v", err)
	}
	properties := schema["properties"].(map[string]any)
	value := properties[property].(map[string]any)
	if value["minimum"] != float64(wantMinimum) || value["maximum"] != float64(wantMaximum) {
		t.Fatalf(
			"output schema %s bounds = %v..%v, want %d..%d",
			property,
			value["minimum"],
			value["maximum"],
			wantMinimum,
			wantMaximum,
		)
	}
}
