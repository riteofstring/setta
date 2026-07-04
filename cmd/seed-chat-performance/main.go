package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"setta/internal/appstate"
	"setta/internal/chat"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, os.Getenv))
}

func run(args []string, stdout io.Writer, stderr io.Writer, getenv func(string) string) int {
	config, err := configFromArgs(args, stderr, getenv)
	if err != nil {
		fmt.Fprintf(stderr, "%v\n", err)
		return 2
	}
	summary, err := resolveTargetWorkspace(config)
	if err != nil {
		fmt.Fprintf(stderr, "%v\n", err)
		return 2
	}
	store, err := chat.NewStore(config.appDataDir)
	if err != nil {
		fmt.Fprintf(stderr, "open chat store: %v\n", err)
		return 1
	}
	result, err := chat.SeedPerformanceTranscriptConversation(store, summary.ID, time.Now())
	if err != nil {
		fmt.Fprintf(stderr, "seed chat performance transcript: %v\n", err)
		return 1
	}
	fmt.Fprintf(stdout, "Seeded %q in workspace %q.\n", result.Conversation.Title, summary.DisplayName)
	fmt.Fprintf(
		stdout,
		"workspaceId=%s conversationId=%s messages=%d runs=%d runItems=%d appDataDir=%s\n",
		summary.ID,
		result.Conversation.ID,
		result.MessageCount,
		result.RunCount,
		result.RunItemCount,
		config.appDataDir,
	)
	return 0
}

type config struct {
	appDataDir    string
	workspaceID   string
	workspacePath string
}

func configFromArgs(args []string, stderr io.Writer, getenv func(string) string) (config, error) {
	appDataDir, err := defaultAppDataDir(getenv)
	if err != nil {
		return config{}, err
	}
	config := config{appDataDir: appDataDir}
	flagSet := flag.NewFlagSet("seed-chat-performance", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.appDataDir, "app-data-dir", config.appDataDir, "directory for persisted Setta app state")
	flagSet.StringVar(&config.workspaceID, "workspace-id", "", "active workspace id to seed; defaults to selected workspace")
	flagSet.StringVar(&config.workspacePath, "workspace-path", "", "workspace path to open, select, and seed")
	if err := flagSet.Parse(args); err != nil {
		return config, err
	}
	if config.workspaceID != "" && config.workspacePath != "" {
		return config, fmt.Errorf("pass only one of --workspace-id or --workspace-path")
	}
	if !filepath.IsAbs(config.appDataDir) {
		return config, fmt.Errorf("app data directory must be absolute: %s", config.appDataDir)
	}
	return config, nil
}

func defaultAppDataDir(getenv func(string) string) (string, error) {
	if value := getenv("SETTA_APP_DATA_DIR"); value != "" {
		return value, nil
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve default app data directory: %w", err)
	}
	return filepath.Join(homeDir, ".setta"), nil
}

func resolveTargetWorkspace(config config) (workspace.WorkspaceSummary, error) {
	store, err := appstate.NewStore(config.appDataDir)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	manager, err := workspace.NewManager(config.appDataDir)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	sessionService, err := workspacesession.NewService(store, manager)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	if config.workspacePath != "" {
		summary, _, err := sessionService.OpenLocalFolder(config.workspacePath)
		return summary, err
	}
	if config.workspaceID != "" {
		if _, err := sessionService.Select(config.workspaceID); err != nil {
			return workspace.WorkspaceSummary{}, err
		}
		return sessionService.ResolveWorkspace(config.workspaceID)
	}
	session := sessionService.Session()
	if session.SelectedWorkspaceID == "" {
		return workspace.WorkspaceSummary{}, fmt.Errorf("no selected workspace; open one in Setta or pass --workspace-path")
	}
	return sessionService.ResolveWorkspace(session.SelectedWorkspaceID)
}
