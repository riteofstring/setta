package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"setta/internal/httpapi"
	"setta/internal/orchestrator"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

const (
	workflowCurrentWorkspaceCLIAuthDisplayName = "Setta CLI workflow current-workspace"
	workflowDefinitionsListCLIAuthDisplayName  = "Setta CLI workflow definitions list"
	workflowSchemaCLIAuthDisplayName           = "Setta CLI workflow schema"
)

type workflowOptions struct {
	AppDataDir string
}

func runWorkflow(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta workflow requires a subcommand: current-workspace, definitions, or schema")}
	}
	switch args[0] {
	case "current-workspace":
		return runWorkflowCurrentWorkspace(args[1:], deps)
	case "definitions":
		return runWorkflowDefinitions(args[1:], deps)
	case "schema":
		return runWorkflowSchema(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown workflow subcommand %q", args[0])}
	}
}

func runWorkflowCurrentWorkspace(args []string, deps cliDeps) error {
	options, err := workflowOptionsFromArgs("setta workflow current-workspace", args, deps)
	if err != nil {
		return err
	}
	currentWorkspace, err := readWorkflowCurrentWorkspace(context.Background(), options.AppDataDir, deps)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(deps.stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(currentWorkspace); err != nil {
		return fmt.Errorf("encode current workspace: %w", err)
	}
	return nil
}

func runWorkflowDefinitions(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta workflow definitions requires a subcommand: list")}
	}
	switch args[0] {
	case "list":
		return runWorkflowDefinitionsList(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown workflow definitions subcommand %q", args[0])}
	}
}

func runWorkflowDefinitionsList(args []string, deps cliDeps) error {
	options, err := workflowOptionsFromArgs("setta workflow definitions list", args, deps)
	if err != nil {
		return err
	}
	definitions, err := listWorkflowDefinitions(context.Background(), options.AppDataDir, deps)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(deps.stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(definitions); err != nil {
		return fmt.Errorf("encode workflow definitions list: %w", err)
	}
	return nil
}

func runWorkflowSchema(args []string, deps cliDeps) error {
	options, err := workflowOptionsFromArgs("setta workflow schema", args, deps)
	if err != nil {
		return err
	}
	schema, err := readWorkflowSchema(context.Background(), options.AppDataDir, deps)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(deps.stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(schema); err != nil {
		return fmt.Errorf("encode workflow schema: %w", err)
	}
	return nil
}

func workflowOptionsFromArgs(name string, args []string, deps cliDeps) (workflowOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workflowOptions{}, err
	}
	flagSet := newFlagSet(name, deps.stderr)
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workflowOptions{}, usageError{err: err}
		}
		return workflowOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return workflowOptions{}, usageError{err: fmt.Errorf("%s does not accept positional arguments", name)}
	}
	return workflowOptions{AppDataDir: appDataDir}, nil
}

