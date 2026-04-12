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
	"runtime"
	"strings"
	"sync"
	"time"

	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/externalagentconfigs"
	"setta/internal/mcpx"
)

const (
	claudeSidecarFileName       = "claude_sdk_runner.py"
	claudeMCPConfigName         = ".mcp.json"
	claudeDefaultThinkingBudget = 1024
	claudeMaxStderrLines        = 200
	claudeStdoutBufferSize      = 1024 * 1024
)

var (
	errClaudeExecutorRunStoreRequired      = errors.New("claude executor run store is required")
	errClaudeExecutorRuntimeRequired       = errors.New("claude executor runtime is required")
	errClaudeExecutorWorkspaceRootRequired = errors.New("claude executor workspace root is required")
	errClaudeExecutorSettaServerURLMissing = errors.New("claude executor setta server url is required")
	errClaudeExecutorSidecarRequired       = errors.New("claude executor sidecar path is required")
	errClaudeExecutorPythonRequired        = errors.New("claude executor python command is required")
)

type ClaudeExecutorOptions struct {
	Runs               *agentruns.RunStore
	Runtime            *Runtime
	WorkspaceRoot      string
	SettaServerURL     string
	CurrentSession     *auth.CurrentSession
	AuthCookieBaseName string
	RuntimeRoot        string
	ProcessEnv         map[string]string
	PythonCommand      string
	SidecarPath        string
	TimeNow            func() time.Time
}

type ClaudeExecutor struct {
	runs               *agentruns.RunStore
	runtime            *Runtime
	workspaceRoot      string
	settaServerURL     string
	currentSession     *auth.CurrentSession
	authCookieBaseName string
	runtimeRoot        string
	processEnv         map[string]string
	pythonCommand      string
	sidecarPath        string
	timeNow            func() time.Time
}

type claudeResultPayload struct {
	SessionID string
	Result    string
	IsError   bool
	Usage     map[string]any
}

func NewClaudeExecutor(options ClaudeExecutorOptions) (*ClaudeExecutor, error) {
	if options.Runs == nil {
		return nil, errClaudeExecutorRunStoreRequired
	}
	if options.Runtime == nil {
		return nil, errClaudeExecutorRuntimeRequired
	}
	workspaceRoot := strings.TrimSpace(options.WorkspaceRoot)
	if workspaceRoot == "" {
		return nil, errClaudeExecutorWorkspaceRootRequired
	}
	settaServerURL := strings.TrimSpace(options.SettaServerURL)
	if settaServerURL == "" {
		return nil, errClaudeExecutorSettaServerURLMissing
	}
	sidecarPath, err := resolveClaudeSidecarPath(options.SidecarPath)
	if err != nil {
		return nil, err
	}
	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	return &ClaudeExecutor{
		runs:               options.Runs,
		runtime:            options.Runtime,
		workspaceRoot:      workspaceRoot,
		settaServerURL:     settaServerURL,
		currentSession:     cloneCurrentSession(options.CurrentSession),
		authCookieBaseName: auth.NormalizeCookieBaseName(options.AuthCookieBaseName),
		runtimeRoot:        strings.TrimSpace(options.RuntimeRoot),
		processEnv:         cloneStringAnyMapToStringMap(options.ProcessEnv),
		pythonCommand:      strings.TrimSpace(options.PythonCommand),
		sidecarPath:        sidecarPath,
		timeNow:            timeNow,
	}, nil
}

func resolveClaudeSidecarPath(explicitPath string) (string, error) {
	if strings.TrimSpace(explicitPath) != "" {
		resolved, err := filepath.Abs(strings.TrimSpace(explicitPath))
		if err != nil {
			return "", fmt.Errorf("resolve claude sidecar path: %w", err)
		}
		if _, err := os.Stat(resolved); err != nil {
			return "", fmt.Errorf("stat claude sidecar path: %w", err)
		}
		return resolved, nil
	}
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return "", errClaudeExecutorSidecarRequired
	}
	resolved := filepath.Clean(filepath.Join(
		filepath.Dir(currentFile),
		"..",
		"..",
		"backend",
		"setta",
		"agentic",
		"external_adapters",
		"sidecars",
		claudeSidecarFileName,
	))
	if _, err := os.Stat(resolved); err != nil {
		return "", fmt.Errorf("stat default claude sidecar path: %w", err)
	}
	return resolved, nil
}

func (e *ClaudeExecutor) Start(ctx context.Context, request StartRequest) (StartResponse, error) {
	if e == nil {
		return StartResponse{}, ErrExecutorUnavailable
	}
	if request.ExternalConfig.ToolType != externalagentconfigs.ToolTypeClaudeCode || request.ExternalConfig.RunMode != externalagentconfigs.RunModeSDK {
		return StartResponse{}, ErrExecutorUnavailable
	}
	resources, err := e.prepareClaudeStartResources(&request)
	if err != nil {
		return StartResponse{}, err
	}
	session, err := e.launchClaudeSession(request, resources)
	if err != nil {
		resources.cleanupStartup()
		return StartResponse{}, err
	}
	controller := &claudeRunController{
		session:      session,
		runtimeReady: make(chan struct{}),
		cancelled:    make(chan struct{}),
	}
	go e.runLoop(request, session, controller, resources.cleanupPaths)
	return StartResponse{Controller: controller}, nil
}

type claudeStartResources struct {
	workingDir     string
	envMap         map[string]string
	cleanupPaths   []string
	cleanupStartup func()
}

func (e *ClaudeExecutor) prepareClaudeStartResources(request *StartRequest) (claudeStartResources, error) {
	workingDir, cleanupWorkingDir, err := e.resolveWorkingDir(request.ExternalConfig)
	if err != nil {
		return claudeStartResources{}, err
	}
	resources := claudeStartResources{
		workingDir:     workingDir,
		envMap:         e.buildRuntimeEnv(request.ExternalConfig),
		cleanupStartup: func() {},
	}
	if cleanupWorkingDir != nil {
		resources.cleanupPaths = append(resources.cleanupPaths, workingDir)
		resources.cleanupStartup = func() {
			_ = cleanupWorkingDir()
		}
	}
	if err := e.prepareClaudeSettings(request.ExternalConfig); err != nil {
		resources.cleanupStartup()
		return claudeStartResources{}, err
	}
	cleanupMCPDir, err := e.ensureClaudeMCPConfig(request)
	if err != nil {
		resources.cleanupStartup()
		return claudeStartResources{}, err
	}
	if strings.TrimSpace(cleanupMCPDir) != "" {
		resources.cleanupPaths = append(resources.cleanupPaths, cleanupMCPDir)
		previousCleanup := resources.cleanupStartup
		resources.cleanupStartup = func() {
			previousCleanup()
			_ = os.RemoveAll(cleanupMCPDir)
		}
	}
	return resources, nil
}

func (e *ClaudeExecutor) resolveClaudePythonCommand() (string, error) {
	pythonCommand := strings.TrimSpace(e.pythonCommand)
	if pythonCommand != "" {
		return pythonCommand, nil
	}
	resolved, err := externalagentconfigs.ResolveClaudePythonCommand()
	if err != nil {
		return "", fmt.Errorf("%w: %v", errClaudeExecutorPythonRequired, err)
	}
	return resolved, nil
}

