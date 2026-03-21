package externalagents

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	toml "github.com/pelletier/go-toml/v2"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/externalagentconfigs"
	"setta/internal/mcpx"
	"setta/internal/settingsstate"
)

const (
	codexConfigFileName       = "config.toml"
	codexAppServerArg         = "app-server"
	codexSettingsRootName     = "external_agent_settings"
	codexStdoutBufferSize     = 1024 * 1024
	codexRequestTimeout       = 15 * time.Second
	codexShutdownTimeout      = 5 * time.Second
	codexLoginTimeout         = 20 * time.Second
	codexMCPStatusTimeout     = 1 * time.Second
	codexMaxStderrLines       = 200
	codexApprovalToolName     = "setta.approval"
	codexTurnCompletedMethod  = "turn/completed"
	codexTurnFailedMethod     = "turn/failed"
	codexResponseItemEnvelope = "response_item"
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
	Claude   *ClaudeExecutor
	Codex    *CodexExecutor
	OpenCode *OpenCodeExecutor
}

type MultiExecutor struct {
	claude   *ClaudeExecutor
	codex    *CodexExecutor
	openCode *OpenCodeExecutor
}

func NewMultiExecutor(options MultiExecutorOptions) *MultiExecutor {
	return &MultiExecutor{
		claude:   options.Claude,
		codex:    options.Codex,
		openCode: options.OpenCode,
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
	case externalagentconfigs.ToolTypeOpenCode:
		if e.openCode == nil {
			return StartResponse{}, ErrExecutorUnavailable
		}
		return e.openCode.Start(ctx, request)
	default:
		return StartResponse{}, ErrExecutorUnavailable
	}
}

type CodexExecutorOptions struct {
	Runs               *agentruns.RunStore
	Runtime            *Runtime
	WorkspaceRoot      string
	SettaFilesRoot     string
	CurrentSession     *auth.CurrentSession
	AuthCookieBaseName string
	RuntimeRoot        string
	ProcessEnv         map[string]string
	TimeNow            func() time.Time
}

type CodexExecutor struct {
	runs               *agentruns.RunStore
	runtime            *Runtime
	workspaceRoot      string
	settaFilesRoot     string
	currentSession     *auth.CurrentSession
	authCookieBaseName string
	runtimeRoot        string
	processEnv         map[string]string
	timeNow            func() time.Time
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
	return &CodexExecutor{
		runs:               options.Runs,
		runtime:            options.Runtime,
		workspaceRoot:      workspaceRoot,
		settaFilesRoot:     settaFilesRoot,
		currentSession:     cloneCurrentSession(options.CurrentSession),
		authCookieBaseName: auth.NormalizeCookieBaseName(options.AuthCookieBaseName),
		runtimeRoot:        strings.TrimSpace(options.RuntimeRoot),
		processEnv:         cloneStringAnyMapToStringMap(options.ProcessEnv),
		timeNow:            timeNow,
	}, nil
}

