package externalagents

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/externalagentconfigs"
	"setta/internal/mcpx"
)

const (
	openCodeConfigFileName   = "opencode.json"
	openCodeMaxStderrLines   = 200
	openCodeStdoutBufferSize = 1024 * 1024
)

var (
	errOpenCodeExecutorRunStoreRequired      = errors.New("opencode executor run store is required")
	errOpenCodeExecutorRuntimeRequired       = errors.New("opencode executor runtime is required")
	errOpenCodeExecutorWorkspaceRootRequired = errors.New("opencode executor workspace root is required")
	errOpenCodeExecutorFilesRootRequired     = errors.New("opencode executor setta files root is required")
	errOpenCodeExecutorSidecarRequired       = errors.New("opencode executor sidecar path is required")
)

type OpenCodeExecutorOptions struct {
	Runs               *agentruns.RunStore
	Runtime            *Runtime
	WorkspaceRoot      string
	SettaFilesRoot     string
	CurrentSession     *auth.CurrentSession
	AuthCookieBaseName string
	RuntimeRoot        string
	ProcessEnv         map[string]string
	SidecarPath        string
	TimeNow            func() time.Time
}

type OpenCodeExecutor struct {
	runs               *agentruns.RunStore
	runtime            *Runtime
	workspaceRoot      string
	settaFilesRoot     string
	currentSession     *auth.CurrentSession
	authCookieBaseName string
	runtimeRoot        string
	processEnv         map[string]string
	sidecarPath        string
	timeNow            func() time.Time
}

func NewOpenCodeExecutor(options OpenCodeExecutorOptions) (*OpenCodeExecutor, error) {
	if options.Runs == nil {
		return nil, errOpenCodeExecutorRunStoreRequired
	}
	if options.Runtime == nil {
		return nil, errOpenCodeExecutorRuntimeRequired
	}
	workspaceRoot := strings.TrimSpace(options.WorkspaceRoot)
	if workspaceRoot == "" {
		return nil, errOpenCodeExecutorWorkspaceRootRequired
	}
	settaFilesRoot := strings.TrimSpace(options.SettaFilesRoot)
	if settaFilesRoot == "" {
		return nil, errOpenCodeExecutorFilesRootRequired
	}
	sidecarPath, err := resolveOpenCodeSidecarPath(options.SidecarPath)
	if err != nil {
		return nil, err
	}
	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	return &OpenCodeExecutor{
		runs:               options.Runs,
		runtime:            options.Runtime,
		workspaceRoot:      workspaceRoot,
		settaFilesRoot:     settaFilesRoot,
		currentSession:     cloneCurrentSession(options.CurrentSession),
		authCookieBaseName: auth.NormalizeCookieBaseName(options.AuthCookieBaseName),
		runtimeRoot:        strings.TrimSpace(options.RuntimeRoot),
		processEnv:         cloneStringAnyMapToStringMap(options.ProcessEnv),
		sidecarPath:        sidecarPath,
		timeNow:            timeNow,
	}, nil
}

func resolveOpenCodeSidecarPath(explicitPath string) (string, error) {
	if strings.TrimSpace(explicitPath) != "" {
		resolved, err := filepath.Abs(strings.TrimSpace(explicitPath))
		if err != nil {
			return "", fmt.Errorf("resolve opencode sidecar path: %w", err)
		}
		if _, err := os.Stat(resolved); err != nil {
			return "", fmt.Errorf("stat opencode sidecar path: %w", err)
		}
		return resolved, nil
	}
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return "", errOpenCodeExecutorSidecarRequired
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
		"opencode_sdk_runner.mjs",
	))
	if _, err := os.Stat(resolved); err != nil {
		return "", fmt.Errorf("stat default opencode sidecar path: %w", err)
	}
	return resolved, nil
}