func (e *ClaudeExecutor) launchClaudeSession(
	request StartRequest,
	resources claudeStartResources,
) (*claudeSession, error) {
	pythonCommand, err := e.resolveClaudePythonCommand()
	if err != nil {
		return nil, err
	}
	cmd := exec.Command(pythonCommand, e.sidecarPath)
	cmd.Dir = resources.workingDir
	cmd.Env = envMapToList(resources.envMap)
	stdin, stdout, stderr, err := openClaudePipes(cmd)
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start claude sidecar: %w", err)
	}
	session := newClaudeSession(cmd, stdin)
	session.start(stdout, stderr)
	if err := session.writeJSON(buildClaudeStartPayload(request, resources.workingDir, resources.envMap)); err != nil {
		_ = session.terminate()
		return nil, err
	}
	return session, nil
}

func openClaudePipes(cmd *exec.Cmd) (io.WriteCloser, io.ReadCloser, io.ReadCloser, error) {
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("claude stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("claude stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("claude stderr pipe: %w", err)
	}
	return stdin, stdout, stderr, nil
}

func (e *ClaudeExecutor) runLoop(
	request StartRequest,
	session *claudeSession,
	controller *claudeRunController,
	cleanupPaths []string,
) {
	defer e.finishClaudeRunLoop(request.Run.ID, controller, cleanupPaths)
	loopState, ready, err := e.prepareClaudeRunLoop(request, session, controller)
	if !ready {
		return
	}
	if err != nil {
		_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		return
	}
	for {
		done, err := e.processClaudeRunLoopEvent(request, session, loopState)
		if err != nil {
			_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
			return
		}
		if done {
			return
		}
	}
}

type claudeLoopState struct {
	chatState ChatState
	sessionID string
	parser    *claudeEventParser
	result    *claudeResultPayload
}

func (e *ClaudeExecutor) finishClaudeRunLoop(
	runID string,
	controller *claudeRunController,
	cleanupPaths []string,
) {
	_ = controller.Cancel()
	for _, cleanupPath := range cleanupPaths {
		if strings.TrimSpace(cleanupPath) == "" {
			continue
		}
		_ = os.RemoveAll(cleanupPath)
	}
	e.runtime.DeactivateRun(runID)
}

func (e *ClaudeExecutor) prepareClaudeRunLoop(
	request StartRequest,
	session *claudeSession,
	controller *claudeRunController,
) (*claudeLoopState, bool, error) {
	if !controller.waitForRuntimeReady() {
		return nil, false, nil
	}
	if err := e.seedClaudeMCPStatuses(request.Run.ID, stringValue(request.Inputs["mcpConfig"])); err != nil && !errors.Is(err, ErrRunNotActive) {
		return nil, true, err
	}
	sessionID := strings.TrimSpace(stringValue(request.Inputs["sessionId"]))
	state, err := e.loadCurrentChatState(request.Run)
	if err != nil {
		return nil, true, err
	}
	if err := e.persistLiveState(request.Run.ID, state, sessionID, nil); err != nil {
		return nil, true, err
	}
	return &claudeLoopState{
		chatState: state,
		sessionID: sessionID,
		parser:    newClaudeEventParser(e.runtime, request),
	}, true, nil
}

func (e *ClaudeExecutor) processClaudeRunLoopEvent(
	request StartRequest,
	session *claudeSession,
	loopState *claudeLoopState,
) (bool, error) {
	payload, ok := <-session.events
	if !ok {
		return true, e.handleProcessExit(
			request.Run.ID,
			session.processErr(),
			session.stderrTail(),
			loopState.chatState,
			loopState.sessionID,
			loopState.result,
			boolValue(request.Inputs["completionGuardEnabled"]),
		)
	}
	e.refreshClaudeRunLoopState(request.Run.ID, payload, loopState)
	changed, nextResult, err := e.handleEvent(request, loopState.parser, payload, &loopState.chatState)
	if err != nil {
		return false, err
	}
	loopState.applyResult(nextResult)
	if !changed {
		return false, nil
	}
	return false, e.persistLiveState(request.Run.ID, loopState.chatState, loopState.sessionID, nil)
}

func (e *ClaudeExecutor) refreshClaudeRunLoopState(
	runID string,
	payload map[string]any,
	loopState *claudeLoopState,
) {
	if currentLiveState, err := e.runtime.GetLiveChatState(runID); err == nil && currentLiveState != nil {
		loopState.chatState = *currentLiveState.Clone()
	}
	if nextSessionID := extractClaudeSessionID(payload); nextSessionID != "" {
		loopState.sessionID = nextSessionID
	}
}

func (loopState *claudeLoopState) applyResult(result *claudeResultPayload) {
	if result == nil {
		return
	}
	loopState.result = result
	if result.SessionID != "" {
		loopState.sessionID = result.SessionID
	}
}

func (e *ClaudeExecutor) handleEvent(
	request StartRequest,
	parser *claudeEventParser,
	payload map[string]any,
	state *ChatState,
) (bool, *claudeResultPayload, error) {
	switch strings.TrimSpace(stringValue(payload["type"])) {
	case "approval_request":
		changed, err := e.handleApprovalRequestEvent(request, parser, payload, state)
		return changed, nil, err
	case "stream_event":
		return e.handleStreamEventEnvelope(request.Run.ID, parser, payload, state)
	case "assistant_message":
		return e.handleAssistantMessageEvent(request.Run.ID, parser, payload, state)
	case "system_message":
		return false, nil, e.handleSystemMessageEvent(request.Run.ID, payload)
	case "result":
		return false, extractClaudeResult(payload), nil
	case "error":
		return false, nil, claudeEventError(payload)
	default:
		return false, nil, nil
	}
}

func (e *ClaudeExecutor) handleApprovalRequestEvent(
	request StartRequest,
	parser *claudeEventParser,
	payload map[string]any,
	state *ChatState,
) (bool, error) {
	approvalID := strings.TrimSpace(stringValue(payload["approvalId"]))
	if approvalID == "" {
		return false, fmt.Errorf("claude approval request missing approvalId")
	}
	toolName := normalizeClaudeToolName(stringValue(payload["toolName"]))
	if toolName == askUserQuestionToolName {
		return false, e.queueQuestionApprovalRequest(request.Run.ID, parser, approvalID, payload)
	}
	return e.registerApprovalRequestEvent(request, approvalID, payload, state)
}

func (e *ClaudeExecutor) queueQuestionApprovalRequest(
	runID string,
	parser *claudeEventParser,
	approvalID string,
	payload map[string]any,
) error {
	if err := parser.queueQuestionApproval(approvalID); err != nil {
		return err
	}
	return e.persistApprovalRequestEvent(runID, approvalID, payload)
}

func (e *ClaudeExecutor) registerApprovalRequestEvent(
	request StartRequest,
	approvalID string,
	payload map[string]any,
	state *ChatState,
) (bool, error) {
	approvalState := ApprovalState{
		ApprovalID:      approvalID,
		RunID:           request.Run.ID,
		ProjectConfigID: request.ProjectConfigID,
		ChatID:          request.ChatID,
		SectionID:       cloneOptionalString(request.SectionID),
	}
	if err := e.runtime.RegisterApproval(approvalState); err != nil {
		return false, err
	}
	appendApprovalRequestMessage(state, approvalID, buildClaudeApprovalArguments(payload))
	if err := e.persistApprovalRequestEvent(request.Run.ID, approvalID, payload); err != nil {
		return true, err
	}
	return true, nil
}

