package conversation

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"setta/internal/agent"
)

func TestEmitArtifactToolCommitsTypedArtifact(t *testing.T) {
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(ctx)
		_ = store.Close()
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	created := createArtifactToolTopic(t, ctx, service, workspaceID)
	conversationID := created.Conversation.ID
	active := startHeldArtifactToolTurn(t, ctx, service, runtime, workspaceID, conversationID)
	requireArtifactToolRequest(t, runtime)

	artifact := emitTestTableArtifact(t, ctx, service, workspaceID, conversationID, active)
	requireTableArtifact(t, artifact)
	read := readTestArtifact(t, ctx, service, workspaceID, conversationID, artifact.ID)
	requireReadTableArtifact(t, read, artifact.ID)
	snapshot := readTestSnapshot(t, ctx, service, workspaceID, conversationID)
	requireSnapshotArtifact(t, snapshot, artifact.ID)
	requireArtifactTrajectory(t, snapshot, artifact.ID)
	stopTestTurn(t, ctx, service, workspaceID, conversationID)
}

func TestEmitArtifactToolReturnsStructuredFailureAndAllowsRetry(t *testing.T) {
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(ctx)
		_ = store.Close()
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	created := createArtifactToolTopic(t, ctx, service, workspaceID)
	conversationID := created.Conversation.ID
	active := startHeldArtifactToolTurn(t, ctx, service, runtime, workspaceID, conversationID)
	tools := service.topicAgentArtifactTools(workspaceID, conversationID, active.turnID)
	if len(tools) != 1 {
		t.Fatalf("artifact tools = %+v", tools)
	}
	failed, err := tools[0].Handler(ctx, agent.DynamicToolCall{
		CallID:           "provider-tool-call-failed",
		ConversationID:   conversationID,
		TurnID:           active.turnID,
		ProviderThreadID: active.providerThreadID,
		ProviderTurnID:   active.providerTurnID,
		Namespace:        artifactToolNamespace,
		Tool:             artifactToolName,
		Arguments:        []byte(`{"kind":"table"}`),
	})
	if err != nil {
		t.Fatalf("failed artifact handler returned error: %v", err)
	}
	failure := requireArtifactToolFailureResult(t, failed, artifactToolFailureMissingRequiredFields)
	requireDynamicToolFieldErrors(t, failure.FieldErrors, []string{"title", "columns", "rows"})

	afterFailure := readTestSnapshot(t, ctx, service, workspaceID, conversationID)
	requireArtifactToolFailureTrajectory(t, afterFailure, failure.DiagnosticReference)
	if len(afterFailure.Artifacts.Artifacts) != 0 {
		t.Fatalf("failed artifact attempt created artifacts = %+v", afterFailure.Artifacts)
	}

	succeeded, err := tools[0].Handler(ctx, agent.DynamicToolCall{
		CallID:           "provider-tool-call-retry",
		ConversationID:   conversationID,
		TurnID:           active.turnID,
		ProviderThreadID: active.providerThreadID,
		ProviderTurnID:   active.providerTurnID,
		Namespace:        artifactToolNamespace,
		Tool:             artifactToolName,
		Arguments: []byte(`{
			"kind":"table",
			"title":"Language line counts",
			"columns":[{"key":"language","label":"Language"},{"key":"lines","label":"Lines"}],
			"rows":[["Go","34"],["TypeScript","21"],["CSS","8"]]
		}`),
	})
	if err != nil {
		t.Fatalf("retry artifact handler returned error: %v", err)
	}
	if !succeeded.Success || succeeded.Failure != nil {
		t.Fatalf("retry result = %+v", succeeded)
	}
	afterRetry := readTestSnapshot(t, ctx, service, workspaceID, conversationID)
	if len(afterRetry.Artifacts.Artifacts) != 1 ||
		afterRetry.Artifacts.Artifacts[0].Kind != ArtifactKindTable {
		t.Fatalf("retry artifacts = %+v", afterRetry.Artifacts)
	}
	completed := completeActiveArtifactToolTurn(t, ctx, service, workspaceID, conversationID, active, "")
	if latestSnapshotTurn(completed).Status != TurnStatusCompleted {
		t.Fatalf("completed retry turn = %+v", latestSnapshotTurn(completed))
	}
}