func (e *OpenCodeExecutor) Start(ctx context.Context, request StartRequest) (StartResponse, error) {
	if e == nil {
		return StartResponse{}, ErrExecutorUnavailable
	}
	if request.ExternalConfig.ToolType != externalagentconfigs.ToolTypeOpenCode {
		return StartResponse{}, ErrExecutorUnavailable
	}
	if request.ExternalConfig.RunMode != externalagentconfigs.RunModeSDK && request.ExternalConfig.RunMode != externalagentconfigs.RunModeServer {
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
	envMap["SETTA_WORKSPACE_ROOT"] = e.workspaceRoot
	headers, err := e.buildOpenCodeMCPHeaders(request)
	if err != nil {
		cleanupStart()
		return StartResponse{}, err
	}
	configPath, err := e.prepareOpenCodeConfig(request.ExternalConfig, request.ChatID, request.Inputs, headers)
	if err != nil {
		cleanupStart()
		return StartResponse{}, err
	}
	if strings.TrimSpace(configPath) != "" {
		envMap["OPENCODE_CONFIG"] = configPath
	}
	startupMCPStatusPayload := e.fetchOpenCodeMCPStatusPayload(ctx, request.ExternalConfig)

	nodeCommand := resolveBundledNodeCommand(derefOptionalString(request.ExternalConfig.CommandPath))
	cmd := exec.Command(nodeCommand, e.sidecarPath)
	cmd.Dir = workingDir
	cmd.Env = envMapToList(envMap)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("opencode stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("opencode stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("opencode stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("start opencode sidecar: %w", err)
	}

	session := newOpenCodeSession(cmd, stdin)
	session.start(stdout, stderr)

	startupFailed := true
	defer func() {
		if !startupFailed {
			return
		}
		_ = session.terminate()
		cleanupStart()
	}()

	if err := session.writeJSON(buildOpenCodeStartPayload(request, workingDir, request.ExternalConfig)); err != nil {
		return StartResponse{}, err
	}

	controller := &openCodeRunController{
		session:      session,
		runtimeReady: make(chan struct{}),
		cancelled:    make(chan struct{}),
	}
	startupFailed = false
	go e.runLoop(request, session, controller, cleanupPaths, configPath, startupMCPStatusPayload)
	return StartResponse{Controller: controller}, nil
}

func (e *OpenCodeExecutor) runLoop(
	request StartRequest,
	session *openCodeSession,
	controller *openCodeRunController,
	cleanupPaths []string,
	configPath string,
	startupMCPStatusPayload any,
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
	if err := e.seedOpenCodeMCPStatuses(request.Run.ID, configPath, startupMCPStatusPayload); err != nil && !errors.Is(err, ErrRunNotActive) {
		_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		return
	}

	sessionID := strings.TrimSpace(stringValue(request.Inputs["sessionId"]))
	state, err := e.loadCurrentChatState(request.Run)
	if err != nil {
		_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		return
	}
	if err := e.persistLiveState(request.Run.ID, state, sessionID); err != nil {
		_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		return
	}

	parser := newOpenCodeEventParser(e.runtime, request)
	for {
		payload, ok := <-session.events
		if !ok {
			if err := e.handleProcessExit(request.Run.ID, session.processErr(), session.stderrTail(), state, sessionID); err != nil {
				_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
			}
			return
		}
		if currentLiveState, err := e.runtime.GetLiveChatState(request.Run.ID); err == nil && currentLiveState != nil {
			state = *currentLiveState.Clone()
		}
		nextSessionID := extractOpenCodeSessionID(payload)
		if nextSessionID != "" {
			sessionID = nextSessionID
		}
		failed, changed, err := e.handleEvent(request, parser, payload, &state)
		if err != nil {
			_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
			return
		}
		if changed || nextSessionID != "" {
			if err := e.persistLiveState(request.Run.ID, state, sessionID); err != nil {
				_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
				return
			}
		}
		if failed {
			return
		}
	}
}

func (e *OpenCodeExecutor) handleEvent(
	request StartRequest,
	parser *openCodeEventParser,
	payload map[string]any,
	state *ChatState,
) (bool, bool, error) {
	if payload == nil {
		return false, false, nil
	}
	switch strings.TrimSpace(stringValue(payload["type"])) {
	case "approval_request":
		approvalID := strings.TrimSpace(stringValue(payload["approvalId"]))
		if approvalID == "" {
			return false, false, fmt.Errorf("opencode approval request missing approvalId")
		}
		if err := e.runtime.RegisterApproval(ApprovalState{
			ApprovalID:      approvalID,
			RunID:           request.Run.ID,
			ProjectConfigID: request.ProjectConfigID,
			ChatID:          request.ChatID,
			SectionID:       cloneOptionalString(request.SectionID),
		}); err != nil {
			return false, false, err
		}
		appendApprovalRequestMessage(state, approvalID, buildOpenCodeApprovalArguments(payload))
		run, err := e.runs.Load(request.Run.ID)
		if err != nil {
			return false, false, err
		}
		appendRunEvent(&run, "approval_request", map[string]any{
			"approvalId": approvalID,
			"payload":    cloneAnyMap(payload),
		}, e.timeNow())
		if err := e.runs.Save(run); err != nil {
			return false, false, err
		}
		return false, true, nil
	case "error":
		message := strings.TrimSpace(stringValue(payload["message"]))
		if message == "" {
			message = "OpenCode sidecar reported an unknown error"
		}
		return false, false, errors.New(message)
	default:
		changed, err := parser.handle(payload, state)
		if err != nil {
			return false, changed, err
		}
		toolResults := parser.takeToolResults()
		if len(toolResults) == 0 {
			return false, changed, nil
		}
		run, err := e.runs.Load(request.Run.ID)
		if err != nil {
			return false, changed, err
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
			return false, changed, err
		}
		return false, changed, nil
	}
}

func (e *OpenCodeExecutor) handleProcessExit(runID string, processErr error, stderrLines []string, state ChatState, sessionID string) error {
	if processErr != nil {
		return e.markRunFailed(runID, processErr, stderrLines)
	}
	return e.finalizeRun(runID, state, sessionID)
}

func (e *OpenCodeExecutor) finalizeRun(runID string, state ChatState, sessionID string) error {
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
	finishedAt := e.timeNow().UTC()
	run.Status = agentruns.RunStatusCompleted
	run.FinishedAt = &finishedAt
	e.runtime.attachMCPStatusSnapshot(&run)
	appendRunEvent(&run, "run_completed", map[string]any{}, finishedAt)
	return e.runs.Save(run)
}

func (e *OpenCodeExecutor) markRunFailed(runID string, runErr error, stderrLines []string) error {
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

func (e *OpenCodeExecutor) persistLiveState(runID string, state ChatState, sessionID string) error {
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
	return e.runs.Save(run)
}

func (e *OpenCodeExecutor) loadCurrentChatState(run agentruns.Run) (ChatState, error) {
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

func (e *OpenCodeExecutor) resolveWorkingDir(config externalagentconfigs.Config) (string, func() error, error) {
	switch config.WorkingDirStrategy {
	case externalagentconfigs.WorkingDirStrategyTempDir:
		root, err := os.MkdirTemp("", "setta-opencode-")
		if err != nil {
			return "", nil, fmt.Errorf("create opencode temp working dir: %w", err)
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
			return "", nil, fmt.Errorf("create opencode custom working dir: %w", err)
		}
		return path, nil, nil
	default:
		return e.workspaceRoot, nil, nil
	}
}

func (e *OpenCodeExecutor) buildRuntimeEnv(config externalagentconfigs.Config) map[string]string {
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

func (e *OpenCodeExecutor) fetchOpenCodeMCPStatusPayload(ctx context.Context, config externalagentconfigs.Config) any {
	if config.RunMode != externalagentconfigs.RunModeServer {
		return nil
	}
	baseURL := strings.TrimSpace(derefOptionalString(config.BaseURL))
	if baseURL == "" {
		return nil
	}
	statusURL := strings.TrimRight(baseURL, "/") + "/mcp"
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, statusURL, nil)
	if err != nil {
		return nil
	}
	client := &http.Client{Timeout: time.Second}
	response, err := client.Do(request)
	if err != nil {
		return nil
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil
	}
	var payload any
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil
	}
	return payload
}

func (e *OpenCodeExecutor) seedOpenCodeMCPStatuses(runID string, configPath string, startupPayload any) error {
	statuses := buildUnknownOpenCodeMCPStatuses(configPath)
	statuses = append(statuses, buildOpenCodeMCPStatuses(startupPayload, e.timeNow)...)
	return e.runtime.UpsertMCPStatuses(runID, statuses)
}

func (e *OpenCodeExecutor) prepareOpenCodeConfig(config externalagentconfigs.Config, chatID string, inputs map[string]any, settaHeaders map[string]string) (string, error) {
	baseRoot := filepath.Join(e.settaFilesRoot, codexSettingsRootName, "opencode", config.ID)
	baseConfigPath := resolveOpenCodeBaseConfig(config, baseRoot)
	if config.SettingsMode == externalagentconfigs.SettingsModeReadOnly {
		return baseConfigPath, nil
	}
	runtimePath := filepath.Join(baseRoot, "sessions", chatID, openCodeConfigFileName)
	if err := os.MkdirAll(filepath.Dir(runtimePath), 0o755); err != nil {
		return "", fmt.Errorf("create opencode runtime config dir: %w", err)
	}
	payload := map[string]any{}
	if baseConfigPath != "" {
		loaded, err := loadOpenCodeConfigPayload(baseConfigPath)
		if err != nil {
			return "", err
		}
		payload = loaded
	}
	applyOpenCodeRuntimeConfig(payload, config, inputs, settaHeaders)
	content, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", fmt.Errorf("encode opencode runtime config: %w", err)
	}
	content = append(content, '\n')
	if err := os.WriteFile(runtimePath, content, 0o644); err != nil {
		return "", fmt.Errorf("write opencode runtime config: %w", err)
	}
	return runtimePath, nil
}

func resolveOpenCodeBaseConfig(config externalagentconfigs.Config, baseRoot string) string {
	if config.SettingsMode == externalagentconfigs.SettingsModeExplicitPath {
		path := strings.TrimSpace(derefOptionalString(config.SettingsFilePath))
		if path != "" {
			return path
		}
	}
	canonical := filepath.Join(baseRoot, openCodeConfigFileName)
	if _, err := os.Stat(canonical); err == nil {
		return canonical
	}
	return ""
}

func loadOpenCodeConfigPayload(path string) (map[string]any, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read opencode base config: %w", err)
	}
	payload := map[string]any{}
	if len(strings.TrimSpace(string(content))) == 0 {
		return payload, nil
	}
	if err := json.Unmarshal(content, &payload); err != nil {
		return nil, fmt.Errorf("decode opencode base config: %w", err)
	}
	return payload, nil
}

func applyOpenCodeRuntimeConfig(payload map[string]any, config externalagentconfigs.Config, inputs map[string]any, settaHeaders map[string]string) {
	if payload == nil {
		return
	}
	model := strings.TrimSpace(stringValue(inputs["model"]))
	if model == "" && config.SettingsManagedBlock != nil && config.SettingsManagedBlock.OpenCode != nil {
		model = strings.TrimSpace(derefOptionalString(config.SettingsManagedBlock.OpenCode.Model))
	}
	if model == "" {
		model = strings.TrimSpace(derefOptionalString(config.DefaultModel))
	}
	if model != "" {
		payload["model"] = model
	}
	var permission any
	if config.SettingsManagedBlock != nil && config.SettingsManagedBlock.OpenCode != nil && config.SettingsManagedBlock.OpenCode.Permission != nil {
		permission = deepCloneJSONValue(config.SettingsManagedBlock.OpenCode.Permission)
	} else if runtimePolicy := parseOpenCodePermission(strings.TrimSpace(stringValue(inputs["approvalPolicy"]))); runtimePolicy != nil {
		permission = runtimePolicy
	} else if configuredPolicy := parseOpenCodePermission(strings.TrimSpace(derefOptionalString(config.ApprovalPolicy))); configuredPolicy != nil {
		permission = configuredPolicy
	}
	if permission != nil {
		payload["permission"] = permission
	}
	if config.SettingsManagedBlock != nil && config.SettingsManagedBlock.OpenCode != nil && len(config.SettingsManagedBlock.OpenCode.MCP) > 0 {
		existingMCP, _ := mapValue(payload["mcp"])
		if existingMCP == nil {
			existingMCP = map[string]any{}
		}
		for key, value := range config.SettingsManagedBlock.OpenCode.MCP {
			existingMCP[key] = deepCloneJSONValue(value)
		}
		payload["mcp"] = existingMCP
	}
	if len(settaHeaders) > 0 {
		existingMCP, _ := mapValue(payload["mcp"])
		if existingMCP == nil {
			existingMCP = map[string]any{}
		}
		settaEntry := ensureAnyMapFromValue(existingMCP[mcpx.DefaultServerID])
		headerEntry := ensureAnyMapFromValue(settaEntry["headers"])
		for key, value := range settaHeaders {
			headerEntry[key] = value
		}
		settaEntry["headers"] = headerEntry
		existingMCP[mcpx.DefaultServerID] = settaEntry
		payload["mcp"] = existingMCP
	}
	externalagentconfigs.ForceOpenCodeOpenAITextVerbosity(payload, "gpt-5.2-chat-latest", "medium")
}

func (e *OpenCodeExecutor) buildOpenCodeMCPHeaders(request StartRequest) (map[string]string, error) {
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
	linkedChatDepth, err := normalizeLinkedChatInvocationDepth(request.Inputs["linkedChatInvocationDepth"])
	if err != nil {
		return nil, err
	}
	if linkedChatDepth > 0 {
		headers[mcpx.AgenticContextLinkedChatDepthHeader] = strconv.Itoa(linkedChatDepth)
	}
	linkedChatChain, err := normalizeLinkedChatInvocationChainSectionIDs(
		request.Inputs["linkedChatInvocationChainSectionIds"],
	)
	if err != nil {
		return nil, err
	}
	if len(linkedChatChain) > 0 {
		headers[mcpx.AgenticContextLinkedChatChainHeader] = strings.Join(linkedChatChain, ",")
	}
	return headers, nil
}

func normalizeLinkedChatInvocationDepth(raw any) (int, error) {
	if raw == nil {
		return 0, nil
	}
	var depth int
	switch value := raw.(type) {
	case bool:
		return 0, errors.New("linkedChatInvocationDepth must be an integer")
	case int:
		depth = value
	case int32:
		depth = int(value)
	case int64:
		depth = int(value)
	case float64:
		if math.IsNaN(value) || math.IsInf(value, 0) || math.Trunc(value) != value {
			return 0, errors.New("linkedChatInvocationDepth must be an integer")
		}
		depth = int(value)
	case string:
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return 0, nil
		}
		parsed, err := strconv.Atoi(trimmed)
		if err != nil {
			return 0, errors.New("linkedChatInvocationDepth must be an integer")
		}
		depth = parsed
	default:
		return 0, errors.New("linkedChatInvocationDepth must be an integer")
	}
	if depth < 0 {
		return 0, errors.New("linkedChatInvocationDepth must be non-negative")
	}
	return depth, nil
}