func (e *ClaudeExecutor) handleStreamEventEnvelope(
	runID string,
	parser *claudeEventParser,
	payload map[string]any,
	state *ChatState,
) (bool, *claudeResultPayload, error) {
	eventPayload, ok := mapValue(payload["event"])
	if !ok {
		return false, nil, nil
	}
	changed, err := parser.handleStreamEvent(eventPayload, state)
	return e.finishParsedClaudeEvent(runID, parser, changed, err)
}

func (e *ClaudeExecutor) handleAssistantMessageEvent(
	runID string,
	parser *claudeEventParser,
	payload map[string]any,
	state *ChatState,
) (bool, *claudeResultPayload, error) {
	messagePayload, ok := mapValue(payload["message"])
	if !ok {
		return false, nil, nil
	}
	changed, err := parser.handleAssistantMessage(messagePayload, state)
	return e.finishParsedClaudeEvent(runID, parser, changed, err)
}

func (e *ClaudeExecutor) finishParsedClaudeEvent(
	runID string,
	parser *claudeEventParser,
	changed bool,
	err error,
) (bool, *claudeResultPayload, error) {
	if err != nil {
		return changed, nil, err
	}
	return e.persistClaudeToolResults(runID, parser.takeToolResults(), changed)
}

func (e *ClaudeExecutor) handleSystemMessageEvent(runID string, payload map[string]any) error {
	statuses := buildClaudeMCPStatuses(payload, e.timeNow)
	if len(statuses) == 0 {
		return nil
	}
	if err := e.runtime.UpsertMCPStatuses(runID, statuses); err != nil && !errors.Is(err, ErrRunNotActive) {
		return err
	}
	return nil
}

func claudeEventError(payload map[string]any) error {
	message := strings.TrimSpace(stringValue(payload["message"]))
	if message == "" {
		message = "claude sidecar reported an error"
	}
	return errors.New(message)
}

func (e *ClaudeExecutor) persistApprovalRequestEvent(runID string, approvalID string, payload map[string]any) error {
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	appendRunEvent(&run, "approval_request", map[string]any{
		"approvalId": approvalID,
		"payload":    cloneAnyMap(payload),
	}, e.timeNow())
	return e.runs.Save(run)
}

func (e *ClaudeExecutor) handleProcessExit(
	runID string,
	processErr error,
	stderrLines []string,
	state ChatState,
	sessionID string,
	result *claudeResultPayload,
	completionGuardEnabled bool,
) error {
	if processErr != nil {
		return e.markRunFailed(runID, processErr, stderrLines)
	}
	if result != nil && result.IsError {
		message := strings.TrimSpace(result.Result)
		if message == "" {
			message = "Claude SDK run failed"
		}
		return e.markRunFailed(runID, errors.New(message), stderrLines)
	}
	var usage map[string]any
	if result != nil && result.Usage != nil {
		usage = cloneAnyMap(result.Usage)
	}
	applyCompletionGuardToState(&state, completionGuardEnabled)
	return e.finalizeRun(runID, state, sessionID, usage)
}

func (e *ClaudeExecutor) finalizeRun(runID string, state ChatState, sessionID string, usage map[string]any) error {
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	if run.Status == agentruns.RunStatusCancelled {
		return nil
	}
	run.Outputs = ensureAnyMap(run.Outputs)
	run.Outputs["messages"] = messageSliceToJSONList(state.Messages)
	run.Outputs["toolCallArguments"] = cloneStringMap(state.ToolCallArguments)
	if strings.TrimSpace(sessionID) != "" {
		run.Outputs["sessionId"] = sessionID
	}
	if len(usage) > 0 {
		run.Outputs["usage"] = deepCloneJSONValue(usage)
	}
	finishedAt := e.timeNow().UTC()
	run.Status = agentruns.RunStatusCompleted
	run.FinishedAt = &finishedAt
	e.runtime.attachMCPStatusSnapshot(&run)
	appendRunEvent(&run, "run_completed", map[string]any{}, finishedAt)
	return e.runs.Save(run)
}

func (e *ClaudeExecutor) markRunFailed(runID string, runErr error, stderrLines []string) error {
	_, err := persistExternalAgentRunFailure(
		e.runs,
		e.runtime,
		e.timeNow,
		runID,
		runErr,
		stderrLines,
	)
	return err
}

func (e *ClaudeExecutor) persistLiveState(runID string, state ChatState, sessionID string, usage map[string]any) error {
	if err := e.runtime.SetLiveChatState(runID, state); err != nil {
		return err
	}
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	run.Outputs = ensureAnyMap(run.Outputs)
	run.Outputs["messages"] = messageSliceToJSONList(state.Messages)
	run.Outputs["toolCallArguments"] = cloneStringMap(state.ToolCallArguments)
	if strings.TrimSpace(sessionID) != "" {
		run.Outputs["sessionId"] = sessionID
	}
	if len(usage) > 0 {
		run.Outputs["usage"] = deepCloneJSONValue(usage)
	}
	return e.runs.Save(run)
}

func (e *ClaudeExecutor) persistClaudeToolResults(
	runID string,
	toolResults []claudeToolResultMetadata,
	changed bool,
) (bool, *claudeResultPayload, error) {
	if len(toolResults) == 0 {
		return changed, nil, nil
	}
	run, err := e.runs.Load(runID)
	if err != nil {
		return changed, nil, err
	}
	for _, toolResult := range toolResults {
		appendRunEvent(&run, "tool_result", map[string]any{
			"toolCallId": toolResult.ToolCallID,
			"toolName":   toolResult.ToolName,
			"result":     deepCloneJSONValue(toolResult.Result),
			"isError":    toolResult.IsError,
		}, e.timeNow())
	}
	if err := e.runs.Save(run); err != nil {
		return changed, nil, err
	}
	return changed, nil, nil
}

func (e *ClaudeExecutor) seedClaudeMCPStatuses(runID string, configPath string) error {
	return e.runtime.UpsertMCPStatuses(runID, buildUnknownClaudeMCPStatuses(configPath))
}

