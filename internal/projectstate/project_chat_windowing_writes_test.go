package projectstate

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestRuntimeSetProjectChatWindowingStateRejectsThreadRebinding(t *testing.T) {
	t.Parallel()

	runtime := openProjectChatWindowingWriteTestRuntime(t)

	_, err := runtime.SetProjectChatWindowingState(
		context.Background(),
		"project-alpha",
		ProjectChatWindowingState{
			InstancesByID: map[string]ProjectChatWindowInstance{
				"project-chat-window-1": {
					InstanceID: "project-chat-window-1",
					Placement:  ChatWindowPlacementFloating,
					Mode:       ChatWindowModeProjectAI,
					ChatID:     stringPointer("chat-after"),
				},
			},
			Order:              []string{"project-chat-window-1"},
			NextInstanceNumber: 2,
		},
	)
	if err == nil || err.Error() != "Project chat window project-chat-window-1 cannot change chatId via layout updates." {
		t.Fatalf("expected thread-binding validation error, got %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	currentChatID := project.ProjectChatWindowing.InstancesByID["project-chat-window-1"].ChatID
	if currentChatID == nil || *currentChatID != "chat-before" {
		t.Fatalf("expected existing chat id chat-before to remain, got %#v", currentChatID)
	}
}

func TestRuntimeSetProjectChatWindowingStateRejectsGitGraphCanvasPlacement(t *testing.T) {
	t.Parallel()

	runtime := openProjectChatWindowingWriteTestRuntime(t)

	_, err := runtime.SetProjectChatWindowingState(
		context.Background(),
		"project-alpha",
		ProjectChatWindowingState{
			InstancesByID: map[string]ProjectChatWindowInstance{
				"project-chat-window-1": {
					InstanceID: "project-chat-window-1",
					Placement:  ChatWindowPlacementFloating,
					Mode:       ChatWindowModeProjectAI,
					ChatID:     stringPointer("chat-before"),
				},
				"project-chat-window-2": {
					InstanceID: "project-chat-window-2",
					Placement:  ChatWindowPlacementCanvasSection,
					Mode:       ChatWindowModeGitGraph,
				},
			},
			Order:              []string{"project-chat-window-1", "project-chat-window-2"},
			NextInstanceNumber: 3,
		},
	)
	if err == nil || err.Error() != "Project chat git_graph_mode windows cannot use canvas_section placement." {
		t.Fatalf("expected git-graph owner validation error, got %v", err)
	}
}

func TestRuntimeSetProjectChatWindowChatIDRequiresExistingProjectAIWindow(t *testing.T) {
	t.Parallel()

	runtime := openProjectChatWindowingWriteTestRuntime(t)

	_, err := runtime.SetProjectChatWindowChatID(
		context.Background(),
		"project-alpha",
		"git-graph-window",
		stringPointer("chat-bound"),
	)
	if err == nil || err.Error() != "Project chat window git-graph-window must use project_ai_mode to bind chatId." {
		t.Fatalf("expected project_ai_mode validation error, got %v", err)
	}

	_, err = runtime.SetProjectChatWindowChatID(
		context.Background(),
		"project-alpha",
		"missing-window",
		stringPointer("chat-bound"),
	)
	if !errors.Is(err, ErrProjectChatWindowNotFound) {
		t.Fatalf("expected ErrProjectChatWindowNotFound, got %v", err)
	}
}

func TestRuntimeCreateWindowSpacePersistsNormalizedState(t *testing.T) {
	t.Parallel()

	runtime := openProjectChatWindowingWriteTestRuntime(t)

	snapshot, createdWindowSpace, err := runtime.CreateWindowSpace(
		context.Background(),
		"project-alpha",
		WindowSpaceState{
			WindowsByID: map[string]WindowSpaceWindow{
				" window-a ": {
					SurfaceKind:     WindowSpaceSurfaceKindSection,
					SectionIDOrNull: stringPointer(" section-a "),
					Mode:            ChatWindowModeSection,
					Title:           stringPointer("Section A"),
					NormalizedBounds: NormalizedFloatingWindowBounds{
						Width:  0,
						Height: 0,
					},
				},
				"window-missing": {
					SurfaceKind:     WindowSpaceSurfaceKindSection,
					SectionIDOrNull: stringPointer("missing"),
					Mode:            ChatWindowModeSection,
				},
			},
			Order: []string{" window-a ", "window-a", "window-missing"},
		},
		stringPointer(" Focused Layout "),
	)
	if err != nil {
		t.Fatalf("CreateWindowSpace returned error: %v", err)
	}
	if createdWindowSpace.ID == "" {
		t.Fatal("expected created window space id")
	}
	if createdWindowSpace.Name != "Focused Layout" {
		t.Fatalf("expected trimmed window space name, got %q", createdWindowSpace.Name)
	}
	if createdWindowSpace.SortIndex != 3 {
		t.Fatalf("expected next sort index 3, got %d", createdWindowSpace.SortIndex)
	}
	if !reflect.DeepEqual(createdWindowSpace.Order, []string{"window-a"}) {
		t.Fatalf("expected normalized order [window-a], got %#v", createdWindowSpace.Order)
	}
	if _, ok := createdWindowSpace.WindowsByID["window-missing"]; ok {
		t.Fatal("expected missing section window to be dropped")
	}
	if got := createdWindowSpace.WindowsByID["window-a"].NormalizedBounds; got.Width != 1 || got.Height != 1 {
		t.Fatalf("expected normalized bounds 1x1, got %#v", got)
	}

	project := snapshot.Document.Projects["project-alpha"]
	persistedWindowSpace, ok := project.WindowSpaces[createdWindowSpace.ID]
	if !ok {
		t.Fatalf("expected created window space %q in project", createdWindowSpace.ID)
	}
	if persistedWindowSpace.Name != "Focused Layout" {
		t.Fatalf("expected persisted name Focused Layout, got %q", persistedWindowSpace.Name)
	}
}

func TestRuntimeCreateWindowSpaceRejectsInvalidWindowOwner(t *testing.T) {
	t.Parallel()

	runtime := openProjectChatWindowingWriteTestRuntime(t)

	_, _, err := runtime.CreateWindowSpace(
		context.Background(),
		"project-alpha",
		WindowSpaceState{
			WindowsByID: map[string]WindowSpaceWindow{
				"window-a": {
					SurfaceKind:     WindowSpaceSurfaceKindSection,
					SectionIDOrNull: stringPointer("section-a"),
					Mode:            ChatWindowModeSection,
					ChatID:          stringPointer("stale-chat"),
				},
			},
			Order: []string{"window-a"},
		},
		stringPointer("Focused Layout"),
	)
	if err == nil || err.Error() != "Window-space windows must use project_ai_mode to bind chatId." {
		t.Fatalf("expected invalid owner error, got %v", err)
	}
}

func TestRuntimeWindowSpaceNameSortAndDeleteMutations(t *testing.T) {
	t.Parallel()

	runtime := openProjectChatWindowingWriteTestRuntime(t)

	_, err := runtime.SetWindowSpaceName(context.Background(), "project-alpha", "space-b", " primary ")
	if !IsInvalidWindowSpaceNameError(err) {
		t.Fatalf("expected InvalidWindowSpaceNameError, got %v", err)
	}

	_, err = runtime.SetWindowSpaceSortOrder(
		context.Background(),
		"project-alpha",
		[]string{"space-a", "space-a", "space-b"},
	)
	if !IsInvalidWindowSpaceSortOrderError(err) {
		t.Fatalf("expected InvalidWindowSpaceSortOrderError, got %v", err)
	}

	if _, err := runtime.DeleteWindowSpace(context.Background(), "project-alpha", "space-a"); err != nil {
		t.Fatalf("DeleteWindowSpace returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	if _, ok := project.WindowSpaces["space-a"]; ok {
		t.Fatal("expected deleted window space to be removed")
	}
	if got := project.WindowSpaces["space-b"].SortIndex; got != 0 {
		t.Fatalf("expected remaining window space sort index 0, got %d", got)
	}
}

func openProjectChatWindowingWriteTestRuntime(t *testing.T) *Runtime {
	t.Helper()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				Sections: map[string]Section{
					"section-a": {
						ID:   "section-a",
						Name: "Section A",
					},
				},
				WindowSpaces: map[string]WindowSpaceConfig{
					"space-a": {
						ID:        "space-a",
						Name:      "Primary",
						SortIndex: 0,
					},
					"space-b": {
						ID:        "space-b",
						Name:      "Secondary",
						SortIndex: 2,
					},
				},
				ProjectChatWindowing: &ProjectChatWindowingState{
					InstancesByID: map[string]ProjectChatWindowInstance{
						"project-chat-window-1": {
							InstanceID: "project-chat-window-1",
							Placement:  ChatWindowPlacementFloating,
							Mode:       ChatWindowModeProjectAI,
							ChatID:     stringPointer("chat-before"),
						},
						"git-graph-window": {
							InstanceID: "git-graph-window",
							Placement:  ChatWindowPlacementFloating,
							Mode:       ChatWindowModeGitGraph,
						},
					},
					Order:              []string{"project-chat-window-1", "git-graph-window"},
					NextInstanceNumber: 3,
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})
	return runtime
}