func (e *CodexExecutor) Start(ctx context.Context, request StartRequest) (StartResponse, error) {
	if e == nil {
		return StartResponse{}, ErrExecutorUnavailable
	}
	if request.ExternalConfig.ToolType != externalagentconfigs.ToolTypeCodex || request.ExternalConfig.RunMode != externalagentconfigs.RunModeAppServer {
		return StartResponse{}, ErrExecutorUnavailable
	}

	workingDir, cleanupWorkingDir, err := e.resolveWorkingDir(request.ExternalConfig)
	if err != nil {
		return StartResponse{}, err
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

	envMap := e.buildRuntimeEnv(request.ExternalConfig)
	completionGuardEnabled, err := e.resolveCompletionGuardEnabled(ctx)
	if err != nil {
		cleanupStart()
		return StartResponse{}, err
	}
	headers, err := e.buildCodexMCPHeaders(request)
	if err != nil {
		cleanupStart()
		return StartResponse{}, err
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
		cleanupStart()
		return StartResponse{}, err
	}
	envMap["CODEX_HOME"] = codexHome
	if err := e.ensureCodexLogin(ctx, request.ExternalConfig, workingDir, envMap); err != nil {
		cleanupStart()
		return StartResponse{}, err
	}

	commandPath := strings.TrimSpace(derefOptionalString(request.ExternalConfig.CommandPath))
	if commandPath == "" {
		commandPath = "codex"
	}
	cmd := exec.Command(commandPath, codexAppServerArg)
	cmd.Dir = workingDir
	cmd.Env = envMapToList(envMap)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("codex stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("codex stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("codex stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("start codex app-server: %w", err)
	}

	session := newCodexSession(cmd, stdin)
	session.start(stdout, stderr)

	startupFailed := true
	defer func() {
		if !startupFailed {
			return
		}
		_ = session.terminate()
		cleanupStart()
	}()

	if _, err := session.sendRequest(ctx, "initialize", map[string]any{
		"clientInfo": map[string]any{
			"name":    "setta",
			"version": "go-rewrite",
		},
	}); err != nil {
		return StartResponse{}, err
	}
	if err := session.sendNotification("initialized", nil); err != nil {
		return StartResponse{}, err
	}
	if _, err := session.sendRequest(ctx, "config/mcpServer/reload", map[string]any{}); err != nil {
		return StartResponse{}, err
	}

	threadID, err := session.startOrResumeThread(ctx, request.Inputs)
	if err != nil {
		return StartResponse{}, err
	}
	if err := e.persistThreadID(request.Run.ID, threadID); err != nil {
		return StartResponse{}, err
	}

	prompt := buildCodexPrompt(request.Inputs)
	if _, err := session.sendRequest(ctx, "turn/start", buildCodexTurnParams(request, prompt, threadID, workingDir)); err != nil {
		return StartResponse{}, err
	}

	controller := &codexRunController{
		session:      session,
		runtimeReady: make(chan struct{}),
		cancelled:    make(chan struct{}),
	}
	startupFailed = false
	go e.runLoop(request, session, controller, cleanupPaths, threadID)
	return StartResponse{Controller: controller}, nil
}

func (e *CodexExecutor) runLoop(
	request StartRequest,
	session *codexSession,
	controller *codexRunController,
	cleanupPaths []string,
	threadID string,
) {
	defer func() {
		_ = controller.Cancel()
		for _, cleanupPath := range cleanupPaths {
			if strings.TrimSpace(cleanupPath) == "" {
				continue
			}
			_ = os.RemoveAll(cleanupPath)
		}
		e.runtime.DeactivateRun(request.Run.ID)
	}()
	if !controller.waitForRuntimeReady() {
		return
	}

	state, err := e.loadCurrentChatState(request.Run)
	if err != nil {
		_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		return
	}
	eventState := newCodexEventState()
	if err := e.persistLiveState(request.Run.ID, state, threadID); err != nil {
		_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		return
	}
	e.captureMCPStatuses(session, request.Run.ID)

	for {
		payload, ok := <-session.events
		if !ok {
			if err := e.handleProcessExit(request.Run.ID, session.processErr(), session.stderrTail()); err != nil {
				_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
			}
			return
		}
		finished, err := e.handleEvent(request, session, payload, &state, eventState)
		if err != nil {
			_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
			return
		}
		if finished {
			return
		}
	}
}

func (e *CodexExecutor) handleEvent(
	request StartRequest,
	session *codexSession,
	payload map[string]any,
	state *ChatState,
	eventState *codexEventState,
) (bool, error) {
	if currentLiveState, err := e.runtime.GetLiveChatState(request.Run.ID); err == nil && currentLiveState != nil {
		*state = *currentLiveState.Clone()
	}
	if isCodexApprovalRequest(payload) {
		approvalState, arguments, err := buildCodexApprovalState(request, payload)
		if err != nil {
			return false, err
		}
		if err := e.runtime.RegisterApproval(approvalState); err != nil {
			return false, err
		}
		session.registerApprovalRawID(approvalState.ApprovalID, payload["id"])
		appendApprovalRequestMessage(state, approvalState.ApprovalID, arguments)
		if err := e.persistLiveState(request.Run.ID, *state, session.threadID()); err != nil {
			return false, err
		}
		run, err := e.runs.Load(request.Run.ID)
		if err != nil {
			return false, err
		}
		appendRunEvent(&run, "approval_request", map[string]any{
			"approvalId": approvalState.ApprovalID,
			"payload":    cloneAnyMap(payload),
		}, e.timeNow())
		if err := e.runs.Save(run); err != nil {
			return false, err
		}
		return false, nil
	}

	switch strings.TrimSpace(stringValue(payload["type"])) {
	case codexResponseItemEnvelope:
		if handled, toolResult, err := e.applyResponseItem(request.Run.ID, payload, state, session.threadID()); err != nil {
			return false, err
		} else if handled {
			if toolResult != nil {
				run, err := e.runs.Load(request.Run.ID)
				if err != nil {
					return false, err
				}
				appendRunEvent(&run, "tool_result", map[string]any{
					"toolCallId": toolResult.ToolCallID,
					"toolName":   toolResult.ToolName,
					"isError":    toolResult.IsError,
				}, e.timeNow())
				if err := e.runs.Save(run); err != nil {
					return false, err
				}
			}
			return false, nil
		}
	}

	method := strings.TrimSpace(stringValue(payload["method"]))
	switch method {
	case codexTurnCompletedMethod:
		if err := e.finalizeRun(request.Run.ID, agentruns.RunStatusCompleted, nil, *state, session.threadID()); err != nil {
			return false, err
		}
		return true, nil
	case codexTurnFailedMethod:
		errorPayload := map[string]any{}
		if params, ok := mapValue(payload["params"]); ok {
			if turn, ok := mapValue(params["turn"]); ok {
				if turnError := turn["error"]; turnError != nil {
					errorPayload["error"] = turnError
				}
			}
		}
		if err := e.finalizeRun(request.Run.ID, agentruns.RunStatusFailed, errorPayload, *state, session.threadID()); err != nil {
			return false, err
		}
		return true, nil
	}

	if applied, toolResult, err := applyCodexStreamEvent(state, eventState, payload); err != nil {
		return false, err
	} else if applied {
		if toolResult != nil {
			run, err := e.runs.Load(request.Run.ID)
			if err != nil {
				return false, err
			}
			appendRunEvent(&run, "tool_result", map[string]any{
				"toolCallId": toolResult.ToolCallID,
				"toolName":   toolResult.ToolName,
				"isError":    toolResult.IsError,
			}, e.timeNow())
			if err := e.runs.Save(run); err != nil {
				return false, err
			}
		}
		if err := e.persistLiveState(request.Run.ID, *state, session.threadID()); err != nil {
			return false, err
		}
	}
	return false, nil
}

func (e *CodexExecutor) applyResponseItem(runID string, payload map[string]any, state *ChatState, threadID string) (bool, *codexToolResultMetadata, error) {
	applied, toolResult, err := applyCodexResponseItem(state, payload)
	if err != nil || !applied {
		return applied, toolResult, err
	}
	if err := e.persistLiveState(runID, *state, threadID); err != nil {
		return false, nil, err
	}
	return true, toolResult, nil
}

func (e *CodexExecutor) handleProcessExit(runID string, processErr error, stderrLines []string) error {
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	if run.Status == agentruns.RunStatusCompleted || run.Status == agentruns.RunStatusFailed || run.Status == agentruns.RunStatusCancelled {
		return nil
	}
	if processErr == nil {
		processErr = errors.New("codex app-server exited before completing the run")
	}
	return e.markRunFailed(runID, processErr, stderrLines)
}

func (e *CodexExecutor) finalizeRun(
	runID string,
	status agentruns.RunStatus,
	extraPayload map[string]any,
	state ChatState,
	threadID string,
) error {
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	if run.Status == agentruns.RunStatusCancelled {
		return nil
	}
	run.Outputs = ensureAnyMap(run.Outputs)
	run.Outputs["messages"] = messageSliceToJSONList(state.Messages)
	if threadID != "" {
		run.Outputs["threadId"] = threadID
	}
	e.runtime.attachMCPStatusSnapshot(&run)
	finishedAt := e.timeNow().UTC()
	run.Status = status
	run.FinishedAt = &finishedAt
	eventType := "run_completed"
	if status == agentruns.RunStatusFailed {
		eventType = "run_failed"
	}
	appendRunEvent(&run, eventType, cloneAnyMap(extraPayload), finishedAt)
	return e.runs.Save(run)
}

func (e *CodexExecutor) markRunFailed(runID string, runErr error, stderrLines []string) error {
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	if run.Status == agentruns.RunStatusCancelled {
		return nil
	}
	e.runtime.attachMCPStatusSnapshot(&run)
	finishedAt := e.timeNow().UTC()
	run.Status = agentruns.RunStatusFailed
	run.FinishedAt = &finishedAt
	payload := map[string]any{
		"error": runErr.Error(),
	}
	if len(stderrLines) > 0 {
		payload["cliStderr"] = append([]string(nil), stderrLines...)
	}
	appendRunEvent(&run, "run_failed", payload, finishedAt)
	return e.runs.Save(run)
}

func (e *CodexExecutor) persistThreadID(runID string, threadID string) error {
	if strings.TrimSpace(threadID) == "" {
		return errCodexThreadStartFailed
	}
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	run.Outputs = ensureAnyMap(run.Outputs)
	run.Outputs["threadId"] = threadID
	return e.runs.Save(run)
}

func (e *CodexExecutor) persistLiveState(runID string, state ChatState, threadID string) error {
	if err := e.runtime.SetLiveChatState(runID, state); err != nil {
		return err
	}
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	run.Outputs = ensureAnyMap(run.Outputs)
	run.Outputs["messages"] = messageSliceToJSONList(state.Messages)
	if threadID != "" {
		run.Outputs["threadId"] = threadID
	}
	return e.runs.Save(run)
}

func (e *CodexExecutor) loadCurrentChatState(run agentruns.Run) (ChatState, error) {
	liveState, err := e.runtime.GetLiveChatState(run.ID)
	if err != nil {
		return ChatState{}, err
	}
	if liveState != nil {
		cloned := liveState.Clone()
		cloned.WaitingForResponse = true
		return *cloned, nil
	}
	built, err := buildChatStateFromRun(run)
	if err != nil {
		return ChatState{}, err
	}
	if built == nil {
		return ChatState{
			Messages:           []map[string]any{},
			WaitingForResponse: true,
			ToolCallArguments:  map[string]string{},
		}, nil
	}
	cloned := built.Clone()
	cloned.WaitingForResponse = true
	return *cloned, nil
}

func (e *CodexExecutor) captureMCPStatuses(session *codexSession, runID string) {
	statusCtx, cancel := context.WithTimeout(context.Background(), codexMCPStatusTimeout)
	defer cancel()
	statusPayload, err := session.sendRequest(statusCtx, "mcpServerStatus/list", map[string]any{})
	if err != nil {
		return
	}
	if err := e.runtime.UpsertMCPStatuses(runID, buildCodexMCPStatuses(statusPayload, e.timeNow)); err != nil && !errors.Is(err, ErrRunNotActive) {
		return
	}
}

func (e *CodexExecutor) resolveWorkingDir(config externalagentconfigs.Config) (string, func() error, error) {
	switch config.WorkingDirStrategy {
	case externalagentconfigs.WorkingDirStrategyTempDir:
		root, err := os.MkdirTemp("", "setta-codex-")
		if err != nil {
			return "", nil, fmt.Errorf("create codex temp working dir: %w", err)
		}
		return root, func() error {
			return os.RemoveAll(root)
		}, nil
	case externalagentconfigs.WorkingDirStrategyCustom:
		path := strings.TrimSpace(derefOptionalString(config.WorkingDir))
		if path == "" {
			return "", nil, fmt.Errorf("custom working directory requires workingDir")
		}
		if err := os.MkdirAll(path, 0o755); err != nil {
			return "", nil, fmt.Errorf("create codex custom working dir: %w", err)
		}
		return path, nil, nil
	default:
		return e.workspaceRoot, nil, nil
	}
}

func (e *CodexExecutor) buildRuntimeEnv(config externalagentconfigs.Config) map[string]string {
	envMap := map[string]string{}
	for _, key := range []string{"PATH", "HOME", "USER", "SHELL", "TMPDIR", "TMP", "TEMP"} {
		if value := strings.TrimSpace(e.processEnv[key]); value != "" {
			envMap[key] = e.processEnv[key]
		}
	}
	for key, value := range externalagentconfigs.ResolveWhitelistedEnvVars(e.workspaceRoot, e.runtimeRoot, e.processEnv, config.EnvVarWhitelist).EnvVars {
		envMap[key] = value
	}
	return envMap
}

func (e *CodexExecutor) prepareCodexHome(
	config externalagentconfigs.Config,
	chatID string,
	workingDir string,
	inputs map[string]any,
	profile *agentprofiles.Profile,
	completionGuardEnabled bool,
	settaHeaders map[string]string,
) (string, error) {
	baseHome := filepath.Join(e.settaFilesRoot, codexSettingsRootName, "codex", config.ID)
	runtimeHome := filepath.Join(baseHome, "sessions", chatID)
	if err := os.MkdirAll(runtimeHome, 0o755); err != nil {
		return "", fmt.Errorf("create codex runtime home: %w", err)
	}

	payload := map[string]any{}
	baseConfigPath, baseAuthDir := resolveCodexBaseConfig(config, baseHome)
	if baseConfigPath != "" {
		loaded, err := loadCodexConfigPayload(baseConfigPath)
		if err != nil {
			return "", err
		}
		payload = loaded
	}
	if err := applyCodexRuntimeConfig(payload, config, workingDir, inputs, profile, completionGuardEnabled, settaHeaders); err != nil {
		return "", err
	}

	content, err := toml.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("encode codex runtime config: %w", err)
	}
	runtimeConfigPath := filepath.Join(runtimeHome, codexConfigFileName)
	if err := os.WriteFile(runtimeConfigPath, content, 0o644); err != nil {
		return "", fmt.Errorf("write codex runtime config: %w", err)
	}
	if err := copyCodexAuthFile(baseAuthDir, runtimeHome); err != nil {
		return "", err
	}
	return runtimeHome, nil
}

func (e *CodexExecutor) resolveCompletionGuardEnabled(ctx context.Context) (bool, error) {
	settingsStore, err := settingsstate.NewStore(filepath.Join(e.settaFilesRoot, settingsstate.DefaultFileName), settingsstate.StoreOptions{})
	if err != nil {
		return false, fmt.Errorf("open settings store: %w", err)
	}
	document, err := settingsStore.Load(ctx)
	if err != nil {
		return false, fmt.Errorf("load settings document: %w", err)
	}
	enabled, err := settingsstate.CompletionGuardEnabled(document)
	if err != nil {
		return false, fmt.Errorf("read completion guard setting: %w", err)
	}
	return enabled, nil
}

func (e *CodexExecutor) ensureCodexLogin(
	ctx context.Context,
	config externalagentconfigs.Config,
	workingDir string,
	envMap map[string]string,
) error {
	apiKey := strings.TrimSpace(envMap["OPENAI_API_KEY"])
	if apiKey == "" {
		return nil
	}
	codexHome := strings.TrimSpace(envMap["CODEX_HOME"])
	if codexHome == "" {
		return nil
	}
	authPath := filepath.Join(codexHome, "auth.json")
	if _, err := os.Stat(authPath); err == nil {
		return nil
	}
	commandPath := strings.TrimSpace(derefOptionalString(config.CommandPath))
	if commandPath == "" {
		commandPath = "codex"
	}
	loginCtx, cancel := context.WithTimeout(ctx, codexLoginTimeout)
	defer cancel()
	cmd := exec.CommandContext(loginCtx, commandPath, "login", "--with-api-key")
	cmd.Dir = workingDir
	cmd.Env = envMapToList(envMap)
	cmd.Stdin = strings.NewReader(apiKey + "\n")
	output, err := cmd.CombinedOutput()
	if err != nil {
		trimmed := strings.TrimSpace(string(output))
		if trimmed == "" {
			trimmed = err.Error()
		}
		return fmt.Errorf("codex login failed: %s", trimmed)
	}
	return nil
}

type codexRunController struct {
	session *codexSession

	runtimeReady     chan struct{}
	runtimeReadyOnce sync.Once
	cancelled        chan struct{}
	cancelledOnce    sync.Once
}

func (c *codexRunController) Cancel() error {
	if c == nil || c.session == nil {
		return nil
	}
	c.cancelledOnce.Do(func() {
		close(c.cancelled)
	})
	return c.session.terminate()
}

func (c *codexRunController) SendApprovalResponse(approvalID string, approved bool) error {
	if c == nil || c.session == nil {
		return ErrRunNotActive
	}
	rawID, ok := c.session.approvalRawID(approvalID)
	if !ok {
		return ErrApprovalNotFound
	}
	decision := "decline"
	if approved {
		decision = "accept"
	}
	return c.session.writeJSON(map[string]any{
		"id": rawID,
		"result": map[string]any{
			"decision": decision,
		},
	})
}

func (c *codexRunController) SendToolResponse(_ string, _ map[string]any) error {
	if c == nil || c.session == nil {
		return ErrRunNotActive
	}
	return errCodexToolResponsesUnsupported
}

func (c *codexRunController) markRuntimeReady() {
	if c == nil {
		return
	}
	c.runtimeReadyOnce.Do(func() {
		close(c.runtimeReady)
	})
}

func (c *codexRunController) waitForRuntimeReady() bool {
	if c == nil {
		return false
	}
	select {
	case <-c.runtimeReady:
		return true
	case <-c.cancelled:
		return false
	}
}

type codexSession struct {
	cmd *exec.Cmd

	stdin io.WriteCloser

	mu            sync.Mutex
	nextRequestID int
	pending       map[int]chan map[string]any
	approvalIDs   map[string]any
	thread        string
	terminated    bool

	stderrMu    sync.Mutex
	stderrLines []string

	waitCh  chan error
	events  chan map[string]any
	waitErr error
}

func newCodexSession(cmd *exec.Cmd, stdin io.WriteCloser) *codexSession {
	return &codexSession{
		cmd:           cmd,
		stdin:         stdin,
		nextRequestID: 1,
		pending:       map[int]chan map[string]any{},
		approvalIDs:   map[string]any{},
		waitCh:        make(chan error, 1),
		events:        make(chan map[string]any, 64),
	}
}

func (s *codexSession) start(stdout io.Reader, stderr io.Reader) {
	go s.readStdout(stdout)
	go s.readStderr(stderr)
	go func() {
		err := s.cmd.Wait()
		s.mu.Lock()
		s.waitErr = err
		s.mu.Unlock()
		s.waitCh <- err
		close(s.waitCh)
	}()
}

func (s *codexSession) processErr() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.waitErr
}

