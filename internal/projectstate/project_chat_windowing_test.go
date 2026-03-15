package projectstate

import (
	"context"
	"path/filepath"
	"reflect"
	"testing"
)

func TestProjectNormalizedNormalizesChatWindowingAndWindowSpaces(t *testing.T) {
	t.Parallel()

	project := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		Sections: map[string]Section{
			"section-a": {
				ID:   "section-a",
				Name: "Section A",
			},
		},
		WindowSpaces: map[string]WindowSpaceConfig{
			" space-a ": {
				Name: " Workspace ",
				WindowsByID: map[string]WindowSpaceWindow{
					" window-a ": {
						SurfaceKind:      WindowSpaceSurfaceKindSection,
						SectionIDOrNull:  stringPointer(" section-a "),
						Mode:             ChatWindowModeSection,
						Title:            stringPointer(" Section "),
						ChatID:           stringPointer("drop-me"),
						NormalizedBounds: NormalizedFloatingWindowBounds{},
					},
					"window-b": {
						Mode:   ChatWindowModeGitGraph,
						ChatID: stringPointer("drop-me"),
					},
					"window-missing": {
						SurfaceKind:     WindowSpaceSurfaceKindSection,
						SectionIDOrNull: stringPointer("missing"),
						Mode:            ChatWindowModeSection,
					},
				},
				Order: []string{" window-b ", "window-b", "window-a", "missing-window"},
			},
			"": {
				Name: "ignored",
			},
		},
		ProjectChatWindowing: &ProjectChatWindowingState{
			InstancesByID: map[string]ProjectChatWindowInstance{
				" instance-a ": {
					Title:  stringPointer(" Project AI "),
					ChatID: stringPointer(" chat-a "),
					Bounds: ChatWindowBounds{},
				},
				"instance-b": {
					Placement:       ChatWindowPlacementCanvasSection,
					Mode:            ChatWindowModeSection,
					SectionIDOrNull: stringPointer(" section-a "),
					Title:           stringPointer(" Section "),
					ChatID:          stringPointer("drop-me"),
				},
				"instance-c": {
					Placement:       ChatWindowPlacementCanvasSection,
					Mode:            ChatWindowModeGitGraph,
					SectionIDOrNull: stringPointer("section-a"),
					ChatID:          stringPointer("drop-me"),
				},
				"instance-d": {
					Mode:            ChatWindowModeSection,
					SectionIDOrNull: stringPointer("missing"),
				},
			},
			Order: []string{" instance-c ", "instance-b", "instance-b", "missing"},
		},
	}

	normalized, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize project: %v", err)
	}

	if normalized.ProjectChatWindowing == nil {
		t.Fatal("expected project chat windowing to be preserved")
	}
	if got := normalized.ProjectChatWindowing.NextInstanceNumber; got != 1 {
		t.Fatalf("expected default next instance number 1, got %d", got)
	}
	if got := normalized.ProjectChatWindowing.Order; !reflect.DeepEqual(got, []string{"instance-c", "instance-b", "instance-a"}) {
		t.Fatalf("expected normalized chat window order, got %#v", got)
	}

	projectAI := normalized.ProjectChatWindowing.InstancesByID["instance-a"]
	if projectAI.Placement != ChatWindowPlacementBottomDocked {
		t.Fatalf("expected default placement bottom_docked, got %q", projectAI.Placement)
	}
	if projectAI.Mode != ChatWindowModeProjectAI {
		t.Fatalf("expected default mode project_ai_mode, got %q", projectAI.Mode)
	}
	if projectAI.ChatID == nil || *projectAI.ChatID != "chat-a" {
		t.Fatalf("expected trimmed chat id chat-a, got %#v", projectAI.ChatID)
	}
	if projectAI.Bounds.Width != 820 || projectAI.Bounds.Height != 520 {
		t.Fatalf("expected default chat bounds 820x520, got %#v", projectAI.Bounds)
	}

	sectionWindow := normalized.ProjectChatWindowing.InstancesByID["instance-b"]
	if sectionWindow.SectionIDOrNull == nil || *sectionWindow.SectionIDOrNull != "section-a" {
		t.Fatalf("expected trimmed section binding section-a, got %#v", sectionWindow.SectionIDOrNull)
	}
	if sectionWindow.ChatID != nil {
		t.Fatalf("expected section window chat id to be cleared, got %#v", sectionWindow.ChatID)
	}

	gitGraphWindow := normalized.ProjectChatWindowing.InstancesByID["instance-c"]
	if gitGraphWindow.SectionIDOrNull != nil {
		t.Fatalf("expected git graph section binding to be cleared, got %#v", gitGraphWindow.SectionIDOrNull)
	}
	if gitGraphWindow.ChatID != nil {
		t.Fatalf("expected git graph chat id to be cleared, got %#v", gitGraphWindow.ChatID)
	}
	if gitGraphWindow.Placement != ChatWindowPlacementFloating {
		t.Fatalf("expected git graph canvas placement to normalize to floating, got %q", gitGraphWindow.Placement)
	}
	if _, ok := normalized.ProjectChatWindowing.InstancesByID["instance-d"]; ok {
		t.Fatal("expected missing section instance to be dropped")
	}

	if got := len(normalized.WindowSpaces); got != 1 {
		t.Fatalf("expected one normalized window space, got %d", got)
	}
	space := normalized.WindowSpaces["space-a"]
	if space.ID != "space-a" {
		t.Fatalf("expected normalized window space id space-a, got %q", space.ID)
	}
	if space.Name != "Workspace" {
		t.Fatalf("expected trimmed window space name Workspace, got %q", space.Name)
	}
	if got := space.Order; !reflect.DeepEqual(got, []string{"window-b", "window-a"}) {
		t.Fatalf("expected normalized window order, got %#v", got)
	}

	spaceSectionWindow := space.WindowsByID["window-a"]
	if spaceSectionWindow.SectionIDOrNull == nil || *spaceSectionWindow.SectionIDOrNull != "section-a" {
		t.Fatalf("expected trimmed window space section binding section-a, got %#v", spaceSectionWindow.SectionIDOrNull)
	}
	if spaceSectionWindow.ChatID != nil {
		t.Fatalf("expected section window-space chat id to be cleared, got %#v", spaceSectionWindow.ChatID)
	}
	if spaceSectionWindow.Title == nil || *spaceSectionWindow.Title != "Section" {
		t.Fatalf("expected trimmed window title Section, got %#v", spaceSectionWindow.Title)
	}
	if spaceSectionWindow.NormalizedBounds.Width != 1 || spaceSectionWindow.NormalizedBounds.Height != 1 {
		t.Fatalf("expected normalized floating bounds 1x1, got %#v", spaceSectionWindow.NormalizedBounds)
	}

	projectChatWindow := space.WindowsByID["window-b"]
	if projectChatWindow.SurfaceKind != WindowSpaceSurfaceKindProjectChat {
		t.Fatalf("expected default project_chat surface kind, got %q", projectChatWindow.SurfaceKind)
	}
	if projectChatWindow.ChatID != nil {
		t.Fatalf("expected git graph window-space chat id to be cleared, got %#v", projectChatWindow.ChatID)
	}
	if _, ok := space.WindowsByID["window-missing"]; ok {
		t.Fatal("expected missing section window to be dropped")
	}
}

