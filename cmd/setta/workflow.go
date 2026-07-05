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
	"os"
	"strings"
	"time"

	"setta/internal/httpapi"
	"setta/internal/jsonio"
	"setta/internal/orchestrator"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

const (
	workflowCurrentWorkspaceCLIAuthDisplayName    = "Setta CLI workflow current-workspace"
	workflowDefinitionsListCLIAuthDisplayName     = "Setta CLI workflow definitions list"
	workflowDefinitionsReadCLIAuthDisplayName     = "Setta CLI workflow definitions read"
	workflowDefinitionsSaveCLIAuthDisplayName     = "Setta CLI workflow definitions save"
	workflowDefinitionsValidateCLIAuthDisplayName = "Setta CLI workflow definitions validate"
	workflowExecutionsReadCLIAuthDisplayName      = "Setta CLI workflow executions read"
	workflowExecutionsStartCLIAuthDisplayName     = "Setta CLI workflow executions start"
	workflowSchemaCLIAuthDisplayName              = "Setta CLI workflow schema"
)

type workflowOptions struct {
	AppDataDir string
}

type workflowDefinitionReadOptions struct {
	AppDataDir   string
	DefinitionID string
}

type workflowDefinitionValidateOptions struct {
	AppDataDir string
	GraphPath  string
}

type workflowDefinitionSaveOptions struct {
	AppDataDir string
	InputPath  string
}

type workflowExecutionReadOptions struct {
	AppDataDir  string
	ExecutionID string
}

type workflowExecutionStartOptions struct {
	AppDataDir   string
	DefinitionID string
}