func readWorkflowCurrentWorkspace(ctx context.Context, appDataDir string, deps cliDeps) (workspace.WorkspaceSummary, error) {
	state, token, cleanup, err := workflowCommandAuth(ctx, appDataDir, workflowCurrentWorkspaceCLIAuthDisplayName, deps)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	defer cleanup()

	session, err := getWorkspaceSession(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	return currentWorkspaceFromSession(session)
}

func readWorkflowSchema(ctx context.Context, appDataDir string, deps cliDeps) (orchestrator.WorkflowSchema, error) {
	state, token, cleanup, err := workflowCommandAuth(ctx, appDataDir, workflowSchemaCLIAuthDisplayName, deps)
	if err != nil {
		return orchestrator.WorkflowSchema{}, err
	}
	defer cleanup()

	schema, err := getWorkflowSchema(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return orchestrator.WorkflowSchema{}, err
	}
	if err := validateWorkflowSchemaResponse(schema); err != nil {
		return orchestrator.WorkflowSchema{}, err
	}
	return schema, nil
}

func listWorkflowDefinitions(ctx context.Context, appDataDir string, deps cliDeps) (httpapi.ListWorkflowDefinitionsResponse, error) {
	state, token, cleanup, err := workflowCommandAuth(ctx, appDataDir, workflowDefinitionsListCLIAuthDisplayName, deps)
	if err != nil {
		return httpapi.ListWorkflowDefinitionsResponse{}, err
	}
	defer cleanup()

	session, err := getWorkspaceSession(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return httpapi.ListWorkflowDefinitionsResponse{}, err
	}
	currentWorkspace, err := currentWorkspaceFromSession(session)
	if err != nil {
		return httpapi.ListWorkflowDefinitionsResponse{}, err
	}
	definitions, err := postWorkflowAPI[httpapi.ListWorkflowDefinitionsResponse](ctx, deps.httpClient, state.BaseURL, token, "workflow definitions list", "/workflows/definitions/list", httpapi.ListWorkflowDefinitionsRequest{
		WorkspaceID: currentWorkspace.ID,
	})
	if err != nil {
		return httpapi.ListWorkflowDefinitionsResponse{}, err
	}
	if err := validateWorkflowDefinitionsListResponse(definitions, currentWorkspace.ID); err != nil {
		return httpapi.ListWorkflowDefinitionsResponse{}, err
	}
	return definitions, nil
}

func workflowCommandAuth(ctx context.Context, appDataDir string, displayName string, deps cliDeps) (serveState, string, func(), error) {
	state, err := readServeState(appDataDir)
	if err != nil {
		return serveState{}, "", nil, err
	}
	if _, err := verifyServeState(ctx, deps.httpClient, state); err != nil {
		return serveState{}, "", nil, err
	}
	token, cleanup, err := createRuntimeCLIAuthSession(ctx, appDataDir, displayName)
	if err != nil {
		return serveState{}, "", nil, err
	}
	return state, token, cleanup, nil
}

func getWorkspaceSession(ctx context.Context, client *http.Client, baseURL string, token string) (workspacesession.WorkspaceSession, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+"/workspace-session", nil)
	if err != nil {
		return workspacesession.WorkspaceSession{}, fmt.Errorf("create workspace session request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := client.Do(request)
	if err != nil {
		return workspacesession.WorkspaceSession{}, fmt.Errorf("request workspace session: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return workspacesession.WorkspaceSession{}, workflowAPIStatusError("workspace session", response)
	}
	var session workspacesession.WorkspaceSession
	if err := json.NewDecoder(response.Body).Decode(&session); err != nil {
		return workspacesession.WorkspaceSession{}, fmt.Errorf("decode workspace session response: %w", err)
	}
	return session, nil
}

func getWorkflowSchema(ctx context.Context, client *http.Client, baseURL string, token string) (orchestrator.WorkflowSchema, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+"/workflows/schema", nil)
	if err != nil {
		return orchestrator.WorkflowSchema{}, fmt.Errorf("create workflow schema request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := client.Do(request)
	if err != nil {
		return orchestrator.WorkflowSchema{}, fmt.Errorf("request workflow schema: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return orchestrator.WorkflowSchema{}, workflowAPIStatusError("workflow schema", response)
	}
	var schema orchestrator.WorkflowSchema
	if err := json.NewDecoder(response.Body).Decode(&schema); err != nil {
		return orchestrator.WorkflowSchema{}, fmt.Errorf("decode workflow schema response: %w", err)
	}
	return schema, nil
}

func postWorkflowAPI[Response any](ctx context.Context, client *http.Client, baseURL string, token string, operation string, path string, payload any) (Response, error) {
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(payload); err != nil {
		var zero Response
		return zero, fmt.Errorf("encode %s request: %w", operation, err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(baseURL, "/")+path, &body)
	if err != nil {
		var zero Response
		return zero, fmt.Errorf("create %s request: %w", operation, err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		var zero Response
		return zero, fmt.Errorf("request %s: %w", operation, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		var zero Response
		return zero, workflowAPIStatusError(operation, response)
	}
	var decoded Response
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		var zero Response
		return zero, fmt.Errorf("decode %s response: %w", operation, err)
	}
	return decoded, nil
}

func workflowAPIStatusError(operation string, response *http.Response) error {
	payload, _ := io.ReadAll(response.Body)
	var apiError httpapi.ErrorResponse
	if err := json.Unmarshal(payload, &apiError); err == nil && apiError.Error.Code != "" && apiError.Error.Message != "" {
		return fmt.Errorf("%s status %d: %s: %s", operation, response.StatusCode, apiError.Error.Code, apiError.Error.Message)
	}
	return fmt.Errorf("%s status %d: %s", operation, response.StatusCode, strings.TrimSpace(string(payload)))
}

func currentWorkspaceFromSession(session workspacesession.WorkspaceSession) (workspace.WorkspaceSummary, error) {
	if session.SelectedWorkspaceID == "" {
		return workspace.WorkspaceSummary{}, errors.New("no current workspace is selected")
	}
	for _, activeWorkspace := range session.ActiveWorkspaces {
		if activeWorkspace.ID == session.SelectedWorkspaceID {
			if err := validateWorkspaceSummaryResponse(activeWorkspace); err != nil {
				return workspace.WorkspaceSummary{}, fmt.Errorf("current workspace response is invalid: %w", err)
			}
			return activeWorkspace, nil
		}
	}
	return workspace.WorkspaceSummary{}, fmt.Errorf("current workspace %s is not active", session.SelectedWorkspaceID)
}

func validateWorkspaceSummaryResponse(summary workspace.WorkspaceSummary) error {
	if summary.ID == "" {
		return errors.New("workspace id is required")
	}
	if summary.RootPath == "" {
		return fmt.Errorf("workspace rootPath is required for %s", summary.ID)
	}
	if summary.DisplayName == "" {
		return fmt.Errorf("workspace displayName is required for %s", summary.ID)
	}
	if summary.LastOpenedAt == "" {
		return fmt.Errorf("workspace lastOpenedAt is required for %s", summary.ID)
	}
	if _, err := time.Parse(time.RFC3339Nano, summary.LastOpenedAt); err != nil {
		return fmt.Errorf("workspace lastOpenedAt must be RFC3339 for %s: %w", summary.ID, err)
	}
	return nil
}

func validateWorkflowSchemaResponse(schema orchestrator.WorkflowSchema) error {
	if schema.SchemaVersion <= 0 {
		return fmt.Errorf("workflow schema returned invalid schemaVersion %d", schema.SchemaVersion)
	}
	if schema.GraphType != "WorkflowGraph" {
		return fmt.Errorf("workflow schema returned graphType %q, want WorkflowGraph", schema.GraphType)
	}
	if len(schema.GraphSchema) == 0 {
		return errors.New("workflow schema returned empty graphSchema")
	}
	if !json.Valid(schema.GraphSchema) {
		return errors.New("workflow schema returned invalid graphSchema JSON")
	}
	if len(schema.Actions) == 0 {
		return errors.New("workflow schema returned no action schemas")
	}
	return nil
}

func validateWorkflowDefinitionsListResponse(response httpapi.ListWorkflowDefinitionsResponse, workspaceID string) error {
	if response.Definitions == nil {
		return errors.New("workflow definitions list returned missing definitions array")
	}
	for _, definition := range response.Definitions {
		if err := validateWorkflowDefinitionListItem(definition, workspaceID); err != nil {
			return err
		}
	}
	return nil
}

func validateWorkflowDefinitionListItem(definition orchestrator.WorkflowDefinition, workspaceID string) error {
	if err := validateWorkflowDefinitionIdentity(definition, workspaceID); err != nil {
		return err
	}
	if err := validateWorkflowDefinitionTimestamps(definition); err != nil {
		return err
	}
	return validateWorkflowDefinitionGraphArrays(definition)
}

func validateWorkflowDefinitionIdentity(definition orchestrator.WorkflowDefinition, workspaceID string) error {
	if definition.ID == "" {
		return errors.New("workflow definition id is required")
	}
	if definition.SchemaVersion != orchestrator.SchemaVersion {
		return fmt.Errorf("workflow definition %s returned invalid schemaVersion %d", definition.ID, definition.SchemaVersion)
	}
	if definition.WorkspaceID != workspaceID {
		return fmt.Errorf("workflow definition %s returned workspaceId %s, want %s", definition.ID, definition.WorkspaceID, workspaceID)
	}
	if definition.Name == "" {
		return fmt.Errorf("workflow definition %s name is required", definition.ID)
	}
	return nil
}

func validateWorkflowDefinitionTimestamps(definition orchestrator.WorkflowDefinition) error {
	if definition.CreatedAt == "" {
		return fmt.Errorf("workflow definition %s createdAt is required", definition.ID)
	}
	if _, err := time.Parse(time.RFC3339Nano, definition.CreatedAt); err != nil {
		return fmt.Errorf("workflow definition %s createdAt must be RFC3339: %w", definition.ID, err)
	}
	if definition.UpdatedAt == "" {
		return fmt.Errorf("workflow definition %s updatedAt is required", definition.ID)
	}
	if _, err := time.Parse(time.RFC3339Nano, definition.UpdatedAt); err != nil {
		return fmt.Errorf("workflow definition %s updatedAt must be RFC3339: %w", definition.ID, err)
	}
	return nil
}

func validateWorkflowDefinitionGraphArrays(definition orchestrator.WorkflowDefinition) error {
	if definition.Graph.Nodes == nil {
		return fmt.Errorf("workflow definition %s graph nodes array is required", definition.ID)
	}
	if definition.Graph.Edges == nil {
		return fmt.Errorf("workflow definition %s graph edges array is required", definition.ID)
	}
	if definition.Graph.Layout.Nodes == nil {
		return fmt.Errorf("workflow definition %s graph layout nodes array is required", definition.ID)
	}
	return nil
}
