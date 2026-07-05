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

	"setta/internal/httpapi"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

const (
	workspaceCurrentCLIAuthDisplayName   = "Setta CLI workspace current"
	workspacePanesListCLIAuthDisplayName = "Setta CLI workspace panes list"
	workspacePanesReadCLIAuthDisplayName = "Setta CLI workspace panes read"
	workspaceSchemaCLIAuthDisplayName    = "Setta CLI workspace schema"
)

type workspaceOptions struct {
	AppDataDir string
}

type workspacePaneReadOptions struct {
	AppDataDir string
	PaneID     string
}

func runWorkspace(args []string, deps cliDeps) error {
	return workspaceCommandError(runWorkspaceCommand(args, deps))
}

func runWorkspaceCommand(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta workspace requires a subcommand: current, panes, or schema")}
	}
	switch args[0] {
	case "current":
		return runWorkspaceCurrent(args[1:], deps)
	case "panes":
		return runWorkspacePanes(args[1:], deps)
	case "schema":
		return runWorkspaceSchema(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown workspace subcommand %q", args[0])}
	}
}

func runWorkspaceCurrent(args []string, deps cliDeps) error {
	options, err := workspaceOptionsFromArgs("setta workspace current", args, deps)
	if err != nil {
		return err
	}
	currentWorkspace, err := readWorkspaceCurrent(context.Background(), options.AppDataDir, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, currentWorkspace, "current workspace")
}

func runWorkspaceSchema(args []string, deps cliDeps) error {
	options, err := workspaceOptionsFromArgs("setta workspace schema", args, deps)
	if err != nil {
		return err
	}
	schema, err := readWorkspaceSchema(context.Background(), options.AppDataDir, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, schema, "workspace schema")
}

func runWorkspacePanes(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta workspace panes requires a subcommand: list or read")}
	}
	switch args[0] {
	case "list":
		return runWorkspacePanesList(args[1:], deps)
	case "read":
		return runWorkspacePanesRead(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown workspace panes subcommand %q", args[0])}
	}
}

func runWorkspacePanesList(args []string, deps cliDeps) error {
	options, err := workspaceOptionsFromArgs("setta workspace panes list", args, deps)
	if err != nil {
		return err
	}
	panes, err := listWorkspacePanes(context.Background(), options.AppDataDir, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, panes, "workspace panes list")
}

func runWorkspacePanesRead(args []string, deps cliDeps) error {
	options, err := workspacePaneReadOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	pane, err := readWorkspacePane(context.Background(), options.AppDataDir, options.PaneID, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, pane, "workspace pane")
}

func workspaceOptionsFromArgs(name string, args []string, deps cliDeps) (workspaceOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspaceOptions{}, err
	}
	flagSet := newWorkspaceFlagSet(name)
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspaceOptions{}, usageError{err: err}
		}
		return workspaceOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return workspaceOptions{}, usageError{err: fmt.Errorf("%s does not accept positional arguments", name)}
	}
	return workspaceOptions{AppDataDir: appDataDir}, nil
}

func workspacePaneReadOptionsFromArgs(args []string, deps cliDeps) (workspacePaneReadOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspacePaneReadOptions{}, err
	}
	flagSet := newWorkspaceFlagSet("setta workspace panes read")
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspacePaneReadOptions{}, usageError{err: err}
		}
		return workspacePaneReadOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return workspacePaneReadOptions{}, usageError{err: errors.New("setta workspace panes read requires exactly one pane id")}
	}
	paneID := strings.TrimSpace(flagSet.Arg(0))
	if paneID == "" {
		return workspacePaneReadOptions{}, usageError{err: errors.New("workspace pane id is required")}
	}
	return workspacePaneReadOptions{AppDataDir: appDataDir, PaneID: paneID}, nil
}