func runWorkflow(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta workflow requires a subcommand: current-workspace, definitions, executions, or schema")}
	}
	switch args[0] {
	case "current-workspace":
		return runWorkflowCurrentWorkspace(args[1:], deps)
	case "definitions":
		return runWorkflowDefinitions(args[1:], deps)
	case "executions":
		return runWorkflowExecutions(args[1:], deps)
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
		return usageError{err: errors.New("setta workflow definitions requires a subcommand: list, read, save, or validate")}
	}
	switch args[0] {
	case "list":
		return runWorkflowDefinitionsList(args[1:], deps)
	case "read":
		return runWorkflowDefinitionsRead(args[1:], deps)
	case "save":
		return runWorkflowDefinitionsSave(args[1:], deps)
	case "validate":
		return runWorkflowDefinitionsValidate(args[1:], deps)
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

func runWorkflowDefinitionsRead(args []string, deps cliDeps) error {
	options, err := workflowDefinitionReadOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	definition, err := readWorkflowDefinition(context.Background(), options.AppDataDir, options.DefinitionID, deps)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(deps.stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(definition); err != nil {
		return fmt.Errorf("encode workflow definition: %w", err)
	}
	return nil
}

func runWorkflowDefinitionsSave(args []string, deps cliDeps) error {
	options, err := workflowDefinitionSaveOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	input, err := readWorkflowDefinitionSaveInputFile(options.InputPath)
	if err != nil {
		return err
	}
	result, err := saveWorkflowDefinition(context.Background(), options.AppDataDir, input, deps)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(deps.stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		return fmt.Errorf("encode workflow definition save result: %w", err)
	}
	return nil
}

func runWorkflowDefinitionsValidate(args []string, deps cliDeps) error {
	options, err := workflowDefinitionValidateOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	graph, err := readWorkflowGraphFile(options.GraphPath)
	if err != nil {
		return err
	}
	result, err := validateWorkflowDefinition(context.Background(), options.AppDataDir, graph, deps)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(deps.stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		return fmt.Errorf("encode workflow validation result: %w", err)
	}
	return nil
}

func runWorkflowExecutions(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta workflow executions requires a subcommand: start or read")}
	}
	switch args[0] {
	case "start":
		return runWorkflowExecutionsStart(args[1:], deps)
	case "read":
		return runWorkflowExecutionsRead(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown workflow executions subcommand %q", args[0])}
	}
}

func runWorkflowExecutionsRead(args []string, deps cliDeps) error {
	options, err := workflowExecutionReadOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	execution, err := readWorkflowExecution(context.Background(), options.AppDataDir, options.ExecutionID, deps)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(deps.stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(execution); err != nil {
		return fmt.Errorf("encode workflow execution: %w", err)
	}
	return nil
}

func runWorkflowExecutionsStart(args []string, deps cliDeps) error {
	options, err := workflowExecutionStartOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	execution, err := startWorkflowExecution(context.Background(), options.AppDataDir, options.DefinitionID, deps)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(deps.stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(execution); err != nil {
		return fmt.Errorf("encode workflow execution: %w", err)
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

func workflowDefinitionReadOptionsFromArgs(args []string, deps cliDeps) (workflowDefinitionReadOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workflowDefinitionReadOptions{}, err
	}
	flagSet := newFlagSet("setta workflow definitions read", deps.stderr)
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workflowDefinitionReadOptions{}, usageError{err: err}
		}
		return workflowDefinitionReadOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return workflowDefinitionReadOptions{}, usageError{err: errors.New("setta workflow definitions read requires exactly one definition id")}
	}
	definitionID := strings.TrimSpace(flagSet.Arg(0))
	if definitionID == "" {
		return workflowDefinitionReadOptions{}, usageError{err: errors.New("workflow definition id is required")}
	}
	return workflowDefinitionReadOptions{AppDataDir: appDataDir, DefinitionID: definitionID}, nil
}

func workflowDefinitionSaveOptionsFromArgs(args []string, deps cliDeps) (workflowDefinitionSaveOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workflowDefinitionSaveOptions{}, err
	}
	var inputPath string
	flagSet := newFlagSet("setta workflow definitions save", deps.stderr)
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.StringVar(&inputPath, "input", "", "path to a workflow definition save JSON input file")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workflowDefinitionSaveOptions{}, usageError{err: err}
		}
		return workflowDefinitionSaveOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return workflowDefinitionSaveOptions{}, usageError{err: errors.New("setta workflow definitions save does not accept positional arguments")}
	}
	inputPath = strings.TrimSpace(inputPath)
	if inputPath == "" {
		return workflowDefinitionSaveOptions{}, usageError{err: errors.New("setta workflow definitions save requires --input")}
	}
	return workflowDefinitionSaveOptions{AppDataDir: appDataDir, InputPath: inputPath}, nil
}

func workflowDefinitionValidateOptionsFromArgs(args []string, deps cliDeps) (workflowDefinitionValidateOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workflowDefinitionValidateOptions{}, err
	}
	var graphPath string
	flagSet := newFlagSet("setta workflow definitions validate", deps.stderr)
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.StringVar(&graphPath, "graph", "", "path to a workflow graph JSON file")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workflowDefinitionValidateOptions{}, usageError{err: err}
		}
		return workflowDefinitionValidateOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return workflowDefinitionValidateOptions{}, usageError{err: errors.New("setta workflow definitions validate does not accept positional arguments")}
	}
	graphPath = strings.TrimSpace(graphPath)
	if graphPath == "" {
		return workflowDefinitionValidateOptions{}, usageError{err: errors.New("setta workflow definitions validate requires --graph")}
	}
	return workflowDefinitionValidateOptions{AppDataDir: appDataDir, GraphPath: graphPath}, nil
}

func workflowExecutionReadOptionsFromArgs(args []string, deps cliDeps) (workflowExecutionReadOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workflowExecutionReadOptions{}, err
	}
	flagSet := newFlagSet("setta workflow executions read", deps.stderr)
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workflowExecutionReadOptions{}, usageError{err: err}
		}
		return workflowExecutionReadOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return workflowExecutionReadOptions{}, usageError{err: errors.New("setta workflow executions read requires exactly one execution id")}
	}
	executionID := strings.TrimSpace(flagSet.Arg(0))
	if executionID == "" {
		return workflowExecutionReadOptions{}, usageError{err: errors.New("workflow execution id is required")}
	}
	return workflowExecutionReadOptions{AppDataDir: appDataDir, ExecutionID: executionID}, nil
}

