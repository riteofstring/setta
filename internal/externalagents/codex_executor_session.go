package externalagents

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/externalagentconfigs"

	toml "github.com/pelletier/go-toml/v2"
)

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
	if err := applyCodexRuntimeConfig(payload, config, workingDir, inputs, profile, completionGuardEnabled, e.settaToolRegistry, settaHeaders); err != nil {
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
	return loadCompletionGuardEnabled(ctx, e.settaFilesRoot)
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
