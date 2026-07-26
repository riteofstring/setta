package conversation

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/agent"
)

func TestDurableActivityKeepsTheProviderActivityIdentity(t *testing.T) {
	service := activityMappingTestService()
	for _, testCase := range []struct {
		name     string
		event    agent.Event
		kind     TrajectoryEventKind
		activity TrajectoryActivity
		progress string
	}{
		{
			name: "command records the directory the provider ran it in",
			event: agentActivityEvent(agent.EventKindActivityStarted, agent.ActivityEvent{
				ProviderItemID: "item-command",
				Kind:           agent.ActivityKindCommand,
				Status:         "inProgress",
				Title:          "rg director",
				Command:        stringPointer("rg director"),
				CWD:            stringPointer("/workspace/setta/internal"),
				ProcessID:      stringPointer("process-7"),
			}),
			kind: TrajectoryEventActivityStarted,
			activity: TrajectoryActivity{
				ID: "item-command", Kind: TrajectoryActivityCommand, Title: "rg director",
				Command:   stringPointer("rg director"),
				CWD:       stringPointer("/workspace/setta/internal"),
				ProcessID: stringPointer("process-7"),
			},
		},
		{
			name: "mcp tool call keeps its server and tool",
			event: agentActivityEvent(agent.EventKindActivityCompleted, agent.ActivityEvent{
				ProviderItemID: "item-mcp",
				Kind:           agent.ActivityKindMCPTool,
				Status:         "completed",
				Title:          "docs/search",
				Server:         stringPointer("docs"),
				Tool:           stringPointer("search"),
			}),
			kind: TrajectoryEventActivityCompleted,
			activity: TrajectoryActivity{
				ID: "item-mcp", Kind: TrajectoryActivityMCPTool, Title: "docs/search",
				Server: stringPointer("docs"), Tool: stringPointer("search"),
			},
		},
		{
			name: "web search stays a search rather than a generic tool",
			event: agentActivityEvent(agent.EventKindActivityCompleted, agent.ActivityEvent{
				ProviderItemID: "item-search",
				Kind:           agent.ActivityKindWebSearch,
				Status:         "completed",
				Title:          "Web search",
				Summary:        "setta director command center",
			}),
			kind: TrajectoryEventActivityCompleted,
			activity: TrajectoryActivity{
				ID: "item-search", Kind: TrajectoryActivityWebSearch, Title: "Web search",
			},
		},
		{
			name: "a blocked hook closes as a failed activity",
			event: agentActivityEvent(agent.EventKindActivityCompleted, agent.ActivityEvent{
				ProviderItemID: "hook-run-1",
				Kind:           agent.ActivityKindHook,
				Status:         "blocked",
				Title:          "preToolUse hook",
				Summary:        "plugin · /hooks/guard.sh",
			}),
			kind: TrajectoryEventActivityFailed,
			activity: TrajectoryActivity{
				ID: "hook-run-1", Kind: TrajectoryActivityHook, Title: "preToolUse hook",
			},
		},
		{
			name: "progress advances the activity without redescribing it",
			event: agentActivityEvent(agent.EventKindActivityUpdated, agent.ActivityEvent{
				ProviderItemID: "item-mcp",
				Kind:           agent.ActivityKindMCPTool,
				Status:         "in_progress",
				Title:          "MCP tool progress",
				Summary:        "Indexed 12 of 40 documents",
			}),
			kind:     TrajectoryEventActivityProgressed,
			progress: "Indexed 12 of 40 documents",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			trajectory, artifact, err := service.populateAgentTrajectory(
				activityMappingTrajectory(),
				&activeConversationTurn{},
				ConversationSnapshot{},
				testCase.event,
				testTimeStarted,
			)
			if err != nil {
				t.Fatalf("populate activity trajectory: %v", err)
			}
			if artifact != nil {
				t.Fatalf("activity produced an unexpected artifact %+v", artifact)
			}
			if trajectory.Kind != testCase.kind {
				t.Fatalf("trajectory kind = %q, want %q", trajectory.Kind, testCase.kind)
			}
			if err := trajectory.Validate(); err != nil {
				t.Fatalf("durable activity event is invalid: %v", err)
			}
			if testCase.progress != "" {
				if trajectory.ActivityProgressed == nil ||
					trajectory.ActivityProgressed.ActivityID != testCase.event.Activity.ProviderItemID ||
					trajectory.ActivityProgressed.Progress != testCase.progress {
					t.Fatalf("progressed payload = %+v, want progress %q", trajectory.ActivityProgressed, testCase.progress)
				}
				return
			}
			assertDurableActivity(t, trajectory, testCase.activity)
		})
	}
}