func TestFailedArtifactAttemptMakesProviderCompletionUnresolved(t *testing.T) {
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(ctx)
		_ = store.Close()
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	created := createArtifactToolTopic(t, ctx, service, workspaceID)
	conversationID := created.Conversation.ID
	active := startHeldArtifactToolTurn(t, ctx, service, runtime, workspaceID, conversationID)
	tools := service.topicAgentArtifactTools(workspaceID, conversationID, active.turnID)
	if len(tools) != 1 {
		t.Fatalf("artifact tools = %+v", tools)
	}
	failed, err := tools[0].Handler(ctx, agent.DynamicToolCall{
		CallID:           "provider-tool-call-unresolved",
		ConversationID:   conversationID,
		TurnID:           active.turnID,
		ProviderThreadID: active.providerThreadID,
		ProviderTurnID:   active.providerTurnID,
		Namespace:        artifactToolNamespace,
		Tool:             artifactToolName,
		Arguments:        []byte(`{"kind":"table"}`),
	})
	if err != nil {
		t.Fatalf("failed artifact handler returned error: %v", err)
	}
	toolFailure := requireArtifactToolFailureResult(t, failed, artifactToolFailureMissingRequiredFields)

	finalProse := "Here is the table in prose, which must remain diagnostic text."
	unresolved := completeActiveArtifactToolTurn(t, ctx, service, workspaceID, conversationID, active, finalProse)
	turn := latestSnapshotTurn(unresolved)
	if turn.Status != TurnStatusFailed ||
		turn.Error == nil ||
		turn.Error.Code != artifactDeliveryUnresolvedFailureCode ||
		!turn.Error.Retryable ||
		turn.Error.DiagnosticReference != toolFailure.DiagnosticReference ||
		!strings.Contains(turn.Error.Message, artifactToolFailureMissingRequiredFields) {
		t.Fatalf("unresolved artifact turn = %+v", turn)
	}
	if len(unresolved.Artifacts.Artifacts) != 0 {
		t.Fatalf("unresolved artifact attempt published artifacts = %+v", unresolved.Artifacts)
	}
	requireAgentMessageTrajectory(t, unresolved, finalProse)
	requireSystemTurnFailedTrajectory(t, unresolved, artifactDeliveryUnresolvedFailureCode)
}

func TestEmitArtifactToolSchemaDeclaresStrictBranches(t *testing.T) {
	var schema struct {
		OneOf []struct {
			AdditionalProperties *bool                      `json:"additionalProperties"`
			Required             []string                   `json:"required"`
			Properties           map[string]json.RawMessage `json:"properties"`
		} `json:"oneOf"`
		Properties map[string]json.RawMessage `json:"properties"`
	}
	if err := json.Unmarshal(emitArtifactInputSchemaJSON, &schema); err != nil {
		t.Fatalf("decode emit artifact schema: %v", err)
	}
	requireSchemaKindEnum(t, schema.Properties["kind"])
	wantBranches := map[string]struct {
		required []string
		allowed  []string
	}{
		"markdown":  {required: []string{"kind", "title", "markdown"}, allowed: []string{"kind", "title", "markdown"}},
		"table":     {required: []string{"kind", "title", "columns", "rows"}, allowed: []string{"kind", "title", "columns", "rows"}},
		"bar_chart": {required: []string{"kind", "title", "items"}, allowed: []string{"kind", "title", "items"}},
		"file":      {required: []string{"kind", "title", "path"}, allowed: []string{"kind", "title", "path", "description"}},
	}
	if len(schema.OneOf) != len(wantBranches) {
		t.Fatalf("schema branches = %d, want %d", len(schema.OneOf), len(wantBranches))
	}
	seen := map[string]bool{}
	for index, branch := range schema.OneOf {
		if branch.AdditionalProperties == nil || *branch.AdditionalProperties {
			t.Fatalf("schema branch[%d] does not reject additional properties", index)
		}
		kind := requireSchemaKindConst(t, branch.Properties["kind"])
		want, ok := wantBranches[kind]
		if !ok {
			t.Fatalf("schema branch[%d] kind = %q", index, kind)
		}
		if seen[kind] {
			t.Fatalf("schema kind %q is duplicated", kind)
		}
		seen[kind] = true
		requireStringSet(t, kind+" required fields", branch.Required, want.required)
		requireStringSet(t, kind+" allowed fields", mapKeys(branch.Properties), want.allowed)
	}
}