func workflowExecutionStartOptionsFromArgs(args []string, deps cliDeps) (workflowExecutionStartOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workflowExecutionStartOptions{}, err
	}
	flagSet := newFlagSet("setta workflow executions start", deps.stderr)
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workflowExecutionStartOptions{}, usageError{err: err}
		}
		return workflowExecutionStartOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return workflowExecutionStartOptions{}, usageError{err: errors.New("setta workflow executions start requires exactly one definition id")}
	}
	definitionID := strings.TrimSpace(flagSet.Arg(0))
	if definitionID == "" {
		return workflowExecutionStartOptions{}, usageError{err: errors.New("workflow definition id is required")}
	}
	return workflowExecutionStartOptions{AppDataDir: appDataDir, DefinitionID: definitionID}, nil
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

func readWorkflowDefinition(ctx context.Context, appDataDir string, definitionID string, deps cliDeps) (orchestrator.WorkflowDefinition, error) {
	state, token, cleanup, err := workflowCommandAuth(ctx, appDataDir, workflowDefinitionsReadCLIAuthDisplayName, deps)
	if err != nil {
		return orchestrator.WorkflowDefinition{}, err
	}
	defer cleanup()

	session, err := getWorkspaceSession(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return orchestrator.WorkflowDefinition{}, err
	}
	currentWorkspace, err := currentWorkspaceFromSession(session)
	if err != nil {
		return orchestrator.WorkflowDefinition{}, err
	}
	definition, err := postWorkflowAPI[orchestrator.WorkflowDefinition](ctx, deps.httpClient, state.BaseURL, token, "workflow definitions read", "/workflows/definitions/read", httpapi.ReadWorkflowDefinitionRequest{
		WorkspaceID:  currentWorkspace.ID,
		DefinitionID: definitionID,
	})
	if err != nil {
		return orchestrator.WorkflowDefinition{}, err
	}
	if err := validateWorkflowDefinitionResponse(definition, currentWorkspace.ID); err != nil {
		return orchestrator.WorkflowDefinition{}, err
	}
	return definition, nil
}

func saveWorkflowDefinition(ctx context.Context, appDataDir string, input orchestrator.WorkflowDefinitionSaveInput, deps cliDeps) (orchestrator.WorkflowDefinitionSaveResult, error) {
	state, token, cleanup, err := workflowCommandAuth(ctx, appDataDir, workflowDefinitionsSaveCLIAuthDisplayName, deps)
	if err != nil {
		return orchestrator.WorkflowDefinitionSaveResult{}, err
	}
	defer cleanup()

	session, err := getWorkspaceSession(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return orchestrator.WorkflowDefinitionSaveResult{}, err
	}
	currentWorkspace, err := currentWorkspaceFromSession(session)
	if err != nil {
		return orchestrator.WorkflowDefinitionSaveResult{}, err
	}
	result, err := postWorkflowAPI[orchestrator.WorkflowDefinitionSaveResult](ctx, deps.httpClient, state.BaseURL, token, "workflow definitions save", "/workflows/definitions/save", httpapi.SaveWorkflowDefinitionRequest{
		WorkspaceID: currentWorkspace.ID,
		Input:       input,
	})
	if err != nil {
		return orchestrator.WorkflowDefinitionSaveResult{}, err
	}
	if err := validateWorkflowDefinitionSaveResultResponse(result, input.Operation, currentWorkspace.ID); err != nil {
		return orchestrator.WorkflowDefinitionSaveResult{}, err
	}
	return result, nil
}