func (e *ClaudeExecutor) loadCurrentChatState(run agentruns.Run) (ChatState, error) {
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

func (e *ClaudeExecutor) resolveWorkingDir(config externalagentconfigs.Config) (string, func() error, error) {
	switch config.WorkingDirStrategy {
	case externalagentconfigs.WorkingDirStrategyTempDir:
		root, err := os.MkdirTemp("", "setta-claude-")
		if err != nil {
			return "", nil, fmt.Errorf("create claude temp working dir: %w", err)
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
			return "", nil, fmt.Errorf("create claude custom working dir: %w", err)
		}
		return path, nil, nil
	default:
		return e.workspaceRoot, nil, nil
	}
}

func (e *ClaudeExecutor) buildRuntimeEnv(config externalagentconfigs.Config) map[string]string {
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

func (e *ClaudeExecutor) prepareClaudeSettings(config externalagentconfigs.Config) error {
	return externalagentconfigs.PrepareClaudeSettings(e.workspaceRoot, config)
}

func (e *ClaudeExecutor) ensureClaudeMCPConfig(request *StartRequest) (string, error) {
	if request == nil {
		return "", nil
	}
	if request.Inputs == nil {
		request.Inputs = map[string]any{}
	}
	if strings.TrimSpace(stringValue(request.Inputs["mcpConfig"])) != "" {
		return "", nil
	}
	configDir, err := os.MkdirTemp("", "setta-claude-mcp-")
	if err != nil {
		return "", fmt.Errorf("create claude mcp config dir: %w", err)
	}
	configPath := filepath.Join(configDir, claudeMCPConfigName)
	serverEntry := map[string]any{
		"type": "sse",
		"url":  e.settaServerURL,
	}
	headers, err := e.buildClaudeMCPHeaders(*request)
	if err != nil {
		_ = os.RemoveAll(configDir)
		return "", err
	}
	if len(headers) > 0 {
		serverEntry["headers"] = headers
	}
	content, err := json.MarshalIndent(map[string]any{
		"mcpServers": map[string]any{
			mcpx.DefaultServerID: serverEntry,
		},
	}, "", "  ")
	if err != nil {
		_ = os.RemoveAll(configDir)
		return "", fmt.Errorf("encode claude mcp config: %w", err)
	}
	content = append(content, '\n')
	if err := os.WriteFile(configPath, content, 0o644); err != nil {
		_ = os.RemoveAll(configDir)
		return "", fmt.Errorf("write claude mcp config: %w", err)
	}
	request.Inputs["mcpConfig"] = configPath
	return configDir, nil
}

func (e *ClaudeExecutor) buildClaudeMCPHeaders(request StartRequest) (map[string]string, error) {
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

func cloneCurrentSession(currentSession *auth.CurrentSession) *auth.CurrentSession {
	if currentSession == nil {
		return nil
	}
	cloned := *currentSession
	cloned.Metadata = currentSession.Metadata
	cloned.Secret = append([]byte(nil), currentSession.Secret...)
	return &cloned
}

func buildClaudeStartPayload(request StartRequest, workingDir string, envMap map[string]string) map[string]any {
	payload := map[string]any{
		"type":   "start",
		"prompt": buildClaudePrompt(request.Inputs),
		"cwd":    workingDir,
		"env":    cloneStringAnyMapToStringMap(envMap),
	}
	populateClaudeStartPayload(payload, request)
	return payload
}

func populateClaudeStartPayload(payload map[string]any, request StartRequest) {
	setOptionalStringPayloadField(payload, "cliPath", strings.TrimSpace(derefOptionalString(request.ExternalConfig.CommandPath)))
	setOptionalStringPayloadField(payload, "systemPrompt", strings.TrimSpace(stringValue(request.Inputs["systemPrompt"])))
	setOptionalStringPayloadField(payload, "model", resolveClaudeModel(request))
	setOptionalStringPayloadField(payload, "resume", strings.TrimSpace(stringValue(request.Inputs["sessionId"])))
	setOptionalStringSlicePayloadField(payload, "settingSources", resolveClaudeSettingSources(request.ExternalConfig))
	setOptionalClaudePolicyFields(payload, request)
	setOptionalStringSlicePayloadField(payload, "allowedTools", extractClaudeAllowedTools(request))
	setOptionalIntPayloadField(payload, "maxTurns", resolveClaudeMaxTurns(request.Inputs))
	setOptionalIntPayloadField(payload, "maxThinkingTokens", resolveClaudeThinkingBudget(request.Inputs))
	setOptionalMapPayloadField(payload, "sandbox", buildClaudeSandboxSettings(resolveClaudeSandboxPolicy(request)))
	setOptionalStringPayloadField(payload, "mcpConfigPath", strings.TrimSpace(stringValue(request.Inputs["mcpConfig"])))
}

func setOptionalClaudePolicyFields(payload map[string]any, request StartRequest) {
	policy := resolveClaudeApprovalPolicy(request)
	setOptionalStringPayloadField(payload, "permissionMode", resolveClaudePermissionMode(policy))
	payload["decisionPolicy"] = resolveClaudeDecisionPolicy(policy)
}

func setOptionalStringPayloadField(payload map[string]any, key string, value string) {
	if value == "" {
		return
	}
	payload[key] = value
}

func setOptionalStringSlicePayloadField(payload map[string]any, key string, values []string) {
	if len(values) == 0 {
		return
	}
	payload[key] = append([]string(nil), values...)
}

func setOptionalIntPayloadField(payload map[string]any, key string, value *int) {
	if value == nil {
		return
	}
	payload[key] = *value
}

func setOptionalMapPayloadField(payload map[string]any, key string, value map[string]any) {
	if value == nil {
		return
	}
	payload[key] = value
}

func buildClaudePrompt(inputs map[string]any) string {
	prompt := extractLatestUserPrompt(inputs)
	attachmentText := strings.TrimSpace(stringValue(inputs["attachmentText"]))
	if prompt != "" && attachmentText != "" {
		return prompt + "\n\n" + attachmentText + "\n"
	}
	if prompt != "" {
		return prompt + "\n"
	}
	if attachmentText != "" {
		return attachmentText + "\n"
	}
	return ""
}

func extractLatestUserPrompt(inputs map[string]any) string {
	if inputs == nil {
		return ""
	}
	rawMessages, ok := inputs["messages"].([]any)
	if ok {
		for index := len(rawMessages) - 1; index >= 0; index-- {
			message, ok := rawMessages[index].(map[string]any)
			if !ok {
				continue
			}
			if strings.TrimSpace(stringValue(message["role"])) != "user" {
				continue
			}
			text := extractMessageText(message)
			if text != "" {
				return text
			}
		}
	}
	return strings.TrimSpace(stringValue(inputs["prompt"]))
}

func resolveClaudeModel(request StartRequest) string {
	if request.ExternalConfig.DefaultModel != nil && strings.TrimSpace(*request.ExternalConfig.DefaultModel) != "" {
		return strings.TrimSpace(*request.ExternalConfig.DefaultModel)
	}
	return strings.TrimSpace(stringValue(request.Inputs["model"]))
}

func resolveClaudeSettingSources(config externalagentconfigs.Config) []string {
	if len(config.SettingsSources) > 0 {
		sources := make([]string, 0, len(config.SettingsSources))
		for _, value := range config.SettingsSources {
			sources = append(sources, string(value))
		}
		return sources
	}
	defaults := externalagentconfigs.DefaultClaudeSettingsSources()
	sources := make([]string, 0, len(defaults))
	for _, value := range defaults {
		sources = append(sources, string(value))
	}
	return sources
}

func resolveClaudeApprovalPolicy(request StartRequest) string {
	if override := strings.TrimSpace(stringValue(request.Inputs["approvalPolicy"])); override != "" {
		return override
	}
	return strings.TrimSpace(derefOptionalString(request.ExternalConfig.ApprovalPolicy))
}

func resolveClaudeSandboxPolicy(request StartRequest) string {
	if override := strings.TrimSpace(stringValue(request.Inputs["sandboxPolicy"])); override != "" {
		return override
	}
	return strings.TrimSpace(derefOptionalString(request.ExternalConfig.SandboxPolicy))
}

func resolveClaudePermissionMode(policy string) string {
	return externalagentconfigs.NormalizeClaudeApprovalPolicy(policy)
}

func resolveClaudeDecisionPolicy(policy string) string {
	if strings.TrimSpace(policy) == "" {
		return "ask"
	}
	normalized := strings.ToLower(policy)
	switch {
	case strings.Contains(normalized, "allow"), strings.Contains(normalized, "auto"), strings.Contains(normalized, "bypass"):
		return "allow"
	case strings.Contains(normalized, "deny"), strings.Contains(normalized, "block"):
		return "deny"
	default:
		return "ask"
	}
}

func extractClaudeAllowedTools(request StartRequest) []string {
	if tools := trimmedStringSlice(request.Inputs["allowedTools"]); len(tools) > 0 {
		return tools
	}
	if request.Profile != nil && len(request.Profile.ToolAllowlist) > 0 {
		return append([]string(nil), request.Profile.ToolAllowlist...)
	}
	return nil
}

func trimmedStringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return appendTrimmedStrings(make([]string, 0, len(typed)), typed)
	case []any:
		tools := make([]string, 0, len(typed))
		for _, raw := range typed {
			value, ok := raw.(string)
			if !ok {
				continue
			}
			tools = appendTrimmedString(tools, value)
		}
		return tools
	default:
		return nil
	}
}

func appendTrimmedStrings(dst []string, values []string) []string {
	for _, value := range values {
		dst = appendTrimmedString(dst, value)
	}
	return dst
}

func appendTrimmedString(dst []string, value string) []string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return dst
	}
	return append(dst, trimmed)
}

