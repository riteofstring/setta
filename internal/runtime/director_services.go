package runtime

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"setta/internal/conversation"
	"setta/internal/director"
	"setta/internal/narration"
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
// registry is what is durably true, the Director conversation decides whether to
// talk or call a Setta tool, and the executor turns authorized tool calls into
// work. Only this file joins the Director conversation to the local conversation
// service.

// directorRuntimeDirectoryName holds the isolated, read-only working directory
// the Director conversation runs in. The Director coordinates workstreams and
// reads no workspace itself, so this directory only ever needs to exist.
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
	roles directorRoleResolver,
	provider directorProviderRuntime,
	narrator *narration.Service,
) (directorServices, error) {
	registry, err := director.NewRegistry(store, directorWorkspaceResources{workspaces: workspaces})
	if err != nil {
		return directorServices{}, fmt.Errorf("create director registry: %w", err)
	}
	if err := registry.Start(context.Background()); err != nil {
		return directorServices{}, fmt.Errorf("materialize director registry: %w", err)
	}
	commandCenter, err := newDirectorCommandCenter(
		appDataDir,
		store,
		registry,
		conversations,
		roles,
		provider,
		narrator,
	)
	if err != nil {
		_ = registry.Close()
		return directorServices{}, err
	}
	return directorServices{commandCenter: commandCenter, registry: registry}, nil
}

func newDirectorCommandCenter(
	appDataDir string,
	store *conversation.Store,
	registry *director.Registry,
	conversations *conversation.Service,
	roles directorRoleResolver,
	provider directorProviderRuntime,
	narrator *narration.Service,
) (*director.CommandCenter, error) {
	carrierRoot := filepath.Join(filepath.Clean(appDataDir), directorRuntimeDirectoryName)
	if err := os.MkdirAll(carrierRoot, 0o700); err != nil {
		return nil, fmt.Errorf("create director runtime directory: %w", err)
	}
	carrierPort, err := newDirectorCarrierPort(roles, provider, carrierRoot)
	if err != nil {
		return nil, fmt.Errorf("create director carrier port: %w", err)
	}
	execution, err := newDirectorWorkstreamExecution(conversations, registry)
	if err != nil {
		return nil, fmt.Errorf("create director workstream execution: %w", err)
	}
	executor, err := director.NewDecisionExecutor(registry, execution)
	if err != nil {
		return nil, fmt.Errorf("create director decision executor: %w", err)
	}
	// The Director shares the conversation runtime's carrier registry. Its
	// carrier is process-local runtime state like every workstream's, so one
	// registry holds every live carrier this app run started.
	narratorPort, err := newDirectorNarratorPort(narrator, store)
	if err != nil {
		return nil, fmt.Errorf("create director narrator port: %w", err)
	}
	directorConversation, err := director.NewDirectorConversation(
		registry,
		executor,
		store,
		conversations.Carriers(),
		carrierPort,
		narratorPort,
	)
	if err != nil {
		return nil, fmt.Errorf("create director conversation: %w", err)
	}
	commandCenter, err := director.NewCommandCenter(registry, directorConversation, executor)
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
