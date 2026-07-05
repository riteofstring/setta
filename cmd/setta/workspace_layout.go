package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"setta/internal/httpapi"
	"setta/internal/jsonio"
	"setta/internal/workspaceui"
)

type workspaceLayoutApplyOptions struct {
	AppDataDir string
	InputPath  string
}

func runWorkspaceLayout(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta workspace layout requires a subcommand: apply")}
	}
	switch args[0] {
	case "apply":
		return runWorkspaceLayoutApply(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown workspace layout subcommand %q", args[0])}
	}
}

func runWorkspaceLayoutApply(args []string, deps cliDeps) error {
	options, err := workspaceLayoutApplyOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	input, err := readWorkspaceLayoutApplyInputFile(options.InputPath)
	if err != nil {
		return err
	}
	result, err := applyWorkspaceLayoutOperations(context.Background(), options.AppDataDir, input, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, result, "workspace layout apply result")
}

func workspaceLayoutApplyOptionsFromArgs(args []string, deps cliDeps) (workspaceLayoutApplyOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspaceLayoutApplyOptions{}, err
	}
	var inputPath string
	flagSet := newWorkspaceFlagSet("setta workspace layout apply")
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.StringVar(&inputPath, "input", "", "path to a workspace layout operations JSON input file")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspaceLayoutApplyOptions{}, usageError{err: err}
		}
		return workspaceLayoutApplyOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return workspaceLayoutApplyOptions{}, usageError{err: errors.New("setta workspace layout apply does not accept positional arguments")}
	}
	inputPath = strings.TrimSpace(inputPath)
	if inputPath == "" {
		return workspaceLayoutApplyOptions{}, usageError{err: errors.New("setta workspace layout apply requires --input")}
	}
	return workspaceLayoutApplyOptions{
		AppDataDir: appDataDir,
		InputPath:  inputPath,
	}, nil
}

func readWorkspaceLayoutApplyInputFile(path string) (workspaceui.WorkspaceUILayoutOperations, error) {
	file, err := os.Open(path)
	if err != nil {
		return workspaceui.WorkspaceUILayoutOperations{}, newWorkspaceCLIError("workspace_layout_apply_input_open_failed", fmt.Errorf("open workspace layout apply input %s: %w", path, err))
	}
	defer file.Close()

	var input workspaceui.WorkspaceUILayoutOperations
	if err := jsonio.DecodeSingle(file, &input); err != nil {
		return workspaceui.WorkspaceUILayoutOperations{}, newWorkspaceCLIError("workspace_layout_apply_input_decode_failed", fmt.Errorf("decode workspace layout apply input %s: %w", path, err))
	}
	if err := validateWorkspaceLayoutApplyInput(input); err != nil {
		return workspaceui.WorkspaceUILayoutOperations{}, newWorkspaceCLIError("workspace_layout_apply_input_invalid", err)
	}
	return input, nil
}

func validateWorkspaceLayoutApplyInput(input workspaceui.WorkspaceUILayoutOperations) error {
	if len(input.Operations) == 0 {
		return errors.New("workspace layout apply input operations are required")
	}
	for index, operation := range input.Operations {
		if err := validateWorkspaceLayoutApplyInputOperation(operation); err != nil {
			return fmt.Errorf("workspace layout apply input operation %d is invalid: %w", index, err)
		}
	}
	return nil
}

func validateWorkspaceLayoutApplyInputOperation(operation workspaceui.WorkspaceUIPaneOperation) error {
	if operation.Kind != workspaceui.WorkspaceUIPaneOperationKindResizePane {
		return fmt.Errorf("kind = %s, want %s", operation.Kind, workspaceui.WorkspaceUIPaneOperationKindResizePane)
	}
	if strings.TrimSpace(operation.PaneID) == "" {
		return errors.New("paneId is required")
	}
	if strings.TrimSpace(operation.PaneID) != operation.PaneID {
		return errors.New("paneId must not have surrounding whitespace")
	}
	if operation.Resize == nil {
		return errors.New("resize payload is required")
	}
	if workspaceLayoutApplyInputHasOtherPayload(operation) {
		return errors.New("operation includes payloads for another operation kind")
	}
	return nil
}

func workspaceLayoutApplyInputHasOtherPayload(operation workspaceui.WorkspaceUIPaneOperation) bool {
	otherPayloads := []bool{
		operation.Close != nil,
		operation.Configure != nil,
		operation.Move != nil,
		operation.Open != nil,
		operation.Rename != nil,
		operation.Reorder != nil,
		operation.ResizeColumn != nil,
	}
	for _, hasPayload := range otherPayloads {
		if hasPayload {
			return true
		}
	}
	return false
}

func applyWorkspaceLayoutOperations(
	ctx context.Context,
	appDataDir string,
	input workspaceui.WorkspaceUILayoutOperations,
	deps cliDeps,
) (workspaceui.WorkspaceUILayoutOperationResult, error) {
	state, token, cleanup, err := workspaceCommandAuth(ctx, appDataDir, workspaceLayoutApplyCLIAuthDisplayName, deps)
	if err != nil {
		return workspaceui.WorkspaceUILayoutOperationResult{}, err
	}
	defer cleanup()

	currentWorkspace, err := currentWorkspaceForWorkspaceCommand(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return workspaceui.WorkspaceUILayoutOperationResult{}, err
	}
	result, err := postWorkspaceAPI[workspaceui.WorkspaceUILayoutOperationResult](ctx, deps.httpClient, state.BaseURL, token, "workspace layout apply", "/workspaces/ui/layout/apply", httpapi.ApplyWorkspaceUILayoutOperationsRequest{
		WorkspaceID: currentWorkspace.ID,
		Operations:  input.Operations,
	})
	if err != nil {
		return workspaceui.WorkspaceUILayoutOperationResult{}, err
	}
	if err := validateWorkspaceLayoutOperationResponse(result, currentWorkspace.ID, input); err != nil {
		return workspaceui.WorkspaceUILayoutOperationResult{}, err
	}
	return result, nil
}
