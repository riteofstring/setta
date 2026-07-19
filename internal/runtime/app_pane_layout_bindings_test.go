package runtime

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"setta/internal/applayout"
	"setta/internal/conversation"
)

func TestAppPaneLayoutPaneBindingObserverProjectsConversationPanes(t *testing.T) {
	store := newRecordingAppPaneBindingStore(map[string]string{
		"conversation_alpha": "workspace_alpha",
		"conversation_beta":  "workspace_beta",
	})
	observer := newTestAppPaneLayoutObserver(t, store)
	layout := appPaneLayoutForBindings(
		"app_pane_beta",
		appConversationPaneForBindings("app_pane_alpha", "conversation_alpha"),
		appConversationPaneForBindings("app_pane_beta", "conversation_beta"),
	)

	if err := observer.ObserveAppPaneLayout(nil, layout); err != nil {
		t.Fatalf("observe layout: %v", err)
	}

	assertAppPaneBindingReplacement(t, store.replacements[0], recordedAppPaneBindingReplacement{
		workspaceID: "workspace_alpha",
		updatedAt:   "2026-07-13T18:00:00Z",
		bindings: []conversation.WorkspacePaneBinding{{
			PaneID:         "app_pane_alpha",
			ConversationID: "conversation_alpha",
		}},
	})
	assertAppPaneBindingReplacement(t, store.replacements[1], recordedAppPaneBindingReplacement{
		workspaceID: "workspace_beta",
		updatedAt:   "2026-07-13T18:00:00Z",
		bindings: []conversation.WorkspacePaneBinding{{
			PaneID:         "app_pane_beta",
			ConversationID: "conversation_beta",
			Focused:        true,
		}},
	})
}

func TestAppPaneLayoutPaneBindingObserverClearsPreviousWorkspacePanes(t *testing.T) {
	store := newRecordingAppPaneBindingStore(map[string]string{
		"conversation_alpha": "workspace_alpha",
	})
	observer := newTestAppPaneLayoutObserver(t, store)
	previous := appPaneLayoutForBindings(
		"app_pane_alpha",
		appConversationPaneForBindings("app_pane_alpha", "conversation_alpha"),
	)
	current := appPaneLayoutForBindings("app_pane_master")

	if err := observer.ObserveAppPaneLayout(&previous, current); err != nil {
		t.Fatalf("observe layout: %v", err)
	}

	if len(store.replacements) != 1 {
		t.Fatalf("replacements = %+v, want one workspace clear", store.replacements)
	}
	assertAppPaneBindingReplacement(t, store.replacements[0], recordedAppPaneBindingReplacement{
		workspaceID: "workspace_alpha",
		updatedAt:   "2026-07-13T18:00:00Z",
		bindings:    []conversation.WorkspacePaneBinding{},
	})
}

func TestAppPaneLayoutPaneBindingObserverRejectsMissingCurrentConversation(t *testing.T) {
	store := newRecordingAppPaneBindingStore(map[string]string{})
	observer := newTestAppPaneLayoutObserver(t, store)
	layout := appPaneLayoutForBindings(
		"app_pane_alpha",
		appConversationPaneForBindings("app_pane_alpha", "conversation_alpha"),
	)

	err := observer.ObserveAppPaneLayout(nil, layout)
	if !errors.Is(err, conversation.ErrConversationNotFound) {
		t.Fatalf("observe error = %v, want ErrConversationNotFound", err)
	}
	if len(store.replacements) != 0 {
		t.Fatalf("replacements = %+v, want none", store.replacements)
	}
}

func newTestAppPaneLayoutObserver(
	t *testing.T,
	store *recordingAppPaneBindingStore,
) *appPaneLayoutPaneBindingObserver {
	t.Helper()

	observer, err := newAppPaneLayoutPaneBindingObserver(store)
	if err != nil {
		t.Fatalf("new observer: %v", err)
	}
	observer.now = func() time.Time {
		return time.Date(2026, 7, 13, 18, 0, 0, 0, time.UTC)
	}
	return observer
}

