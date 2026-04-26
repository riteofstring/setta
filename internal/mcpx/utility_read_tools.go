package mcpx

import (
	"context"
	"errors"
	"slices"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/settadocs"
	"setta/internal/terminals"
	"setta/internal/tools"
)

type mcpToolSearchResult struct {
	Results []tools.SearchResult `json:"results"`
}

type projectConfigNamesAndIDsResult struct {
	ProjectConfigs []projectstate.ProjectConfigMetadata `json:"projectConfigs"`
}

type installedPythonPackagesResult struct {
	Packages []string `json:"packages"`
}

type mcpServerRuntimeStatusEntry struct {
	ServerID      string       `json:"serverId"`
	State         RuntimeState `json:"state"`
	ToolCount     int          `json:"toolCount"`
	LastError     *string      `json:"lastError,omitempty"`
	MissingEnvVar *string      `json:"missingEnvVar,omitempty"`
}

type mcpServerRuntimeStatusResult struct {
	Servers []mcpServerRuntimeStatusEntry `json:"servers"`
}

const defaultMCPToolSearchLimit = 2

type mcpToolSearchRequest struct {
	query     string
	limit     int
	serverIDs []string
}

func newSearchMCPToolsHandler(server *Server) tools.Handler {
	return func(_ context.Context, arguments map[string]any) (any, error) {
		request, err := readMCPToolSearchRequest(arguments)
		if err != nil {
			return nil, err
		}
		if !shouldSearchMCPToolServers(request.serverIDs) {
			return mcpToolSearchResult{Results: []tools.SearchResult{}}, nil
		}

		results, err := searchMCPTools(server, request)
		if err != nil {
			return nil, err
		}
		return mcpToolSearchResult{Results: results}, nil
	}
}

func readMCPToolSearchRequest(arguments map[string]any) (mcpToolSearchRequest, error) {
	query, err := readRequiredStringArgument(arguments, "query")
	if err != nil {
		return mcpToolSearchRequest{}, err
	}
	limit, err := readMCPToolSearchLimit(arguments)
	if err != nil {
		return mcpToolSearchRequest{}, err
	}
	serverIDs, err := readNormalizedOptionalStringArrayArgument(arguments, "serverIds")
	if err != nil {
		return mcpToolSearchRequest{}, err
	}
	return mcpToolSearchRequest{
		query:     query,
		limit:     limit,
		serverIDs: serverIDs,
	}, nil
}

func readMCPToolSearchLimit(arguments map[string]any) (int, error) {
	resolvedLimit, err := readOptionalIntArgument(arguments, "limit")
	if err != nil {
		return 0, err
	}
	if resolvedLimit == nil {
		return defaultMCPToolSearchLimit, nil
	}
	return *resolvedLimit, nil
}

func readNormalizedOptionalStringArrayArgument(arguments map[string]any, field string) ([]string, error) {
	values, err := readOptionalStringArrayArgument(arguments, field)
	if err != nil {
		return nil, err
	}
	return normalizeNonBlankStrings(values, field)
}

func shouldSearchMCPToolServers(serverIDs []string) bool {
	return len(serverIDs) == 0 || slices.Contains(serverIDs, DefaultServerID)
}

func searchMCPTools(server *Server, request mcpToolSearchRequest) ([]tools.SearchResult, error) {
	if server == nil || server.toolSearch == nil {
		return []tools.SearchResult{}, nil
	}

	results, err := server.toolSearch.Search(request.query, request.limit)
	if err != nil {
		return nil, mapMCPToolSearchError(err)
	}
	if results == nil {
		return []tools.SearchResult{}, nil
	}
	return results, nil
}

func mapMCPToolSearchError(err error) error {
	if errors.Is(err, tools.ErrToolSearchQueryRequired) || errors.Is(err, tools.ErrToolSearchQueryUnsearchable) {
		return newToolError("invalid_arguments", "%s", err.Error())
	}
	return err
}