func TestGeneratedMediaProducesTheArtifactItSaved(t *testing.T) {
	service := activityMappingTestService()
	workspaceRoot := t.TempDir()
	savedPath := writeGeneratedMediaFile(t, workspaceRoot, "docs/director-graph.png")
	event := agentActivityEvent(agent.EventKindActivityCompleted, agent.ActivityEvent{
		ProviderItemID: "item-image",
		Kind:           agent.ActivityKindImageGeneration,
		Status:         "completed",
		Title:          "Generated image",
		SavedPath:      &savedPath,
	})

	trajectory, artifact, err := service.populateAgentTrajectory(
		activityMappingTrajectory(),
		imageGenerationActiveTurn(workspaceRoot),
		ConversationSnapshot{},
		event,
		testTimeStarted,
	)
	if err != nil {
		t.Fatalf("populate image generation trajectory: %v", err)
	}
	if trajectory.Kind != TrajectoryEventActivityCompleted ||
		trajectory.ActivityCompleted.Activity.Kind != TrajectoryActivityImageGeneration {
		t.Fatalf("image generation trajectory = %+v", trajectory)
	}
	if artifact == nil {
		t.Fatal("image generation produced no artifact")
	}
	if err := artifact.Validate(); err != nil {
		t.Fatalf("image generation artifact is not a valid document: %v", err)
	}
	if !strings.Contains(artifact.Document.Source, `FileReference("docs/director-graph.png"`) {
		t.Fatalf("image generation artifact document = %q", artifact.Document.Source)
	}
	if trajectory.ActivityCompleted.Summary != "Generated image" {
		t.Fatalf("saved path leaked into image activity summary %q", trajectory.ActivityCompleted.Summary)
	}
}

// An artifact addresses an existing safe file inside the conversation's
// canonical authorized workspace. Anything else stays a completed activity
// rather than becoming a durable reference the workspace does not own or the
// artifact catalog cannot represent.
func TestGeneratedMediaWithoutAnAuthorizedSafeFileProducesNoArtifact(t *testing.T) {
	for _, testCase := range []struct {
		name    string
		prepare func(*testing.T) (string, string)
	}{
		{
			name: "outside the workspace",
			prepare: func(t *testing.T) (string, string) {
				return t.TempDir(), writeGeneratedMediaFile(t, t.TempDir(), "director-graph.png")
			},
		},
		{
			name: "no authorized workspace",
			prepare: func(t *testing.T) (string, string) {
				return "", writeGeneratedMediaFile(t, t.TempDir(), "director-graph.png")
			},
		},
		{
			name: "missing saved file",
			prepare: func(t *testing.T) (string, string) {
				workspaceRoot := t.TempDir()
				return workspaceRoot, filepath.Join(workspaceRoot, "missing.png")
			},
		},
		{
			name: "saved path is a directory",
			prepare: func(t *testing.T) (string, string) {
				workspaceRoot := t.TempDir()
				savedPath := filepath.Join(workspaceRoot, "generated")
				if err := os.Mkdir(savedPath, 0o755); err != nil {
					t.Fatalf("create generated-media directory: %v", err)
				}
				return workspaceRoot, savedPath
			},
		},
		{
			name: "workspace symlink escapes",
			prepare: func(t *testing.T) (string, string) {
				workspaceRoot := t.TempDir()
				outsidePath := writeGeneratedMediaFile(t, t.TempDir(), "director-graph.png")
				savedPath := filepath.Join(workspaceRoot, "director-graph.png")
				if err := os.Symlink(outsidePath, savedPath); err != nil {
					t.Fatalf("create generated-media symlink: %v", err)
				}
				return workspaceRoot, savedPath
			},
		},
		{
			name: "path is outside the artifact catalog profile",
			prepare: func(t *testing.T) (string, string) {
				workspaceRoot := t.TempDir()
				return workspaceRoot, writeGeneratedMediaFile(t, workspaceRoot, "report\u202Egnp.png")
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			workspaceRoot, savedPath := testCase.prepare(t)
			mintedArtifactID := false
			service := &Service{newID: func(string) (string, error) {
				mintedArtifactID = true
				return "artifact-unexpected", nil
			}}
			event := agentActivityEvent(agent.EventKindActivityCompleted, agent.ActivityEvent{
				ProviderItemID: "item-image",
				Kind:           agent.ActivityKindImageGeneration,
				Status:         "completed",
				Title:          "Generated image",
				SavedPath:      &savedPath,
			})
			trajectory, artifact, err := service.populateAgentTrajectory(
				activityMappingTrajectory(),
				imageGenerationActiveTurn(workspaceRoot),
				ConversationSnapshot{},
				event,
				testTimeStarted,
			)
			if err != nil {
				t.Fatalf("populate image generation trajectory: %v", err)
			}
			if trajectory.Kind != TrajectoryEventActivityCompleted {
				t.Fatalf("image generation trajectory = %+v", trajectory)
			}
			if artifact != nil {
				t.Fatalf("image generation artifact = %+v, want none", artifact)
			}
			if mintedArtifactID {
				t.Fatal("image generation minted an artifact id before document acceptance")
			}
		})
	}
}