func resolveClaudeMaxTurns(inputs map[string]any) *int {
	if inputs == nil {
		return nil
	}
	value := parseOptionalNonNegativeInt(inputs["maxTurns"])
	if value == nil {
		value = parseOptionalNonNegativeInt(inputs["max_turns"])
	}
	if value == nil {
		return nil
	}
	if *value < 1 {
		normalized := 1
		return &normalized
	}
	return value
}

func resolveClaudeThinkingBudget(inputs map[string]any) *int {
	if inputs == nil {
		return nil
	}
	if budget, resolved := resolveClaudeThinkingPayload(inputs["thinking"]); resolved {
		return budget
	}
	if budget := parseOptionalNonNegativeInt(inputs["thinkingBudgetTokens"]); budget != nil {
		return budget
	}
	return parseOptionalNonNegativeInt(inputs["thinking_budget_tokens"])
}

func resolveClaudeThinkingPayload(value any) (*int, bool) {
	switch typed := value.(type) {
	case bool:
		if typed {
			return claudeDefaultThinkingBudgetValue(), true
		}
		return nil, true
	case map[string]any:
		return resolveClaudeThinkingBudgetFromMap(typed)
	case string:
		if strings.EqualFold(strings.TrimSpace(typed), "disabled") {
			return nil, true
		}
	}
	return nil, false
}

func resolveClaudeThinkingBudgetFromMap(payload map[string]any) (*int, bool) {
	for _, key := range []string{"budget_tokens", "budgetTokens"} {
		if budget := parseOptionalNonNegativeInt(payload[key]); budget != nil {
			return budget, true
		}
	}
	if strings.EqualFold(strings.TrimSpace(stringValue(payload["type"])), "enabled") {
		return claudeDefaultThinkingBudgetValue(), true
	}
	return nil, false
}

func claudeDefaultThinkingBudgetValue() *int {
	value := claudeDefaultThinkingBudget
	return &value
}

func parseOptionalNonNegativeInt(value any) *int {
	switch typed := value.(type) {
	case int:
		if typed < 0 {
			return nil
		}
		return &typed
	case float64:
		normalized := int(typed)
		if float64(normalized) != typed || normalized < 0 {
			return nil
		}
		return &normalized
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return nil
		}
		var parsed int
		if _, err := fmt.Sscanf(trimmed, "%d", &parsed); err != nil || parsed < 0 {
			return nil
		}
		return &parsed
	default:
		return nil
	}
}

func boolValue(value any) bool {
	typed, ok := value.(bool)
	return ok && typed
}

func buildClaudeSandboxSettings(policy string) map[string]any {
	normalized := strings.TrimSpace(policy)
	if normalized == "" {
		return nil
	}
	if strings.HasPrefix(normalized, "{") || strings.HasPrefix(normalized, "[") {
		parsed := map[string]any{}
		if err := json.Unmarshal([]byte(normalized), &parsed); err == nil {
			return parsed
		}
	}
	switch strings.ToLower(normalized) {
	case "disabled", "off", "false", "0", "dangerously_disable", "dangerously-disable":
		return map[string]any{"enabled": false}
	case "allow_unsandboxed_commands", "allow-unsandboxed-commands", "allow_unsandboxed":
		return map[string]any{"enabled": true, "allowUnsandboxedCommands": true}
	case "enabled", "on", "true", "sandboxed":
		return map[string]any{"enabled": true}
	default:
		return nil
	}
}

func extractClaudeSessionID(payload map[string]any) string {
	for _, key := range []string{"sessionId", "session_id"} {
		if value := strings.TrimSpace(stringValue(payload[key])); value != "" {
			return value
		}
	}
	if eventPayload, ok := mapValue(payload["event"]); ok {
		for _, key := range []string{"sessionId", "session_id"} {
			if value := strings.TrimSpace(stringValue(eventPayload[key])); value != "" {
				return value
			}
		}
	}
	return ""
}

func extractClaudeResult(payload map[string]any) *claudeResultPayload {
	result := &claudeResultPayload{
		SessionID: extractClaudeSessionID(payload),
		Result:    strings.TrimSpace(stringValue(payload["result"])),
		IsError:   boolValue(payload["isError"]),
	}
	if usage, ok := mapValue(payload["usage"]); ok {
		result.Usage = cloneAnyMap(usage)
	}
	return result
}

func buildClaudeApprovalArguments(payload map[string]any) map[string]any {
	arguments := map[string]any{}
	if approvalID := strings.TrimSpace(stringValue(payload["approvalId"])); approvalID != "" {
		arguments["approvalId"] = approvalID
	}
	if toolName := normalizeClaudeToolName(stringValue(payload["toolName"])); toolName != "" {
		arguments["toolName"] = toolName
	}
	if toolType := strings.TrimSpace(stringValue(payload["toolType"])); toolType != "" {
		arguments["toolType"] = toolType
	}
	if payload["tool"] != nil {
		arguments["tool"] = deepCloneJSONValue(payload["tool"])
	}
	if payload["input"] != nil {
		arguments["input"] = deepCloneJSONValue(payload["input"])
	}
	return arguments
}

func normalizeClaudeToolName(raw string) string {
	normalized := mcpx.NormalizeToolName(raw)
	if normalized == "" {
		normalized = strings.TrimSpace(raw)
	}
	if !strings.HasPrefix(strings.TrimSpace(raw), "mcp__") && strings.EqualFold(normalized, "question") {
		return askUserQuestionToolName
	}
	return normalized
}

type claudeRunController struct {
	session *claudeSession

	runtimeReady     chan struct{}
	runtimeReadyOnce sync.Once
	cancelled        chan struct{}
	cancelledOnce    sync.Once
}

func (c *claudeRunController) Cancel() error {
	if c == nil || c.session == nil {
		return nil
	}
	c.cancelledOnce.Do(func() {
		close(c.cancelled)
	})
	return c.session.terminate()
}

func (c *claudeRunController) SendApprovalResponse(approvalID string, approved bool) error {
	if c == nil || c.session == nil {
		return ErrRunNotActive
	}
	return c.session.writeJSON(map[string]any{
		"type":       "approval_response",
		"approvalId": approvalID,
		"approved":   approved,
	})
}

