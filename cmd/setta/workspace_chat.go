package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"strings"

	"setta/internal/httpapi"
)

type workspaceChatReadOptions struct {
	AppDataDir string
	Limit      int
	PaneID     string
}

func runWorkspaceChats(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta workspace chats requires a subcommand: read")}
	}
	switch args[0] {
	case "read":
		return runWorkspaceChatsRead(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown workspace chats subcommand %q", args[0])}
	}
}

func runWorkspaceChatsRead(args []string, deps cliDeps) error {
	options, err := workspaceChatReadOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	result, err := readWorkspaceChat(context.Background(), options, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, result, "workspace chat read result")
}

func workspaceChatReadOptionsFromArgs(args []string, deps cliDeps) (workspaceChatReadOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspaceChatReadOptions{}, err
	}
	limit := 0
	normalizedArgs, err := normalizeWorkspacePaneFlagArgs(args, "app-data-dir", "limit")
	if err != nil {
		return workspaceChatReadOptions{}, usageError{err: err}
	}
	flagSet := newWorkspaceFlagSet("setta workspace chats read")
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.IntVar(&limit, "limit", limit, "recent chat message and transcript block limit")
	if err := flagSet.Parse(normalizedArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspaceChatReadOptions{}, usageError{err: err}
		}
		return workspaceChatReadOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return workspaceChatReadOptions{}, usageError{err: errors.New("setta workspace chats read requires exactly one pane id")}
	}
	paneID := strings.TrimSpace(flagSet.Arg(0))
	if paneID == "" {
		return workspaceChatReadOptions{}, usageError{err: errors.New("workspace pane id is required")}
	}
	if limit < 0 {
		return workspaceChatReadOptions{}, usageError{err: errors.New("chat read limit must not be negative")}
	}
	return workspaceChatReadOptions{
		AppDataDir: appDataDir,
		Limit:      limit,
		PaneID:     paneID,
	}, nil
}

func readWorkspaceChat(
	ctx context.Context,
	options workspaceChatReadOptions,
	deps cliDeps,
) (httpapi.ReadWorkspaceUIChatResponse, error) {
	state, token, cleanup, err := workspaceCommandAuth(ctx, options.AppDataDir, workspaceChatsReadCLIAuthDisplayName, deps)
	if err != nil {
		return httpapi.ReadWorkspaceUIChatResponse{}, err
	}
	defer cleanup()

	currentWorkspace, err := currentWorkspaceForWorkspaceCommand(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return httpapi.ReadWorkspaceUIChatResponse{}, err
	}
	result, err := postWorkspaceAPI[httpapi.ReadWorkspaceUIChatResponse](ctx, deps.httpClient, state.BaseURL, token, "workspace chats read", "/workspaces/ui/chats/read", httpapi.ReadWorkspaceUIChatRequest{
		WorkspaceID: currentWorkspace.ID,
		PaneID:      options.PaneID,
		Limit:       options.Limit,
	})
	if err != nil {
		return httpapi.ReadWorkspaceUIChatResponse{}, err
	}
	if err := validateWorkspaceChatReadResponse(result, currentWorkspace.ID, options.PaneID); err != nil {
		return httpapi.ReadWorkspaceUIChatResponse{}, err
	}
	return result, nil
}