func requireArtifactToolFailureResult(
	t *testing.T,
	result agent.DynamicToolResult,
	code string,
) agent.DynamicToolFailure {
	t.Helper()
	if result.Success || result.Failure == nil {
		t.Fatalf("dynamic tool result = %+v, want structured failure", result)
	}
	if len(result.ContentItems) != 1 ||
		result.ContentItems[0].Type != "inputText" ||
		strings.TrimSpace(result.ContentItems[0].Text) == "" {
		t.Fatalf("dynamic tool failure content items = %+v", result.ContentItems)
	}
	var output agent.DynamicToolFailure
	if err := json.Unmarshal([]byte(result.ContentItems[0].Text), &output); err != nil {
		t.Fatalf("decode dynamic tool failure output %q: %v", result.ContentItems[0].Text, err)
	}
	if output.Code != code ||
		result.Failure.Code != code ||
		output.Message == "" ||
		output.DiagnosticReference == "" ||
		output.DiagnosticReference != result.Failure.DiagnosticReference ||
		!output.Retryable {
		t.Fatalf("dynamic tool failure = output %+v, result %+v", output, result.Failure)
	}
	return output
}

func requireDynamicToolFieldErrors(
	t *testing.T,
	fieldErrors []agent.DynamicToolFieldError,
	fields []string,
) {
	t.Helper()
	seen := map[string]bool{}
	for _, fieldError := range fieldErrors {
		if strings.TrimSpace(fieldError.Message) == "" {
			t.Fatalf("blank field error = %+v", fieldErrors)
		}
		seen[fieldError.Field] = true
	}
	for _, field := range fields {
		if !seen[field] {
			t.Fatalf("field errors = %+v, missing %s", fieldErrors, field)
		}
	}
}

func requireArtifactToolFailureTrajectory(
	t *testing.T,
	snapshot ConversationSnapshot,
	diagnosticReference string,
) {
	t.Helper()
	if len(snapshot.Trajectory.Events) == 0 {
		t.Fatal("snapshot has no trajectory events")
	}
	event := snapshot.Trajectory.Events[len(snapshot.Trajectory.Events)-1]
	if event.Kind != TrajectoryEventActivityFailed || event.ActivityFailed == nil {
		t.Fatalf("latest trajectory = %+v, want activity_failed", event)
	}
	activity := event.ActivityFailed.Activity
	if activity.Kind != TrajectoryActivityDynamicTool ||
		activity.Tool == nil ||
		*activity.Tool != artifactToolName ||
		activity.Namespace == nil ||
		*activity.Namespace != artifactToolNamespace {
		t.Fatalf("artifact tool failure activity = %+v", activity)
	}
	failure := event.ActivityFailed.Failure
	if failure.Code != artifactToolFailureMissingRequiredFields ||
		!failure.Retryable ||
		failure.DiagnosticReference != diagnosticReference {
		t.Fatalf("artifact tool failure trajectory = %+v", event)
	}
}

func requireSchemaKindEnum(t *testing.T, raw json.RawMessage) {
	t.Helper()
	var property struct {
		Enum []string `json:"enum"`
	}
	if err := json.Unmarshal(raw, &property); err != nil {
		t.Fatalf("decode schema kind enum: %v", err)
	}
	requireStringSet(t, "schema kind enum", property.Enum, []string{"markdown", "table", "bar_chart", "file"})
}

func requireSchemaKindConst(t *testing.T, raw json.RawMessage) string {
	t.Helper()
	var property struct {
		Const string `json:"const"`
	}
	if err := json.Unmarshal(raw, &property); err != nil {
		t.Fatalf("decode schema branch kind: %v", err)
	}
	return property.Const
}

func requireStringSet(t *testing.T, label string, got []string, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s = %+v, want %+v", label, got, want)
	}
	seen := map[string]bool{}
	for _, value := range got {
		seen[value] = true
	}
	for _, value := range want {
		if !seen[value] {
			t.Fatalf("%s = %+v, want %+v", label, got, want)
		}
	}
}

func mapKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	return keys
}

func createArtifactToolTopic(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
) ConversationSnapshot {
	t.Helper()
	created, err := service.CreateTopic(ctx, workspaceID, "Tool artifact")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	return created
}

func startHeldArtifactToolTurn(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
	conversationID string,
) *activeConversationTurn {
	t.Helper()
	if _, err := service.sendTestTurn(ctx, workspaceID, conversationID, "hold"); err != nil {
		t.Fatalf("send held turn: %v", err)
	}
	runtime.waitForStart(t, "hold")
	active := service.activeFor(conversationID)
	if active == nil || active.providerTurnID == "" {
		t.Fatalf("active turn = %+v", active)
	}
	return active
}

