package runtime

import (
	"context"
	"slices"
	"testing"
	"time"

	"setta/internal/conversation"
	"setta/internal/workspaceui"
)

func TestWorkspaceUILayoutPaneBindingObserverProjectsEasyButtonPanes(t *testing.T) {
	store := &recordingWorkspacePaneBindingStore{}
	observer, err := newWorkspaceUILayoutPaneBindingObserver(store)
	if err != nil {
		t.Fatalf("new observer: %v", err)
	}
	observer.now = func() time.Time {
		return time.Date(2026, 7, 13, 18, 0, 0, 0, time.UTC)
	}
	layout := workspaceui.WorkspaceUILayout{
		WorkspaceID:   "workspace_alpha",
		FocusedPaneID: "pane_beta",
		Panes: []workspaceui.WorkspaceUIPane{
			{
				PaneID:           "pane_alpha",
				EasyButtonConfig: &workspaceui.EasyButtonPaneConfig{ConversationID: "conversation_alpha"},
			},
			{PaneID: "pane_chat"},
			{
				PaneID:           "pane_beta",
				EasyButtonConfig: &workspaceui.EasyButtonPaneConfig{ConversationID: "conversation_beta"},
			},
		},
	}

	if err := observer.ObserveWorkspaceUILayout(layout); err != nil {
		t.Fatalf("observe layout: %v", err)
	}
	want := []conversation.WorkspacePaneBinding{
		{PaneID: "pane_alpha", ConversationID: "conversation_alpha"},
		{PaneID: "pane_beta", ConversationID: "conversation_beta", Focused: true},
	}
	if store.workspaceID != layout.WorkspaceID ||
		store.updatedAt != "2026-07-13T18:00:00Z" ||
		!slices.Equal(store.bindings, want) {
		t.Fatalf(
			"projected bindings = workspace %q at %q %+v, want workspace %q at 2026-07-13T18:00:00Z %+v",
			store.workspaceID,
			store.updatedAt,
			store.bindings,
			layout.WorkspaceID,
			want,
		)
	}
}

type recordingWorkspacePaneBindingStore struct {
	workspaceID string
	bindings    []conversation.WorkspacePaneBinding
	updatedAt   string
}

func (store *recordingWorkspacePaneBindingStore) ReplaceWorkspacePaneBindings(
	_ context.Context,
	workspaceID string,
	bindings []conversation.WorkspacePaneBinding,
	updatedAt string,
) error {
	store.workspaceID = workspaceID
	store.bindings = slices.Clone(bindings)
	store.updatedAt = updatedAt
	return nil
}