func normalizeLinkedChatInvocationChainSectionIDs(raw any) ([]string, error) {
	if raw == nil {
		return []string{}, nil
	}
	rawEntries := []any{}
	switch value := raw.(type) {
	case string:
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return []string{}, nil
		}
		parts := strings.Split(trimmed, ",")
		rawEntries = make([]any, 0, len(parts))
		for _, part := range parts {
			rawEntries = append(rawEntries, part)
		}
	case []string:
		rawEntries = make([]any, 0, len(value))
		for _, entry := range value {
			rawEntries = append(rawEntries, entry)
		}
	case []any:
		rawEntries = value
	default:
		return nil, errors.New("linkedChatInvocationChainSectionIds must be a list of section ids")
	}

	chain := make([]string, 0, len(rawEntries))
	for _, rawEntry := range rawEntries {
		entry, ok := rawEntry.(string)
		if !ok {
			return nil, errors.New("linkedChatInvocationChainSectionIds must be a list of section ids")
		}
		trimmed := strings.TrimSpace(entry)
		if trimmed == "" {
			return nil, errors.New("linkedChatInvocationChainSectionIds cannot contain empty values")
		}
		chain = append(chain, trimmed)
	}
	return chain, nil
}

func parseOpenCodePermission(value string) any {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	if strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
		var parsed any
		if err := json.Unmarshal([]byte(trimmed), &parsed); err == nil {
			return parsed
		}
	}
	return trimmed
}