func readWorkspaceCurrent(ctx context.Context, appDataDir string, deps cliDeps) (workspace.WorkspaceSummary, error) {
	state, token, cleanup, err := workspaceCommandAuth(ctx, appDataDir, workspaceCurrentCLIAuthDisplayName, deps)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	defer cleanup()

	session, err := getWorkspaceSessionForWorkspaceCommand(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	return currentWorkspaceFromWorkspaceSession(session)
}

func readWorkspaceSchema(ctx context.Context, appDataDir string, deps cliDeps) (workspaceui.WorkspaceUISchema, error) {
	state, token, cleanup, err := workspaceCommandAuth(ctx, appDataDir, workspaceSchemaCLIAuthDisplayName, deps)
	if err != nil {
		return workspaceui.WorkspaceUISchema{}, err
	}
	defer cleanup()

	schema, err := getWorkspaceSchema(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return workspaceui.WorkspaceUISchema{}, err
	}
	if err := validateWorkspaceSchemaResponse(schema); err != nil {
		return workspaceui.WorkspaceUISchema{}, err
	}
	return schema, nil
}

func listWorkspacePanes(ctx context.Context, appDataDir string, deps cliDeps) (workspaceui.WorkspaceUIPaneListResult, error) {
	state, token, cleanup, err := workspaceCommandAuth(ctx, appDataDir, workspacePanesListCLIAuthDisplayName, deps)
	if err != nil {
		return workspaceui.WorkspaceUIPaneListResult{}, err
	}
	defer cleanup()

	currentWorkspace, err := currentWorkspaceForWorkspaceCommand(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return workspaceui.WorkspaceUIPaneListResult{}, err
	}
	panes, err := postWorkspaceAPI[workspaceui.WorkspaceUIPaneListResult](ctx, deps.httpClient, state.BaseURL, token, "workspace panes list", "/workspaces/ui/panes/list", httpapi.ListWorkspaceUIPanesRequest{
		WorkspaceID: currentWorkspace.ID,
	})
	if err != nil {
		return workspaceui.WorkspaceUIPaneListResult{}, err
	}
	if err := validateWorkspacePaneListResponse(panes, currentWorkspace.ID); err != nil {
		return workspaceui.WorkspaceUIPaneListResult{}, err
	}
	return panes, nil
}

func readWorkspacePane(ctx context.Context, appDataDir string, paneID string, deps cliDeps) (workspaceui.WorkspaceUIPaneReadResult, error) {
	state, token, cleanup, err := workspaceCommandAuth(ctx, appDataDir, workspacePanesReadCLIAuthDisplayName, deps)
	if err != nil {
		return workspaceui.WorkspaceUIPaneReadResult{}, err
	}
	defer cleanup()

	currentWorkspace, err := currentWorkspaceForWorkspaceCommand(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return workspaceui.WorkspaceUIPaneReadResult{}, err
	}
	pane, err := postWorkspaceAPI[workspaceui.WorkspaceUIPaneReadResult](ctx, deps.httpClient, state.BaseURL, token, "workspace panes read", "/workspaces/ui/panes/read", httpapi.ReadWorkspaceUIPaneRequest{
		WorkspaceID: currentWorkspace.ID,
		PaneID:      paneID,
	})
	if err != nil {
		return workspaceui.WorkspaceUIPaneReadResult{}, err
	}
	if err := validateWorkspacePaneReadResponse(pane, currentWorkspace.ID, paneID); err != nil {
		return workspaceui.WorkspaceUIPaneReadResult{}, err
	}
	return pane, nil
}

func currentWorkspaceForWorkspaceCommand(ctx context.Context, client *http.Client, baseURL string, token string) (workspace.WorkspaceSummary, error) {
	session, err := getWorkspaceSessionForWorkspaceCommand(ctx, client, baseURL, token)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	return currentWorkspaceFromWorkspaceSession(session)
}

func workspaceCommandAuth(ctx context.Context, appDataDir string, displayName string, deps cliDeps) (serveState, string, func(), error) {
	state, err := readServeState(appDataDir)
	if err != nil {
		if errors.Is(err, errServeStateNotFound) {
			return serveState{}, "", nil, newWorkspaceCLIError("setta_serve_state_missing", err)
		}
		return serveState{}, "", nil, newWorkspaceCLIError("setta_serve_state_read_failed", err)
	}
	if _, err := verifyServeState(ctx, deps.httpClient, state); err != nil {
		return serveState{}, "", nil, newWorkspaceCLIError("setta_serve_unreachable", err)
	}
	token, cleanup, err := createRuntimeCLIAuthSession(ctx, appDataDir, displayName)
	if err != nil {
		return serveState{}, "", nil, newWorkspaceCLIError("workspace_cli_auth_session_failed", err)
	}
	return state, token, cleanup, nil
}

func getWorkspaceSessionForWorkspaceCommand(ctx context.Context, client *http.Client, baseURL string, token string) (workspacesession.WorkspaceSession, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+"/workspace-session", nil)
	if err != nil {
		return workspacesession.WorkspaceSession{}, newWorkspaceCLIError("workspace_api_request_create_failed", fmt.Errorf("create workspace session request: %w", err))
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := client.Do(request)
	if err != nil {
		return workspacesession.WorkspaceSession{}, newWorkspaceCLIError("workspace_api_request_failed", fmt.Errorf("request workspace session: %w", err))
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return workspacesession.WorkspaceSession{}, workspaceAPIStatusError("workspace session", response)
	}
	var session workspacesession.WorkspaceSession
	if err := json.NewDecoder(response.Body).Decode(&session); err != nil {
		return workspacesession.WorkspaceSession{}, newWorkspaceCLIError("workspace_api_response_decode_failed", fmt.Errorf("decode workspace session response: %w", err))
	}
	return session, nil
}

func getWorkspaceSchema(ctx context.Context, client *http.Client, baseURL string, token string) (workspaceui.WorkspaceUISchema, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+"/workspaces/ui/schema", nil)
	if err != nil {
		return workspaceui.WorkspaceUISchema{}, newWorkspaceCLIError("workspace_api_request_create_failed", fmt.Errorf("create workspace schema request: %w", err))
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := client.Do(request)
	if err != nil {
		return workspaceui.WorkspaceUISchema{}, newWorkspaceCLIError("workspace_api_request_failed", fmt.Errorf("request workspace schema: %w", err))
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return workspaceui.WorkspaceUISchema{}, workspaceAPIStatusError("workspace schema", response)
	}
	var schema workspaceui.WorkspaceUISchema
	if err := json.NewDecoder(response.Body).Decode(&schema); err != nil {
		return workspaceui.WorkspaceUISchema{}, newWorkspaceCLIError("workspace_api_response_decode_failed", fmt.Errorf("decode workspace schema response: %w", err))
	}
	return schema, nil
}

func postWorkspaceAPI[Response any](ctx context.Context, client *http.Client, baseURL string, token string, operation string, path string, payload any) (Response, error) {
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(payload); err != nil {
		var zero Response
		return zero, newWorkspaceCLIError("workspace_api_request_encode_failed", fmt.Errorf("encode %s request: %w", operation, err))
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(baseURL, "/")+path, &body)
	if err != nil {
		var zero Response
		return zero, newWorkspaceCLIError("workspace_api_request_create_failed", fmt.Errorf("create %s request: %w", operation, err))
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		var zero Response
		return zero, newWorkspaceCLIError("workspace_api_request_failed", fmt.Errorf("request %s: %w", operation, err))
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		var zero Response
		return zero, workspaceAPIStatusError(operation, response)
	}
	var decoded Response
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		var zero Response
		return zero, newWorkspaceCLIError("workspace_api_response_decode_failed", fmt.Errorf("decode %s response: %w", operation, err))
	}
	return decoded, nil
}

