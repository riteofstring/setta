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
	"setta/internal/terminal"
)

type workspaceTerminalReadOptions struct {
	AppDataDir            string
	PaneID                string
	RecentOutputByteLimit int
}

type workspaceTerminalWritePrepareOptions struct {
	AppDataDir string
	InputPath  string
	PaneID     string
}

type workspaceTerminalWriteCommitOptions struct {
	AppDataDir      string
	PreparedWriteID string
	SHA256          string
}

type workspaceTerminalWritePrepareInput struct {
	DataBase64 string `json:"dataBase64"`
	ByteCount  int    `json:"byteCount"`
	SHA256     string `json:"sha256"`
}

func runWorkspaceTerminals(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta workspace terminals requires a subcommand: read or writes")}
	}
	switch args[0] {
	case "read":
		return runWorkspaceTerminalsRead(args[1:], deps)
	case "writes":
		return runWorkspaceTerminalsWrites(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown workspace terminals subcommand %q", args[0])}
	}
}

func runWorkspaceTerminalsRead(args []string, deps cliDeps) error {
	options, err := workspaceTerminalReadOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	result, err := readWorkspaceTerminal(context.Background(), options, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, result, "workspace terminal read result")
}

func runWorkspaceTerminalsWrites(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta workspace terminals writes requires a subcommand: prepare or commit")}
	}
	switch args[0] {
	case "prepare":
		return runWorkspaceTerminalsWritesPrepare(args[1:], deps)
	case "commit":
		return runWorkspaceTerminalsWritesCommit(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown workspace terminals writes subcommand %q", args[0])}
	}
}

func runWorkspaceTerminalsWritesPrepare(args []string, deps cliDeps) error {
	options, err := workspaceTerminalWritePrepareOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	input, err := readWorkspaceTerminalWritePrepareInputFile(options.InputPath)
	if err != nil {
		return err
	}
	result, err := prepareWorkspaceTerminalWrite(context.Background(), options, input, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, result, "workspace terminal write prepare result")
}

func runWorkspaceTerminalsWritesCommit(args []string, deps cliDeps) error {
	options, err := workspaceTerminalWriteCommitOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	result, err := commitWorkspaceTerminalWrite(context.Background(), options, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, result, "workspace terminal write commit result")
}

func workspaceTerminalReadOptionsFromArgs(args []string, deps cliDeps) (workspaceTerminalReadOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspaceTerminalReadOptions{}, err
	}
	recentOutputByteLimit := 0
	normalizedArgs, err := normalizeWorkspacePaneFlagArgs(args, "app-data-dir", "recent-output-byte-limit")
	if err != nil {
		return workspaceTerminalReadOptions{}, usageError{err: err}
	}
	flagSet := newWorkspaceFlagSet("setta workspace terminals read")
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.IntVar(&recentOutputByteLimit, "recent-output-byte-limit", recentOutputByteLimit, "bounded terminal output bytes to return")
	if err := flagSet.Parse(normalizedArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspaceTerminalReadOptions{}, usageError{err: err}
		}
		return workspaceTerminalReadOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return workspaceTerminalReadOptions{}, usageError{err: errors.New("setta workspace terminals read requires exactly one pane id")}
	}
	paneID := strings.TrimSpace(flagSet.Arg(0))
	if paneID == "" {
		return workspaceTerminalReadOptions{}, usageError{err: errors.New("workspace pane id is required")}
	}
	if recentOutputByteLimit < 0 {
		return workspaceTerminalReadOptions{}, usageError{err: errors.New("recent output byte limit must not be negative")}
	}
	if recentOutputByteLimit > terminal.MaxRecentOutputByteLimit {
		return workspaceTerminalReadOptions{}, usageError{err: fmt.Errorf("recent output byte limit exceeds %d bytes", terminal.MaxRecentOutputByteLimit)}
	}
	return workspaceTerminalReadOptions{
		AppDataDir:            appDataDir,
		PaneID:                paneID,
		RecentOutputByteLimit: recentOutputByteLimit,
	}, nil
}