func (s *codexSession) sendRequest(ctx context.Context, method string, params map[string]any) (map[string]any, error) {
	s.mu.Lock()
	requestID := s.nextRequestID
	s.nextRequestID++
	responseCh := make(chan map[string]any, 1)
	s.pending[requestID] = responseCh
	s.mu.Unlock()

	payload := map[string]any{
		"id":     requestID,
		"method": method,
	}
	if params != nil {
		payload["params"] = params
	}
	if err := s.writeJSON(payload); err != nil {
		s.mu.Lock()
		delete(s.pending, requestID)
		s.mu.Unlock()
		return nil, err
	}

	requestCtx, cancel := context.WithTimeout(ctx, codexRequestTimeout)
	defer cancel()

	select {
	case response, ok := <-responseCh:
		if !ok {
			return nil, fmt.Errorf("codex app-server closed while waiting for %s", method)
		}
		if errorPayload, ok := mapValue(response["error"]); ok {
			return nil, fmt.Errorf("codex app-server request failed (%s): %v", method, errorPayload)
		}
		if result, ok := mapValue(response["result"]); ok {
			return result, nil
		}
		return response, nil
	case <-requestCtx.Done():
		s.mu.Lock()
		delete(s.pending, requestID)
		s.mu.Unlock()
		return nil, fmt.Errorf("codex app-server request timed out (%s)", method)
	}
}