func (c *claudeRunController) SendToolResponse(toolCallID string, payload map[string]any) error {
	if c == nil || c.session == nil {
		return ErrRunNotActive
	}
	message := map[string]any{
		"type":       "tool_response",
		"toolCallId": toolCallID,
	}
	for key, value := range payload {
		message[key] = deepCloneJSONValue(value)
	}
	return c.session.writeJSON(message)
}

func (c *claudeRunController) markRuntimeReady() {
	if c == nil {
		return
	}
	c.runtimeReadyOnce.Do(func() {
		close(c.runtimeReady)
	})
}

func (c *claudeRunController) waitForRuntimeReady() bool {
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

type claudeSession struct {
	cmd   *exec.Cmd
	stdin io.WriteCloser

	writeMu sync.Mutex

	stderrMu    sync.Mutex
	stderrLines []string

	termMu     sync.Mutex
	terminated bool

	waitCh chan error
	events chan map[string]any
}

func newClaudeSession(cmd *exec.Cmd, stdin io.WriteCloser) *claudeSession {
	return &claudeSession{
		cmd:    cmd,
		stdin:  stdin,
		waitCh: make(chan error, 1),
		events: make(chan map[string]any, 128),
	}
}

func (s *claudeSession) start(stdout io.Reader, stderr io.Reader) {
	go func() {
		s.readStdout(stdout)
		s.waitCh <- s.cmd.Wait()
		close(s.events)
	}()
	go s.readStderr(stderr)
}

func (s *claudeSession) readStdout(stdout io.Reader) {
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 16*1024), claudeStdoutBufferSize)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		payload := map[string]any{}
		if err := json.Unmarshal([]byte(line), &payload); err != nil {
			s.events <- map[string]any{
				"type":    "error",
				"message": fmt.Sprintf("invalid claude sidecar event: %v", err),
			}
			continue
		}
		s.events <- payload
	}
	if err := scanner.Err(); err != nil {
		s.events <- map[string]any{
			"type":    "error",
			"message": fmt.Sprintf("read claude sidecar stdout: %v", err),
		}
	}
}

func (s *claudeSession) readStderr(stderr io.Reader) {
	scanner := bufio.NewScanner(stderr)
	scanner.Buffer(make([]byte, 0, 16*1024), claudeStdoutBufferSize)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		s.stderrMu.Lock()
		s.stderrLines = append(s.stderrLines, line)
		if len(s.stderrLines) > claudeMaxStderrLines {
			s.stderrLines = append([]string(nil), s.stderrLines[len(s.stderrLines)-claudeMaxStderrLines:]...)
		}
		s.stderrMu.Unlock()
	}
}

func (s *claudeSession) writeJSON(payload map[string]any) error {
	if s == nil || s.stdin == nil {
		return ErrRunNotActive
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	content, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode claude payload: %w", err)
	}
	if _, err := s.stdin.Write(append(content, '\n')); err != nil {
		return fmt.Errorf("write claude payload: %w", err)
	}
	return nil
}

func (s *claudeSession) terminate() error {
	if s == nil || s.cmd == nil || s.cmd.Process == nil {
		return nil
	}
	s.termMu.Lock()
	if s.terminated {
		s.termMu.Unlock()
		return nil
	}
	s.terminated = true
	s.termMu.Unlock()
	_ = s.stdin.Close()
	if err := s.cmd.Process.Signal(os.Interrupt); err != nil && !errors.Is(err, os.ErrProcessDone) {
		_ = s.cmd.Process.Kill()
	}
	return nil
}

func (s *claudeSession) processErr() error {
	if s == nil {
		return nil
	}
	return <-s.waitCh
}

func (s *claudeSession) stderrTail() []string {
	s.stderrMu.Lock()
	defer s.stderrMu.Unlock()
	return append([]string(nil), s.stderrLines...)
}

type claudeEventParser struct {
	runtime                  *Runtime
	request                  StartRequest
	currentMessageID         string
	blockTypesByIndex        map[int]string
	toolUseIDsByIndex        map[int]string
	toolResultIDsByIndex     map[int]string
	toolCallArgumentsByID    map[string]string
	toolCallSeededFromInput  map[string]bool
	toolResultBuffersByID    map[string]*claudeToolResultBuffer
	pendingQuestionApprovals []string
	pendingQuestionToolCalls []string
	pendingToolResults       []claudeToolResultMetadata
}

type claudeContentBlockDelta struct {
	messageID string
	index     int
	blockType string
	deltaType string
	delta     map[string]any
}

type claudeContentBlockStart struct {
	messageID    string
	index        int
	blockType    string
	contentBlock map[string]any
}

func newClaudeEventParser(runtime *Runtime, request StartRequest) *claudeEventParser {
	return &claudeEventParser{
		runtime:                 runtime,
		request:                 request,
		blockTypesByIndex:       map[int]string{},
		toolUseIDsByIndex:       map[int]string{},
		toolResultIDsByIndex:    map[int]string{},
		toolCallArgumentsByID:   map[string]string{},
		toolCallSeededFromInput: map[string]bool{},
		toolResultBuffersByID:   map[string]*claudeToolResultBuffer{},
	}
}

func contentBlockIndex(eventPayload map[string]any) (int, bool) {
	switch value := eventPayload["index"].(type) {
	case float64:
		return int(value), true
	case int:
		return value, true
	default:
		return 0, false
	}
}

func (p *claudeEventParser) queueQuestionApproval(approvalID string) error {
	trimmedApprovalID := strings.TrimSpace(approvalID)
	if trimmedApprovalID == "" {
		return nil
	}
	if toolCallID := p.popPendingQuestionToolCall(); toolCallID != nil {
		responseID := trimmedApprovalID
		if err := p.runtime.RegisterQuestion(p.buildQuestionState(*toolCallID, &responseID)); err != nil && !errors.Is(err, ErrRunNotActive) {
			return err
		}
		return nil
	}
	p.pendingQuestionApprovals = append(p.pendingQuestionApprovals, trimmedApprovalID)
	return nil
}

func (p *claudeEventParser) popQuestionApproval() *string {
	if len(p.pendingQuestionApprovals) == 0 {
		return nil
	}
	approvalID := p.pendingQuestionApprovals[0]
	p.pendingQuestionApprovals = append([]string(nil), p.pendingQuestionApprovals[1:]...)
	return &approvalID
}

func (p *claudeEventParser) popPendingQuestionToolCall() *string {
	if len(p.pendingQuestionToolCalls) == 0 {
		return nil
	}
	toolCallID := p.pendingQuestionToolCalls[0]
	p.pendingQuestionToolCalls = append([]string(nil), p.pendingQuestionToolCalls[1:]...)
	return &toolCallID
}

func (p *claudeEventParser) takeToolResults() []claudeToolResultMetadata {
	if len(p.pendingToolResults) == 0 {
		return []claudeToolResultMetadata{}
	}
	toolResults := append([]claudeToolResultMetadata(nil), p.pendingToolResults...)
	p.pendingToolResults = nil
	return toolResults
}

