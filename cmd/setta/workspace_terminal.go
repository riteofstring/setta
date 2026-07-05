package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"strings"

	"setta/internal/httpapi"
	"setta/internal/terminal"
)

type workspaceTerminalReadOptions struct {
	AppDataDir            string
	PaneID                string
	RecentOutputByteLimit int
}

func runWorkspaceTerminals(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta workspace terminals requires a subcommand: read")}
	}
	switch args[0] {
	case "read":
		return runWorkspaceTerminalsRead(args[1:], deps)
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
