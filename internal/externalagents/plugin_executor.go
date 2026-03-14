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
	"strings"
	"sync"
	"time"

	"setta/internal/agentruns"
	"setta/internal/externalagentconfigs"
)

const (
	pluginStdoutBufferSize          = 1024 * 1024
	pluginMaxStderrLines            = 200
	pluginDoneExitGraceTimeout      = 250 * time.Millisecond
	pluginDoneTerminateGraceTimeout = 500 * time.Millisecond
)

var (
	errPluginExecutorRunStoreRequired      = errors.New("plugin executor run store is required")
	errPluginExecutorRuntimeRequired       = errors.New("plugin executor runtime is required")
	errPluginExecutorWorkspaceRootRequired = errors.New("plugin executor workspace root is required")
	errPluginExecutorAdapterProvider       = errors.New("plugin executor plugin adapter provider is required")
	errPluginAdapterIDRequired             = errors.New("plugin external agent pluginAdapterId is required")
	errPluginAdapterNotRegistered          = errors.New("plugin external agent adapter is not registered")
	errPluginRunModeUnsupported            = errors.New("plugin external agent run mode is not supported")
)

type PluginExecutorOptions struct {
	Runs                  *agentruns.RunStore
	Runtime               *Runtime
	WorkspaceRoot         string
	ProcessEnv            map[string]string
	PluginAdapterProvider externalagentconfigs.PluginExternalAgentAdapterProvider
	TimeNow               func() time.Time
}

type PluginExecutor struct {
	runs                  *agentruns.RunStore
	runtime               *Runtime
	workspaceRoot         string
	processEnv            map[string]string
	pluginAdapterProvider externalagentconfigs.PluginExternalAgentAdapterProvider
	timeNow               func() time.Time
}

type pluginStreamEvent struct {
	payload   map[string]any
	plainText *string
}

type pluginEventParser struct {
	currentMessageID  string
	lastChunkWasPlain bool
}

func NewPluginExecutor(options PluginExecutorOptions) (*PluginExecutor, error) {
	if options.Runs == nil {
		return nil, errPluginExecutorRunStoreRequired
	}
	if options.Runtime == nil {
		return nil, errPluginExecutorRuntimeRequired
	}
	workspaceRoot := strings.TrimSpace(options.WorkspaceRoot)
	if workspaceRoot == "" {
		return nil, errPluginExecutorWorkspaceRootRequired
	}
	if options.PluginAdapterProvider == nil {
		return nil, errPluginExecutorAdapterProvider
	}
	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	return &PluginExecutor{
		runs:                  options.Runs,
		runtime:               options.Runtime,
		workspaceRoot:         workspaceRoot,
		processEnv:            cloneStringAnyMapToStringMap(options.ProcessEnv),
		pluginAdapterProvider: options.PluginAdapterProvider,
		timeNow:               timeNow,
	}, nil
}