func (s *codexSession) sendNotification(method string, params map[string]any) error {
	payload := map[string]any{
		"method": method,
	}
	if params != nil {
		payload["params"] = params
	}
	return s.writeJSON(payload)
}

func (s *codexSession) startOrResumeThread(ctx context.Context, inputs map[string]any) (string, error) {
	threadID := strings.TrimSpace(stringValue(inputs["threadId"]))
	if threadID != "" {
		result, err := s.sendRequest(ctx, "thread/resume", map[string]any{"threadId": threadID})
		if err != nil {
			return "", err
		}
		if resolved := extractThreadID(result); resolved != "" {
			s.setThreadID(resolved)
			return resolved, nil
		}
	}
	result, err := s.sendRequest(ctx, "thread/start", map[string]any{})
	if err != nil {
		return "", err
	}
	resolved := extractThreadID(result)
	if resolved == "" {
		return "", errCodexThreadStartFailed
	}
	s.setThreadID(resolved)
	return resolved, nil
}

func (s *codexSession) setThreadID(threadID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.thread = strings.TrimSpace(threadID)
}

func (s *codexSession) threadID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.thread
}

func (s *codexSession) writeJSON(payload map[string]any) error {
	content, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode codex payload: %w", err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.stdin == nil {
		return fmt.Errorf("codex app-server stdin is unavailable")
	}
	if _, err := s.stdin.Write(append(content, '\n')); err != nil {
		return fmt.Errorf("write codex payload: %w", err)
	}
	return nil
}