type recordingAppPaneBindingStore struct {
	owners       map[string]string
	replacements []recordedAppPaneBindingReplacement
}

type recordedAppPaneBindingReplacement struct {
	workspaceID string
	bindings    []conversation.WorkspacePaneBinding
	updatedAt   string
}

func newRecordingAppPaneBindingStore(owners map[string]string) *recordingAppPaneBindingStore {
	return &recordingAppPaneBindingStore{
		owners: owners,
	}
}

func (store *recordingAppPaneBindingStore) ReadConversationWorkspaceID(
	_ context.Context,
	conversationID string,
) (string, error) {
	workspaceID, ok := store.owners[conversationID]
	if !ok {
		return "", conversation.ErrConversationNotFound
	}
	return workspaceID, nil
}

func (store *recordingAppPaneBindingStore) ReplaceWorkspacePaneBindings(
	_ context.Context,
	workspaceID string,
	bindings []conversation.WorkspacePaneBinding,
	updatedAt string,
) error {
	store.replacements = append(store.replacements, recordedAppPaneBindingReplacement{
		workspaceID: workspaceID,
		bindings:    slices.Clone(bindings),
		updatedAt:   updatedAt,
	})
	return nil
}

func assertAppPaneBindingReplacement(
	t *testing.T,
	got recordedAppPaneBindingReplacement,
	want recordedAppPaneBindingReplacement,
) {
	t.Helper()

	if got.workspaceID != want.workspaceID ||
		got.updatedAt != want.updatedAt ||
		!slices.Equal(got.bindings, want.bindings) {
		t.Fatalf("replacement = %+v, want %+v", got, want)
	}
}

func appPaneLayoutForBindings(
	focusedPaneID string,
	conversationPanes ...applayout.AppPane,
) applayout.AppPaneLayout {
	panes := []applayout.AppPane{{
		ColumnID:     "app_column_master",
		Heat:         0,
		MasterConfig: &applayout.MasterPaneConfig{},
		PaneID:       "app_pane_master",
		Sequence:     0,
		Subtitle:     "Global coordinator",
		SurfaceID:    "app_surface_master",
		SurfaceKind:  applayout.AppPaneSurfaceKindMaster,
		Title:        "Setta",
		Tone:         applayout.AppPaneToneSlate,
		Weight:       1.6,
	}}
	panes = append(panes, conversationPanes...)
	paneIDs := make([]string, 0, len(panes))
	for _, pane := range panes {
		paneIDs = append(paneIDs, pane.PaneID)
	}
	return applayout.AppPaneLayout{
		SchemaVersion: applayout.SchemaVersion,
		FocusedPaneID: focusedPaneID,
		Columns: []applayout.AppPaneColumn{{
			ColumnID:       "app_column_master",
			IdealWidthSpec: applayout.AppPaneColumnWidthSpec{Unit: applayout.AppPaneColumnWidthUnitPX, Value: 640},
			Index:          0,
			PaneIDs:        paneIDs,
			PlaneIndex:     0,
			SlotIndex:      0,
			WidthSpec:      applayout.AppPaneColumnWidthSpec{Unit: applayout.AppPaneColumnWidthUnitPX, Value: 720},
		}},
		Panes: panes,
	}
}

func appConversationPaneForBindings(
	paneID string,
	conversationID string,
) applayout.AppPane {
	return applayout.AppPane{
		ColumnID: "app_column_master",
		ConversationConfig: &applayout.ConversationPaneConfig{
			ConversationID: conversationID,
			PresentationIdentity: applayout.ConversationPanePresentationIdentity{
				Subtitle: "Topic conversation",
				Title:    "Topic",
				Tone:     applayout.AppPaneToneCyan,
			},
			ResourceBindings: []applayout.ConversationPaneResourceBinding{},
		},
		Heat:        37,
		PaneID:      paneID,
		Sequence:    1,
		Subtitle:    "Topic conversation",
		SurfaceID:   paneID + "_surface",
		SurfaceKind: applayout.AppPaneSurfaceKindConversation,
		Title:       "Topic",
		Tone:        applayout.AppPaneToneCyan,
		Weight:      1,
	}
}