func workspaceAPIStatusError(operation string, response *http.Response) error {
	payload, err := io.ReadAll(response.Body)
	if err != nil {
		return newWorkspaceCLIError("workspace_api_error_body_read_failed", fmt.Errorf("read %s error response body: %w", operation, err))
	}
	var apiError httpapi.ErrorResponse
	if err := json.Unmarshal(payload, &apiError); err == nil && apiError.Error.Code != "" && apiError.Error.Message != "" {
		return workspaceHTTPStatusError{
			operation:  operation,
			response:   apiError,
			statusCode: response.StatusCode,
		}
	}
	body := strings.TrimSpace(string(payload))
	if body == "" {
		body = "empty response body"
	}
	return newWorkspaceCLIError("workspace_api_error_response_invalid", fmt.Errorf("%s status %d returned invalid error response: %s", operation, response.StatusCode, body))
}

func currentWorkspaceFromWorkspaceSession(session workspacesession.WorkspaceSession) (workspace.WorkspaceSummary, error) {
	if session.SelectedWorkspaceID == "" {
		return workspace.WorkspaceSummary{}, newWorkspaceCLIError("no_current_workspace", errors.New("no current workspace is selected"))
	}
	for _, activeWorkspace := range session.ActiveWorkspaces {
		if activeWorkspace.ID == session.SelectedWorkspaceID {
			if err := validateWorkspaceSummaryResponse(activeWorkspace); err != nil {
				return workspace.WorkspaceSummary{}, newWorkspaceCLIError("invalid_current_workspace_response", fmt.Errorf("current workspace response is invalid: %w", err))
			}
			return activeWorkspace, nil
		}
	}
	return workspace.WorkspaceSummary{}, newWorkspaceCLIError("current_workspace_not_active", fmt.Errorf("current workspace %s is not active", session.SelectedWorkspaceID))
}

func encodeWorkspaceCommandOutput(output io.Writer, payload any, label string) error {
	encoder := json.NewEncoder(output)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(payload); err != nil {
		return fmt.Errorf("encode %s: %w", label, err)
	}
	return nil
}
