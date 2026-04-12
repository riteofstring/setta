package projectstate

import (
	"context"
	"path/filepath"
	"reflect"
	"strings"
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
						NormalizedBounds: NormalizedFloatingWindowBounds{},
					},
					"window-b": {
						ChatID: stringPointer(" chat-window "),
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
					Placement: ChatWindowPlacementFloating,
					Mode:      ChatWindowModeGitGraph,
					ChatID:    stringPointer("drop-me"),
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
	if sectionWindow.Title != nil {
		t.Fatalf("expected section window title to be cleared, got %#v", sectionWindow.Title)
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
		t.Fatalf("expected git graph placement to remain floating, got %q", gitGraphWindow.Placement)
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
	if spaceSectionWindow.Title != nil {
		t.Fatalf("expected section-owned window-space title to be cleared, got %#v", spaceSectionWindow.Title)
	}
	if spaceSectionWindow.NormalizedBounds.Width != 1 || spaceSectionWindow.NormalizedBounds.Height != 1 {
		t.Fatalf("expected normalized floating bounds 1x1, got %#v", spaceSectionWindow.NormalizedBounds)
	}

	projectChatWindow := space.WindowsByID["window-b"]
	if projectChatWindow.SurfaceKind != WindowSpaceSurfaceKindProjectChat {
		t.Fatalf("expected default project_chat surface kind, got %q", projectChatWindow.SurfaceKind)
	}
	if projectChatWindow.Mode != ChatWindowModeProjectAI {
		t.Fatalf("expected default window-space mode project_ai_mode, got %q", projectChatWindow.Mode)
	}
	if projectChatWindow.ChatID == nil || *projectChatWindow.ChatID != "chat-window" {
		t.Fatalf("expected trimmed project-chat window-space chat id chat-window, got %#v", projectChatWindow.ChatID)
	}
	if _, ok := space.WindowsByID["window-missing"]; ok {
		t.Fatal("expected missing section window to be dropped")
	}
}

func TestProjectNormalizedDedupesSectionBoundProjectChatWindowsAndClearsTitles(t *testing.T) {
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
		ProjectChatWindowing: &ProjectChatWindowingState{
			InstancesByID: map[string]ProjectChatWindowInstance{
				"project-chat-window-1": {
					InstanceID:      "project-chat-window-1",
					Placement:       ChatWindowPlacementCanvasSection,
					SectionIDOrNull: stringPointer("section-a"),
					Title:           stringPointer("Canvas Section Chat"),
					ZIndex:          1,
				},
				"project-chat-window-2": {
					InstanceID:      "project-chat-window-2",
					Placement:       ChatWindowPlacementFloating,
					SectionIDOrNull: stringPointer("section-a"),
					Title:           stringPointer("Floating Section Chat"),
					ZIndex:          10,
				},
			},
			Order:              []string{"project-chat-window-2", "project-chat-window-1"},
			NextInstanceNumber: 3,
		},
	}

	normalized, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize project: %v", err)
	}

	if normalized.ProjectChatWindowing == nil {
		t.Fatal("expected project chat windowing to be present")
	}
	if got := normalized.ProjectChatWindowing.Order; !reflect.DeepEqual(got, []string{"project-chat-window-1"}) {
		t.Fatalf("expected deduped project chat order, got %#v", got)
	}
	if got := len(normalized.ProjectChatWindowing.InstancesByID); got != 1 {
		t.Fatalf("expected one surviving project chat window, got %d", got)
	}
	survivor := normalized.ProjectChatWindowing.InstancesByID["project-chat-window-1"]
	if survivor.SectionIDOrNull == nil || *survivor.SectionIDOrNull != "section-a" {
		t.Fatalf("expected surviving section binding section-a, got %#v", survivor.SectionIDOrNull)
	}
	if survivor.Title != nil {
		t.Fatalf("expected surviving section-bound title to be cleared, got %#v", survivor.Title)
	}
	if _, ok := normalized.ProjectChatWindowing.InstancesByID["project-chat-window-2"]; ok {
		t.Fatal("expected lower-priority duplicate project chat window to be dropped")
	}
}

