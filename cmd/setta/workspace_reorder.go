package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"setta/internal/jsonio"
	"setta/internal/workspaceui"
)

type workspacePaneReorderOptions struct {
	AppDataDir string
	InputPath  string
}

func runWorkspacePanesReorder(args []string, deps cliDeps) error {
	options, err := workspacePaneReorderOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	operation, err := readWorkspacePaneReorderInputFile(options.InputPath)
	if err != nil {
		return err
	}
	result, err := reorderWorkspacePane(context.Background(), options.AppDataDir, operation, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, result, "workspace pane reorder result")
}

func workspacePaneReorderOptionsFromArgs(args []string, deps cliDeps) (workspacePaneReorderOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspacePaneReorderOptions{}, err
	}
	var inputPath string
	flagSet := newWorkspaceFlagSet("setta workspace panes reorder")
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.StringVar(&inputPath, "input", "", "path to a workspace pane reorder JSON input file")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspacePaneReorderOptions{}, usageError{err: err}
		}
		return workspacePaneReorderOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return workspacePaneReorderOptions{}, usageError{err: errors.New("setta workspace panes reorder does not accept positional arguments")}
	}
	inputPath = strings.TrimSpace(inputPath)
	if inputPath == "" {
		return workspacePaneReorderOptions{}, usageError{err: errors.New("setta workspace panes reorder requires --input")}
	}
	return workspacePaneReorderOptions{
		AppDataDir: appDataDir,
		InputPath:  inputPath,
	}, nil
}

func readWorkspacePaneReorderInputFile(path string) (workspaceui.WorkspaceUIPaneOperation, error) {
	file, err := os.Open(path)
	if err != nil {
		return workspaceui.WorkspaceUIPaneOperation{}, newWorkspaceCLIError("workspace_pane_reorder_input_open_failed", fmt.Errorf("open workspace pane reorder input %s: %w", path, err))
	}
	defer file.Close()

	var operation workspaceui.WorkspaceUIPaneOperation
	if err := jsonio.DecodeSingle(file, &operation); err != nil {
		return workspaceui.WorkspaceUIPaneOperation{}, newWorkspaceCLIError("workspace_pane_reorder_input_decode_failed", fmt.Errorf("decode workspace pane reorder input %s: %w", path, err))
	}
	if err := validateWorkspacePaneReorderInputOperation(operation); err != nil {
		return workspaceui.WorkspaceUIPaneOperation{}, newWorkspaceCLIError("workspace_pane_reorder_input_invalid", err)
	}
	return operation, nil
}

func validateWorkspacePaneReorderInputOperation(operation workspaceui.WorkspaceUIPaneOperation) error {
	if operation.Kind != workspaceui.WorkspaceUIPaneOperationKindReorderPane {
		return fmt.Errorf("workspace pane reorder input kind = %s, want %s", operation.Kind, workspaceui.WorkspaceUIPaneOperationKindReorderPane)
	}
	if strings.TrimSpace(operation.PaneID) == "" {
		return errors.New("workspace pane reorder input paneId is required")
	}
	if strings.TrimSpace(operation.PaneID) != operation.PaneID {
		return errors.New("workspace pane reorder input paneId must not have surrounding whitespace")
	}
	if operation.Reorder == nil {
		return errors.New("workspace pane reorder input reorder payload is required")
	}
	if workspacePaneReorderInputHasOtherPayload(operation) {
		return errors.New("workspace pane reorder input includes payloads for another operation kind")
	}
	return nil
}

func workspacePaneReorderInputHasOtherPayload(operation workspaceui.WorkspaceUIPaneOperation) bool {
	otherPayloads := []bool{
		operation.Close != nil,
		operation.Configure != nil,
		operation.Move != nil,
		operation.Open != nil,
		operation.Rename != nil,
		operation.Resize != nil,
		operation.ResizeColumn != nil,
	}
	for _, hasPayload := range otherPayloads {
		if hasPayload {
			return true
		}
	}
	return false
}

func reorderWorkspacePane(ctx context.Context, appDataDir string, operation workspaceui.WorkspaceUIPaneOperation, deps cliDeps) (workspaceui.WorkspaceUIPaneOperationResult, error) {
	return applyWorkspacePaneOperation(ctx, appDataDir, workspacePanesReorderCLIAuthDisplayName, "workspace panes reorder", operation, deps)
}
