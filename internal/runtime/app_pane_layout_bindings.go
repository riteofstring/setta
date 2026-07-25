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

type projectedAppPaneLayoutBindings struct {
	bindingsByWorkspace map[string][]conversation.WorkspacePaneBinding
	workspaceIDs        map[string]bool
	folderlessBindings  []conversation.FolderlessPaneBinding
	hasFolderless       bool
}

type appPaneLayoutConversationStore interface {
	ReadConversationWorkspaceBindingID(context.Context, string) (*string, error)
	ReplaceWorkspacePaneBindings(
		context.Context,
		string,
		[]conversation.WorkspacePaneBinding,
		string,
	) error
	ReplaceFolderlessPaneBindings(
		context.Context,
		[]conversation.FolderlessPaneBinding,
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
	projection, err := observer.projectLayoutBindings(layout, false)
	if err != nil {
		return err
	}
	if previous != nil {
		if err := observer.includePreviousLayoutBindingScopes(&projection, *previous); err != nil {
			return err
		}
	}
	return observer.replaceProjectedLayoutBindings(projection)
}

func (observer *appPaneLayoutPaneBindingObserver) includePreviousLayoutBindingScopes(
	projection *projectedAppPaneLayoutBindings,
	previous applayout.AppPaneLayout,
) error {
	previousProjection, err := observer.projectLayoutBindings(previous, true)
	if err != nil {
		return err
	}
	for workspaceID := range previousProjection.workspaceIDs {
		projection.workspaceIDs[workspaceID] = true
	}
	projection.hasFolderless = projection.hasFolderless || previousProjection.hasFolderless
	return nil
}

func (observer *appPaneLayoutPaneBindingObserver) replaceProjectedLayoutBindings(
	projection projectedAppPaneLayoutBindings,
) error {
	updatedAt := observer.now().UTC().Format(time.RFC3339Nano)
	if err := observer.replaceWorkspacePaneBindings(projection, updatedAt); err != nil {
		return err
	}
	return observer.replaceFolderlessPaneBindings(projection, updatedAt)
}

func (observer *appPaneLayoutPaneBindingObserver) replaceWorkspacePaneBindings(
	projection projectedAppPaneLayoutBindings,
	updatedAt string,
) error {
	orderedWorkspaceIDs := make([]string, 0, len(projection.workspaceIDs))
	for workspaceID := range projection.workspaceIDs {
		orderedWorkspaceIDs = append(orderedWorkspaceIDs, workspaceID)
	}
	slices.Sort(orderedWorkspaceIDs)

	for _, workspaceID := range orderedWorkspaceIDs {
		bindings := projection.bindingsByWorkspace[workspaceID]
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

func (observer *appPaneLayoutPaneBindingObserver) replaceFolderlessPaneBindings(
	projection projectedAppPaneLayoutBindings,
	updatedAt string,
) error {
	if !projection.hasFolderless {
		return nil
	}
	bindings := projection.folderlessBindings
	if bindings == nil {
		bindings = []conversation.FolderlessPaneBinding{}
	}
	return observer.store.ReplaceFolderlessPaneBindings(
		context.Background(),
		bindings,
		updatedAt,
	)
}

func (observer *appPaneLayoutPaneBindingObserver) projectLayoutBindings(
	layout applayout.AppPaneLayout,
	allowMissingConversations bool,
) (projectedAppPaneLayoutBindings, error) {
	projection := projectedAppPaneLayoutBindings{
		bindingsByWorkspace: map[string][]conversation.WorkspacePaneBinding{},
		workspaceIDs:        map[string]bool{},
		folderlessBindings:  []conversation.FolderlessPaneBinding{},
	}
	for _, pane := range layout.Panes {
		if pane.SurfaceKind != applayout.AppPaneSurfaceKindConversation {
			continue
		}
		if pane.ConversationConfig == nil {
			continue
		}
		workspaceID, err := observer.store.ReadConversationWorkspaceBindingID(
			context.Background(),
			pane.ConversationConfig.ConversationID,
		)
		if err != nil {
			if allowMissingConversations && errors.Is(err, conversation.ErrConversationNotFound) {
				continue
			}
			return projectedAppPaneLayoutBindings{}, err
		}
		if workspaceID == nil {
			projection.hasFolderless = true
			projection.folderlessBindings = append(projection.folderlessBindings, conversation.FolderlessPaneBinding{
				PaneID:         pane.PaneID,
				ConversationID: pane.ConversationConfig.ConversationID,
				Focused:        pane.PaneID == layout.FocusedPaneID,
			})
			continue
		}
		projection.workspaceIDs[*workspaceID] = true
		projection.bindingsByWorkspace[*workspaceID] = append(projection.bindingsByWorkspace[*workspaceID], conversation.WorkspacePaneBinding{
			PaneID:         pane.PaneID,
			ConversationID: pane.ConversationConfig.ConversationID,
			Focused:        pane.PaneID == layout.FocusedPaneID,
		})
	}
	return projection, nil
}

var _ applayout.LayoutObserver = (*appPaneLayoutPaneBindingObserver)(nil)