func writeGeneratedMediaFile(t *testing.T, workspaceRoot string, relativePath string) string {
	t.Helper()
	savedPath := filepath.Join(workspaceRoot, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(savedPath), 0o755); err != nil {
		t.Fatalf("create generated-media parent: %v", err)
	}
	if err := os.WriteFile(savedPath, []byte("generated media"), 0o600); err != nil {
		t.Fatalf("write generated media: %v", err)
	}
	return savedPath
}

func imageGenerationActiveTurn(workspaceRoot string) *activeConversationTurn {
	return &activeConversationTurn{request: agent.TurnRequest{WorkspaceRoot: workspaceRoot}}
}

func TestProviderFileChangesUseTheDedicatedDurableContract(t *testing.T) {
	service := activityMappingTestService()
	movePath := "internal/director/projector_core.go"
	changes := []agent.FileChange{{
		Path:     "internal/director/projector.go",
		Kind:     agent.FileChangeKindUpdate,
		MovePath: &movePath,
		Diff:     "@@ -1 +1 @@",
	}}
	for _, testCase := range []struct {
		name    string
		kind    agent.EventKind
		status  string
		want    TrajectoryEventKind
		outcome FileChangeOutcome
	}{
		{name: "proposed", kind: agent.EventKindActivityStarted, status: "inProgress", want: TrajectoryEventFileChangeProposed},
		{name: "completed", kind: agent.EventKindActivityCompleted, status: "completed", want: TrajectoryEventFileChangeCompleted, outcome: FileChangeOutcomeCompleted},
		{name: "declined", kind: agent.EventKindActivityCompleted, status: "declined", want: TrajectoryEventFileChangeCompleted, outcome: FileChangeOutcomeDeclined},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			event := agentActivityEvent(testCase.kind, agent.ActivityEvent{
				ProviderItemID: "item-file",
				Kind:           agent.ActivityKindFileChange,
				Status:         testCase.status,
				Title:          "Changed 1 file(s)",
				FileChanges:    changes,
			})
			trajectory, artifact, err := service.populateAgentTrajectory(
				activityMappingTrajectory(),
				&activeConversationTurn{},
				ConversationSnapshot{},
				event,
				testTimeStarted,
			)
			if err != nil {
				t.Fatalf("populate file change trajectory: %v", err)
			}
			if artifact != nil || trajectory.Kind != testCase.want {
				t.Fatalf("file change result = kind %q artifact %+v", trajectory.Kind, artifact)
			}
			if err := trajectory.Validate(); err != nil {
				t.Fatalf("dedicated file change trajectory is invalid: %v", err)
			}
			switch trajectory.Kind {
			case TrajectoryEventFileChangeProposed:
				if got := trajectory.FileChangeProposed.Changes; len(got) != 1 ||
					got[0].MovePath == nil || *got[0].MovePath != movePath ||
					got[0].Diff != changes[0].Diff {
					t.Fatalf("proposed changes = %+v", got)
				}
			case TrajectoryEventFileChangeCompleted:
				if trajectory.FileChangeCompleted.Outcome != testCase.outcome {
					t.Fatalf("file change outcome = %q, want %q", trajectory.FileChangeCompleted.Outcome, testCase.outcome)
				}
			}
		})
	}
}

