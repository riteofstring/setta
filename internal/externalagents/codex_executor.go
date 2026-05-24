package externalagents

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/buildinfo"
	"setta/internal/externalagentconfigs"
	"setta/internal/tools"
)

const (
	codexConfigFileName        = "config.toml"
	codexAppServerArg          = "app-server"
	codexSettingsRootName      = "external_agent_settings"
	codexStdoutBufferSize      = 1024 * 1024
	codexRequestTimeout        = 15 * time.Second
	codexShutdownTimeout       = 5 * time.Second
	codexLoginTimeout          = 20 * time.Second
	codexMCPStatusTimeout      = 1 * time.Second
	codexMCPStatusProbeTimeout = 5 * time.Second
	codexToolDispatchTimeout   = 15 * time.Second
	codexToolResultTimeout     = 5 * time.Second
	codexWatchdogPollInterval  = 250 * time.Millisecond
	codexMaxStderrLines        = 200
	codexTurnCompletedMethod   = "turn/completed"
	codexTurnFailedMethod      = "turn/failed"
	codexTokenUsageMethod      = "thread/tokenUsage/updated"
	codexResponseItemEnvelope  = "response_item"
	codexSettaToolPrefix       = "mcp__setta__"
)

var (
	errCodexExecutorRunStoreRequired      = errors.New("codex executor run store is required")
	errCodexExecutorRuntimeRequired       = errors.New("codex executor runtime is required")
	errCodexExecutorWorkspaceRootRequired = errors.New("codex executor workspace root is required")
	errCodexExecutorFilesRootRequired     = errors.New("codex executor setta files root is required")
	errCodexThreadStartFailed             = errors.New("codex app-server did not return a thread id")
	errCodexToolResponsesUnsupported      = errors.New("codex executor does not support tool responses")
)

type MultiExecutorOptions struct {
	Claude *ClaudeExecutor
	Codex  *CodexExecutor
}

type MultiExecutor struct {
	claude *ClaudeExecutor
	codex  *CodexExecutor
}

func NewMultiExecutor(options MultiExecutorOptions) *MultiExecutor {
	return &MultiExecutor{
		claude: options.Claude,
		codex:  options.Codex,
	}
}

func (e *MultiExecutor) Start(ctx context.Context, request StartRequest) (StartResponse, error) {
	if e == nil {
		return StartResponse{}, ErrExecutorUnavailable
	}
	switch request.ExternalConfig.ToolType {
	case externalagentconfigs.ToolTypeClaudeCode:
		if e.claude == nil {
			return StartResponse{}, ErrExecutorUnavailable
		}
		return e.claude.Start(ctx, request)
	case externalagentconfigs.ToolTypeCodex:
		if e.codex == nil {
			return StartResponse{}, ErrExecutorUnavailable
		}
		return e.codex.Start(ctx, request)
	default:
		return StartResponse{}, ErrExecutorUnavailable
	}
}

type CodexExecutorOptions struct {
	Runs                 *agentruns.RunStore
	Runtime              *Runtime
	WorkspaceRoot        string
	SettaFilesRoot       string
	SettaToolRegistry    *tools.Registry
	CurrentSession       *auth.CurrentSession
	AuthCookieBaseName   string
	RuntimeRoot          string
	ProcessEnv           map[string]string
	Logger               *slog.Logger
	TimeNow              func() time.Time
	ToolDispatchTimeout  time.Duration
	ToolResultTimeout    time.Duration
	WatchdogPollInterval time.Duration
}

type CodexExecutor struct {
	runs                 *agentruns.RunStore
	runtime              *Runtime
	workspaceRoot        string
	settaFilesRoot       string
	settaToolRegistry    *tools.Registry
	currentSession       *auth.CurrentSession
	authCookieBaseName   string
	runtimeRoot          string
	processEnv           map[string]string
	logger               *slog.Logger
	timeNow              func() time.Time
	toolDispatchTimeout  time.Duration
	toolResultTimeout    time.Duration
	watchdogPollInterval time.Duration
}