func (s *codexSession) registerApprovalRawID(approvalID string, rawID any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.approvalIDs[approvalID] = rawID
}

func (s *codexSession) approvalRawID(approvalID string) (any, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rawID, ok := s.approvalIDs[strings.TrimSpace(approvalID)]
	if ok {
		delete(s.approvalIDs, strings.TrimSpace(approvalID))
	}
	return rawID, ok
}

func (s *codexSession) terminate() error {
	s.mu.Lock()
	if s.terminated {
		s.mu.Unlock()
		return nil
	}
	s.terminated = true
	process := s.cmd.Process
	s.mu.Unlock()
	if process == nil {
		return nil
	}
	_ = process.Signal(os.Interrupt)
	select {
	case <-s.waitCh:
		return nil
	case <-time.After(codexShutdownTimeout):
		_ = process.Kill()
		<-s.waitCh
		return nil
	}
}

func (s *codexSession) readStdout(stdout io.Reader) {
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 16*1024), codexStdoutBufferSize)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var payload map[string]any
		if err := json.Unmarshal([]byte(line), &payload); err != nil {
			continue
		}
		if responseID, ok := responsePayloadID(payload); ok {
			s.mu.Lock()
			responseCh := s.pending[responseID]
			delete(s.pending, responseID)
			s.mu.Unlock()
			if responseCh != nil {
				responseCh <- payload
				close(responseCh)
				continue
			}
		}
		s.events <- payload
	}
	s.mu.Lock()
	for requestID, responseCh := range s.pending {
		delete(s.pending, requestID)
		close(responseCh)
	}
	s.mu.Unlock()
	close(s.events)
}

func (s *codexSession) readStderr(stderr io.Reader) {
	scanner := bufio.NewScanner(stderr)
	scanner.Buffer(make([]byte, 0, 16*1024), codexStdoutBufferSize)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		s.stderrMu.Lock()
		s.stderrLines = append(s.stderrLines, line)
		if len(s.stderrLines) > codexMaxStderrLines {
			s.stderrLines = append([]string(nil), s.stderrLines[len(s.stderrLines)-codexMaxStderrLines:]...)
		}
		s.stderrMu.Unlock()
	}
}

func (s *codexSession) stderrTail() []string {
	s.stderrMu.Lock()
	defer s.stderrMu.Unlock()
	return append([]string(nil), s.stderrLines...)
}

func buildCodexTurnParams(request StartRequest, prompt string, threadID string, workingDir string) map[string]any {
	params := map[string]any{
		"threadId": threadID,
		"input": []any{
			map[string]any{
				"type": "text",
				"text": prompt,
			},
		},
		"cwd": workingDir,
	}
	if model := strings.TrimSpace(stringValue(request.Inputs["model"])); model != "" {
		params["model"] = model
	} else if model := strings.TrimSpace(derefOptionalString(request.ExternalConfig.DefaultModel)); model != "" {
		params["model"] = model
	}
	if effort := strings.TrimSpace(stringValue(request.Inputs["effort"])); effort != "" {
		params["effort"] = effort
	}
	if summary := strings.TrimSpace(stringValue(request.Inputs["summary"])); summary != "" {
		params["summary"] = summary
	}
	if approvalPolicy := strings.TrimSpace(mapCodexApprovalPolicy(stringValue(request.Inputs["approvalPolicy"]), derefOptionalString(request.ExternalConfig.ApprovalPolicy))); approvalPolicy != "" {
		params["approvalPolicy"] = approvalPolicy
	}
	if sandboxPolicy := buildCodexSandboxPolicy(stringValue(request.Inputs["sandboxPolicy"]), derefOptionalString(request.ExternalConfig.SandboxPolicy)); sandboxPolicy != nil {
		params["sandboxPolicy"] = sandboxPolicy
	}
	return params
}

func buildCodexPrompt(inputs map[string]any) string {
	if inputs == nil {
		return "\n"
	}
	parts := []string{}
	if rawMessages, ok := inputs["messages"].([]any); ok {
		for _, rawMessage := range rawMessages {
			message, ok := rawMessage.(map[string]any)
			if !ok {
				continue
			}
			role := strings.TrimSpace(stringValue(message["role"]))
			if role == "" || role == "system" || role == "developer" {
				continue
			}
			text := extractMessageText(message)
			if text == "" {
				continue
			}
			parts = append(parts, strings.Title(role)+":\n"+text)
		}
	}
	if prompt := strings.TrimSpace(stringValue(inputs["prompt"])); prompt != "" {
		parts = append(parts, prompt)
	}
	if len(parts) == 0 {
		return "\n"
	}
	return strings.Join(parts, "\n\n") + "\n"
}