func requireArtifactToolRequest(t *testing.T, runtime *serviceTestAgentRuntime) {
	t.Helper()
	turnRequests := runtime.turnRequests()
	if len(turnRequests) != 1 || len(turnRequests[0].DynamicTools) != 1 {
		t.Fatalf("turn request dynamic tools = %+v", turnRequests)
	}
}

func emitTestTableArtifact(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
	conversationID string,
	active *activeConversationTurn,
) Artifact {
	t.Helper()
	artifact, err := service.emitArtifactFromTool(ctx, workspaceID, conversationID, active.turnID, agent.DynamicToolCall{
		CallID:           "provider-tool-call-1",
		ConversationID:   conversationID,
		TurnID:           active.turnID,
		ProviderThreadID: active.providerThreadID,
		ProviderTurnID:   active.providerTurnID,
		Namespace:        artifactToolNamespace,
		Tool:             artifactToolName,
		Arguments: []byte(`{
			"kind":"table",
			"title":"Language line counts",
			"columns":[{"key":"language","label":"Language"},{"key":"lines","label":"Lines"}],
			"rows":[["Go","34"],["TypeScript","21"],["CSS","8"]]
		}`),
	})
	if err != nil {
		t.Fatalf("emitArtifactFromTool: %v", err)
	}
	return artifact
}

func requireTableArtifact(t *testing.T, artifact Artifact) {
	t.Helper()
	if artifact.Kind != ArtifactKindTable || artifact.Table == nil || len(artifact.Table.Rows) != 3 {
		t.Fatalf("artifact = %+v", artifact)
	}
}

func readTestArtifact(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
	conversationID string,
	artifactID string,
) Artifact {
	t.Helper()
	read, err := service.ReadArtifact(ctx, workspaceID, conversationID, artifactID)
	if err != nil {
		t.Fatalf("ReadArtifact: %v", err)
	}
	return read
}

func requireReadTableArtifact(t *testing.T, read Artifact, artifactID string) {
	t.Helper()
	if read.ID != artifactID || read.Table == nil || read.Table.Rows[0][0] != "Go" {
		t.Fatalf("read artifact = %+v", read)
	}
}

func readTestSnapshot(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
	conversationID string,
) ConversationSnapshot {
	t.Helper()
	snapshot, err := service.ReadSnapshot(ctx, workspaceID, conversationID)
	if err != nil {
		t.Fatalf("ReadSnapshot: %v", err)
	}
	return snapshot
}

func requireSnapshotArtifact(t *testing.T, snapshot ConversationSnapshot, artifactID string) {
	t.Helper()
	if len(snapshot.Artifacts.Artifacts) != 1 ||
		snapshot.Artifacts.Artifacts[0].ID != artifactID ||
		snapshot.Artifacts.Artifacts[0].Kind != ArtifactKindTable {
		t.Fatalf("snapshot artifacts = %+v", snapshot.Artifacts)
	}
}

func requireArtifactTrajectory(t *testing.T, snapshot ConversationSnapshot, artifactID string) {
	t.Helper()
	event := snapshot.Trajectory.Events[len(snapshot.Trajectory.Events)-1]
	if event.Kind != TrajectoryEventArtifactEmitted ||
		event.ArtifactEmitted == nil ||
		event.ArtifactEmitted.ArtifactID != artifactID ||
		event.ProviderEventID == nil ||
		*event.ProviderEventID != "provider-tool-call-1" {
		t.Fatalf("artifact trajectory = %+v", event)
	}
}

func stopTestTurn(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
	conversationID string,
) {
	t.Helper()
	if _, err := service.StopTurn(ctx, workspaceID, conversationID); err != nil {
		t.Fatalf("StopTurn: %v", err)
	}
}

func completeActiveArtifactToolTurn(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
	conversationID string,
	active *activeConversationTurn,
	finalText string,
) ConversationSnapshot {
	t.Helper()
	if finalText != "" {
		message := agent.Event{
			Kind:             agent.EventKindAgentTextCompleted,
			ConversationID:   conversationID,
			TurnID:           active.turnID,
			ProviderThreadID: active.providerThreadID,
			ProviderTurnID:   active.providerTurnID,
			Text: &agent.TextEvent{
				ProviderItemID: "provider-message-" + active.providerTurnID,
				Text:           finalText,
			},
		}
		if err := service.handleAgentEvent(ctx, active, "", agent.ResolvedInvocation{}, message); err != nil {
			t.Fatalf("persist final agent message: %v", err)
		}
	}
	terminal := agent.Event{
		Kind:             agent.EventKindTurnTerminal,
		ConversationID:   conversationID,
		TurnID:           active.turnID,
		ProviderThreadID: active.providerThreadID,
		ProviderTurnID:   active.providerTurnID,
		Terminal:         &agent.TerminalEvent{Outcome: agent.TurnOutcomeCompleted},
	}
	if err := service.handleAgentEvent(ctx, active, "", agent.ResolvedInvocation{}, terminal); err != nil {
		t.Fatalf("persist completed terminal event: %v", err)
	}
	return readTestSnapshot(t, ctx, service, workspaceID, conversationID)
}

