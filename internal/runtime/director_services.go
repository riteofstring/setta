package runtime

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

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
//
// The command center is assembled from three pieces that stay separable: the
// registry is what is durably true, the router is what one request means, and
// the executor is how a decision becomes work. Only this file knows that the
// Director decides through a provider and executes through the local
// conversation service.

// directorRuntimeDirectoryName holds the isolated, read-only working directory
// the Director's decision turns run in. They cannot read a workspace, so this
// directory only ever needs to exist.
const directorRuntimeDirectoryName = "director"

type directorServices struct {
	commandCenter *director.CommandCenter
	registry      *director.Registry
}

// newDirectorServices materializes the app-scoped registry from the durable log
// and opens the command center over it.
func newDirectorServices(
	appDataDir string,
	store *conversation.Store,
	workspaces *workspacesession.Service,
	conversations *conversation.Service,
	roles directorDecisionRole,
	provider directorStructuredCallProvider,
) (directorServices, error) {
	registry, err := director.NewRegistry(store, directorWorkspaceResources{workspaces: workspaces})
	if err != nil {
		return directorServices{}, fmt.Errorf("create director registry: %w", err)
	}
	if err := registry.Start(context.Background()); err != nil {
		return directorServices{}, fmt.Errorf("materialize director registry: %w", err)
	}
	commandCenter, err := newDirectorCommandCenter(appDataDir, registry, conversations, roles, provider)
	if err != nil {
		_ = registry.Close()
		return directorServices{}, err
	}
	return directorServices{commandCenter: commandCenter, registry: registry}, nil
}

func newDirectorCommandCenter(
	appDataDir string,
	registry *director.Registry,
	conversations *conversation.Service,
	roles directorDecisionRole,
	provider directorStructuredCallProvider,
) (*director.CommandCenter, error) {
	decisionRoot := filepath.Join(filepath.Clean(appDataDir), directorRuntimeDirectoryName)
	if err := os.MkdirAll(decisionRoot, 0o700); err != nil {
		return nil, fmt.Errorf("create director runtime directory: %w", err)
	}
	caller, err := newDirectorDecisionCaller(roles, provider, decisionRoot)
	if err != nil {
		return nil, fmt.Errorf("create director decision caller: %w", err)
	}
	router, err := director.NewDecisionRouter(registry, caller)
	if err != nil {
		return nil, fmt.Errorf("create director decision router: %w", err)
	}
	execution, err := newDirectorWorkstreamExecution(conversations)
	if err != nil {
		return nil, fmt.Errorf("create director workstream execution: %w", err)
	}
	executor, err := director.NewDecisionExecutor(registry, execution)
	if err != nil {
		return nil, fmt.Errorf("create director decision executor: %w", err)
	}
	commandCenter, err := director.NewCommandCenter(registry, router, executor)
	if err != nil {
		return nil, fmt.Errorf("create director command center: %w", err)
	}
	return commandCenter, nil
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
	return availableDirectorWorkspaces(resources.workspaces.Session())
}

func availableDirectorWorkspaces(
	session workspacesession.WorkspaceSession,
) ([]workspace.WorkspaceSummary, error) {
	availableIDs, err := session.AvailableActiveWorkspaceIDs()
	if err != nil {
		return nil, err
	}
	available := make(map[string]bool, len(availableIDs))
	for _, workspaceID := range availableIDs {
		available[workspaceID] = true
	}
	summaries := make([]workspace.WorkspaceSummary, 0, len(availableIDs))
	for _, summary := range session.ActiveWorkspaces {
		if available[summary.ID] {
			summaries = append(summaries, summary)
		}
	}
	return summaries, nil
}