func TestProjectNormalizedDedupesSectionBoundWindowSpaceWindowsAndClearsTitles(t *testing.T) {
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
			"space-dedupe": {
				ID:        "space-dedupe",
				Name:      "Workspace",
				SortIndex: 0,
				WindowsByID: map[string]WindowSpaceWindow{
					"window-1": {
						SurfaceKind:     WindowSpaceSurfaceKindSection,
						SectionIDOrNull: stringPointer("section-a"),
						Title:           stringPointer("Lower Priority Section"),
						ZIndex:          9,
					},
					"window-2": {
						SurfaceKind:     WindowSpaceSurfaceKindSection,
						SectionIDOrNull: stringPointer("section-a"),
						Title:           stringPointer("Higher ID Section"),
						ZIndex:          9,
					},
				},
				Order: []string{"window-1", "window-2"},
			},
		},
	}

	normalized, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize project: %v", err)
	}

	space := normalized.WindowSpaces["space-dedupe"]
	if got := space.Order; !reflect.DeepEqual(got, []string{"window-2"}) {
		t.Fatalf("expected deduped window-space order, got %#v", got)
	}
	if got := len(space.WindowsByID); got != 1 {
		t.Fatalf("expected one surviving window-space window, got %d", got)
	}
	survivor := space.WindowsByID["window-2"]
	if survivor.SectionIDOrNull == nil || *survivor.SectionIDOrNull != "section-a" {
		t.Fatalf("expected surviving window-space section binding section-a, got %#v", survivor.SectionIDOrNull)
	}
	if survivor.Title != nil {
		t.Fatalf("expected surviving window-space title to be cleared, got %#v", survivor.Title)
	}
	if _, ok := space.WindowsByID["window-1"]; ok {
		t.Fatal("expected lower-priority duplicate window-space window to be dropped")
	}
}

func TestProjectNormalizedRejectsInvalidProjectChatWindowOwnerModes(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name         string
		window       ProjectChatWindowInstance
		expectedText string
	}{
		{
			name: "section_mode_without_section_binding",
			window: ProjectChatWindowInstance{
				InstanceID: "project-chat-window-1",
				Placement:  ChatWindowPlacementFloating,
				Mode:       ChatWindowModeSection,
			},
			expectedText: "Project chat section_mode windows require sectionIdOrNull.",
		},
		{
			name: "git_graph_with_section_binding",
			window: ProjectChatWindowInstance{
				InstanceID:      "project-chat-window-1",
				Placement:       ChatWindowPlacementFloating,
				Mode:            ChatWindowModeGitGraph,
				SectionIDOrNull: stringPointer("section-a"),
			},
			expectedText: "Project chat git_graph_mode windows cannot carry sectionIdOrNull.",
		},
		{
			name: "git_graph_canvas_placement",
			window: ProjectChatWindowInstance{
				InstanceID: "project-chat-window-1",
				Placement:  ChatWindowPlacementCanvasSection,
				Mode:       ChatWindowModeGitGraph,
			},
			expectedText: "Project chat git_graph_mode windows cannot use canvas_section placement.",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
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
				ProjectChatWindowing: &ProjectChatWindowingState{
					InstancesByID: map[string]ProjectChatWindowInstance{
						tc.window.InstanceID: tc.window,
					},
					Order:              []string{tc.window.InstanceID},
					NextInstanceNumber: 2,
				},
			}

			_, err := project.Normalized()
			if err == nil || !strings.Contains(err.Error(), tc.expectedText) {
				t.Fatalf("expected error containing %q, got %v", tc.expectedText, err)
			}
		})
	}
}