func validateWorkflowDefinition(ctx context.Context, appDataDir string, graph orchestrator.WorkflowGraph, deps cliDeps) (orchestrator.WorkflowValidationResult, error) {
	state, token, cleanup, err := workflowCommandAuth(ctx, appDataDir, workflowDefinitionsValidateCLIAuthDisplayName, deps)
	if err != nil {
		return orchestrator.WorkflowValidationResult{}, err
	}
	defer cleanup()

	session, err := getWorkspaceSession(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return orchestrator.WorkflowValidationResult{}, err
	}
	currentWorkspace, err := currentWorkspaceFromSession(session)
	if err != nil {
		return orchestrator.WorkflowValidationResult{}, err
	}
	result, err := postWorkflowAPI[orchestrator.WorkflowValidationResult](ctx, deps.httpClient, state.BaseURL, token, "workflow definitions validate", "/workflows/definitions/validate", httpapi.ValidateWorkflowDefinitionRequest{
		WorkspaceID: currentWorkspace.ID,
		Graph:       graph,
	})
	if err != nil {
		return orchestrator.WorkflowValidationResult{}, err
	}
	if err := validateWorkflowValidationResultResponse(result); err != nil {
		return orchestrator.WorkflowValidationResult{}, err
	}
	return result, nil
}

func readWorkflowExecution(ctx context.Context, appDataDir string, executionID string, deps cliDeps) (orchestrator.WorkflowExecution, error) {
	state, token, cleanup, err := workflowCommandAuth(ctx, appDataDir, workflowExecutionsReadCLIAuthDisplayName, deps)
	if err != nil {
		return orchestrator.WorkflowExecution{}, err
	}
	defer cleanup()

	session, err := getWorkspaceSession(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return orchestrator.WorkflowExecution{}, err
	}
	currentWorkspace, err := currentWorkspaceFromSession(session)
	if err != nil {
		return orchestrator.WorkflowExecution{}, err
	}
	execution, err := postWorkflowAPI[orchestrator.WorkflowExecution](ctx, deps.httpClient, state.BaseURL, token, "workflow executions read", "/workflows/executions/read", httpapi.ReadWorkflowExecutionRequest{
		WorkspaceID: currentWorkspace.ID,
		ExecutionID: executionID,
	})
	if err != nil {
		return orchestrator.WorkflowExecution{}, err
	}
	if err := validateWorkflowExecutionResponse(execution, currentWorkspace.ID); err != nil {
		return orchestrator.WorkflowExecution{}, err
	}
	return execution, nil
}

func startWorkflowExecution(ctx context.Context, appDataDir string, definitionID string, deps cliDeps) (orchestrator.WorkflowExecution, error) {
	state, token, cleanup, err := workflowCommandAuth(ctx, appDataDir, workflowExecutionsStartCLIAuthDisplayName, deps)
	if err != nil {
		return orchestrator.WorkflowExecution{}, err
	}
	defer cleanup()

	session, err := getWorkspaceSession(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return orchestrator.WorkflowExecution{}, err
	}
	currentWorkspace, err := currentWorkspaceFromSession(session)
	if err != nil {
		return orchestrator.WorkflowExecution{}, err
	}
	execution, err := postWorkflowAPI[orchestrator.WorkflowExecution](ctx, deps.httpClient, state.BaseURL, token, "workflow executions start", "/workflows/executions/start", httpapi.StartWorkflowExecutionRequest{
		WorkspaceID:  currentWorkspace.ID,
		DefinitionID: definitionID,
		VersionID:    "",
	})
	if err != nil {
		return orchestrator.WorkflowExecution{}, err
	}
	if err := validateWorkflowExecutionResponse(execution, currentWorkspace.ID); err != nil {
		return orchestrator.WorkflowExecution{}, err
	}
	if execution.DefinitionID != definitionID {
		return orchestrator.WorkflowExecution{}, fmt.Errorf("workflow execution %s returned definitionId %s, want %s", execution.ID, execution.DefinitionID, definitionID)
	}
	return execution, nil
}

