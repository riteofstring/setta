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
	claudeSidecarFileName  = "claude_sdk_runner.py"
	claudeMCPConfigName    = ".mcp.json"
	claudeMaxStderrLines   = 200
	claudeStdoutBufferSize = 1024 * 1024
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
	if err := e.prepareClaudeSettings(request.ExternalConfig); err != nil {
		cleanupStart()
		return StartResponse{}, err
	}
	if cleanupMCPDir, err := e.ensureClaudeMCPConfig(&request); err != nil {
		cleanupStart()
		return StartResponse{}, err
	} else if strings.TrimSpace(cleanupMCPDir) != "" {
		cleanupPaths = append(cleanupPaths, cleanupMCPDir)
	}

	envMap := e.buildRuntimeEnv(request.ExternalConfig)
	pythonCommand := strings.TrimSpace(e.pythonCommand)
	if pythonCommand == "" {
		pythonCommand, err = externalagentconfigs.ResolveClaudePythonCommand()
		if err != nil {
			cleanupStart()
			return StartResponse{}, fmt.Errorf("%w: %v", errClaudeExecutorPythonRequired, err)
		}
	}
	cmd := exec.CommandContext(ctx, pythonCommand, e.sidecarPath)
	cmd.Dir = workingDir
	cmd.Env = envMapToList(envMap)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("claude stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("claude stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("claude stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("start claude sidecar: %w", err)
	}

	session := newClaudeSession(cmd, stdin)
	session.start(stdout, stderr)

	startupFailed := true
	defer func() {
		if !startupFailed {
			return
		}
		_ = session.terminate()
		cleanupStart()
	}()

	if err := session.writeJSON(buildClaudeStartPayload(request, workingDir, envMap)); err != nil {
		return StartResponse{}, err
	}

	controller := &claudeRunController{
		session:      session,
		runtimeReady: make(chan struct{}),
		cancelled:    make(chan struct{}),
	}
	startupFailed = false
	go e.runLoop(request, session, controller, cleanupPaths)
	return StartResponse{Controller: controller}, nil
}

