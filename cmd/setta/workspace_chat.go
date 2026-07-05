package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"setta/internal/chat"
	"setta/internal/httpapi"
	"setta/internal/jsonio"
)

type workspaceChatReadOptions struct {
	AppDataDir string
	Limit      int
	PaneID     string
}

type workspaceChatSendOptions struct {
	AppDataDir string
	InputPath  string
	PaneID     string
}

func runWorkspaceChats(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta workspace chats requires a subcommand: read or send")}
	}
	switch args[0] {
	case "read":
		return runWorkspaceChatsRead(args[1:], deps)
	case "send":
		return runWorkspaceChatsSend(args[1:], deps)
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

func runWorkspaceChatsSend(args []string, deps cliDeps) error {
	options, err := workspaceChatSendOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	input, err := readWorkspaceChatSendInputFile(options.InputPath)
	if err != nil {
		return err
	}
	result, err := sendWorkspaceChat(context.Background(), options, input, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, result, "workspace chat send result")
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

func workspaceChatSendOptionsFromArgs(args []string, deps cliDeps) (workspaceChatSendOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspaceChatSendOptions{}, err
	}
	var inputPath string
	normalizedArgs, err := normalizeWorkspacePaneFlagArgs(args, "app-data-dir", "input")
	if err != nil {
		return workspaceChatSendOptions{}, usageError{err: err}
	}
	flagSet := newWorkspaceFlagSet("setta workspace chats send")
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.StringVar(&inputPath, "input", "", "path to a chat message JSON input file")
	if err := flagSet.Parse(normalizedArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspaceChatSendOptions{}, usageError{err: err}
		}
		return workspaceChatSendOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return workspaceChatSendOptions{}, usageError{err: errors.New("setta workspace chats send requires exactly one pane id")}
	}
	paneID := strings.TrimSpace(flagSet.Arg(0))
	if paneID == "" {
		return workspaceChatSendOptions{}, usageError{err: errors.New("workspace pane id is required")}
	}
	inputPath = strings.TrimSpace(inputPath)
	if inputPath == "" {
		return workspaceChatSendOptions{}, usageError{err: errors.New("setta workspace chats send requires --input")}
	}
	return workspaceChatSendOptions{
		AppDataDir: appDataDir,
		InputPath:  inputPath,
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

func sendWorkspaceChat(
	ctx context.Context,
	options workspaceChatSendOptions,
	input chat.ChatInput,
	deps cliDeps,
) (httpapi.SendWorkspaceUIChatResponse, error) {
	state, token, cleanup, err := workspaceCommandAuth(ctx, options.AppDataDir, workspaceChatsSendCLIAuthDisplayName, deps)
	if err != nil {
		return httpapi.SendWorkspaceUIChatResponse{}, err
	}
	defer cleanup()

	currentWorkspace, err := currentWorkspaceForWorkspaceCommand(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return httpapi.SendWorkspaceUIChatResponse{}, err
	}
	result, err := postWorkspaceAPI[httpapi.SendWorkspaceUIChatResponse](ctx, deps.httpClient, state.BaseURL, token, "workspace chats send", "/workspaces/ui/chats/send", httpapi.SendWorkspaceUIChatRequest{
		WorkspaceID: currentWorkspace.ID,
		PaneID:      options.PaneID,
		Input:       input,
	})
	if err != nil {
		return httpapi.SendWorkspaceUIChatResponse{}, err
	}
	if err := validateWorkspaceChatSendResponse(result, currentWorkspace.ID, options.PaneID); err != nil {
		return httpapi.SendWorkspaceUIChatResponse{}, err
	}
	return result, nil
}

func readWorkspaceChatSendInputFile(path string) (chat.ChatInput, error) {
	file, err := os.Open(path)
	if err != nil {
		return chat.ChatInput{}, newWorkspaceCLIError("workspace_chat_send_input_open_failed", fmt.Errorf("open workspace chat send input %s: %w", path, err))
	}
	defer file.Close()

	var input chat.ChatInput
	if err := jsonio.DecodeSingle(file, &input); err != nil {
		return chat.ChatInput{}, newWorkspaceCLIError("workspace_chat_send_input_decode_failed", fmt.Errorf("decode workspace chat send input %s: %w", path, err))
	}
	return input, nil
}
