package runtime

import (
	"context"
	"fmt"

	"setta/internal/conversation"
	"setta/internal/director"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

// The Director command center's runtime home.
//
// The registry follows the same durable log the conversation services write to,
// so nothing here schedules, polls, or reconciles: it materializes once at
// startup and then blocks on the store's committed-event wake.

type directorServices struct {
	commandCenter *director.CommandCenter
	registry      *director.Registry
}

// newDirectorServices materializes the app-scoped registry from the durable log
// and opens the command center over it.
func newDirectorServices(
	store *conversation.Store,
	workspaces *workspacesession.Service,
) (directorServices, error) {
	registry, err := director.NewRegistry(store, directorWorkspaceResources{workspaces: workspaces})
	if err != nil {
		return directorServices{}, fmt.Errorf("create director registry: %w", err)
	}
	if err := registry.Start(context.Background()); err != nil {
		return directorServices{}, fmt.Errorf("materialize director registry: %w", err)
	}
	commandCenter, err := director.NewCommandCenter(registry)
	if err != nil {
		_ = registry.Close()
		return directorServices{}, fmt.Errorf("create director command center: %w", err)
	}
	return directorServices{commandCenter: commandCenter, registry: registry}, nil
}

// closeDirectorServices stops following the durable log and ends every
// subscription. It runs before the conversation store closes, because the
// follower is blocked on that store's committed-event wake.
func closeDirectorServices(services directorServices) {
	if services.registry == nil {
		return
	}
	_ = services.registry.Close()
}

// directorWorkspaceResources answers the registry's two folder questions from
// the sources that actually own them: a binding resolves against durable
// workspace metadata, and the folders a new workstream may be scoped to are the
// ones the app can reach right now.
type directorWorkspaceResources struct {
	workspaces *workspacesession.Service
}

func (resources directorWorkspaceResources) LookupWorkspace(
	workspaceID string,
) (workspace.WorkspaceSummary, bool, error) {
	return resources.workspaces.LookupLocalWorkspace(workspaceID)
}

func (resources directorWorkspaceResources) AvailableWorkspaces() ([]workspace.WorkspaceSummary, error) {
	return resources.workspaces.Session().ActiveWorkspaces, nil
}