func TestProjectCloneDeepCopiesChatWindowingAndWindowSpaces(t *testing.T) {
	t.Parallel()

	project := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		WindowSpaces: map[string]WindowSpaceConfig{
			"space-a": {
				ID:    "space-a",
				Name:  "Workspace",
				Order: []string{"window-a"},
				WindowsByID: map[string]WindowSpaceWindow{
					"window-a": {
						Title:            stringPointer("Window A"),
						ChatID:           stringPointer("chat-a"),
						NormalizedBounds: NormalizedFloatingWindowBounds{Width: 0.5, Height: 0.75},
					},
				},
			},
		},
		ProjectChatWindowing: &ProjectChatWindowingState{
			InstancesByID: map[string]ProjectChatWindowInstance{
				"instance-a": {
					Title:  stringPointer("Project AI"),
					ChatID: stringPointer("chat-a"),
					DockMetrics: ChatWindowDockMetrics{
						WidthFraction: float64Pointer(0.5),
					},
				},
			},
			Order:              []string{"instance-a"},
			NextInstanceNumber: 3,
		},
	}

	cloned := project.Clone()
	clonedWindowSpace := cloned.WindowSpaces["space-a"]
	clonedWindowSpace.Order[0] = "window-b"
	clonedWindow := clonedWindowSpace.WindowsByID["window-a"]
	clonedWindow.Title = stringPointer("Changed")
	clonedWindow.NormalizedBounds.Width = 0.25
	clonedWindowSpace.WindowsByID["window-a"] = clonedWindow
	cloned.WindowSpaces["space-a"] = clonedWindowSpace

	clonedWindowing := cloned.ProjectChatWindowing
	clonedWindowing.Order[0] = "instance-b"
	clonedInstance := clonedWindowing.InstancesByID["instance-a"]
	clonedInstance.Title = stringPointer("Changed")
	*clonedInstance.DockMetrics.WidthFraction = 0.25
	clonedWindowing.InstancesByID["instance-a"] = clonedInstance

	originalWindowSpace := project.WindowSpaces["space-a"]
	if originalWindowSpace.Order[0] != "window-a" {
		t.Fatalf("expected original window order to stay unchanged, got %#v", originalWindowSpace.Order)
	}
	if *originalWindowSpace.WindowsByID["window-a"].Title != "Window A" {
		t.Fatalf("expected original window title to stay unchanged, got %#v", originalWindowSpace.WindowsByID["window-a"].Title)
	}
	if originalWindowSpace.WindowsByID["window-a"].NormalizedBounds.Width != 0.5 {
		t.Fatalf("expected original window width to stay unchanged, got %v", originalWindowSpace.WindowsByID["window-a"].NormalizedBounds.Width)
	}

	originalWindowing := project.ProjectChatWindowing
	if originalWindowing.Order[0] != "instance-a" {
		t.Fatalf("expected original instance order to stay unchanged, got %#v", originalWindowing.Order)
	}
	if *originalWindowing.InstancesByID["instance-a"].Title != "Project AI" {
		t.Fatalf("expected original windowing title to stay unchanged, got %#v", originalWindowing.InstancesByID["instance-a"].Title)
	}
	if *originalWindowing.InstancesByID["instance-a"].DockMetrics.WidthFraction != 0.5 {
		t.Fatalf("expected original dock width fraction to stay unchanged, got %v", *originalWindowing.InstancesByID["instance-a"].DockMetrics.WidthFraction)
	}
}