func NewCodexExecutor(options CodexExecutorOptions) (*CodexExecutor, error) {
	if options.Runs == nil {
		return nil, errCodexExecutorRunStoreRequired
	}
	if options.Runtime == nil {
		return nil, errCodexExecutorRuntimeRequired
	}
	workspaceRoot := strings.TrimSpace(options.WorkspaceRoot)
	if workspaceRoot == "" {
		return nil, errCodexExecutorWorkspaceRootRequired
	}
	settaFilesRoot := strings.TrimSpace(options.SettaFilesRoot)
	if settaFilesRoot == "" {
		return nil, errCodexExecutorFilesRootRequired
	}
	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	toolDispatchTimeout := options.ToolDispatchTimeout
	if toolDispatchTimeout <= 0 {
		toolDispatchTimeout = codexToolDispatchTimeout
	}
	toolResultTimeout := options.ToolResultTimeout
	if toolResultTimeout <= 0 {
		toolResultTimeout = codexToolResultTimeout
	}
	watchdogPollInterval := options.WatchdogPollInterval
	if watchdogPollInterval <= 0 {
		watchdogPollInterval = codexWatchdogPollInterval
	}
	return &CodexExecutor{
		runs:                 options.Runs,
		runtime:              options.Runtime,
		workspaceRoot:        workspaceRoot,
		settaFilesRoot:       settaFilesRoot,
		settaToolRegistry:    options.SettaToolRegistry,
		currentSession:       cloneCurrentSession(options.CurrentSession),
		authCookieBaseName:   auth.NormalizeCookieBaseName(options.AuthCookieBaseName),
		runtimeRoot:          strings.TrimSpace(options.RuntimeRoot),
		processEnv:           cloneStringAnyMapToStringMap(options.ProcessEnv),
		logger:               options.Logger,
		timeNow:              timeNow,
		toolDispatchTimeout:  toolDispatchTimeout,
		toolResultTimeout:    toolResultTimeout,
		watchdogPollInterval: watchdogPollInterval,
	}, nil
}

func (e *CodexExecutor) Start(ctx context.Context, request StartRequest) (StartResponse, error) {
	if e == nil {
		return StartResponse{}, ErrExecutorUnavailable
	}
	if request.ExternalConfig.ToolType != externalagentconfigs.ToolTypeCodex || request.ExternalConfig.RunMode != externalagentconfigs.RunModeAppServer {
		return StartResponse{}, ErrExecutorUnavailable
	}

	workingDir, cleanupPaths, cleanupStart, err := e.resolveStartWorkingDir(request.ExternalConfig)
	if err != nil {
		return StartResponse{}, err
	}
	session, startupState, err := e.prepareStartSession(ctx, request, workingDir)
	if err != nil {
		return StartResponse{}, err
	}
	startupFailed := true
	defer func() {
		if !startupFailed {
			return
		}
		_ = session.terminate()
		cleanupStart()
	}()

	threadID, err := e.initializeStartSession(ctx, request, session, workingDir)
	if err != nil {
		return StartResponse{}, err
	}

	controller := &codexRunController{
		session:      session,
		runtimeReady: make(chan struct{}),
		cancelled:    make(chan struct{}),
	}
	startupFailed = false
	go e.runLoop(
		request,
		session,
		controller,
		cleanupPaths,
		threadID,
		filepath.Join(startupState.codexHome, codexConfigFileName),
	)
	return StartResponse{Controller: controller}, nil
}

func (e *CodexExecutor) resolveStartWorkingDir(
	config externalagentconfigs.Config,
) (string, []string, func(), error) {
	workingDir, cleanupWorkingDir, err := e.resolveWorkingDir(config)
	if err != nil {
		return "", nil, nil, err
	}
	cleanupPaths := []string{}
	if cleanupWorkingDir != nil {
		cleanupPaths = append(cleanupPaths, workingDir)
	}
	cleanupStart := func() {
		if cleanupWorkingDir != nil {
			_ = cleanupWorkingDir()
		}
	}
	return workingDir, cleanupPaths, cleanupStart, nil
}