func buildOpenCodeStartPayload(request StartRequest, workingDir string, config externalagentconfigs.Config) map[string]any {
	prompt := buildCodexPrompt(request.Inputs)
	payload := map[string]any{
		"prompt":     prompt,
		"parts":      buildOpenCodeParts(prompt),
		"runId":      request.Run.ID,
		"workingDir": workingDir,
	}
	if baseURL := strings.TrimSpace(derefOptionalString(request.ExternalConfig.BaseURL)); baseURL != "" {
		payload["baseUrl"] = baseURL
	}
	if model := strings.TrimSpace(stringValue(request.Inputs["model"])); model != "" {
		payload["model"] = model
	} else if config.SettingsManagedBlock != nil && config.SettingsManagedBlock.OpenCode != nil && config.SettingsManagedBlock.OpenCode.Model != nil {
		if configuredModel := strings.TrimSpace(*config.SettingsManagedBlock.OpenCode.Model); configuredModel != "" {
			payload["model"] = configuredModel
		}
	} else if model := strings.TrimSpace(derefOptionalString(request.ExternalConfig.DefaultModel)); model != "" {
		payload["model"] = model
	}
	if systemPrompt := normalizeOpenCodeSystemPrompt(stringValue(request.Inputs["systemPrompt"])); systemPrompt != "" {
		payload["systemPrompt"] = systemPrompt
	}
	if sessionID := strings.TrimSpace(stringValue(request.Inputs["sessionId"])); sessionID != "" {
		payload["sessionId"] = sessionID
	}
	if port := extractOpenCodePort(request.Inputs); port != nil {
		payload["port"] = *port
	}
	if hostname := extractOpenCodeHostname(request.Inputs); hostname != "" {
		payload["hostname"] = hostname
	}
	return payload
}

