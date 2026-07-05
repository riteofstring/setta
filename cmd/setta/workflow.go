package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"strings"

	"setta/internal/httpapi"
	"setta/internal/orchestrator"
)

const workflowSchemaCLIAuthDisplayName = "Setta CLI workflow schema"

type workflowOptions struct {
	AppDataDir string
}

func runWorkflow(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta workflow requires a subcommand: schema")}
	}
	switch args[0] {
	case "schema":
		return runWorkflowSchema(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown workflow subcommand %q", args[0])}
	}
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

func readWorkflowSchema(ctx context.Context, appDataDir string, deps cliDeps) (orchestrator.WorkflowSchema, error) {
	state, err := readServeState(appDataDir)
	if err != nil {
		return orchestrator.WorkflowSchema{}, err
	}
	if _, err := verifyServeState(ctx, deps.httpClient, state); err != nil {
		return orchestrator.WorkflowSchema{}, err
	}
	token, cleanup, err := createRuntimeCLIAuthSession(ctx, appDataDir, workflowSchemaCLIAuthDisplayName)
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

func workflowAPIStatusError(operation string, response *http.Response) error {
	payload, _ := io.ReadAll(response.Body)
	var apiError httpapi.ErrorResponse
	if err := json.Unmarshal(payload, &apiError); err == nil && apiError.Error.Code != "" && apiError.Error.Message != "" {
		return fmt.Errorf("%s status %d: %s: %s", operation, response.StatusCode, apiError.Error.Code, apiError.Error.Message)
	}
	return fmt.Errorf("%s status %d: %s", operation, response.StatusCode, strings.TrimSpace(string(payload)))
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