func (e *PluginExecutor) Start(_ context.Context, request StartRequest) (StartResponse, error) {
	if e == nil {
		return StartResponse{}, ErrExecutorUnavailable
	}
	if request.ExternalConfig.ToolType != externalagentconfigs.ToolTypePlugin {
		return StartResponse{}, ErrExecutorUnavailable
	}

	adapter, err := e.resolvePluginAdapter(request.ExternalConfig)
	if err != nil {
		return StartResponse{}, err
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

	envMap := e.buildRuntimeEnv(request.ExternalConfig, adapter)
	commandPath := strings.TrimSpace(derefOptionalString(request.ExternalConfig.CommandPath))
	if commandPath == "" {
		commandPath = strings.TrimSpace(adapter.Command)
	}
	if commandPath == "" {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("%w: %s", errPluginAdapterNotRegistered, strings.TrimSpace(derefOptionalString(request.ExternalConfig.PluginAdapterID)))
	}
	cmd := exec.Command(commandPath, append([]string(nil), adapter.Args...)...)
	cmd.Dir = workingDir
	cmd.Env = envMapToList(envMap)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("plugin adapter stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("plugin adapter stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("plugin adapter stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		cleanupStart()
		return StartResponse{}, fmt.Errorf("start plugin adapter: %w", err)
	}

	session := newPluginSession(cmd, stdin)
	session.start(stdout, stderr)

	startupFailed := true
	defer func() {
		if !startupFailed {
			return
		}
		_ = session.terminate()
		cleanupStart()
	}()

	if err := session.writeJSON(buildPluginStartPayload(request, adapter, workingDir)); err != nil {
		return StartResponse{}, err
	}

	controller := &pluginRunController{
		session:      session,
		runtimeReady: make(chan struct{}),
		cancelled:    make(chan struct{}),
	}
	startupFailed = false
	go e.runLoop(request, session, controller, cleanupPaths)
	return StartResponse{Controller: controller}, nil
}

func (e *PluginExecutor) runLoop(
	request StartRequest,
	session *pluginSession,
	controller *pluginRunController,
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

	sessionID := strings.TrimSpace(stringValue(request.Inputs["sessionId"]))
	threadID := strings.TrimSpace(stringValue(request.Inputs["threadId"]))
	state, err := e.loadCurrentChatState(request.Run)
	if err != nil {
		_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		return
	}
	if err := e.persistLiveState(request.Run.ID, state, sessionID, threadID); err != nil {
		_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
		return
	}

	parser := &pluginEventParser{}
	for {
		next, ok := <-session.events
		if !ok {
			if err := e.handleProcessExit(request.Run.ID, session.processErr(), session.stderrTail(), state, sessionID, threadID); err != nil {
				_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
			}
			return
		}
		if currentLiveState, err := e.runtime.GetLiveChatState(request.Run.ID); err == nil && currentLiveState != nil {
			state = *currentLiveState.Clone()
		}
		changed, handledDone, nextSessionID, nextThreadID, err := e.handleEvent(request, parser, next, &state)
		if err != nil {
			_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
			return
		}
		if nextSessionID != "" {
			sessionID = nextSessionID
		}
		if nextThreadID != "" {
			threadID = nextThreadID
		}
		if changed {
			if err := e.persistLiveState(request.Run.ID, state, sessionID, threadID); err != nil {
				_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
				return
			}
		}
		if handledDone {
			if err := session.finalizeAfterDone(); err != nil {
				_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
				return
			}
			if err := e.finalizeRun(request.Run.ID, state, sessionID, threadID); err != nil {
				_ = e.markRunFailed(request.Run.ID, err, session.stderrTail())
			}
			return
		}
	}
}

func (e *PluginExecutor) handleEvent(
	request StartRequest,
	parser *pluginEventParser,
	event pluginStreamEvent,
	state *ChatState,
) (bool, bool, string, string, error) {
	if event.plainText != nil {
		changed := parser.appendText(state, *event.plainText, true)
		return changed, false, "", "", nil
	}
	payload := event.payload
	if payload == nil {
		return false, false, "", "", nil
	}
	sessionID := extractPluginSessionID(payload)
	threadID := extractPluginThreadID(payload)
	switch strings.TrimSpace(stringValue(payload["type"])) {
	case "approval_request":
		approvalID := strings.TrimSpace(stringValue(payload["approvalId"]))
		if approvalID == "" {
			return false, false, sessionID, threadID, fmt.Errorf("plugin approval request missing approvalId")
		}
		if err := e.runtime.RegisterApproval(ApprovalState{
			ApprovalID:      approvalID,
			RunID:           request.Run.ID,
			ProjectConfigID: request.ProjectConfigID,
			ChatID:          request.ChatID,
			SectionID:       cloneOptionalString(request.SectionID),
		}); err != nil {
			return false, false, sessionID, threadID, err
		}
		appendApprovalRequestMessage(state, approvalID, buildPluginApprovalArguments(payload))
		run, err := e.runs.Load(request.Run.ID)
		if err != nil {
			return true, false, sessionID, threadID, err
		}
		appendRunEvent(&run, "approval_request", map[string]any{
			"approvalId": approvalID,
			"payload":    cloneAnyMap(payload),
		}, e.timeNow())
		if err := e.runs.Save(run); err != nil {
			return true, false, sessionID, threadID, err
		}
		return true, false, sessionID, threadID, nil
	case "done":
		return false, true, sessionID, threadID, nil
	default:
		text := payload["text"]
		textValue, ok := text.(string)
		if ok {
			changed := parser.appendText(state, textValue, false)
			return changed, false, sessionID, threadID, nil
		}
		return false, false, sessionID, threadID, nil
	}
}

func (e *PluginExecutor) handleProcessExit(
	runID string,
	processErr error,
	stderrLines []string,
	state ChatState,
	sessionID string,
	threadID string,
) error {
	if processErr != nil {
		return e.markRunFailed(runID, processErr, stderrLines)
	}
	return e.finalizeRun(runID, state, sessionID, threadID)
}

func (e *PluginExecutor) finalizeRun(runID string, state ChatState, sessionID string, threadID string) error {
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
	if strings.TrimSpace(threadID) != "" {
		run.Outputs["threadId"] = threadID
	}
	finishedAt := e.timeNow().UTC()
	run.Status = agentruns.RunStatusCompleted
	run.FinishedAt = &finishedAt
	appendRunEvent(&run, "run_completed", map[string]any{}, finishedAt)
	return e.runs.Save(run)
}

func (e *PluginExecutor) markRunFailed(runID string, runErr error, stderrLines []string) error {
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
	appendRunEvent(&run, "run_failed", payload, finishedAt)
	return e.runs.Save(run)
}

func (e *PluginExecutor) persistLiveState(runID string, state ChatState, sessionID string, threadID string) error {
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
	if strings.TrimSpace(threadID) != "" {
		run.Outputs["threadId"] = threadID
	}
	return e.runs.Save(run)
}

func (e *PluginExecutor) loadCurrentChatState(run agentruns.Run) (ChatState, error) {
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

func (e *PluginExecutor) resolveWorkingDir(config externalagentconfigs.Config) (string, func() error, error) {
	switch config.WorkingDirStrategy {
	case externalagentconfigs.WorkingDirStrategyTempDir:
		root, err := os.MkdirTemp("", "setta-plugin-")
		if err != nil {
			return "", nil, fmt.Errorf("create plugin temp working dir: %w", err)
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
			return "", nil, fmt.Errorf("create plugin custom working dir: %w", err)
		}
		return path, nil, nil
	default:
		return e.workspaceRoot, nil, nil
	}
}

func (e *PluginExecutor) buildRuntimeEnv(config externalagentconfigs.Config, adapter externalagentconfigs.PluginExternalAgentAdapter) map[string]string {
	envMap := map[string]string{}
	for _, key := range []string{"PATH", "HOME", "USER", "SHELL", "TMPDIR", "TMP", "TEMP"} {
		if value := strings.TrimSpace(e.processEnv[key]); value != "" {
			envMap[key] = e.processEnv[key]
		}
	}
	combinedWhitelist := append([]string(nil), config.EnvVarWhitelist...)
	combinedWhitelist = append(combinedWhitelist, adapter.EnvVarWhitelist...)
	for key, value := range externalagentconfigs.ResolveWhitelistedEnvVars(e.workspaceRoot, e.processEnv, combinedWhitelist).EnvVars {
		envMap[key] = value
	}
	return envMap
}

func (e *PluginExecutor) resolvePluginAdapter(config externalagentconfigs.Config) (externalagentconfigs.PluginExternalAgentAdapter, error) {
	pluginAdapterID := strings.TrimSpace(derefOptionalString(config.PluginAdapterID))
	if pluginAdapterID == "" {
		return externalagentconfigs.PluginExternalAgentAdapter{}, errPluginAdapterIDRequired
	}
	adapters, err := e.pluginAdapterProvider.RegisteredExternalAgentAdapters()
	if err != nil {
		return externalagentconfigs.PluginExternalAgentAdapter{}, err
	}
	for _, adapter := range adapters {
		if strings.TrimSpace(adapter.AdapterID) != pluginAdapterID {
			continue
		}
		for _, runMode := range adapter.RunModes {
			if strings.TrimSpace(runMode) == string(config.RunMode) {
				return adapter, nil
			}
		}
		return externalagentconfigs.PluginExternalAgentAdapter{}, fmt.Errorf("%w: %s for %s", errPluginRunModeUnsupported, config.RunMode, pluginAdapterID)
	}
	return externalagentconfigs.PluginExternalAgentAdapter{}, fmt.Errorf("%w: %s", errPluginAdapterNotRegistered, pluginAdapterID)
}

func buildPluginStartPayload(
	request StartRequest,
	adapter externalagentconfigs.PluginExternalAgentAdapter,
	workingDir string,
) map[string]any {
	model := strings.TrimSpace(derefOptionalString(request.ExternalConfig.DefaultModel))
	if model == "" {
		model = strings.TrimSpace(derefOptionalString(adapter.DefaultModel))
	}
	sectionID := any(nil)
	if request.SectionID != nil && strings.TrimSpace(*request.SectionID) != "" {
		sectionID = strings.TrimSpace(*request.SectionID)
	}
	modelValue := any(nil)
	if model != "" {
		modelValue = model
	}
	return map[string]any{
		"type":            "setta_external_agent_start",
		"adapterId":       strings.TrimSpace(adapter.AdapterID),
		"runId":           strings.TrimSpace(request.Run.ID),
		"runMode":         string(request.ExternalConfig.RunMode),
		"model":           modelValue,
		"prompt":          buildPluginPrompt(stringValue(request.Inputs["systemPrompt"]), request.Inputs),
		"inputs":          deepCloneJSONValue(request.Inputs),
		"systemPrompt":    stringValue(request.Inputs["systemPrompt"]),
		"workingDir":      workingDir,
		"projectConfigId": strings.TrimSpace(request.ProjectConfigID),
		"chatId":          strings.TrimSpace(request.ChatID),
		"sectionId":       sectionID,
	}
}

func buildPluginPrompt(systemPrompt string, inputs map[string]any) string {
	parts := []string{}
	if normalizedSystem := strings.TrimSpace(systemPrompt); normalizedSystem != "" {
		parts = append(parts, "System:\n"+normalizedSystem)
	}
	if rawMessages, ok := inputs["messages"].([]any); ok {
		for _, rawMessage := range rawMessages {
			message, ok := rawMessage.(map[string]any)
			if !ok {
				continue
			}
			role := strings.TrimSpace(stringValue(message["role"]))
			if role == "" {
				role = "user"
			}
			text := strings.TrimSpace(extractMessageText(message))
			if text == "" {
				continue
			}
			parts = append(parts, strings.ToUpper(role[:1])+role[1:]+":\n"+text)
		}
	}
	if prompt := strings.TrimSpace(stringValue(inputs["prompt"])); prompt != "" {
		parts = append(parts, prompt)
	}
	if attachmentText := strings.TrimSpace(stringValue(inputs["attachmentText"])); attachmentText != "" {
		parts = append(parts, attachmentText)
	}
	combined := strings.TrimSpace(strings.Join(parts, "\n\n"))
	if combined == "" {
		return "\n"
	}
	return combined + "\n"
}

func extractPluginSessionID(payload map[string]any) string {
	for _, key := range []string{"sessionId", "session_id", "sessionID"} {
		if value := strings.TrimSpace(stringValue(payload[key])); value != "" {
			return value
		}
	}
	return ""
}

func extractPluginThreadID(payload map[string]any) string {
	for _, key := range []string{"threadId", "thread_id"} {
		if value := strings.TrimSpace(stringValue(payload[key])); value != "" {
			return value
		}
	}
	return ""
}

func buildPluginApprovalArguments(payload map[string]any) map[string]any {
	approvalID := strings.TrimSpace(stringValue(payload["approvalId"]))
	toolName := strings.TrimSpace(stringValue(payload["toolName"]))
	if toolName == "" {
		toolName = strings.TrimSpace(stringValue(payload["tool_name"]))
	}
	if toolName == "" {
		if tool, ok := payload["tool"].(string); ok {
			toolName = strings.TrimSpace(tool)
		} else if tool, ok := mapValue(payload["tool"]); ok {
			toolName = strings.TrimSpace(stringValue(tool["name"]))
		}
	}
	arguments := map[string]any{
		"approvalId": approvalID,
		"toolName":   toolName,
		"toolType":   stringValue(payload["toolType"]),
	}
	if strings.TrimSpace(stringValue(payload["toolType"])) == "" {
		arguments["toolType"] = stringValue(payload["tool_type"])
	}
	if payload["tool"] != nil {
		arguments["tool"] = deepCloneJSONValue(payload["tool"])
	}
	if payload["input"] != nil {
		arguments["input"] = deepCloneJSONValue(payload["input"])
	}
	return arguments
}

func (p *pluginEventParser) appendText(state *ChatState, text string, plainFallback bool) bool {
	if state == nil {
		return false
	}
	delta := text
	if plainFallback && p.lastChunkWasPlain {
		delta = "\n" + delta
	}
	if p.currentMessageID == "" {
		p.currentMessageID = "plugin-message-" + strings.ReplaceAll(strings.TrimSpace(createRandomID()), "-", "")
	}
	appendAssistantDelta(state, p.currentMessageID, delta)
	p.lastChunkWasPlain = plainFallback
	return true
}

func createRandomID() string {
	now := time.Now().UTC().UnixNano()
	return fmt.Sprintf("%d", now)
}

type pluginRunController struct {
	session *pluginSession

	runtimeReady     chan struct{}
	runtimeReadyOnce sync.Once
	cancelled        chan struct{}
	cancelledOnce    sync.Once
}

func (c *pluginRunController) Cancel() error {
	if c == nil || c.session == nil {
		return nil
	}
	c.cancelledOnce.Do(func() {
		close(c.cancelled)
	})
	return c.session.terminate()
}

func (c *pluginRunController) SendApprovalResponse(approvalID string, approved bool) error {
	if c == nil || c.session == nil {
		return ErrRunNotActive
	}
	return c.session.writeJSON(map[string]any{
		"type":       "approval_response",
		"approvalId": approvalID,
		"approved":   approved,
	})
}

func (c *pluginRunController) SendToolResponse(toolCallID string, payload map[string]any) error {
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

func (c *pluginRunController) markRuntimeReady() {
	if c == nil {
		return
	}
	c.runtimeReadyOnce.Do(func() {
		close(c.runtimeReady)
	})
}

func (c *pluginRunController) waitForRuntimeReady() bool {
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

type pluginSession struct {
	cmd   *exec.Cmd
	stdin io.WriteCloser

	writeMu sync.Mutex

	stderrMu    sync.Mutex
	stderrLines []string

	termMu     sync.Mutex
	terminated bool

	waitCh chan error
	events chan pluginStreamEvent
}

func newPluginSession(cmd *exec.Cmd, stdin io.WriteCloser) *pluginSession {
	return &pluginSession{
		cmd:    cmd,
		stdin:  stdin,
		waitCh: make(chan error, 1),
		events: make(chan pluginStreamEvent, 128),
	}
}

func (s *pluginSession) start(stdout io.Reader, stderr io.Reader) {
	go func() {
		s.readStdout(stdout)
		s.waitCh <- s.cmd.Wait()
		close(s.events)
	}()
	go s.readStderr(stderr)
}

func (s *pluginSession) readStdout(stdout io.Reader) {
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 16*1024), pluginStdoutBufferSize)
	for scanner.Scan() {
		line := scanner.Text()
		payload := map[string]any{}
		if err := json.Unmarshal([]byte(line), &payload); err == nil {
			s.events <- pluginStreamEvent{payload: payload}
			continue
		}
		text := line
		s.events <- pluginStreamEvent{plainText: &text}
	}
	if err := scanner.Err(); err != nil {
		s.events <- pluginStreamEvent{
			payload: map[string]any{
				"type":    "error",
				"message": fmt.Sprintf("read plugin adapter stdout: %v", err),
			},
		}
	}
}

func (s *pluginSession) readStderr(stderr io.Reader) {
	scanner := bufio.NewScanner(stderr)
	scanner.Buffer(make([]byte, 0, 16*1024), pluginStdoutBufferSize)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		s.stderrMu.Lock()
		s.stderrLines = append(s.stderrLines, line)
		if len(s.stderrLines) > pluginMaxStderrLines {
			s.stderrLines = append([]string(nil), s.stderrLines[len(s.stderrLines)-pluginMaxStderrLines:]...)
		}
		s.stderrMu.Unlock()
	}
}

func (s *pluginSession) writeJSON(payload map[string]any) error {
	if s == nil || s.stdin == nil {
		return ErrRunNotActive
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	content, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode plugin payload: %w", err)
	}
	if _, err := s.stdin.Write(append(content, '\n')); err != nil {
		return fmt.Errorf("write plugin payload: %w", err)
	}
	return nil
}

func (s *pluginSession) terminate() error {
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

func (s *pluginSession) finalizeAfterDone() error {
	if s == nil || s.cmd == nil || s.cmd.Process == nil {
		return nil
	}
	done := make(chan error, 1)
	go func() {
		done <- s.processErr()
	}()
	select {
	case err := <-done:
		return err
	case <-time.After(pluginDoneExitGraceTimeout):
	}
	if err := s.cmd.Process.Signal(os.Interrupt); err != nil && !errors.Is(err, os.ErrProcessDone) {
		_ = s.cmd.Process.Kill()
	}
	select {
	case err := <-done:
		return err
	case <-time.After(pluginDoneTerminateGraceTimeout):
	}
	if err := s.cmd.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return err
	}
	return <-done
}

func (s *pluginSession) processErr() error {
	if s == nil {
		return nil
	}
	return <-s.waitCh
}

func (s *pluginSession) stderrTail() []string {
	s.stderrMu.Lock()
	defer s.stderrMu.Unlock()
	return append([]string(nil), s.stderrLines...)
}