func TestStoreSaveRoundTripsChatWindowingAndWindowSpaces(t *testing.T) {
	t.Parallel()

	document := Document{
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
						ID:    "space-a",
						Name:  "Workspace",
						Order: []string{"window-a"},
						WindowsByID: map[string]WindowSpaceWindow{
							"window-a": {
								Mode:             ChatWindowModeProjectAI,
								Title:            stringPointer("Project AI"),
								ChatID:           stringPointer("chat-a"),
								NormalizedBounds: NormalizedFloatingWindowBounds{Width: 0.6, Height: 0.7},
							},
						},
					},
				},
				ProjectChatWindowing: &ProjectChatWindowingState{
					InstancesByID: map[string]ProjectChatWindowInstance{
						"instance-a": {
							Placement: ChatWindowPlacementFloating,
							Mode:      ChatWindowModeProjectAI,
							Title:     stringPointer("Project AI"),
							ChatID:    stringPointer("chat-a"),
							Bounds: ChatWindowBounds{
								X:      10,
								Y:      20,
								Width:  900,
								Height: 600,
							},
						},
					},
					Order:              []string{"instance-a"},
					NextInstanceNumber: 2,
				},
			},
		},
	}

	expected, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize document: %v", err)
	}

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save document: %v", err)
	}

	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load document: %v", err)
	}

	expectedProject := expected.Projects["project-alpha"]
	loadedProject := loaded.Projects["project-alpha"]
	if !reflect.DeepEqual(loadedProject.WindowSpaces, expectedProject.WindowSpaces) {
		t.Fatalf("expected window spaces %#v, got %#v", expectedProject.WindowSpaces, loadedProject.WindowSpaces)
	}
	if !reflect.DeepEqual(loadedProject.ProjectChatWindowing, expectedProject.ProjectChatWindowing) {
		t.Fatalf("expected project chat windowing %#v, got %#v", expectedProject.ProjectChatWindowing, loadedProject.ProjectChatWindowing)
	}
}

func float64Pointer(value float64) *float64 {
	return &value
}