func extractMessageText(message map[string]any) string {
	rawContent, ok := message["content"].([]any)
	if !ok {
		return ""
	}
	lines := []string{}
	for _, rawEntry := range rawContent {
		entry, ok := rawEntry.(map[string]any)
		if !ok {
			continue
		}
		entryType := strings.TrimSpace(stringValue(entry["type"]))
		if entryType != "" && entryType != "text" {
			continue
		}
		text := stringValue(entry["text"])
		if text != "" {
			lines = append(lines, text)
		}
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func resolveCodexBaseConfig(config externalagentconfigs.Config, baseHome string) (string, string) {
	if config.SettingsMode == externalagentconfigs.SettingsModeExplicitPath {
		path := strings.TrimSpace(derefOptionalString(config.SettingsFilePath))
		if path != "" {
			return path, filepath.Dir(path)
		}
	}
	canonical := filepath.Join(baseHome, codexConfigFileName)
	if _, err := os.Stat(canonical); err == nil {
		return canonical, baseHome
	}
	return "", baseHome
}

func loadCodexConfigPayload(path string) (map[string]any, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read codex base config: %w", err)
	}
	payload := map[string]any{}
	if len(strings.TrimSpace(string(content))) == 0 {
		return payload, nil
	}
	if err := toml.Unmarshal(content, &payload); err != nil {
		return nil, fmt.Errorf("decode codex base config: %w", err)
	}
	if _, ok := payload["mcpServers"]; ok {
		return nil, fmt.Errorf(
			"decode codex base config: top-level mcpServers is not supported; use mcp_servers",
		)
	}
	return payload, nil
}

func applyCodexRuntimeConfig(
	payload map[string]any,
	config externalagentconfigs.Config,
	workingDir string,
	inputs map[string]any,
	profile *agentprofiles.Profile,
	completionGuardEnabled bool,
	settaHeaders map[string]string,
) error {
	if payload == nil {
		return nil
	}
	if model := strings.TrimSpace(stringValue(inputs["model"])); model != "" {
		payload["model"] = model
	} else if model := strings.TrimSpace(derefOptionalString(config.DefaultModel)); model != "" {
		payload["model"] = model
	}
	if approvalPolicy := strings.TrimSpace(stringValue(inputs["approvalPolicy"])); approvalPolicy != "" {
		payload["approval_policy"] = approvalPolicy
	} else if approvalPolicy := strings.TrimSpace(derefOptionalString(config.ApprovalPolicy)); approvalPolicy != "" {
		payload["approval_policy"] = approvalPolicy
	}
	if sandboxPolicy := strings.TrimSpace(stringValue(inputs["sandboxPolicy"])); sandboxPolicy != "" {
		payload["sandbox_mode"] = sandboxPolicy
	} else if sandboxPolicy := strings.TrimSpace(derefOptionalString(config.SandboxPolicy)); sandboxPolicy != "" {
		payload["sandbox_mode"] = sandboxPolicy
	}
	if systemPrompt := strings.TrimSpace(stringValue(inputs["systemPrompt"])); systemPrompt != "" {
		if existing := strings.TrimSpace(stringValue(payload["developer_instructions"])); existing != "" {
			payload["developer_instructions"] = systemPrompt + "\n\n" + existing
		} else {
			payload["developer_instructions"] = systemPrompt
		}
	}
	if envWhitelistContains(config.EnvVarWhitelist, "OPENAI_API_KEY") {
		if strings.TrimSpace(stringValue(payload["forced_login_method"])) == "" {
			payload["forced_login_method"] = "api"
		}
		if strings.TrimSpace(stringValue(payload["preferred_auth_method"])) == "" {
			payload["preferred_auth_method"] = "apikey"
		}
		if strings.TrimSpace(stringValue(payload["cli_auth_credentials_store"])) == "" {
			payload["cli_auth_credentials_store"] = "file"
		}
		features := ensureAnyMapFromValue(payload["features"])
		if _, ok := features["remote_models"]; !ok {
			features["remote_models"] = false
		}
		if _, ok := features["remote_compaction"]; !ok {
			features["remote_compaction"] = false
		}
		payload["features"] = features
	}
	if strings.TrimSpace(stringValue(payload["model_reasoning_summary"])) == "" {
		payload["model_reasoning_summary"] = "none"
	}
	if len(settaHeaders) > 0 {
		mcpServers := ensureAnyMapFromValue(payload["mcp_servers"])
		serverEntry := ensureAnyMapFromValue(mcpServers[mcpx.DefaultServerID])
		headerEntry := ensureAnyMapFromValue(serverEntry["http_headers"])
		for key, value := range settaHeaders {
			headerEntry[key] = value
		}
		serverEntry["http_headers"] = headerEntry
		mcpServers[mcpx.DefaultServerID] = serverEntry
		payload["mcp_servers"] = mcpServers
	}
	projects := ensureAnyMapFromValue(payload["projects"])
	projectEntry := ensureAnyMapFromValue(projects[workingDir])
	projectEntry["trust_level"] = "trusted"
	projects[workingDir] = projectEntry
	payload["projects"] = projects
	allowlist, err := buildCodexToolAllowlist(profile, completionGuardEnabled)
	if err != nil {
		return err
	}
	if allowlist != nil && !allowlist.allowAll {
		mcpServers := ensureAnyMapFromValue(payload["mcp_servers"])
		serverEntry := ensureAnyMapFromValue(mcpServers[mcpx.DefaultServerID])
		serverEntry["enabled_tools"] = append([]string(nil), allowlist.toolNames...)
		mcpServers[mcpx.DefaultServerID] = serverEntry
		payload["mcp_servers"] = mcpServers
	}
	return nil
}

type codexToolAllowlist struct {
	allowAll  bool
	toolNames []string
}

func buildCodexToolAllowlist(profile *agentprofiles.Profile, completionGuardEnabled bool) (*codexToolAllowlist, error) {
	if profile == nil || len(profile.ToolAllowlist) == 0 {
		return nil, nil
	}

	allowAll := false
	toolNames := map[string]struct{}{}
	for _, entry := range profile.ToolAllowlist {
		normalized := strings.TrimSpace(entry)
		if normalized == "" {
			return nil, fmt.Errorf("toolAllowlist entries must be non-empty strings")
		}
		if strings.HasPrefix(normalized, "mcp__") {
			normalized = strings.TrimPrefix(normalized, "mcp__")
		}
		if strings.Contains(normalized, mcpx.ToolNameSeparator) {
			serverID, toolName, ok := mcpx.SplitNamespacedToolName(normalized)
			if !ok || strings.TrimSpace(serverID) == "" || strings.TrimSpace(toolName) == "" {
				return nil, fmt.Errorf("invalid tool allowlist entry %q", entry)
			}
			if serverID != mcpx.DefaultServerID {
				return nil, fmt.Errorf("external tool allowlist only supports MCP server %q: %s", mcpx.DefaultServerID, entry)
			}
			toolNames[toolName] = struct{}{}
			continue
		}
		if normalized == mcpx.DefaultServerID {
			allowAll = true
			continue
		}
		toolNames[normalized] = struct{}{}
	}
	if allowAll {
		return &codexToolAllowlist{allowAll: true}, nil
	}
	if len(toolNames) == 0 {
		return nil, nil
	}
	toolNames["set_agentic_context"] = struct{}{}
	if completionGuardEnabled {
		toolNames["report_completion_status"] = struct{}{}
	}
	resolved := make([]string, 0, len(toolNames))
	for toolName := range toolNames {
		resolved = append(resolved, toolName)
	}
	sort.Strings(resolved)
	return &codexToolAllowlist{
		toolNames: resolved,
	}, nil
}

func (e *CodexExecutor) buildCodexMCPHeaders(request StartRequest) (map[string]string, error) {
	headers := map[string]string{}
	if e != nil && e.currentSession != nil {
		cookieName, err := auth.CookieName(e.authCookieBaseName, e.currentSession.Metadata.ID)
		if err != nil {
			return nil, err
		}
		cookieValue, err := auth.NewAuthCookieManager(auth.DefaultAuthCookieTTL).Mint(
			e.currentSession.Metadata.ID,
			e.currentSession.Secret,
			e.timeNow(),
		)
		if err != nil {
			return nil, err
		}
		headers["Cookie"] = cookieName + "=" + cookieValue
	}
	if projectConfigID := strings.TrimSpace(request.ProjectConfigID); projectConfigID != "" {
		headers[mcpx.AgenticContextProjectConfigIDHeader] = projectConfigID
	}
	if chatID := strings.TrimSpace(request.ChatID); chatID != "" {
		headers[mcpx.AgenticContextChatIDHeader] = chatID
	}
	if runID := strings.TrimSpace(request.Run.ID); runID != "" {
		headers[mcpx.AgenticContextRunIDHeader] = runID
	}
	if sectionID := strings.TrimSpace(derefOptionalString(request.SectionID)); sectionID != "" {
		headers[mcpx.AgenticContextSectionIDHeader] = sectionID
	}
	if frontendAffinityToken := strings.TrimSpace(stringValue(request.Inputs["frontendAffinityToken"])); frontendAffinityToken != "" {
		headers[mcpx.AgenticContextFrontendAffinityHeader] = frontendAffinityToken
	}
	if boolValue(request.Inputs["allowUnscoped"]) {
		headers[mcpx.AgenticContextAllowUnscopedHeader] = "true"
	}
	return headers, nil
}

func copyCodexAuthFile(baseAuthDir string, runtimeHome string) error {
	if strings.TrimSpace(baseAuthDir) == "" {
		return nil
	}
	source := filepath.Join(baseAuthDir, "auth.json")
	if _, err := os.Stat(source); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("stat codex auth file: %w", err)
	}
	destination := filepath.Join(runtimeHome, "auth.json")
	if _, err := os.Stat(destination); err == nil {
		return nil
	}
	content, err := os.ReadFile(source)
	if err != nil {
		return fmt.Errorf("read codex auth file: %w", err)
	}
	if err := os.WriteFile(destination, content, 0o600); err != nil {
		return fmt.Errorf("write codex auth file: %w", err)
	}
	return nil
}