func (e *ClaudeExecutor) runLoop(
	request StartRequest,
	session *claudeSession,
	controller *claudeRunController,
	cleanupPaths []string,
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
	if err := e.seedClaudeMCPStatuses(request.Run.ID, stringValue(request.Inputs["mcpConfig"])); err != nil && !errors.Is(err, ErrRunNotActive) {
		_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		return
	}

	sessionID := strings.TrimSpace(stringValue(request.Inputs["sessionId"]))
	state, err := e.loadCurrentChatState(request.Run)
	if err != nil {
		_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		return
	}
	if err := e.persistLiveState(request.Run.ID, state, sessionID, nil); err != nil {
		_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		return
	}

	parser := newClaudeEventParser(e.runtime, request)
	var result *claudeResultPayload
	for {
		payload, ok := <-session.events
		if !ok {
			if err := e.handleProcessExit(
				request.Run.ID,
				session.processErr(),
				session.stderrTail(),
				state,
				sessionID,
				result,
				boolValue(request.Inputs["completionGuardEnabled"]),
			); err != nil {
				_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
			}
			return
		}
		if currentLiveState, err := e.runtime.GetLiveChatState(request.Run.ID); err == nil && currentLiveState != nil {
			state = *currentLiveState.Clone()
		}
		if nextSessionID := extractClaudeSessionID(payload); nextSessionID != "" {
			sessionID = nextSessionID
		}
		changed, nextResult, err := e.handleEvent(request, parser, payload, &state)
		if err != nil {
			_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
			return
		}
		if nextResult != nil {
			result = nextResult
			if result.SessionID != "" {
				sessionID = result.SessionID
			}
		}
		if changed {
			if err := e.persistLiveState(request.Run.ID, state, sessionID, nil); err != nil {
				_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
				return
			}
		}
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
		approvalID := strings.TrimSpace(stringValue(payload["approvalId"]))
		if approvalID == "" {
			return false, nil, fmt.Errorf("claude approval request missing approvalId")
		}
		toolName := normalizeClaudeToolName(stringValue(payload["toolName"]))
		if toolName == askUserQuestionToolName {
			parser.queueQuestionApproval(approvalID)
			return false, nil, nil
		}
		approvalState := ApprovalState{
			ApprovalID:      approvalID,
			RunID:           request.Run.ID,
			ProjectConfigID: request.ProjectConfigID,
			ChatID:          request.ChatID,
			SectionID:       cloneOptionalString(request.SectionID),
		}
		if err := e.runtime.RegisterApproval(approvalState); err != nil {
			return false, nil, err
		}
		appendApprovalRequestMessage(state, approvalID, buildClaudeApprovalArguments(payload))
		run, err := e.runs.Load(request.Run.ID)
		if err != nil {
			return true, nil, err
		}
		appendRunEvent(&run, "approval_request", map[string]any{
			"approvalId": approvalID,
			"payload":    cloneAnyMap(payload),
		}, e.timeNow())
		if err := e.runs.Save(run); err != nil {
			return true, nil, err
		}
		return true, nil, nil
	case "stream_event":
		eventPayload, ok := mapValue(payload["event"])
		if !ok {
			return false, nil, nil
		}
		changed, err := parser.handleStreamEvent(eventPayload, state)
		if err != nil {
			return changed, nil, err
		}
		return e.persistClaudeToolResults(request.Run.ID, parser.takeToolResults(), changed)
	case "assistant_message":
		messagePayload, ok := mapValue(payload["message"])
		if !ok {
			return false, nil, nil
		}
		changed, err := parser.handleAssistantMessage(messagePayload, state)
		if err != nil {
			return changed, nil, err
		}
		return e.persistClaudeToolResults(request.Run.ID, parser.takeToolResults(), changed)
	case "system_message":
		statuses := buildClaudeMCPStatuses(payload, e.timeNow)
		if len(statuses) == 0 {
			return false, nil, nil
		}
		if err := e.runtime.UpsertMCPStatuses(request.Run.ID, statuses); err != nil && !errors.Is(err, ErrRunNotActive) {
			return false, nil, err
		}
		return false, nil, nil
	case "result":
		return false, extractClaudeResult(payload), nil
	case "error":
		message := strings.TrimSpace(stringValue(payload["message"]))
		if message == "" {
			message = "claude sidecar reported an error"
		}
		return false, nil, errors.New(message)
	default:
		return false, nil, nil
	}
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
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	if run.Status == agentruns.RunStatusCancelled {
		return nil
	}
	finishedAt := e.timeNow().UTC()
	run.Status = agentruns.RunStatusFailed
	run.FinishedAt = &finishedAt
	payload := map[string]any{
		"error": runErr.Error(),
	}
	if len(stderrLines) > 0 {
		payload["cliStderr"] = append([]string(nil), stderrLines...)
	}
	e.runtime.attachMCPStatusSnapshot(&run)
	appendRunEvent(&run, "run_failed", payload, finishedAt)
	return e.runs.Save(run)
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

func resolveClaudeSettingsPath(config externalagentconfigs.Config, workspaceRoot string) string {
	return externalagentconfigs.ResolveClaudeSettingsPath(config, workspaceRoot)
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
	if cliPath := strings.TrimSpace(derefOptionalString(request.ExternalConfig.CommandPath)); cliPath != "" {
		payload["cliPath"] = cliPath
	}
	if systemPrompt := strings.TrimSpace(stringValue(request.Inputs["systemPrompt"])); systemPrompt != "" {
		payload["systemPrompt"] = systemPrompt
	}
	if model := resolveClaudeModel(request); model != "" {
		payload["model"] = model
	}
	if resume := strings.TrimSpace(stringValue(request.Inputs["sessionId"])); resume != "" {
		payload["resume"] = resume
	}
	if settingSources := resolveClaudeSettingSources(request.ExternalConfig); len(settingSources) > 0 {
		payload["settingSources"] = append([]string(nil), settingSources...)
	}
	if permissionMode := resolveClaudePermissionMode(resolveClaudeApprovalPolicy(request)); permissionMode != "" {
		payload["permissionMode"] = permissionMode
	}
	payload["decisionPolicy"] = resolveClaudeDecisionPolicy(resolveClaudeApprovalPolicy(request))
	if allowedTools := extractClaudeAllowedTools(request); len(allowedTools) > 0 {
		payload["allowedTools"] = append([]string(nil), allowedTools...)
	}
	if maxTurns := resolveClaudeMaxTurns(request.Inputs); maxTurns != nil {
		payload["maxTurns"] = *maxTurns
	}
	if maxThinkingTokens := resolveClaudeThinkingBudget(request.Inputs); maxThinkingTokens != nil {
		payload["maxThinkingTokens"] = *maxThinkingTokens
	}
	if sandbox := buildClaudeSandboxSettings(resolveClaudeSandboxPolicy(request)); sandbox != nil {
		payload["sandbox"] = sandbox
	}
	if mcpConfigPath := strings.TrimSpace(stringValue(request.Inputs["mcpConfig"])); mcpConfigPath != "" {
		payload["mcpConfigPath"] = mcpConfigPath
	}
	return payload
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
		return append([]string(nil), config.SettingsSources...)
	}
	return []string{"project", "local"}
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
	normalized := strings.TrimSpace(policy)
	if normalized == "" {
		return ""
	}
	switch normalized {
	case "default", "acceptEdits", "plan", "bypassPermissions":
		return normalized
	}
	switch strings.ToLower(normalized) {
	case "allow", "auto", "bypass":
		return "bypassPermissions"
	case "ask", "deny", "block":
		return "default"
	default:
		return ""
	}
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
	if rawTools, ok := request.Inputs["allowedTools"].([]string); ok {
		tools := make([]string, 0, len(rawTools))
		for _, value := range rawTools {
			trimmed := strings.TrimSpace(value)
			if trimmed == "" {
				continue
			}
			tools = append(tools, trimmed)
		}
		if len(tools) > 0 {
			return tools
		}
	}
	if rawTools, ok := request.Inputs["allowedTools"].([]any); ok {
		tools := make([]string, 0, len(rawTools))
		for _, raw := range rawTools {
			value, ok := raw.(string)
			if !ok {
				continue
			}
			trimmed := strings.TrimSpace(value)
			if trimmed == "" {
				continue
			}
			tools = append(tools, trimmed)
		}
		if len(tools) > 0 {
			return tools
		}
	}
	if request.Profile != nil && len(request.Profile.ToolAllowlist) > 0 {
		return append([]string(nil), request.Profile.ToolAllowlist...)
	}
	return nil
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
	thinkingPayload, ok := inputs["thinking"]
	if ok {
		switch value := thinkingPayload.(type) {
		case bool:
			if value {
				defaultBudget := 1024
				return &defaultBudget
			}
			return nil
		case map[string]any:
			if budget := parseOptionalNonNegativeInt(value["budget_tokens"]); budget != nil {
				return budget
			}
			if budget := parseOptionalNonNegativeInt(value["budgetTokens"]); budget != nil {
				return budget
			}
			if strings.EqualFold(strings.TrimSpace(stringValue(value["type"])), "enabled") {
				defaultBudget := 1024
				return &defaultBudget
			}
		case string:
			if strings.EqualFold(strings.TrimSpace(value), "disabled") {
				return nil
			}
		}
	}
	if budget := parseOptionalNonNegativeInt(inputs["thinkingBudgetTokens"]); budget != nil {
		return budget
	}
	return parseOptionalNonNegativeInt(inputs["thinking_budget_tokens"])
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
	pendingToolResults       []claudeToolResultMetadata
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

func (p *claudeEventParser) queueQuestionApproval(approvalID string) {
	if strings.TrimSpace(approvalID) == "" {
		return
	}
	p.pendingQuestionApprovals = append(p.pendingQuestionApprovals, approvalID)
}

func (p *claudeEventParser) popQuestionApproval() *string {
	if len(p.pendingQuestionApprovals) == 0 {
		return nil
	}
	approvalID := p.pendingQuestionApprovals[0]
	p.pendingQuestionApprovals = append([]string(nil), p.pendingQuestionApprovals[1:]...)
	return &approvalID
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
	changed := true
	if rawContent, ok := messagePayload["content"].([]any); ok {
		for _, rawEntry := range rawContent {
			entry, ok := rawEntry.(map[string]any)
			if !ok {
				continue
			}
			switch strings.TrimSpace(stringValue(entry["type"])) {
			case "text":
				if text := strings.TrimSpace(stringValue(entry["text"])); text != "" {
					appendAssistantDelta(state, messageID, text)
				}
			case "thinking":
				thinking := strings.TrimSpace(stringValue(entry["thinking"]))
				summary := optionalStringValue(entry, "summary")
				signature := optionalStringValue(entry, "signature")
				if thinking != "" || summary != nil || signature != nil {
					appendAssistantThinkingUpdate(state, messageID, thinking, summary, signature)
				}
			case "tool_use":
				toolCallID := strings.TrimSpace(stringValue(entry["id"]))
				if toolCallID == "" {
					continue
				}
				toolName := normalizeClaudeToolName(stringValue(entry["name"]))
				arguments, _ := mapValue(entry["input"])
				if arguments == nil {
					arguments = map[string]any{}
				}
				setToolCallArguments(state, toolCallID, arguments)
				upsertAssistantToolCall(state, messageID, toolCallID, toolName, arguments)
				if err := p.registerQuestion(toolCallID, toolName); err != nil {
					return changed, err
				}
			case "tool_result":
				metadata := buildClaudeToolResultFromContentBlock(state, entry)
				if metadata == nil {
					continue
				}
				p.pendingToolResults = append(p.pendingToolResults, *metadata)
			}
		}
	}
	return changed, nil
}

func (p *claudeEventParser) handleContentBlockStart(eventPayload map[string]any, state *ChatState) (bool, error) {
	messageID := strings.TrimSpace(p.currentMessageID)
	if messageID == "" {
		return false, nil
	}
	indexValue, ok := eventPayload["index"].(float64)
	if !ok {
		if parsedIndex, ok := eventPayload["index"].(int); ok {
			indexValue = float64(parsedIndex)
		} else {
			return false, nil
		}
	}
	index := int(indexValue)
	contentBlock, ok := mapValue(eventPayload["content_block"])
	if !ok {
		return false, nil
	}
	blockType := strings.TrimSpace(stringValue(contentBlock["type"]))
	if blockType == "" {
		return false, nil
	}
	p.blockTypesByIndex[index] = blockType
	switch blockType {
	case "text":
		if text := stringValue(contentBlock["text"]); text != "" {
			appendAssistantDelta(state, messageID, text)
			return true, nil
		}
	case "thinking":
		thinking := stringValue(contentBlock["thinking"])
		summary := optionalStringValue(contentBlock, "summary")
		signature := optionalStringValue(contentBlock, "signature")
		if thinking != "" || summary != nil || signature != nil {
			appendAssistantThinkingUpdate(state, messageID, thinking, summary, signature)
			return true, nil
		}
	case "tool_use":
		toolCallID := strings.TrimSpace(stringValue(contentBlock["id"]))
		if toolCallID == "" {
			return false, nil
		}
		p.toolUseIDsByIndex[index] = toolCallID
		toolName := normalizeClaudeToolName(stringValue(contentBlock["name"]))
		arguments, _ := mapValue(contentBlock["input"])
		if arguments == nil {
			arguments = map[string]any{}
		}
		if len(arguments) > 0 {
			setToolCallArguments(state, toolCallID, arguments)
			if encoded, err := json.Marshal(arguments); err == nil {
				p.toolCallArgumentsByID[toolCallID] = string(encoded)
				p.toolCallSeededFromInput[toolCallID] = true
			}
		}
		upsertAssistantToolCall(state, messageID, toolCallID, toolName, arguments)
		if err := p.registerQuestion(toolCallID, toolName); err != nil {
			return true, err
		}
		return true, nil
	case "tool_result":
		toolCallID := strings.TrimSpace(stringValue(contentBlock["tool_use_id"]))
		if toolCallID == "" {
			return false, nil
		}
		p.toolResultIDsByIndex[index] = toolCallID
		appendClaudeToolResultChunk(
			p.toolResultBuffersByID,
			toolCallID,
			contentBlock["content"],
			boolValue(contentBlock["is_error"]),
		)
	}
	return false, nil
}

func (p *claudeEventParser) handleContentBlockDelta(eventPayload map[string]any, state *ChatState) (bool, error) {
	messageID := strings.TrimSpace(p.currentMessageID)
	if messageID == "" {
		return false, nil
	}
	indexValue, ok := eventPayload["index"].(float64)
	if !ok {
		if parsedIndex, ok := eventPayload["index"].(int); ok {
			indexValue = float64(parsedIndex)
		} else {
			return false, nil
		}
	}
	index := int(indexValue)
	delta, ok := mapValue(eventPayload["delta"])
	if !ok {
		return false, nil
	}
	blockType := p.blockTypesByIndex[index]
	switch {
	case blockType == "text" && strings.TrimSpace(stringValue(delta["type"])) == "text_delta":
		text := stringValue(delta["text"])
		if text == "" {
			return false, nil
		}
		appendAssistantDelta(state, messageID, text)
		return true, nil
	case blockType == "thinking" && strings.TrimSpace(stringValue(delta["type"])) == "thinking_delta":
		thinking := stringValue(delta["thinking"])
		summary := optionalStringValue(delta, "summary")
		if thinking == "" && summary == nil {
			return false, nil
		}
		appendAssistantThinkingUpdate(state, messageID, thinking, summary, nil)
		return true, nil
	case blockType == "thinking" && strings.TrimSpace(stringValue(delta["type"])) == "signature_delta":
		signature := optionalStringValue(delta, "signature")
		if signature == nil {
			return false, nil
		}
		appendAssistantThinkingUpdate(state, messageID, "", nil, signature)
		return true, nil
	case blockType == "thinking" && strings.TrimSpace(stringValue(delta["type"])) == "summary_delta":
		summary := optionalStringValue(delta, "summary")
		if summary == nil {
			return false, nil
		}
		appendAssistantThinkingUpdate(state, messageID, "", summary, nil)
		return true, nil
	case blockType == "tool_use" && strings.TrimSpace(stringValue(delta["type"])) == "input_json_delta":
		toolCallID := strings.TrimSpace(p.toolUseIDsByIndex[index])
		if toolCallID == "" {
			return false, nil
		}
		partialJSON := stringValue(delta["partial_json"])
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
		upsertAssistantToolCall(state, messageID, toolCallID, "", parsed)
		return true, nil
	case blockType == "tool_result" && strings.TrimSpace(stringValue(delta["type"])) == "text_delta":
		toolCallID := strings.TrimSpace(p.toolResultIDsByIndex[index])
		if toolCallID == "" {
			return false, nil
		}
		appendClaudeToolResultChunk(p.toolResultBuffersByID, toolCallID, delta["text"], false)
		return false, nil
	default:
		return false, nil
	}
}

func (p *claudeEventParser) handleContentBlockStop(eventPayload map[string]any, state *ChatState) (bool, error) {
	indexValue, ok := eventPayload["index"].(float64)
	if !ok {
		if parsedIndex, ok := eventPayload["index"].(int); ok {
			indexValue = float64(parsedIndex)
		} else {
			return false, nil
		}
	}
	index := int(indexValue)
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
	state := QuestionState{
		ToolCallID:      toolCallID,
		RunID:           p.request.Run.ID,
		ProjectConfigID: p.request.ProjectConfigID,
		ChatID:          p.request.ChatID,
		SectionID:       cloneOptionalString(p.request.SectionID),
		ResponseID:      p.popQuestionApproval(),
	}
	if err := p.runtime.RegisterQuestion(state); err != nil && !errors.Is(err, ErrRunNotActive) {
		return err
	}
	return nil
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