func (e *CodexExecutor) prepareStartSession(
	ctx context.Context,
	request StartRequest,
	workingDir string,
) (*codexSession, codexPreparedStartState, error) {
	startupState, err := e.prepareStartState(ctx, request, workingDir)
	if err != nil {
		return nil, codexPreparedStartState{}, err
	}
	session, err := e.startCodexSession(request.ExternalConfig, workingDir, startupState.envMap)
	if err != nil {
		return nil, codexPreparedStartState{}, err
	}
	return session, startupState, nil
}

type codexPreparedStartState struct {
	codexHome string
	envMap    map[string]string
}

func (e *CodexExecutor) prepareStartState(
	ctx context.Context,
	request StartRequest,
	workingDir string,
) (codexPreparedStartState, error) {
	envMap := e.buildRuntimeEnv(request.ExternalConfig)
	completionGuardEnabled, err := e.resolveCompletionGuardEnabled(ctx)
	if err != nil {
		return codexPreparedStartState{}, err
	}
	headers, err := e.buildCodexMCPHeaders(request)
	if err != nil {
		return codexPreparedStartState{}, err
	}
	codexHome, err := e.prepareCodexHome(
		request.ExternalConfig,
		request.ChatID,
		workingDir,
		request.Inputs,
		request.Profile,
		completionGuardEnabled,
		headers,
	)
	if err != nil {
		return codexPreparedStartState{}, err
	}
	envMap["CODEX_HOME"] = codexHome
	if err := e.ensureCodexLogin(ctx, request.ExternalConfig, workingDir, envMap); err != nil {
		return codexPreparedStartState{}, err
	}
	return codexPreparedStartState{
		codexHome: codexHome,
		envMap:    envMap,
	}, nil
}

func (e *CodexExecutor) startCodexSession(
	config externalagentconfigs.Config,
	workingDir string,
	envMap map[string]string,
) (*codexSession, error) {
	commandPath := strings.TrimSpace(derefOptionalString(config.CommandPath))
	if commandPath == "" {
		commandPath = "codex"
	}
	cmd := exec.Command(commandPath, codexAppServerArg)
	cmd.Dir = workingDir
	cmd.Env = envMapToList(envMap)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("codex stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("codex stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("codex stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start codex app-server: %w", err)
	}
	session := newCodexSession(cmd, stdin)
	session.start(stdout, stderr)
	return session, nil
}

func (e *CodexExecutor) initializeStartSession(
	ctx context.Context,
	request StartRequest,
	session *codexSession,
	workingDir string,
) (string, error) {
	if err := initializeCodexSessionProtocol(ctx, session); err != nil {
		return "", err
	}
	threadID, err := session.startOrResumeThread(ctx, request.Inputs)
	if err != nil {
		return "", err
	}
	if err := e.persistThreadID(request.Run.ID, threadID); err != nil {
		return "", err
	}
	if err := startCodexSessionTurn(ctx, session, request, threadID, workingDir); err != nil {
		return "", err
	}
	return threadID, nil
}

func initializeCodexSessionProtocol(ctx context.Context, session *codexSession) error {
	if _, err := session.sendRequest(ctx, "initialize", map[string]any{
		"clientInfo": map[string]any{
			"name":    "setta",
			"version": buildinfo.Version(),
		},
	}); err != nil {
		return err
	}
	if err := session.sendNotification("initialized", nil); err != nil {
		return err
	}
	_, err := session.sendRequest(ctx, "config/mcpServer/reload", map[string]any{})
	return err
}

func startCodexSessionTurn(
	ctx context.Context,
	session *codexSession,
	request StartRequest,
	threadID string,
	workingDir string,
) error {
	prompt := buildCodexPrompt(request.Inputs)
	turnParams, err := buildCodexTurnParams(request, prompt, threadID, workingDir)
	if err != nil {
		return err
	}
	_, err = session.sendRequest(ctx, "turn/start", turnParams)
	return err
}