func buildOpenCodeParts(prompt string) []any {
	if strings.TrimSpace(prompt) == "" {
		return []any{map[string]any{"type": "text", "text": "\n"}}
	}
	return []any{
		map[string]any{
			"type": "text",
			"text": prompt,
		},
	}
}

func normalizeOpenCodeSystemPrompt(systemPrompt string) string {
	normalized := strings.TrimSpace(systemPrompt)
	if normalized == "" {
		return ""
	}
	const needle = "MCP tool names are always namespaced as `<serverId>__<toolName>`."
	const replacement = "MCP tool names in OpenCode are `<serverId>_<toolName>`."
	if strings.Contains(normalized, needle) {
		return strings.ReplaceAll(normalized, needle, replacement)
	}
	return normalized + "\n\n" + replacement
}

func extractOpenCodePort(inputs map[string]any) *int {
	if inputs == nil {
		return nil
	}
	switch value := inputs["opencodePort"].(type) {
	case int:
		return &value
	case float64:
		normalized := int(value)
		return &normalized
	case string:
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return nil
		}
		var parsed int
		if _, err := fmt.Sscanf(trimmed, "%d", &parsed); err == nil {
			return &parsed
		}
	}
	return nil
}

func extractOpenCodeHostname(inputs map[string]any) string {
	if inputs == nil {
		return ""
	}
	return strings.TrimSpace(stringValue(inputs["opencodeHostname"]))
}