func workspaceTerminalWritePrepareOptionsFromArgs(args []string, deps cliDeps) (workspaceTerminalWritePrepareOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspaceTerminalWritePrepareOptions{}, err
	}
	var inputPath string
	normalizedArgs, err := normalizeWorkspacePaneFlagArgs(args, "app-data-dir", "input")
	if err != nil {
		return workspaceTerminalWritePrepareOptions{}, usageError{err: err}
	}
	flagSet := newWorkspaceFlagSet("setta workspace terminals writes prepare")
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.StringVar(&inputPath, "input", "", "path to a terminal write JSON input file")
	if err := flagSet.Parse(normalizedArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspaceTerminalWritePrepareOptions{}, usageError{err: err}
		}
		return workspaceTerminalWritePrepareOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return workspaceTerminalWritePrepareOptions{}, usageError{err: errors.New("setta workspace terminals writes prepare requires exactly one pane id")}
	}
	paneID := strings.TrimSpace(flagSet.Arg(0))
	if paneID == "" {
		return workspaceTerminalWritePrepareOptions{}, usageError{err: errors.New("workspace pane id is required")}
	}
	inputPath = strings.TrimSpace(inputPath)
	if inputPath == "" {
		return workspaceTerminalWritePrepareOptions{}, usageError{err: errors.New("setta workspace terminals writes prepare requires --input")}
	}
	return workspaceTerminalWritePrepareOptions{
		AppDataDir: appDataDir,
		InputPath:  inputPath,
		PaneID:     paneID,
	}, nil
}

func workspaceTerminalWriteCommitOptionsFromArgs(args []string, deps cliDeps) (workspaceTerminalWriteCommitOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspaceTerminalWriteCommitOptions{}, err
	}
	var sha256 string
	normalizedArgs, err := normalizeWorkspacePaneFlagArgs(args, "app-data-dir", "sha256")
	if err != nil {
		return workspaceTerminalWriteCommitOptions{}, usageError{err: err}
	}
	flagSet := newWorkspaceFlagSet("setta workspace terminals writes commit")
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.StringVar(&sha256, "sha256", "", "lowercase SHA-256 digest for the prepared write bytes")
	if err := flagSet.Parse(normalizedArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspaceTerminalWriteCommitOptions{}, usageError{err: err}
		}
		return workspaceTerminalWriteCommitOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return workspaceTerminalWriteCommitOptions{}, usageError{err: errors.New("setta workspace terminals writes commit requires exactly one prepared write id")}
	}
	preparedWriteID := strings.TrimSpace(flagSet.Arg(0))
	if preparedWriteID == "" {
		return workspaceTerminalWriteCommitOptions{}, usageError{err: errors.New("prepared write id is required")}
	}
	sha256 = strings.TrimSpace(sha256)
	if sha256 == "" {
		return workspaceTerminalWriteCommitOptions{}, usageError{err: errors.New("setta workspace terminals writes commit requires --sha256")}
	}
	return workspaceTerminalWriteCommitOptions{
		AppDataDir:      appDataDir,
		PreparedWriteID: preparedWriteID,
		SHA256:          sha256,
	}, nil
}

func readWorkspaceTerminal(ctx context.Context, options workspaceTerminalReadOptions, deps cliDeps) (httpapi.ReadWorkspaceUITerminalResponse, error) {
	state, token, cleanup, err := workspaceCommandAuth(ctx, options.AppDataDir, workspaceTerminalsReadCLIAuthDisplayName, deps)
	if err != nil {
		return httpapi.ReadWorkspaceUITerminalResponse{}, err
	}
	defer cleanup()

	currentWorkspace, err := currentWorkspaceForWorkspaceCommand(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return httpapi.ReadWorkspaceUITerminalResponse{}, err
	}
	result, err := postWorkspaceAPI[httpapi.ReadWorkspaceUITerminalResponse](ctx, deps.httpClient, state.BaseURL, token, "workspace terminals read", "/workspaces/ui/terminals/read", httpapi.ReadWorkspaceUITerminalRequest{
		WorkspaceID:           currentWorkspace.ID,
		PaneID:                options.PaneID,
		RecentOutputByteLimit: options.RecentOutputByteLimit,
	})
	if err != nil {
		return httpapi.ReadWorkspaceUITerminalResponse{}, err
	}
	if err := validateWorkspaceTerminalReadResponse(result, currentWorkspace.ID, options.PaneID); err != nil {
		return httpapi.ReadWorkspaceUITerminalResponse{}, err
	}
	return result, nil
}