func isCodexApprovalRequest(payload map[string]any) bool {
	method := strings.TrimSpace(stringValue(payload["method"]))
	return strings.HasSuffix(method, "/requestApproval")
}

func buildCodexApprovalState(request StartRequest, payload map[string]any) (ApprovalState, map[string]any, error) {
	approvalID := strings.TrimSpace(codexApprovalID(payload["id"]))
	if approvalID == "" {
		return ApprovalState{}, nil, fmt.Errorf("codex approval request missing id")
	}
	item, _ := approvalItem(payload)
	toolName := strings.TrimSpace(stringValue(item["type"]))
	arguments := map[string]any{
		"approvalId": approvalID,
		"toolName":   toolName,
		"tool":       toolName,
	}
	inputPayload := map[string]any{}
	for key, value := range item {
		switch key {
		case "id", "type", "status":
			continue
		default:
			inputPayload[key] = deepCloneJSONValue(value)
		}
	}
	arguments["input"] = inputPayload
	if command := strings.TrimSpace(stringValue(item["command"])); command != "" {
		arguments["command"] = command
	}
	if diff := strings.TrimSpace(stringValue(item["diff"])); diff != "" {
		arguments["diff"] = diff
	}
	return ApprovalState{
		ApprovalID:      approvalID,
		RunID:           request.Run.ID,
		ProjectConfigID: request.ProjectConfigID,
		ChatID:          request.ChatID,
		SectionID:       cloneOptionalString(request.SectionID),
	}, arguments, nil
}

func approvalItem(payload map[string]any) (map[string]any, bool) {
	params, ok := mapValue(payload["params"])
	if !ok {
		return nil, false
	}
	item, ok := mapValue(params["item"])
	return item, ok
}

func codexApprovalID(raw any) string {
	switch value := raw.(type) {
	case string:
		return value
	case float64:
		if value == float64(int64(value)) {
			return strconv.FormatInt(int64(value), 10)
		}
	case int:
		return strconv.Itoa(value)
	case int64:
		return strconv.FormatInt(value, 10)
	}
	return ""
}

func extractCodexResponseItemText(payload map[string]any) string {
	rawContent, ok := payload["content"].([]any)
	if !ok {
		return ""
	}
	lines := []string{}
	for _, rawEntry := range rawContent {
		entry, ok := rawEntry.(map[string]any)
		if !ok {
			continue
		}
		entryType := strings.TrimSpace(stringValue(entry["type"]))
		switch entryType {
		case "", "text", "output_text":
			if text := strings.TrimSpace(stringValue(entry["text"])); text != "" {
				lines = append(lines, text)
			}
		}
	}
	return strings.Join(lines, "\n")
}

func extractCodexMessageText(item map[string]any) string {
	if text := strings.TrimSpace(stringValue(item["text"])); text != "" {
		return text
	}
	rawContent, ok := item["content"].([]any)
	if !ok {
		return ""
	}
	lines := []string{}
	for _, rawEntry := range rawContent {
		entry, ok := rawEntry.(map[string]any)
		if !ok {
			continue
		}
		if text := strings.TrimSpace(stringValue(entry["text"])); text != "" {
			lines = append(lines, text)
		}
	}
	return strings.Join(lines, "\n")
}

func appendAssistantDelta(state *ChatState, messageID string, delta string) {
	index := findMessageIndex(state.Messages, messageID)
	if index == -1 {
		state.Messages = append(state.Messages, map[string]any{
			"id":      messageID,
			"role":    "assistant",
			"content": []any{map[string]any{"type": "text", "text": delta}},
		})
		return
	}
	message := cloneMessageOrPanic(state.Messages[index])
	content, _ := message["content"].([]any)
	if len(content) == 0 {
		message["content"] = []any{map[string]any{"type": "text", "text": delta}}
		state.Messages[index] = message
		return
	}
	lastEntry, ok := content[len(content)-1].(map[string]any)
	if !ok {
		content = append(content, map[string]any{"type": "text", "text": delta})
		message["content"] = content
		state.Messages[index] = message
		return
	}
	if strings.TrimSpace(stringValue(lastEntry["type"])) != "text" {
		content = append(content, map[string]any{"type": "text", "text": delta})
		message["content"] = content
		state.Messages[index] = message
		return
	}
	lastEntry = cloneAnyMap(lastEntry)
	lastEntry["text"] = stringValue(lastEntry["text"]) + delta
	content[len(content)-1] = lastEntry
	message["content"] = content
	state.Messages[index] = message
}

