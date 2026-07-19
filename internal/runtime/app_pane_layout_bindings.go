package runtime

import (
	"context"
	"errors"
	"slices"
	"time"

	"setta/internal/applayout"
	"setta/internal/conversation"
)

type appPaneLayoutPaneBindingObserver struct {
	store appPaneLayoutConversationStore
	now   func() time.Time
}

type appPaneLayoutConversationStore interface {
	ReadConversationWorkspaceID(context.Context, string) (string, error)
	ReplaceWorkspacePaneBindings(
		context.Context,
		string,
		[]conversation.WorkspacePaneBinding,
		string,
	) error
}

func newAppPaneLayoutPaneBindingObserver(
	store appPaneLayoutConversationStore,
) (*appPaneLayoutPaneBindingObserver, error) {
	if store == nil {
		return nil, errors.New("app layout pane binding store is required")
	}
	return &appPaneLayoutPaneBindingObserver{store: store, now: time.Now}, nil
}

func (observer *appPaneLayoutPaneBindingObserver) ObserveAppPaneLayout(
	previous *applayout.AppPaneLayout,
	layout applayout.AppPaneLayout,
) error {
	bindingsByWorkspace, workspaceIDs, err := observer.projectLayoutBindings(layout, false)
	if err != nil {
		return err
	}
	if previous != nil {
		_, previousWorkspaceIDs, err := observer.projectLayoutBindings(*previous, true)
		if err != nil {
			return err
		}
		for workspaceID := range previousWorkspaceIDs {
			workspaceIDs[workspaceID] = true
		}
	}

	orderedWorkspaceIDs := make([]string, 0, len(workspaceIDs))
	for workspaceID := range workspaceIDs {
		orderedWorkspaceIDs = append(orderedWorkspaceIDs, workspaceID)
	}
	slices.Sort(orderedWorkspaceIDs)

	updatedAt := observer.now().UTC().Format(time.RFC3339Nano)
	for _, workspaceID := range orderedWorkspaceIDs {
		bindings := bindingsByWorkspace[workspaceID]
		if bindings == nil {
			bindings = []conversation.WorkspacePaneBinding{}
		}
		if err := observer.store.ReplaceWorkspacePaneBindings(
			context.Background(),
			workspaceID,
			bindings,
			updatedAt,
		); err != nil {
			return err
		}
	}
	return nil
}

func (observer *appPaneLayoutPaneBindingObserver) projectLayoutBindings(
	layout applayout.AppPaneLayout,
	allowMissingConversations bool,
) (map[string][]conversation.WorkspacePaneBinding, map[string]bool, error) {
	bindingsByWorkspace := map[string][]conversation.WorkspacePaneBinding{}
	workspaceIDs := map[string]bool{}
	for _, pane := range layout.Panes {
		if pane.SurfaceKind != applayout.AppPaneSurfaceKindConversation {
			continue
		}
		if pane.ConversationConfig == nil {
			continue
		}
		workspaceID, err := observer.store.ReadConversationWorkspaceID(
			context.Background(),
			pane.ConversationConfig.ConversationID,
		)
		if err != nil {
			if allowMissingConversations && errors.Is(err, conversation.ErrConversationNotFound) {
				continue
			}
			return nil, nil, err
		}
		workspaceIDs[workspaceID] = true
		bindingsByWorkspace[workspaceID] = append(bindingsByWorkspace[workspaceID], conversation.WorkspacePaneBinding{
			PaneID:         pane.PaneID,
			ConversationID: pane.ConversationConfig.ConversationID,
			Focused:        pane.PaneID == layout.FocusedPaneID,
		})
	}
	return bindingsByWorkspace, workspaceIDs, nil
}

var _ applayout.LayoutObserver = (*appPaneLayoutPaneBindingObserver)(nil)
