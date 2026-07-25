package conversation

import (
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
	event := agentActivityEvent(agent.EventKindActivityCompleted, agent.ActivityEvent{
		ProviderItemID: "item-image",
		Kind:           agent.ActivityKindImageGeneration,
		Status:         "completed",
		Title:          "Generated image",
		Summary:        "/tmp/director-graph.png",
	})

	trajectory, artifact, err := service.populateAgentTrajectory(
		activityMappingTrajectory(),
		&activeConversationTurn{},
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
	if artifact == nil || artifact.File == nil || artifact.File.Path != "/tmp/director-graph.png" {
		t.Fatalf("image generation artifact = %+v", artifact)
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
	providerThreadID := "provider-thread-1"
	providerTurnID := "provider-turn-1"
	return TrajectoryEvent{
		ID:               "trajectory-activity",
		ConversationID:   "conversation-director",
		TurnID:           &turnID,
		Sequence:         1,
		EmittedAt:        testTimeStarted,
		ProviderThreadID: &providerThreadID,
		ProviderTurnID:   &providerTurnID,
	}
}