type openCodeRunController struct {
	session *openCodeSession

	runtimeReady     chan struct{}
	runtimeReadyOnce sync.Once
	cancelled        chan struct{}
	cancelledOnce    sync.Once
}

func (c *openCodeRunController) Cancel() error {
	if c == nil || c.session == nil {
		return nil
	}
	c.cancelledOnce.Do(func() {
		close(c.cancelled)
	})
	return c.session.terminate()
}

func (c *openCodeRunController) SendApprovalResponse(approvalID string, approved bool) error {
	if c == nil || c.session == nil {
		return ErrRunNotActive
	}
	return c.session.writeJSON(map[string]any{
		"type":       "approval_response",
		"approvalId": approvalID,
		"approved":   approved,
	})
}

func (c *openCodeRunController) SendToolResponse(toolCallID string, payload map[string]any) error {
	if c == nil || c.session == nil {
		return ErrRunNotActive
	}
	message := map[string]any{
		"type":       "question_response",
		"toolCallId": toolCallID,
	}
	for key, value := range payload {
		message[key] = deepCloneJSONValue(value)
	}
	return c.session.writeJSON(message)
}

func (c *openCodeRunController) markRuntimeReady() {
	if c == nil {
		return
	}
	c.runtimeReadyOnce.Do(func() {
		close(c.runtimeReady)
	})
}

func (c *openCodeRunController) waitForRuntimeReady() bool {
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

type openCodeSession struct {
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

func newOpenCodeSession(cmd *exec.Cmd, stdin io.WriteCloser) *openCodeSession {
	return &openCodeSession{
		cmd:    cmd,
		stdin:  stdin,
		waitCh: make(chan error, 1),
		events: make(chan map[string]any, 128),
	}
}

func (s *openCodeSession) start(stdout io.Reader, stderr io.Reader) {
	go func() {
		s.readStdout(stdout)
		s.waitCh <- s.cmd.Wait()
		close(s.events)
	}()
	go s.readStderr(stderr)
}

func (s *openCodeSession) readStdout(stdout io.Reader) {
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 16*1024), openCodeStdoutBufferSize)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		payload := map[string]any{}
		if err := json.Unmarshal([]byte(line), &payload); err != nil {
			s.events <- map[string]any{
				"type":    "error",
				"message": fmt.Sprintf("invalid opencode sidecar event: %v", err),
			}
			continue
		}
		s.events <- payload
	}
	if err := scanner.Err(); err != nil {
		s.events <- map[string]any{
			"type":    "error",
			"message": fmt.Sprintf("read opencode sidecar stdout: %v", err),
		}
	}
}

func (s *openCodeSession) readStderr(stderr io.Reader) {
	scanner := bufio.NewScanner(stderr)
	scanner.Buffer(make([]byte, 0, 16*1024), openCodeStdoutBufferSize)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		s.stderrMu.Lock()
		s.stderrLines = append(s.stderrLines, line)
		if len(s.stderrLines) > openCodeMaxStderrLines {
			s.stderrLines = append([]string(nil), s.stderrLines[len(s.stderrLines)-openCodeMaxStderrLines:]...)
		}
		s.stderrMu.Unlock()
	}
}

func (s *openCodeSession) writeJSON(payload map[string]any) error {
	if s == nil || s.stdin == nil {
		return ErrRunNotActive
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	content, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode opencode payload: %w", err)
	}
	if _, err := s.stdin.Write(append(content, '\n')); err != nil {
		return fmt.Errorf("write opencode payload: %w", err)
	}
	return nil
}

