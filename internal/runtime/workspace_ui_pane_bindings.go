package runtime

import (
	"context"
	"errors"
	"time"

	"setta/internal/conversation"
	"setta/internal/workspaceui"
)

type workspaceUILayoutPaneBindingObserver struct {
	store workspacePaneBindingStore
	now   func() time.Time
}

type workspacePaneBindingStore interface {
	ReplaceWorkspacePaneBindings(
		context.Context,
		string,
		[]conversation.WorkspacePaneBinding,
		string,
	) error
}

func newWorkspaceUILayoutPaneBindingObserver(
	store workspacePaneBindingStore,
) (*workspaceUILayoutPaneBindingObserver, error) {
	if store == nil {
		return nil, errors.New("workspace layout pane binding store is required")
	}
	return &workspaceUILayoutPaneBindingObserver{store: store, now: time.Now}, nil
}

func (observer *workspaceUILayoutPaneBindingObserver) ObserveWorkspaceUILayout(
	layout workspaceui.WorkspaceUILayout,
) error {
	bindings := make([]conversation.WorkspacePaneBinding, 0, len(layout.Panes))
	for _, pane := range layout.Panes {
		if pane.EasyButtonConfig == nil {
			continue
		}
		bindings = append(bindings, conversation.WorkspacePaneBinding{
			PaneID:         pane.PaneID,
			ConversationID: pane.EasyButtonConfig.ConversationID,
			Focused:        pane.PaneID == layout.FocusedPaneID,
		})
	}
	return observer.store.ReplaceWorkspacePaneBindings(
		context.Background(),
		layout.WorkspaceID,
		bindings,
		observer.now().UTC().Format(time.RFC3339Nano),
	)
}

var _ workspaceui.LayoutObserver = (*workspaceUILayoutPaneBindingObserver)(nil)
