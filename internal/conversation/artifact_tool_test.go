package conversation

import (
	"context"
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
		snapshot.Artifacts.Artifacts[0].Table == nil {
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