func (s *openCodeSession) terminate() error {
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

func (s *openCodeSession) processErr() error {
	if s == nil {
		return nil
	}
	return <-s.waitCh
}

func (s *openCodeSession) stderrTail() []string {
	s.stderrMu.Lock()
	defer s.stderrMu.Unlock()
	return append([]string(nil), s.stderrLines...)
}

type openCodeEventParser struct {
	runtime      *Runtime
	request      StartRequest
	messageRoles map[string]string
	pendingParts map[string][]map[string]any
	partTextByID map[string]string
	toolResults  []openCodeToolResultMetadata
}

func newOpenCodeEventParser(runtime *Runtime, request StartRequest) *openCodeEventParser {
	return &openCodeEventParser{
		runtime:      runtime,
		request:      request,
		messageRoles: map[string]string{},
		pendingParts: map[string][]map[string]any{},
		partTextByID: map[string]string{},
		toolResults:  []openCodeToolResultMetadata{},
	}
}

func (p *openCodeEventParser) handle(payload map[string]any, state *ChatState) (bool, error) {
	p.toolResults = p.toolResults[:0]
	switch strings.TrimSpace(stringValue(payload["type"])) {
	case "message.updated":
		return p.handleMessageUpdated(payload, state)
	case "message.part.updated":
		return p.handlePartUpdated(payload, state)
	case "assistant_message":
		return p.handleAssistantMessage(payload, state)
	default:
		return p.handleGenericPayload(payload, state)
	}
}

func (p *openCodeEventParser) takeToolResults() []openCodeToolResultMetadata {
	if len(p.toolResults) == 0 {
		return []openCodeToolResultMetadata{}
	}
	results := append([]openCodeToolResultMetadata(nil), p.toolResults...)
	p.toolResults = p.toolResults[:0]
	return results
}

func (p *openCodeEventParser) handleMessageUpdated(payload map[string]any, state *ChatState) (bool, error) {
	properties, ok := mapValue(payload["properties"])
	if !ok {
		return false, nil
	}
	info, ok := mapValue(properties["info"])
	if !ok {
		return false, nil
	}
	messageID := strings.TrimSpace(stringValue(info["id"]))
	role := strings.TrimSpace(stringValue(info["role"]))
	if messageID == "" || role == "" {
		return false, nil
	}
	p.messageRoles[messageID] = role
	parts := append([]map[string]any(nil), p.pendingParts[messageID]...)
	delete(p.pendingParts, messageID)
	changed := false
	for _, partPayload := range parts {
		partChanged, err := p.handlePartUpdated(partPayload, state)
		if err != nil {
			return changed, err
		}
		if partChanged {
			changed = true
		}
	}
	return changed, nil
}

func (p *openCodeEventParser) handlePartUpdated(payload map[string]any, state *ChatState) (bool, error) {
	properties, ok := mapValue(payload["properties"])
	if !ok {
		return false, nil
	}
	part, ok := mapValue(properties["part"])
	if !ok {
		return false, nil
	}
	messageID := strings.TrimSpace(stringValue(part["messageID"]))
	if messageID == "" {
		return false, nil
	}
	role, ok := p.messageRoles[messageID]
	if !ok {
		p.pendingParts[messageID] = append(p.pendingParts[messageID], cloneAnyMap(payload))
		return false, nil
	}
	if role != "assistant" {
		return false, nil
	}
	switch strings.TrimSpace(stringValue(part["type"])) {
	case "text":
		delta := p.extractPartDelta(part, properties, "text")
		if delta == "" {
			return false, nil
		}
		appendAssistantDelta(state, messageID, delta)
		return true, nil
	case "reasoning":
		delta := p.extractPartDelta(part, properties, "thinking")
		if delta == "" {
			return false, nil
		}
		appendAssistantThinkingDelta(state, messageID, delta)
		return true, nil
	case "tool":
		return p.handleToolPart(messageID, part, state)
	default:
		return false, nil
	}
}

func (p *openCodeEventParser) handleAssistantMessage(payload map[string]any, state *ChatState) (bool, error) {
	messagePayload, ok := mapValue(payload["message"])
	if !ok {
		return false, nil
	}
	info, ok := mapValue(messagePayload["info"])
	if !ok {
		return false, nil
	}
	syntheticUpdated := map[string]any{
		"type": "message.updated",
		"properties": map[string]any{
			"info": info,
		},
	}
	changed, err := p.handleMessageUpdated(syntheticUpdated, state)
	if err != nil {
		return changed, err
	}
	rawParts, ok := messagePayload["parts"].([]any)
	if !ok {
		return changed, nil
	}
	for _, rawPart := range rawParts {
		part, ok := rawPart.(map[string]any)
		if !ok {
			continue
		}
		syntheticPart := map[string]any{
			"type": "message.part.updated",
			"properties": map[string]any{
				"part":  part,
				"delta": part["text"],
			},
		}
		partChanged, err := p.handlePartUpdated(syntheticPart, state)
		if err != nil {
			return changed, err
		}
		if partChanged {
			changed = true
		}
	}
	return changed, nil
}

func (p *openCodeEventParser) handleToolPart(messageID string, part map[string]any, state *ChatState) (bool, error) {
	toolCall, toolResult := applyOpenCodeToolPart(state, messageID, part)
	if toolCall.ToolCallID == "" {
		return false, nil
	}
	if toolCall.ToolName == askUserQuestionToolName {
		if err := p.runtime.RegisterQuestion(QuestionState{
			ToolCallID:      toolCall.ToolCallID,
			RunID:           p.request.Run.ID,
			ProjectConfigID: p.request.ProjectConfigID,
			ChatID:          p.request.ChatID,
			SectionID:       cloneOptionalString(p.request.SectionID),
		}); err != nil && !errors.Is(err, ErrRunNotActive) {
			return true, err
		}
	}
	if toolResult != nil {
		p.toolResults = append(p.toolResults, *toolResult)
	}
	return true, nil
}

func (p *openCodeEventParser) handleGenericPayload(payload map[string]any, state *ChatState) (bool, error) {
	changed, toolCalls, toolResults := applyOpenCodeGenericPayload(state, payload)
	for _, toolCall := range toolCalls {
		if toolCall.ToolName != askUserQuestionToolName {
			continue
		}
		if err := p.runtime.RegisterQuestion(QuestionState{
			ToolCallID:      toolCall.ToolCallID,
			RunID:           p.request.Run.ID,
			ProjectConfigID: p.request.ProjectConfigID,
			ChatID:          p.request.ChatID,
			SectionID:       cloneOptionalString(p.request.SectionID),
		}); err != nil && !errors.Is(err, ErrRunNotActive) {
			return changed, err
		}
	}
	if len(toolResults) > 0 {
		p.toolResults = append(p.toolResults, toolResults...)
	}
	return changed, nil
}

func (p *openCodeEventParser) extractPartDelta(part map[string]any, properties map[string]any, textKey string) string {
	partID := strings.TrimSpace(stringValue(part["id"]))
	previous := ""
	if partID != "" {
		previous = p.partTextByID[partID]
	}
	if delta := stringValue(properties["delta"]); delta != "" {
		if partID != "" {
			p.partTextByID[partID] = previous + delta
		}
		return delta
	}
	fullText := stringValue(part[textKey])
	if fullText == "" {
		return ""
	}
	if partID != "" {
		p.partTextByID[partID] = fullText
	}
	if previous != "" && strings.HasPrefix(fullText, previous) {
		return strings.TrimPrefix(fullText, previous)
	}
	return fullText
}

func buildOpenCodeApprovalArguments(payload map[string]any) map[string]any {
	arguments := map[string]any{}
	if approvalID := strings.TrimSpace(stringValue(payload["approvalId"])); approvalID != "" {
		arguments["approvalId"] = approvalID
	}
	if toolName := strings.TrimSpace(stringValue(payload["toolName"])); toolName != "" {
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

func extractOpenCodeSessionID(payload map[string]any) string {
	payloadType := strings.TrimSpace(stringValue(payload["type"]))
	for _, key := range []string{"sessionId", "sessionID", "session_id"} {
		if value := strings.TrimSpace(stringValue(payload[key])); value != "" {
			return value
		}
	}
	properties, ok := mapValue(payload["properties"])
	if !ok {
		return ""
	}
	if info, ok := mapValue(properties["info"]); ok {
		for _, key := range []string{"sessionId", "sessionID", "session_id"} {
			if value := strings.TrimSpace(stringValue(info[key])); value != "" {
				return value
			}
		}
		if strings.HasPrefix(strings.ToLower(payloadType), "session.") {
			if value := strings.TrimSpace(stringValue(info["id"])); value != "" {
				return value
			}
		}
	}
	if part, ok := mapValue(properties["part"]); ok {
		for _, key := range []string{"sessionId", "sessionID", "session_id"} {
			if value := strings.TrimSpace(stringValue(part[key])); value != "" {
				return value
			}
		}
	}
	return ""
}

func normalizeOpenCodeToolName(raw string) string {
	normalized := mcpx.NormalizeToolName(raw)
	if normalized == "" {
		return ""
	}
	if !strings.HasPrefix(strings.TrimSpace(raw), "mcp__") && strings.EqualFold(normalized, "question") {
		return askUserQuestionToolName
	}
	return normalized
}

func resolveBundledNodeCommand(commandPath string) string {
	if strings.TrimSpace(commandPath) != "" {
		return strings.TrimSpace(commandPath)
	}
	_, currentFile, _, ok := runtime.Caller(0)
	if ok {
		repoRoot := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", ".."))
		platformTag := resolveNodePlatformTag(runtime.GOOS, runtime.GOARCH)
		if platformTag != "" {
			candidates := []string{
				filepath.Join(repoRoot, "backend", "setta", "vendor", "node", platformTag, "node"),
				filepath.Join(repoRoot, "backend", "setta", "vendor", "node", platformTag, "node.exe"),
				filepath.Join(repoRoot, "backend", "setta", "vendor", "node", platformTag, "bin", "node"),
			}
			for _, candidate := range candidates {
				if _, err := os.Stat(candidate); err == nil {
					return candidate
				}
			}
		}
	}
	return "node"
}

func resolveNodePlatformTag(goos string, goarch string) string {
	osTag := ""
	switch goos {
	case "darwin":
		osTag = "darwin"
	case "linux":
		osTag = "linux"
	case "windows":
		osTag = "win"
	}
	archTag := ""
	switch goarch {
	case "amd64":
		archTag = "x64"
	case "arm64":
		archTag = "arm64"
	}
	if osTag == "" || archTag == "" {
		return ""
	}
	return osTag + "-" + archTag
}