func TestFileChangeWithoutDeclaredChangesRemainsATypedActivity(t *testing.T) {
	service := activityMappingTestService()
	event := agentActivityEvent(agent.EventKindActivityStarted, agent.ActivityEvent{
		ProviderItemID: "item-file-empty",
		Kind:           agent.ActivityKindFileChange,
		Status:         "inProgress",
		Title:          "Preparing file changes",
		FileChanges:    []agent.FileChange{},
	})
	trajectory, artifact, err := service.populateAgentTrajectory(
		activityMappingTrajectory(),
		&activeConversationTurn{},
		ConversationSnapshot{},
		event,
		testTimeStarted,
	)
	if err != nil {
		t.Fatalf("populate empty file change activity: %v", err)
	}
	if artifact != nil ||
		trajectory.Kind != TrajectoryEventActivityStarted ||
		trajectory.ActivityStarted.Activity.Kind != TrajectoryActivityFileChange {
		t.Fatalf("empty file change result = %+v artifact=%+v", trajectory, artifact)
	}
}

func TestEveryAdapterActivityKindHasDurableMeaning(t *testing.T) {
	for _, kind := range agent.ActivityKinds() {
		durable, err := trajectoryActivityKind(kind)
		if err != nil {
			t.Fatalf("adapter activity kind %q has no durable meaning: %v", kind, err)
		}
		if !isTrajectoryActivityKind(durable) {
			t.Fatalf("adapter activity kind %q maps to unknown durable kind %q", kind, durable)
		}
	}
	if _, err := trajectoryActivityKind("collaboration"); err == nil {
		t.Fatal("a retired adapter activity kind still resolves to durable meaning")
	}
}

func isTrajectoryActivityKind(kind TrajectoryActivityKind) bool {
	for _, candidate := range TrajectoryActivityKinds() {
		if candidate == kind {
			return true
		}
	}
	return false
}

func assertDurableActivity(t *testing.T, trajectory TrajectoryEvent, want TrajectoryActivity) {
	t.Helper()
	var activity TrajectoryActivity
	switch trajectory.Kind {
	case TrajectoryEventActivityStarted:
		activity = trajectory.ActivityStarted.Activity
	case TrajectoryEventActivityCompleted:
		activity = trajectory.ActivityCompleted.Activity
	case TrajectoryEventActivityFailed:
		activity = trajectory.ActivityFailed.Activity
	default:
		t.Fatalf("trajectory kind %q carries no activity", trajectory.Kind)
	}
	if activity.ID != want.ID || activity.Kind != want.Kind || activity.Title != want.Title {
		t.Fatalf("durable activity = %+v, want %+v", activity, want)
	}
	for _, field := range []struct {
		label string
		got   *string
		want  *string
	}{
		{"command", activity.Command, want.Command},
		{"cwd", activity.CWD, want.CWD},
		{"server", activity.Server, want.Server},
		{"tool", activity.Tool, want.Tool},
		{"namespace", activity.Namespace, want.Namespace},
		{"process id", activity.ProcessID, want.ProcessID},
	} {
		if (field.got == nil) != (field.want == nil) {
			t.Fatalf("durable activity %s = %v, want %v", field.label, field.got, field.want)
		}
		if field.got != nil && *field.got != *field.want {
			t.Fatalf("durable activity %s = %q, want %q", field.label, *field.got, *field.want)
		}
	}
}

func activityMappingTestService() *Service {
	identifiers := 0
	return &Service{newID: func(string) (string, error) {
		identifiers++
		return "artifact-" + string(rune('a'+identifiers)), nil
	}}
}

func agentActivityEvent(kind agent.EventKind, activity agent.ActivityEvent) agent.Event {
	return agent.Event{
		Kind:             kind,
		ConversationID:   "conversation-director",
		TurnID:           "turn-director",
		ProviderThreadID: "provider-thread-1",
		ProviderTurnID:   "provider-turn-1",
		Activity:         &activity,
	}
}

func activityMappingTrajectory() TrajectoryEvent {
	turnID := "turn-director"
	providerTurnID := "provider-turn-1"
	return TrajectoryEvent{
		ID:             "trajectory-activity",
		ConversationID: "conversation-director",
		TurnID:         &turnID,
		Sequence:       1,
		EmittedAt:      testTimeStarted,
		ProviderTurnID: &providerTurnID,
	}
}