func (p *claudeEventParser) handleStreamEvent(eventPayload map[string]any, state *ChatState) (bool, error) {
	switch strings.TrimSpace(stringValue(eventPayload["type"])) {
	case "message_start":
		messagePayload, ok := mapValue(eventPayload["message"])
		if !ok {
			return false, nil
		}
		messageID := strings.TrimSpace(stringValue(messagePayload["id"]))
		if messageID == "" {
			return false, nil
		}
		p.currentMessageID = messageID
		p.blockTypesByIndex = map[int]string{}
		p.toolUseIDsByIndex = map[int]string{}
		p.toolResultIDsByIndex = map[int]string{}
		upsertAssistantMessage(state, messageID, "")
		return true, nil
	case "content_block_start":
		return p.handleContentBlockStart(eventPayload, state)
	case "content_block_delta":
		return p.handleContentBlockDelta(eventPayload, state)
	case "content_block_stop":
		return p.handleContentBlockStop(eventPayload, state)
	case "message_stop":
		p.currentMessageID = ""
		p.blockTypesByIndex = map[int]string{}
		p.toolUseIDsByIndex = map[int]string{}
		p.toolResultIDsByIndex = map[int]string{}
		return false, nil
	default:
		return false, nil
	}
}

func (p *claudeEventParser) handleAssistantMessage(messagePayload map[string]any, state *ChatState) (bool, error) {
	messageID := strings.TrimSpace(stringValue(messagePayload["id"]))
	if messageID == "" || findMessageIndex(state.Messages, messageID) != -1 {
		return false, nil
	}
	upsertAssistantMessage(state, messageID, "")
	rawContent, _ := messagePayload["content"].([]any)
	for _, rawEntry := range rawContent {
		if err := p.handleAssistantMessageEntry(messageID, rawEntry, state); err != nil {
			return true, err
		}
	}
	return true, nil
}

func (p *claudeEventParser) handleAssistantMessageEntry(
	messageID string,
	rawEntry any,
	state *ChatState,
) error {
	entry, ok := rawEntry.(map[string]any)
	if !ok {
		return nil
	}
	return p.applyAssistantMessageEntry(messageID, entry, state)
}

func (p *claudeEventParser) applyAssistantMessageEntry(
	messageID string,
	entry map[string]any,
	state *ChatState,
) error {
	switch strings.TrimSpace(stringValue(entry["type"])) {
	case "text":
		p.applyAssistantTextEntry(messageID, entry, state)
		return nil
	case "thinking":
		p.applyAssistantThinkingEntry(messageID, entry, state)
		return nil
	case "tool_use":
		return p.applyAssistantToolUseEntry(messageID, entry, state)
	case "tool_result":
		p.applyAssistantToolResultEntry(entry, state)
		return nil
	default:
		return nil
	}
}

func (p *claudeEventParser) applyAssistantTextEntry(messageID string, entry map[string]any, state *ChatState) {
	text := strings.TrimSpace(stringValue(entry["text"]))
	if text != "" {
		appendAssistantDelta(state, messageID, text)
	}
}

func (p *claudeEventParser) applyAssistantThinkingEntry(messageID string, entry map[string]any, state *ChatState) {
	thinking := strings.TrimSpace(stringValue(entry["thinking"]))
	summary := optionalStringValue(entry, "summary")
	signature := optionalStringValue(entry, "signature")
	if thinking != "" || summary != nil || signature != nil {
		appendAssistantThinkingUpdate(state, messageID, thinking, summary, signature)
	}
}

func (p *claudeEventParser) applyAssistantToolUseEntry(messageID string, entry map[string]any, state *ChatState) error {
	toolCallID, toolName, arguments := toolUsePayload(entry)
	if toolCallID == "" {
		return nil
	}
	setToolCallArguments(state, toolCallID, arguments)
	upsertAssistantToolCall(state, messageID, toolCallID, toolName, arguments)
	return p.registerQuestion(toolCallID, toolName)
}

func (p *claudeEventParser) applyAssistantToolResultEntry(entry map[string]any, state *ChatState) {
	metadata := buildClaudeToolResultFromContentBlock(state, entry)
	if metadata != nil {
		p.pendingToolResults = append(p.pendingToolResults, *metadata)
	}
}

func (p *claudeEventParser) handleContentBlockStart(eventPayload map[string]any, state *ChatState) (bool, error) {
	start, ok := p.parseContentBlockStart(eventPayload)
	if !ok {
		return false, nil
	}
	p.blockTypesByIndex[start.index] = start.blockType
	switch start.blockType {
	case "text":
		return start.applyTextStart(state)
	case "thinking":
		return start.applyThinkingStart(state)
	case "tool_use":
		return p.applyToolUseStart(start, state)
	case "tool_result":
		return p.applyToolResultStart(start)
	default:
		return false, nil
	}
}

func (p *claudeEventParser) parseContentBlockStart(eventPayload map[string]any) (claudeContentBlockStart, bool) {
	messageID := strings.TrimSpace(p.currentMessageID)
	if messageID == "" {
		return claudeContentBlockStart{}, false
	}
	index, ok := contentBlockIndex(eventPayload)
	if !ok {
		return claudeContentBlockStart{}, false
	}
	contentBlock, ok := mapValue(eventPayload["content_block"])
	if !ok {
		return claudeContentBlockStart{}, false
	}
	blockType := strings.TrimSpace(stringValue(contentBlock["type"]))
	if blockType == "" {
		return claudeContentBlockStart{}, false
	}
	return claudeContentBlockStart{
		messageID:    messageID,
		index:        index,
		blockType:    blockType,
		contentBlock: contentBlock,
	}, true
}

func (start claudeContentBlockStart) applyTextStart(state *ChatState) (bool, error) {
	text := stringValue(start.contentBlock["text"])
	if text == "" {
		return false, nil
	}
	appendAssistantDelta(state, start.messageID, text)
	return true, nil
}

func (start claudeContentBlockStart) applyThinkingStart(state *ChatState) (bool, error) {
	thinking := stringValue(start.contentBlock["thinking"])
	summary := optionalStringValue(start.contentBlock, "summary")
	signature := optionalStringValue(start.contentBlock, "signature")
	if thinking == "" && summary == nil && signature == nil {
		return false, nil
	}
	appendAssistantThinkingUpdate(state, start.messageID, thinking, summary, signature)
	return true, nil
}

func (p *claudeEventParser) applyToolUseStart(start claudeContentBlockStart, state *ChatState) (bool, error) {
	toolCallID, toolName, arguments := toolUsePayload(start.contentBlock)
	if toolCallID == "" {
		return false, nil
	}
	p.toolUseIDsByIndex[start.index] = toolCallID
	if len(arguments) > 0 {
		setToolCallArguments(state, toolCallID, arguments)
		if encoded, err := json.Marshal(arguments); err == nil {
			p.toolCallArgumentsByID[toolCallID] = string(encoded)
			p.toolCallSeededFromInput[toolCallID] = true
		}
	}
	upsertAssistantToolCall(state, start.messageID, toolCallID, toolName, arguments)
	if err := p.registerQuestion(toolCallID, toolName); err != nil {
		return true, err
	}
	return true, nil
}

func (p *claudeEventParser) applyToolResultStart(start claudeContentBlockStart) (bool, error) {
	toolCallID := strings.TrimSpace(stringValue(start.contentBlock["tool_use_id"]))
	if toolCallID == "" {
		return false, nil
	}
	p.toolResultIDsByIndex[start.index] = toolCallID
	appendClaudeToolResultChunk(
		p.toolResultBuffersByID,
		toolCallID,
		start.contentBlock["content"],
		boolValue(start.contentBlock["is_error"]),
	)
	return false, nil
}