func TestProjectNormalizedRejectsInvalidWindowSpaceOwnerModes(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name         string
		window       WindowSpaceWindow
		expectedText string
	}{
		{
			name: "section_without_section_binding",
			window: WindowSpaceWindow{
				SurfaceKind: WindowSpaceSurfaceKindSection,
			},
			expectedText: "Section window-space windows require sectionIdOrNull.",
		},
		{
			name: "project_chat_with_section_binding",
			window: WindowSpaceWindow{
				SurfaceKind:     WindowSpaceSurfaceKindProjectChat,
				SectionIDOrNull: stringPointer("section-a"),
			},
			expectedText: "Project-chat window-space windows cannot carry sectionIdOrNull.",
		},
		{
			name: "section_git_graph_mode",
			window: WindowSpaceWindow{
				SurfaceKind:     WindowSpaceSurfaceKindSection,
				SectionIDOrNull: stringPointer("section-a"),
				Mode:            ChatWindowModeGitGraph,
			},
			expectedText: "Section window-space windows cannot use git_graph_mode.",
		},
		{
			name: "project_chat_section_mode",
			window: WindowSpaceWindow{
				SurfaceKind: WindowSpaceSurfaceKindProjectChat,
				Mode:        ChatWindowModeSection,
			},
			expectedText: "Project-chat window-space windows cannot use section_mode.",
		},
		{
			name: "section_mode_with_chat_id",
			window: WindowSpaceWindow{
				SurfaceKind:     WindowSpaceSurfaceKindSection,
				SectionIDOrNull: stringPointer("section-a"),
				Mode:            ChatWindowModeSection,
				ChatID:          stringPointer("stale-chat"),
			},
			expectedText: "Window-space windows must use project_ai_mode to bind chatId.",
		},
		{
			name: "project_chat_git_graph_mode_with_chat_id",
			window: WindowSpaceWindow{
				SurfaceKind: WindowSpaceSurfaceKindProjectChat,
				Mode:        ChatWindowModeGitGraph,
				ChatID:      stringPointer("stale-chat"),
			},
			expectedText: "Window-space windows must use project_ai_mode to bind chatId.",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
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
					"space-invalid": {
						ID:        "space-invalid",
						Name:      "Invalid Workspace",
						SortIndex: 0,
						WindowsByID: map[string]WindowSpaceWindow{
							"window-invalid": tc.window,
						},
						Order: []string{"window-invalid"},
					},
				},
			}

			_, err := project.Normalized()
			if err == nil || !strings.Contains(err.Error(), tc.expectedText) {
				t.Fatalf("expected error containing %q, got %v", tc.expectedText, err)
			}
		})
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

func TestStoreSaveRoundTripsWindowingScopedPerProjectConfig(t *testing.T) {
	t.Parallel()

	newProject := func(
		projectID string,
		projectName string,
		windowSpaceID string,
		windowID string,
		instanceID string,
		chatSuffix string,
	) Project {
		return Project{
			ID:   projectID,
			Name: projectName,
			WindowSpaces: map[string]WindowSpaceConfig{
				windowSpaceID: {
					ID:    windowSpaceID,
					Name:  projectName + " Workspace",
					Order: []string{windowID},
					WindowsByID: map[string]WindowSpaceWindow{
						windowID: {
							SurfaceKind: WindowSpaceSurfaceKindProjectChat,
							Mode:        ChatWindowModeProjectAI,
							ChatID:      stringPointer("saved-" + chatSuffix),
							NormalizedBounds: NormalizedFloatingWindowBounds{
								Width:  0.5,
								Height: 0.6,
							},
						},
					},
				},
			},
			ProjectChatWindowing: &ProjectChatWindowingState{
				InstancesByID: map[string]ProjectChatWindowInstance{
					instanceID: {
						Placement: ChatWindowPlacementFloating,
						Mode:      ChatWindowModeProjectAI,
						ChatID:    stringPointer("live-" + chatSuffix),
						Bounds: ChatWindowBounds{
							X:      10,
							Y:      20,
							Width:  900,
							Height: 600,
						},
					},
				},
				Order:              []string{instanceID},
				NextInstanceNumber: 2,
			},
		}
	}

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": newProject(
				"project-alpha",
				"Alpha",
				"space-alpha",
				"window-alpha",
				"instance-alpha",
				"alpha",
			),
			"project-beta": newProject(
				"project-beta",
				"Beta",
				"space-beta",
				"window-beta",
				"instance-beta",
				"beta",
			),
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

	for _, projectID := range []string{"project-alpha", "project-beta"} {
		expectedProject := expected.Projects[projectID]
		loadedProject := loaded.Projects[projectID]
		if !reflect.DeepEqual(loadedProject.WindowSpaces, expectedProject.WindowSpaces) {
			t.Fatalf(
				"expected window spaces for %s %#v, got %#v",
				projectID,
				expectedProject.WindowSpaces,
				loadedProject.WindowSpaces,
			)
		}
		if !reflect.DeepEqual(loadedProject.ProjectChatWindowing, expectedProject.ProjectChatWindowing) {
			t.Fatalf(
				"expected project chat windowing for %s %#v, got %#v",
				projectID,
				expectedProject.ProjectChatWindowing,
				loadedProject.ProjectChatWindowing,
			)
		}
	}
}

func float64Pointer(value float64) *float64 {
	return &value
}
