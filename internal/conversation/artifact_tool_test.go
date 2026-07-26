package conversation

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"setta/internal/agent"
	"setta/internal/conversation/artifactdoc"
)

// artifactToolTestSource is one accepted document exercising a heading, a
// table, and a chart, so the emission tests cover a mixed document rather than
// the smallest one the compiler accepts.
const artifactToolTestSource = `root = Document([
  Heading("Language line counts"),
  Table(
    [{key: "language", label: "Language"}, {key: "lines", label: "Lines"}],
    [["Go", "34"], ["TypeScript", "21"], ["CSS", "8"]]
  ),
  BarChart([{name: "Lines", points: [{label: "Go", value: 34}, {label: "CSS", value: 8}]}])
])`

func artifactToolArguments(t *testing.T, title string, source string) []byte {
	t.Helper()
	arguments, err := json.Marshal(map[string]string{"title": title, "source": source})
	if err != nil {
		t.Fatalf("encode emit_artifact arguments: %v", err)
	}
	return arguments
}

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

	artifact := emitTestDocumentArtifact(t, ctx, service, workspaceID, conversationID, active)
	requireDocumentArtifact(t, artifact)
	read := readTestArtifact(t, ctx, service, workspaceID, conversationID, artifact.ID)
	requireReadDocumentArtifact(t, read, artifact.ID)
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
		Arguments:        []byte(`{"title":"Language line counts"}`),
	})
	if err != nil {
		t.Fatalf("failed artifact handler returned error: %v", err)
	}
	failure := requireArtifactToolFailureResult(t, failed, artifactToolFailureMissingRequiredFields)
	requireDynamicToolFieldErrors(t, failure.FieldErrors, []string{"source"})

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
		Arguments:        artifactToolArguments(t, "Language line counts", artifactToolTestSource),
	})
	if err != nil {
		t.Fatalf("retry artifact handler returned error: %v", err)
	}
	if !succeeded.Success || succeeded.Failure != nil {
		t.Fatalf("retry result = %+v", succeeded)
	}
	afterRetry := readTestSnapshot(t, ctx, service, workspaceID, conversationID)
	if len(afterRetry.Artifacts.Artifacts) != 1 ||
		afterRetry.Artifacts.Artifacts[0].Title != "Language line counts" {
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
		Arguments:        []byte(`{"title":"Language line counts"}`),
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

func TestEmitArtifactToolSchemaDeclaresTitleAndSource(t *testing.T) {
	var schema struct {
		Type                 string   `json:"type"`
		AdditionalProperties *bool    `json:"additionalProperties"`
		Required             []string `json:"required"`
		Properties           map[string]struct {
			Type      string `json:"type"`
			MaxLength int    `json:"maxLength"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(emitArtifactInputSchemaJSON, &schema); err != nil {
		t.Fatalf("decode emit artifact schema: %v", err)
	}
	if schema.Type != "object" || schema.AdditionalProperties == nil || *schema.AdditionalProperties {
		t.Fatalf("emit artifact schema = %+v, want a strict object", schema)
	}
	requireStringSet(t, "emit artifact required fields", schema.Required, []string{"title", "source"})
	requireStringSet(t, "emit artifact properties", mapKeys(schema.Properties), []string{"title", "source"})
	if schema.Properties["title"].Type != "string" || schema.Properties["source"].Type != "string" {
		t.Fatalf("emit artifact property types = %+v", schema.Properties)
	}
	if schema.Properties["source"].MaxLength != artifactdoc.MaxSourceBytes {
		t.Fatalf("emit artifact source maxLength = %d, want %d", schema.Properties["source"].MaxLength, artifactdoc.MaxSourceBytes)
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
	startRequests := runtime.startThreadRequests()
	if len(startRequests) != 1 || len(startRequests[0].DynamicTools) != 1 {
		t.Fatalf("start request dynamic tools = %+v", startRequests)
	}
	requireArtifactRecoveryInstructions(t, startRequests[0].DeveloperInstructions)

	turnRequests := runtime.turnRequests()
	if len(turnRequests) != 1 || len(turnRequests[0].DynamicTools) != 1 {
		t.Fatalf("turn request dynamic tools = %+v", turnRequests)
	}
}

func requireArtifactRecoveryInstructions(t *testing.T, instructions string) {
	t.Helper()
	for _, fragment := range []string{
		"setta.emit_artifact",
		"retryable true",
		"fieldErrors",
		"retry setta.emit_artifact",
		"before completing the turn",
		"Assign root exactly once",
		"Document(blocks",
	} {
		if !strings.Contains(instructions, fragment) {
			t.Fatalf("topic agent developer instructions missing %q: %q", fragment, instructions)
		}
	}
}

func emitTestDocumentArtifact(
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
		Arguments:        artifactToolArguments(t, "Language line counts", artifactToolTestSource),
	})
	if err != nil {
		t.Fatalf("emitArtifactFromTool: %v", err)
	}
	return artifact
}

func requireDocumentArtifact(t *testing.T, artifact Artifact) {
	t.Helper()
	if artifact.Document.Language != ArtifactDocumentLanguageOpenUI ||
		artifact.Document.CatalogID != ArtifactCatalogSettaV1 ||
		artifact.Document.Source != artifactToolTestSource {
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

func requireReadDocumentArtifact(t *testing.T, read Artifact, artifactID string) {
	t.Helper()
	if read.ID != artifactID || read.Document.Source != artifactToolTestSource {
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
		snapshot.Artifacts.Artifacts[0].ID != artifactID {
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

func TestDecodeEmitArtifactInputRejectsInvalidDocuments(t *testing.T) {
	tests := []struct {
		name      string
		argument  string
		wantCode  string
		wantField string
	}{
		{
			name:      "unknown field",
			argument:  `{"title":"Report","source":"root = Document([Text(\"Done\")])","kind":"markdown"}`,
			wantCode:  artifactToolFailureInvalidArguments,
			wantField: "kind",
		},
		{
			name:      "missing title",
			argument:  `{"source":"root = Document([Text(\"Done\")])"}`,
			wantCode:  artifactToolFailureMissingRequiredFields,
			wantField: "title",
		},
		{
			name:      "missing source",
			argument:  `{"title":"Report"}`,
			wantCode:  artifactToolFailureMissingRequiredFields,
			wantField: "source",
		},
		{
			name:      "source is not a string",
			argument:  `{"title":"Report","source":{"root":"Document"}}`,
			wantCode:  artifactToolFailureInvalidField,
			wantField: "source",
		},
		{
			name:      "empty source",
			argument:  `{"title":"Report","source":""}`,
			wantCode:  string(artifactdoc.CodeSourceEmpty),
			wantField: "source",
		},
		{
			name:      "missing root",
			argument:  `{"title":"Report","source":"body = Document([Text(\"Done\")])"}`,
			wantCode:  string(artifactdoc.CodeMissingRoot),
			wantField: "source",
		},
		{
			name:      "unknown component",
			argument:  `{"title":"Report","source":"root = Document([Marquee(\"Done\")])"}`,
			wantCode:  string(artifactdoc.CodeUnknownComponent),
			wantField: "source.root.blocks",
		},
		{
			name:      "table row width",
			argument:  `{"title":"Counts","source":"root = Document([Table([{key: \"language\", label: \"Language\"}], [[\"Go\", \"34\"]])])"}`,
			wantCode:  string(artifactdoc.CodeRowWidthMismatch),
			wantField: "source.root.rows",
		},
		{
			name:      "unsafe file reference",
			argument:  `{"title":"Report","source":"root = Document([FileReference(\"/etc/passwd\")])"}`,
			wantCode:  string(artifactdoc.CodeUnsafeValue),
			wantField: "source.root.path",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := decodeEmitArtifactInput([]byte(test.argument))
			var failure *artifactToolFailureError
			if !errors.As(err, &failure) {
				t.Fatalf("decode error = %v, want a typed artifact tool failure", err)
			}
			if failure.code != test.wantCode || !failure.retryable {
				t.Fatalf("decode failure = %+v, want retryable %s", failure, test.wantCode)
			}
			requireDynamicToolFieldErrors(t, failure.fieldErrors, []string{test.wantField})
		})
	}
}

func TestDecodeEmitArtifactInputAcceptsDocument(t *testing.T) {
	input, err := decodeEmitArtifactInput(artifactToolArguments(t, "Language line counts", artifactToolTestSource))
	if err != nil {
		t.Fatalf("decodeEmitArtifactInput: %v", err)
	}
	artifact := input.artifact("artifact-test", "conversation-test", "turn-test", "2026-07-11T20:00:00Z")
	if err := artifact.Validate(); err != nil {
		t.Fatalf("artifact.Validate: %v", err)
	}
	if artifact.Document.Language != ArtifactDocumentLanguageOpenUI ||
		artifact.Document.CatalogID != ArtifactCatalogSettaV1 ||
		artifact.Document.Source != artifactToolTestSource {
		t.Fatalf("artifact document = %+v", artifact.Document)
	}
}