func prepareWorkspaceTerminalWrite(
	ctx context.Context,
	options workspaceTerminalWritePrepareOptions,
	input workspaceTerminalWritePrepareInput,
	deps cliDeps,
) (httpapi.PrepareWorkspaceUITerminalWriteResponse, error) {
	state, token, err := workspaceTerminalWriteCommandAuth(ctx, options.AppDataDir, deps)
	if err != nil {
		return httpapi.PrepareWorkspaceUITerminalWriteResponse{}, err
	}
	currentWorkspace, err := currentWorkspaceForWorkspaceCommand(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return httpapi.PrepareWorkspaceUITerminalWriteResponse{}, err
	}
	result, err := postWorkspaceAPI[httpapi.PrepareWorkspaceUITerminalWriteResponse](ctx, deps.httpClient, state.BaseURL, token, "workspace terminals writes prepare", "/workspaces/ui/terminals/writes/prepare", httpapi.PrepareWorkspaceUITerminalWriteRequest{
		WorkspaceID: currentWorkspace.ID,
		PaneID:      options.PaneID,
		DataBase64:  input.DataBase64,
		ByteCount:   input.ByteCount,
		SHA256:      input.SHA256,
	})
	if err != nil {
		return httpapi.PrepareWorkspaceUITerminalWriteResponse{}, err
	}
	if err := validateWorkspaceTerminalWritePrepareResponse(result, currentWorkspace.ID, options.PaneID, input.SHA256); err != nil {
		return httpapi.PrepareWorkspaceUITerminalWriteResponse{}, err
	}
	return result, nil
}

func commitWorkspaceTerminalWrite(
	ctx context.Context,
	options workspaceTerminalWriteCommitOptions,
	deps cliDeps,
) (httpapi.CommitWorkspaceUITerminalWriteResponse, error) {
	state, token, err := workspaceTerminalWriteCommandAuth(ctx, options.AppDataDir, deps)
	if err != nil {
		return httpapi.CommitWorkspaceUITerminalWriteResponse{}, err
	}
	currentWorkspace, err := currentWorkspaceForWorkspaceCommand(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return httpapi.CommitWorkspaceUITerminalWriteResponse{}, err
	}
	result, err := postWorkspaceAPI[httpapi.CommitWorkspaceUITerminalWriteResponse](ctx, deps.httpClient, state.BaseURL, token, "workspace terminals writes commit", "/workspaces/ui/terminals/writes/commit", httpapi.CommitWorkspaceUITerminalWriteRequest{
		WorkspaceID:     currentWorkspace.ID,
		PreparedWriteID: options.PreparedWriteID,
		SHA256:          options.SHA256,
	})
	if err != nil {
		return httpapi.CommitWorkspaceUITerminalWriteResponse{}, err
	}
	if err := validateWorkspaceTerminalWriteCommitResponse(result, currentWorkspace.ID, options.PreparedWriteID, options.SHA256); err != nil {
		return httpapi.CommitWorkspaceUITerminalWriteResponse{}, err
	}
	return result, nil
}

func readWorkspaceTerminalWritePrepareInputFile(path string) (workspaceTerminalWritePrepareInput, error) {
	file, err := os.Open(path)
	if err != nil {
		return workspaceTerminalWritePrepareInput{}, newWorkspaceCLIError("workspace_terminal_write_input_open_failed", fmt.Errorf("open workspace terminal write input %s: %w", path, err))
	}
	defer file.Close()

	var input workspaceTerminalWritePrepareInput
	if err := jsonio.DecodeSingle(file, &input); err != nil {
		return workspaceTerminalWritePrepareInput{}, newWorkspaceCLIError("workspace_terminal_write_input_decode_failed", fmt.Errorf("decode workspace terminal write input %s: %w", path, err))
	}
	return input, nil
}