func requireAgentMessageTrajectory(t *testing.T, snapshot ConversationSnapshot, text string) {
	t.Helper()
	for _, event := range snapshot.Trajectory.Events {
		if event.Kind == TrajectoryEventAgentMessageCompleted &&
			event.AgentMessageCompleted != nil &&
			event.AgentMessageCompleted.Text == text {
			return
		}
	}
	t.Fatalf("snapshot missing preserved agent message %q: %+v", text, snapshot.Trajectory)
}

func requireSystemTurnFailedTrajectory(t *testing.T, snapshot ConversationSnapshot, code string) {
	t.Helper()
	for _, event := range snapshot.Trajectory.Events {
		if event.Kind == TrajectoryEventTurnFailed &&
			event.Actor == TrajectoryActorSystem &&
			event.TurnFailed != nil &&
			event.TurnFailed.Failure.Code == code {
			return
		}
	}
	t.Fatalf("snapshot missing system turn_failed %s: %+v", code, snapshot.Trajectory)
}

func TestDecodeEmitArtifactInputRejectsInvalidBranches(t *testing.T) {
	tests := []struct {
		name      string
		argument  string
		wantError string
	}{
		{
			name:      "unknown field",
			argument:  `{"kind":"markdown","title":"Report","markdown":"Done","uri":"setta://old"}`,
			wantError: "unknown field",
		},
		{
			name:      "missing title",
			argument:  `{"kind":"markdown","markdown":"Done"}`,
			wantError: "artifact title is required",
		},
		{
			name:      "missing table columns",
			argument:  `{"kind":"table","title":"Counts","rows":[]}`,
			wantError: "table artifact requires columns",
		},
		{
			name:      "mixed branch",
			argument:  `{"kind":"markdown","title":"Report","markdown":"Done","rows":[]}`,
			wantError: "rows is not valid",
		},
		{
			name:      "table row width",
			argument:  `{"kind":"table","title":"Counts","columns":[{"key":"language","label":"Language"}],"rows":[["Go","34"]]}`,
			wantError: "table artifact row[0] has 2 cells",
		},
		{
			name:      "table column unknown field",
			argument:  `{"kind":"table","title":"Counts","columns":[{"key":"language","label":"Language","secret":"ignored"}],"rows":[["Go"]]}`,
			wantError: "unknown field columns[0].secret",
		},
		{
			name:      "table row null cell",
			argument:  `{"kind":"table","title":"Counts","columns":[{"key":"language","label":"Language"}],"rows":[[null]]}`,
			wantError: "table artifact row[0] cell[0] must be a string",
		},
		{
			name:      "bar chart missing value",
			argument:  `{"kind":"bar_chart","title":"Counts","items":[{"label":"Go"}]}`,
			wantError: "bar_chart artifact requires items[0].value",
		},
		{
			name:      "bar chart null value",
			argument:  `{"kind":"bar_chart","title":"Counts","items":[{"label":"Go","value":null}]}`,
			wantError: "bar chart artifact item[0].value must be a number",
		},
		{
			name:      "empty optional file description",
			argument:  `{"kind":"file","title":"Report file","path":"report.md","description":""}`,
			wantError: "file artifact description must not be empty",
		},
		{
			name:      "oversized markdown",
			argument:  `{"kind":"markdown","title":"Report","markdown":"` + strings.Repeat("x", MaxMarkdownArtifactBytes+1) + `"}`,
			wantError: "markdown artifact exceeds",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input, err := decodeEmitArtifactInput([]byte(test.argument))
			if err != nil {
				if !strings.Contains(err.Error(), test.wantError) {
					t.Fatalf("decode error = %v, want %q", err, test.wantError)
				}
				return
			}
			artifact := input.artifact("artifact-test", "conversation-test", "turn-test", "2026-07-11T20:00:00Z")
			err = artifact.Validate()
			if err == nil || !strings.Contains(err.Error(), test.wantError) {
				t.Fatalf("validation error = %v, want %q for %+v", err, test.wantError, artifact)
			}
		})
	}
}