func newGetMCPServerRuntimeStatusHandler(server *Server) tools.Handler {
	return func(context.Context, map[string]any) (any, error) {
		statuses := []mcpServerRuntimeStatusEntry{}
		if server != nil && server.mcpStatuses != nil {
			runtimeStatuses := server.mcpStatuses.RuntimeStatuses()
			statuses = make([]mcpServerRuntimeStatusEntry, 0, len(runtimeStatuses))
			for _, status := range runtimeStatuses {
				statuses = append(statuses, mcpServerRuntimeStatusEntry{
					ServerID:      status.ServerID,
					State:         status.State,
					ToolCount:     status.ToolCount,
					LastError:     cloneStringPtr(status.LastError),
					MissingEnvVar: cloneStringPtr(status.MissingEnvVar),
				})
			}
		}
		return mcpServerRuntimeStatusResult{Servers: statuses}, nil
	}
}

func newGetProjectConfigNamesAndIDsHandler(projectState projectStateProvider) tools.Handler {
	return func(context.Context, map[string]any) (any, error) {
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state runtime is unavailable.")
		}
		return projectConfigNamesAndIDsResult{
			ProjectConfigs: projectState.Snapshot().Document.ProjectConfigMetadata(),
		}, nil
	}
}

func newGetInstalledPythonPackagesHandler(server *Server) tools.Handler {
	return func(ctx context.Context, _ map[string]any) (any, error) {
		if server == nil || server.pythonPackages == nil {
			return nil, newToolError("internal_error", "Python package inspection runtime is unavailable.")
		}

		packages, err := server.pythonPackages.InstalledPackages(ctx)
		if err != nil {
			return nil, newToolError("internal_error", "Failed to inspect installed Python packages: %s", err.Error())
		}
		if packages == nil {
			packages = []string{}
		}
		return installedPythonPackagesResult{Packages: packages}, nil
	}
}

func newGetTerminalOutputHandler(server *Server) tools.Handler {
	return func(_ context.Context, arguments map[string]any) (any, error) {
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		if server == nil || server.terminals == nil {
			return nil, newToolError("internal_error", "Terminal history service is unavailable.")
		}

		history, err := server.terminals.History(terminals.BuildTerminalID(sectionID, ""))
		if err != nil {
			if errors.Is(err, terminals.ErrUnknownSession) {
				return nil, newToolError("invalid_arguments", "%s", err.Error())
			}
			return nil, err
		}
		return history, nil
	}
}

func newGetSettaDocsHandler(server *Server) tools.Handler {
	return func(_ context.Context, arguments map[string]any) (any, error) {
		docIDs, err := readOptionalStringArrayArgument(arguments, "docIds")
		if err != nil {
			return nil, err
		}
		docIDs, err = normalizeNonBlankStrings(docIDs, "docIds")
		if err != nil {
			return nil, err
		}
		if server == nil || server.docs == nil {
			return nil, newToolError("internal_error", "Setta docs loader is unavailable.")
		}

		bundle, err := server.docs.Load(docIDs)
		if err != nil {
			switch {
			case errors.Is(err, settadocs.ErrDocIDInvalid):
				return nil, newToolError("invalid_arguments", "%s", err.Error())
			case errors.Is(err, settadocs.ErrDocNotFound):
				return nil, newToolError("file_not_found", "%s", err.Error())
			case errors.Is(err, settadocs.ErrDocsRootNotFound),
				errors.Is(err, settadocs.ErrDocsRootRequired):
				return nil, newToolError("internal_error", "%s", err.Error())
			default:
				return nil, err
			}
		}
		return bundle, nil
	}
}

func normalizeNonBlankStrings(values []string, field string) ([]string, error) {
	if len(values) == 0 {
		return values, nil
	}

	normalized := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return nil, newToolError("invalid_arguments", "%s must contain non-empty strings", field)
		}
		normalized = append(normalized, trimmed)
	}
	return normalized, nil
}