func readWorkflowGraphFile(path string) (orchestrator.WorkflowGraph, error) {
	file, err := os.Open(path)
	if err != nil {
		return orchestrator.WorkflowGraph{}, fmt.Errorf("open workflow graph %s: %w", path, err)
	}
	defer file.Close()

	var graph orchestrator.WorkflowGraph
	if err := jsonio.DecodeSingle(file, &graph); err != nil {
		return orchestrator.WorkflowGraph{}, fmt.Errorf("decode workflow graph %s: %w", path, err)
	}
	return graph, nil
}

func readWorkflowDefinitionSaveInputFile(path string) (orchestrator.WorkflowDefinitionSaveInput, error) {
	file, err := os.Open(path)
	if err != nil {
		return orchestrator.WorkflowDefinitionSaveInput{}, fmt.Errorf("open workflow definition save input %s: %w", path, err)
	}
	defer file.Close()

	var input orchestrator.WorkflowDefinitionSaveInput
	if err := jsonio.DecodeSingle(file, &input); err != nil {
		return orchestrator.WorkflowDefinitionSaveInput{}, fmt.Errorf("decode workflow definition save input %s: %w", path, err)
	}
	return input, nil
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
		if err := validateWorkflowDefinitionResponse(definition, workspaceID); err != nil {
			return err
		}
	}
	return nil
}

