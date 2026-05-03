package externalagents

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/externalagentconfigs"
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