func upsertAssistantMessage(state *ChatState, messageID string, text string) {
	message := map[string]any{
		"id":      messageID,
		"role":    "assistant",
		"content": []any{},
	}
	if text != "" {
		message["content"] = []any{map[string]any{"type": "text", "text": text}}
	}
	index := findMessageIndex(state.Messages, messageID)
	if index == -1 {
		state.Messages = append(state.Messages, message)
		return
	}
	existing := cloneMessageOrPanic(state.Messages[index])
	if rawToolCalls, ok := existing["tool_calls"]; ok {
		message["tool_calls"] = deepCloneJSONValue(rawToolCalls)
	}
	state.Messages[index] = message
}

func appendApprovalRequestMessage(state *ChatState, approvalID string, arguments map[string]any) {
	if state.ToolCallArguments == nil {
		state.ToolCallArguments = map[string]string{}
	}
	if encoded, err := json.Marshal(arguments); err == nil {
		state.ToolCallArguments[approvalID] = string(encoded)
	}
	upsertApprovalMessage(state, approvalID, arguments)
}

func appendApprovalResultMessage(state *ChatState, approvalID string, approved bool) {
	if state.ToolCallArguments != nil {
		delete(state.ToolCallArguments, approvalID)
	}
	state.Messages = append(state.Messages, map[string]any{
		"id":           "tool-result-" + approvalID,
		"role":         "tool",
		"tool_call_id": approvalID,
		"tool_name":    codexApprovalToolName,
		"arguments":    map[string]any{},
		"result": map[string]any{
			"approved": approved,
		},
		"content": []any{
			map[string]any{
				"type": "text",
				"text": approvalDecisionText(approved),
			},
		},
		"is_error": !approved,
	})
}

func upsertApprovalMessage(state *ChatState, approvalID string, arguments map[string]any) {
	message := map[string]any{
		"id":      approvalID,
		"role":    "assistant",
		"content": []any{},
		"tool_calls": []any{
			map[string]any{
				"id": approvalID,
				"function": map[string]any{
					"name":      codexApprovalToolName,
					"arguments": cloneAnyMap(arguments),
				},
			},
		},
	}
	index := findMessageIndex(state.Messages, approvalID)
	if index == -1 {
		state.Messages = append(state.Messages, message)
		return
	}
	state.Messages[index] = message
}

func approvalDecisionText(approved bool) string {
	if approved {
		return "Approved"
	}
	return "Denied"
}

func extractThreadID(payload map[string]any) string {
	if payload == nil {
		return ""
	}
	for _, key := range []string{"threadId", "thread_id"} {
		if value := strings.TrimSpace(stringValue(payload[key])); value != "" {
			return value
		}
	}
	if thread, ok := mapValue(payload["thread"]); ok {
		for _, key := range []string{"id", "threadId"} {
			if value := strings.TrimSpace(stringValue(thread[key])); value != "" {
				return value
			}
		}
	}
	return ""
}

func responsePayloadID(payload map[string]any) (int, bool) {
	if _, hasMethod := payload["method"]; hasMethod {
		return 0, false
	}
	rawID, ok := payload["id"]
	if !ok {
		return 0, false
	}
	switch value := rawID.(type) {
	case float64:
		return int(value), true
	case int:
		return value, true
	case int64:
		return int(value), true
	default:
		return 0, false
	}
}

func findMessageIndex(messages []map[string]any, targetID string) int {
	for index, message := range messages {
		messageID, err := messageID(message)
		if err == nil && messageID == targetID {
			return index
		}
	}
	return -1
}

func mapCodexApprovalPolicy(preferred string, fallback string) string {
	raw := strings.TrimSpace(preferred)
	if raw == "" {
		raw = strings.TrimSpace(fallback)
	}
	if raw == "" {
		return ""
	}
	normalizedKey := strings.ToLower(strings.ReplaceAll(raw, "_", "-"))
	switch normalizedKey {
	case "unlesstrusted", "unless-trusted", "untrusted":
		return "untrusted"
	case "onrequested", "on-requested", "onrequest", "on-request":
		return "on-request"
	case "onfailure", "on-failure":
		return "on-failure"
	default:
		return raw
	}
}

func buildCodexSandboxPolicy(preferred string, fallback string) map[string]any {
	raw := strings.TrimSpace(preferred)
	if raw == "" {
		raw = strings.TrimSpace(fallback)
	}
	if raw == "" {
		return nil
	}
	switch strings.ToLower(strings.ReplaceAll(raw, "_", "-")) {
	case "workspace-write":
		return map[string]any{"type": "workspaceWrite"}
	case "read-only":
		return map[string]any{"type": "readOnly"}
	case "danger-full-access":
		return map[string]any{"type": "dangerFullAccess"}
	case "external":
		return map[string]any{"type": "externalSandbox"}
	default:
		return map[string]any{"type": raw}
	}
}

func ensureAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return map[string]any{}
	}
	return cloneAnyMap(input)
}

func ensureAnyMapFromValue(value any) map[string]any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneAnyMap(typed)
	case map[string]string:
		converted := map[string]any{}
		for key, item := range typed {
			converted[key] = item
		}
		return converted
	default:
		return map[string]any{}
	}
}

func cloneStringAnyMapToStringMap(input map[string]string) map[string]string {
	if input == nil {
		return map[string]string{}
	}
	cloned := map[string]string{}
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func envMapToList(envMap map[string]string) []string {
	envList := make([]string, 0, len(envMap))
	for key, value := range envMap {
		envList = append(envList, key+"="+value)
	}
	return envList
}

func stringValue(raw any) string {
	if value, ok := raw.(string); ok {
		return value
	}
	return ""
}

func mapValue(raw any) (map[string]any, bool) {
	value, ok := raw.(map[string]any)
	return value, ok
}

func envWhitelistContains(whitelist []string, target string) bool {
	for _, entry := range whitelist {
		if strings.EqualFold(strings.TrimSpace(entry), target) {
			return true
		}
	}
	return false
}