func validateWorkflowDefinitionResponse(definition orchestrator.WorkflowDefinition, workspaceID string) error {
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

func validateWorkflowDefinitionSaveResultResponse(result orchestrator.WorkflowDefinitionSaveResult, operation orchestrator.WorkflowDefinitionSaveOperation, workspaceID string) error {
	if result.Operation != operation {
		return fmt.Errorf("workflow definition save result operation %q, want %q", result.Operation, operation)
	}
	if err := validateWorkflowValidationResultResponse(result.Validation); err != nil {
		return fmt.Errorf("workflow definition save validation is invalid: %w", err)
	}
	if result.Saved {
		return validateSavedWorkflowDefinitionResult(result, workspaceID)
	}
	return validateUnsavedWorkflowDefinitionResult(result)
}

func validateSavedWorkflowDefinitionResult(result orchestrator.WorkflowDefinitionSaveResult, workspaceID string) error {
	if !result.Validation.Valid {
		return errors.New("workflow definition save returned saved true with invalid validation")
	}
	if result.Definition == nil {
		return errors.New("workflow definition save returned saved true without a definition")
	}
	return validateWorkflowDefinitionResponse(*result.Definition, workspaceID)
}

func validateUnsavedWorkflowDefinitionResult(result orchestrator.WorkflowDefinitionSaveResult) error {
	if result.Validation.Valid {
		return errors.New("workflow definition save returned saved false with valid validation")
	}
	if result.Definition != nil {
		return errors.New("workflow definition save returned saved false with a definition")
	}
	return nil
}

func validateWorkflowExecutionResponse(execution orchestrator.WorkflowExecution, workspaceID string) error {
	if execution.ID == "" {
		return errors.New("workflow execution id is required")
	}
	if execution.SchemaVersion != orchestrator.SchemaVersion {
		return fmt.Errorf("workflow execution %s returned invalid schemaVersion %d", execution.ID, execution.SchemaVersion)
	}
	if execution.WorkspaceID != workspaceID {
		return fmt.Errorf("workflow execution %s returned workspaceId %s, want %s", execution.ID, execution.WorkspaceID, workspaceID)
	}
	if execution.DefinitionID == "" {
		return fmt.Errorf("workflow execution %s definitionId is required", execution.ID)
	}
	if execution.DefinitionVersionID == "" {
		return fmt.Errorf("workflow execution %s definitionVersionId is required", execution.ID)
	}
	if err := validateWorkflowExecutionStatus(execution); err != nil {
		return err
	}
	if err := validateWorkflowExecutionTimestamps(execution); err != nil {
		return err
	}
	return validateWorkflowExecutionArrays(execution)
}

func validateWorkflowExecutionStatus(execution orchestrator.WorkflowExecution) error {
	switch execution.Status {
	case orchestrator.ExecutionStatusIdle,
		orchestrator.ExecutionStatusRunning,
		orchestrator.ExecutionStatusCompleted,
		orchestrator.ExecutionStatusFailed,
		orchestrator.ExecutionStatusStopped,
		orchestrator.ExecutionStatusCancelled:
		return nil
	default:
		return fmt.Errorf("workflow execution %s returned unsupported status %q", execution.ID, execution.Status)
	}
}

func validateWorkflowExecutionTimestamps(execution orchestrator.WorkflowExecution) error {
	if execution.CreatedAt == "" {
		return fmt.Errorf("workflow execution %s createdAt is required", execution.ID)
	}
	if _, err := time.Parse(time.RFC3339Nano, execution.CreatedAt); err != nil {
		return fmt.Errorf("workflow execution %s createdAt must be RFC3339: %w", execution.ID, err)
	}
	if execution.StartedAt == "" {
		return fmt.Errorf("workflow execution %s startedAt is required", execution.ID)
	}
	if _, err := time.Parse(time.RFC3339Nano, execution.StartedAt); err != nil {
		return fmt.Errorf("workflow execution %s startedAt must be RFC3339: %w", execution.ID, err)
	}
	if execution.UpdatedAt == "" {
		return fmt.Errorf("workflow execution %s updatedAt is required", execution.ID)
	}
	if _, err := time.Parse(time.RFC3339Nano, execution.UpdatedAt); err != nil {
		return fmt.Errorf("workflow execution %s updatedAt must be RFC3339: %w", execution.ID, err)
	}
	if execution.CompletedAt != "" {
		if _, err := time.Parse(time.RFC3339Nano, execution.CompletedAt); err != nil {
			return fmt.Errorf("workflow execution %s completedAt must be RFC3339: %w", execution.ID, err)
		}
	}
	return nil
}

func validateWorkflowExecutionArrays(execution orchestrator.WorkflowExecution) error {
	if execution.NodeExecutions == nil {
		return fmt.Errorf("workflow execution %s nodeExecutions array is required", execution.ID)
	}
	if execution.Tokens == nil {
		return fmt.Errorf("workflow execution %s tokens array is required", execution.ID)
	}
	if execution.LoopIterations == nil {
		return fmt.Errorf("workflow execution %s loopIterations array is required", execution.ID)
	}
	if execution.ActiveNodeExecutionIDs == nil {
		return fmt.Errorf("workflow execution %s activeNodeExecutionIds array is required", execution.ID)
	}
	return nil
}

func validateWorkflowValidationResultResponse(result orchestrator.WorkflowValidationResult) error {
	if result.Diagnostics == nil {
		return errors.New("workflow validation result returned missing diagnostics array")
	}
	hasErrorDiagnostic := false
	for index, diagnostic := range result.Diagnostics {
		switch diagnostic.Severity {
		case orchestrator.ValidationSeverityError:
			hasErrorDiagnostic = true
		case orchestrator.ValidationSeverityWarning:
		default:
			return fmt.Errorf("workflow validation diagnostic %d returned unsupported severity %q", index, diagnostic.Severity)
		}
		if diagnostic.Code == "" {
			return fmt.Errorf("workflow validation diagnostic %d code is required", index)
		}
		if diagnostic.Message == "" {
			return fmt.Errorf("workflow validation diagnostic %d message is required", index)
		}
	}
	if !result.Valid && !hasErrorDiagnostic {
		return errors.New("workflow validation result is invalid without an error diagnostic")
	}
	return nil
}