func toolUsePayload(payload map[string]any) (string, string, map[string]any) {
	toolCallID := strings.TrimSpace(stringValue(payload["id"]))
	toolName := normalizeClaudeToolName(stringValue(payload["name"]))
	arguments, _ := mapValue(payload["input"])
	if arguments == nil {
		arguments = map[string]any{}
	}
	return toolCallID, toolName, arguments
}

func (p *claudeEventParser) handleContentBlockDelta(eventPayload map[string]any, state *ChatState) (bool, error) {
	delta, ok := p.parseContentBlockDelta(eventPayload)
	if !ok {
		return false, nil
	}
	switch delta.blockType {
	case "text":
		return delta.applyTextDelta(state)
	case "thinking":
		return delta.applyThinkingDelta(state)
	case "tool_use":
		return p.applyToolUseDelta(delta, state)
	case "tool_result":
		return p.applyToolResultDelta(delta)
	default:
		return false, nil
	}
}

func (p *claudeEventParser) parseContentBlockDelta(eventPayload map[string]any) (claudeContentBlockDelta, bool) {
	messageID := strings.TrimSpace(p.currentMessageID)
	if messageID == "" {
		return claudeContentBlockDelta{}, false
	}
	index, ok := contentBlockIndex(eventPayload)
	if !ok {
		return claudeContentBlockDelta{}, false
	}
	delta, ok := mapValue(eventPayload["delta"])
	if !ok {
		return claudeContentBlockDelta{}, false
	}
	return claudeContentBlockDelta{
		messageID: messageID,
		index:     index,
		blockType: p.blockTypesByIndex[index],
		deltaType: strings.TrimSpace(stringValue(delta["type"])),
		delta:     delta,
	}, true
}

func (delta claudeContentBlockDelta) applyTextDelta(state *ChatState) (bool, error) {
	if delta.deltaType != "text_delta" {
		return false, nil
	}
	text := stringValue(delta.delta["text"])
	if text == "" {
		return false, nil
	}
	appendAssistantDelta(state, delta.messageID, text)
	return true, nil
}

func (delta claudeContentBlockDelta) applyThinkingDelta(state *ChatState) (bool, error) {
	switch delta.deltaType {
	case "thinking_delta":
		thinking := stringValue(delta.delta["thinking"])
		summary := optionalStringValue(delta.delta, "summary")
		if thinking == "" && summary == nil {
			return false, nil
		}
		appendAssistantThinkingUpdate(state, delta.messageID, thinking, summary, nil)
		return true, nil
	case "signature_delta":
		signature := optionalStringValue(delta.delta, "signature")
		if signature == nil {
			return false, nil
		}
		appendAssistantThinkingUpdate(state, delta.messageID, "", nil, signature)
		return true, nil
	case "summary_delta":
		summary := optionalStringValue(delta.delta, "summary")
		if summary == nil {
			return false, nil
		}
		appendAssistantThinkingUpdate(state, delta.messageID, "", summary, nil)
		return true, nil
	default:
		return false, nil
	}
}

func (p *claudeEventParser) applyToolUseDelta(delta claudeContentBlockDelta, state *ChatState) (bool, error) {
	if delta.deltaType != "input_json_delta" {
		return false, nil
	}
	toolCallID := strings.TrimSpace(p.toolUseIDsByIndex[delta.index])
	if toolCallID == "" {
		return false, nil
	}
	partialJSON := stringValue(delta.delta["partial_json"])
	if partialJSON == "" {
		return false, nil
	}
	if p.toolCallSeededFromInput[toolCallID] {
		p.toolCallArgumentsByID[toolCallID] = ""
		p.toolCallSeededFromInput[toolCallID] = false
	}
	p.toolCallArgumentsByID[toolCallID] += partialJSON
	parsed, ok := decodeJSONObject(p.toolCallArgumentsByID[toolCallID])
	if !ok {
		return false, nil
	}
	setToolCallArguments(state, toolCallID, parsed)
	upsertAssistantToolCall(state, delta.messageID, toolCallID, "", parsed)
	return true, nil
}

func (p *claudeEventParser) applyToolResultDelta(delta claudeContentBlockDelta) (bool, error) {
	if delta.deltaType != "text_delta" {
		return false, nil
	}
	toolCallID := strings.TrimSpace(p.toolResultIDsByIndex[delta.index])
	if toolCallID == "" {
		return false, nil
	}
	appendClaudeToolResultChunk(p.toolResultBuffersByID, toolCallID, delta.delta["text"], false)
	return false, nil
}

func (p *claudeEventParser) handleContentBlockStop(eventPayload map[string]any, state *ChatState) (bool, error) {
	index, ok := contentBlockIndex(eventPayload)
	if !ok {
		return false, nil
	}
	switch p.blockTypesByIndex[index] {
	case "tool_use":
		toolCallID := strings.TrimSpace(p.toolUseIDsByIndex[index])
		if toolCallID == "" {
			return false, nil
		}
		parsed, ok := decodeJSONObject(p.toolCallArgumentsByID[toolCallID])
		if !ok {
			return false, nil
		}
		messageID := strings.TrimSpace(p.currentMessageID)
		if messageID == "" {
			return false, nil
		}
		setToolCallArguments(state, toolCallID, parsed)
		upsertAssistantToolCall(state, messageID, toolCallID, "", parsed)
		return true, nil
	case "tool_result":
		toolCallID := strings.TrimSpace(p.toolResultIDsByIndex[index])
		if toolCallID == "" {
			return false, nil
		}
		buffer := p.toolResultBuffersByID[toolCallID]
		delete(p.toolResultIDsByIndex, index)
		delete(p.toolResultBuffersByID, toolCallID)
		if buffer == nil {
			return false, nil
		}
		metadata := applyClaudeToolResult(state, toolCallID, buffer.Text, buffer.IsError)
		if metadata == nil {
			return false, nil
		}
		p.pendingToolResults = append(p.pendingToolResults, *metadata)
		return true, nil
	default:
		return false, nil
	}
}

func (p *claudeEventParser) registerQuestion(toolCallID string, toolName string) error {
	if toolName != askUserQuestionToolName {
		return nil
	}
	state := p.buildQuestionState(toolCallID, p.popQuestionApproval())
	if state.ResponseID == nil {
		p.pendingQuestionToolCalls = append(p.pendingQuestionToolCalls, toolCallID)
	}
	if err := p.runtime.RegisterQuestion(state); err != nil && !errors.Is(err, ErrRunNotActive) {
		return err
	}
	return nil
}

func (p *claudeEventParser) buildQuestionState(toolCallID string, responseID *string) QuestionState {
	return QuestionState{
		ToolCallID:      toolCallID,
		RunID:           p.request.Run.ID,
		ProjectConfigID: p.request.ProjectConfigID,
		ChatID:          p.request.ChatID,
		SectionID:       cloneOptionalString(p.request.SectionID),
		ResponseID:      cloneOptionalString(responseID),
	}
}

func decodeJSONObject(raw string) (map[string]any, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return map[string]any{}, true
	}
	parsed := map[string]any{}
	if err := json.Unmarshal([]byte(trimmed), &parsed); err != nil {
		return nil, false
	}
	return parsed, true
}

func optionalStringValue(payload map[string]any, key string) *string {
	if payload == nil {
		return nil
	}
	raw, ok := payload[key]
	if !ok {
		return nil
	}
	value := stringValue(raw)
	return &value
}
