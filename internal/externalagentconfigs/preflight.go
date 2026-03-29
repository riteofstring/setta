package externalagentconfigs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"setta/internal/llmconfig"
)

type Status struct {
	ConfigID    string       `json:"configId"`
	Name        string       `json:"name"`
	ToolType    ToolType     `json:"toolType"`
	RunMode     RunMode      `json:"runMode"`
	Supported   bool         `json:"supported"`
	Available   bool         `json:"available"`
	Issues      []string     `json:"issues"`
	BaseURL     *string      `json:"baseUrl,omitempty"`
	WorkingDir  *string      `json:"workingDir,omitempty"`
	CommandPath *string      `json:"commandPath,omitempty"`
	NodeVersion *string      `json:"nodeVersion,omitempty"`
	SDKVersion  *string      `json:"sdkVersion,omitempty"`
	CLIVersion  *string      `json:"cliVersion,omitempty"`
	EnvVars     EnvVarStatus `json:"envVars"`
}

const defaultCLITimeout = 5 * time.Second
const preflightCacheTTL = 30 * time.Second

type Checker interface {
	Check(config Config) (Status, error)
}

type SystemCheckerOptions struct {
	WorkspaceRoot          string
	ManagedAPIKeysLockRoot string
	ProcessEnv             map[string]string
	Now                    func() time.Time
}

type SystemChecker struct {
	workspaceRoot          string
	managedAPIKeysLockRoot string
	processEnv             map[string]string
	now                    func() time.Time
	cacheMu                sync.Mutex
	cache                  map[string]preflightCacheEntry
}

type preflightCacheEntry struct {
	fingerprint string
	status      Status
	createdAt   time.Time
}

type preflightCacheFingerprint struct {
	Config           Config   `json:"config"`
	PresentEnvVars   []string `json:"presentEnvVars"`
	MissingEnvVars   []string `json:"missingEnvVars"`
	CorruptionIssue  string   `json:"corruptionIssue"`
	UnavailableIssue string   `json:"unavailableIssue"`
	WorkingDir       *string  `json:"workingDir,omitempty"`
	WorkingDirIssue  string   `json:"workingDirIssue"`
	BaseURL          *string  `json:"baseUrl,omitempty"`
	BaseURLIssue     string   `json:"baseUrlIssue"`
	CommandPath      *string  `json:"commandPath,omitempty"`
	CommandPathIssue string   `json:"commandPathIssue"`
}

func cloneStatus(status Status) Status {
	cloned := status
	cloned.Issues = append([]string(nil), status.Issues...)
	cloned.BaseURL = cloneStringPtr(status.BaseURL)
	cloned.WorkingDir = cloneStringPtr(status.WorkingDir)
	cloned.CommandPath = cloneStringPtr(status.CommandPath)
	cloned.NodeVersion = cloneStringPtr(status.NodeVersion)
	cloned.SDKVersion = cloneStringPtr(status.SDKVersion)
	cloned.CLIVersion = cloneStringPtr(status.CLIVersion)
	cloned.EnvVars = EnvVarStatus{
		Present: append([]string(nil), status.EnvVars.Present...),
		Missing: append([]string(nil), status.EnvVars.Missing...),
	}
	return cloned
}

func buildPreflightCacheFingerprint(value preflightCacheFingerprint) (string, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", fmt.Errorf("encode preflight cache fingerprint: %w", err)
	}
	return string(encoded), nil
}

func NewSystemChecker(options SystemCheckerOptions) (*SystemChecker, error) {
	workspaceRoot := strings.TrimSpace(options.WorkspaceRoot)
	if workspaceRoot == "" {
		return nil, ErrWorkspaceRequired
	}
	processEnv := cloneStringMap(options.ProcessEnv)
	if processEnv == nil {
		processEnv = llmconfig.CurrentProcessEnv()
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	return &SystemChecker{
		workspaceRoot:          workspaceRoot,
		managedAPIKeysLockRoot: strings.TrimSpace(options.ManagedAPIKeysLockRoot),
		processEnv:             processEnv,
		now:                    now,
		cache:                  map[string]preflightCacheEntry{},
	}, nil
}

func (c *SystemChecker) Check(config Config) (Status, error) {
	normalized, err := normalizeConfig(config, 0)
	if err != nil {
		return Status{}, err
	}
	issues := []string{}
	blockingIssueCount := 0
	addIssue := func(issue string, blocking bool) {
		if strings.TrimSpace(issue) == "" {
			return
		}
		issues = append(issues, issue)
		if blocking {
			blockingIssueCount++
		}
	}
	supported := isSupported(normalized.ToolType, normalized.RunMode)
	effectiveEnvVarWhitelist := append([]string(nil), normalized.EnvVarWhitelist...)
	if !supported {
		addIssue(fmt.Sprintf("Run mode %s not supported for %s", normalized.RunMode, normalized.ToolType), true)
	}
	envVars := ResolveWhitelistedEnvVars(c.workspaceRoot, c.managedAPIKeysLockRoot, c.processEnv, effectiveEnvVarWhitelist)
	managedStoreIssueBlocks := len(envVars.Status.Missing) > 0
	if envVars.CorruptionIssue != "" {
		addIssue(envVars.CorruptionIssue, managedStoreIssueBlocks)
	}
	if envVars.UnavailableIssue != "" {
		addIssue(envVars.UnavailableIssue, managedStoreIssueBlocks)
	}
	if len(envVars.Status.Missing) > 0 {
		addIssue(fmt.Sprintf("Missing env vars: %s", strings.Join(envVars.Status.Missing, ", ")), true)
	}
	workingDir, workingDirIssue := c.resolveWorkingDir(normalized)
	baseURL, baseURLIssue := validateBaseURL(normalized)
	commandPath, commandIssue := c.resolveCommandPath(normalized)
	cacheFingerprint, err := buildPreflightCacheFingerprint(preflightCacheFingerprint{
		Config:           cloneConfig(normalized),
		PresentEnvVars:   append([]string(nil), envVars.Status.Present...),
		MissingEnvVars:   append([]string(nil), envVars.Status.Missing...),
		CorruptionIssue:  envVars.CorruptionIssue,
		UnavailableIssue: envVars.UnavailableIssue,
		WorkingDir:       cloneStringPtr(workingDir),
		WorkingDirIssue:  workingDirIssue,
		BaseURL:          cloneStringPtr(baseURL),
		BaseURLIssue:     baseURLIssue,
		CommandPath:      cloneStringPtr(commandPath),
		CommandPathIssue: commandIssue,
	})
	if err != nil {
		return Status{}, err
	}
	if cached, ok := c.loadCachedStatus(normalized.ID, cacheFingerprint); ok {
		return cached, nil
	}
	if workingDirIssue != "" {
		addIssue(workingDirIssue, true)
	}
	if baseURLIssue != "" {
		addIssue(baseURLIssue, true)
	}
	if commandIssue != "" {
		addIssue(commandIssue, true)
	}
	var (
		nodeVersion *string
		sdkVersion  *string
		cliVersion  *string
	)
	if normalized.ToolType == ToolTypeClaudeCode && normalized.RunMode == RunModeSDK {
		pythonCommand, err := ResolveClaudePythonCommand()
		if err != nil {
			addIssue(fmt.Sprintf("Claude bridge python unavailable (%v)", err), true)
		} else if version, issue := readClaudeSDKVersion(pythonCommand, c.workspaceRoot); issue != "" {
			if err := CheckClaudeSDKImport(pythonCommand); err != nil {
				addIssue(fmt.Sprintf("claude-agent-sdk not available for %s", pythonCommand), true)
			} else {
				addIssue(issue, true)
			}
		} else {
			sdkVersion = version
		}
	}
	if normalized.ToolType == ToolTypeOpenCode && (normalized.RunMode == RunModeSDK || normalized.RunMode == RunModeServer) {
		if commandPath != nil {
			if version, issue := readVersionCommand(*commandPath, c.workspaceRoot, []string{"--version"}, "Failed to read Node version"); issue != "" {
				addIssue(issue, true)
			} else {
				nodeVersion = version
			}
		}
		if version, issue := readOpenCodeSDKVersion(); issue != "" {
			addIssue(issue, true)
		} else {
			sdkVersion = version
		}
	}
	if normalized.ToolType == ToolTypeOpenCode && normalized.RunMode == RunModeSDK && strings.TrimSpace(derefOptionalString(normalized.BaseURL)) == "" {
		opencodePath, err := exec.LookPath("opencode")
		if err != nil {
			addIssue("opencode CLI not found (install opencode CLI)", true)
		} else if version, issue := readVersionCommand(opencodePath, c.workspaceRoot, []string{"--version"}, "Failed to read opencode CLI version"); issue != "" {
			addIssue(issue, true)
		} else {
			cliVersion = version
		}
	}
	if normalized.ToolType == ToolTypeCodex && normalized.RunMode == RunModeAppServer && commandPath != nil {
		if version, issue := readVersionCommand(*commandPath, c.workspaceRoot, []string{"--version"}, "Failed to read codex CLI version"); issue != "" {
			addIssue(issue, true)
		} else {
			cliVersion = version
		}
	}

	status := Status{
		ConfigID:    normalized.ID,
		Name:        normalized.Name,
		ToolType:    normalized.ToolType,
		RunMode:     normalized.RunMode,
		Supported:   supported,
		Available:   supported && blockingIssueCount == 0,
		Issues:      append([]string(nil), issues...),
		BaseURL:     baseURL,
		WorkingDir:  workingDir,
		CommandPath: commandPath,
		NodeVersion: cloneStringPtr(nodeVersion),
		SDKVersion:  cloneStringPtr(sdkVersion),
		CLIVersion:  cloneStringPtr(cliVersion),
		EnvVars: EnvVarStatus{
			Present: append([]string(nil), envVars.Status.Present...),
			Missing: append([]string(nil), envVars.Status.Missing...),
		},
	}
	c.storeCachedStatus(normalized.ID, cacheFingerprint, status)
	return status, nil
}

func (c *SystemChecker) loadCachedStatus(configID string, fingerprint string) (Status, bool) {
	if c == nil {
		return Status{}, false
	}
	now := c.now()
	c.cacheMu.Lock()
	defer c.cacheMu.Unlock()
	entry, ok := c.cache[configID]
	if !ok {
		return Status{}, false
	}
	if now.Sub(entry.createdAt) > preflightCacheTTL {
		delete(c.cache, configID)
		return Status{}, false
	}
	if entry.fingerprint != fingerprint {
		return Status{}, false
	}
	return cloneStatus(entry.status), true
}

func (c *SystemChecker) storeCachedStatus(configID string, fingerprint string, status Status) {
	if c == nil {
		return
	}
	c.cacheMu.Lock()
	defer c.cacheMu.Unlock()
	c.cache[configID] = preflightCacheEntry{
		fingerprint: fingerprint,
		status:      cloneStatus(status),
		createdAt:   c.now(),
	}
}

func isSupported(toolType ToolType, runMode RunMode) bool {
	switch toolType {
	case ToolTypeCodex:
		return runMode == RunModeAppServer
	case ToolTypeClaudeCode:
		return runMode == RunModeSDK
	case ToolTypeOpenCode:
		return runMode == RunModeSDK || runMode == RunModeServer
	default:
		return false
	}
}

func (c *SystemChecker) resolveWorkingDir(config Config) (*string, string) {
	switch config.WorkingDirStrategy {
	case WorkingDirStrategyProjectRoot:
		root := c.workspaceRoot
		return &root, ""
	case WorkingDirStrategyTempDir:
		tempDir := os.TempDir()
		return &tempDir, ""
	case WorkingDirStrategyCustom:
		if config.WorkingDir == nil || strings.TrimSpace(*config.WorkingDir) == "" {
			return nil, "Custom working directory requires workingDir."
		}
		resolved := strings.TrimSpace(*config.WorkingDir)
		return &resolved, ""
	default:
		return nil, ""
	}
}

func validateBaseURL(config Config) (*string, string) {
	if config.RunMode != RunModeServer {
		return cloneStringPtr(config.BaseURL), ""
	}
	if config.BaseURL == nil || strings.TrimSpace(*config.BaseURL) == "" {
		return nil, "Server mode requires baseUrl."
	}
	resolved := strings.TrimSpace(*config.BaseURL)
	parsed, err := url.Parse(resolved)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, "Server mode baseUrl must be a valid absolute URL."
	}
	return &resolved, ""
}

func (c *SystemChecker) resolveCommandPath(config Config) (*string, string) {
	commandName := defaultCommand(config)
	if config.CommandPath != nil && strings.TrimSpace(*config.CommandPath) != "" {
		commandName = strings.TrimSpace(*config.CommandPath)
	}
	if commandName == "" {
		return nil, ""
	}
	resolved, err := exec.LookPath(commandName)
	if err != nil {
		if config.ToolType == ToolTypeCodex {
			return nil, fmt.Sprintf("codex CLI not found (%s)", commandName)
		}
		return nil, fmt.Sprintf("Command not found (%s)", commandName)
	}
	normalized := resolved
	return &normalized, ""
}

func defaultCommand(config Config) string {
	switch {
	case config.ToolType == ToolTypeCodex && config.RunMode == RunModeAppServer:
		return "codex"
	case config.ToolType == ToolTypeClaudeCode && config.RunMode == RunModeSDK:
		return "claude"
	case config.ToolType == ToolTypeOpenCode && (config.RunMode == RunModeSDK || config.RunMode == RunModeServer):
		return "node"
	default:
		return ""
	}
}

type cliCommandResult struct {
	Output   string
	ExitCode int
}

func runCLI(command []string, workingDir string, timeout time.Duration) (*cliCommandResult, string) {
	if len(command) == 0 {
		return nil, "command is required"
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, command[0], command[1:]...)
	cmd.Dir = workingDir
	output, err := cmd.CombinedOutput()
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return nil, fmt.Sprintf("Timed out running %s", strings.Join(command, " "))
	}
	trimmedOutput := strings.TrimSpace(string(output))
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return &cliCommandResult{
				Output:   trimmedOutput,
				ExitCode: exitErr.ExitCode(),
			}, ""
		}
		return nil, fmt.Sprintf("Failed to run %s: %v", strings.Join(command, " "), err)
	}
	return &cliCommandResult{Output: trimmedOutput, ExitCode: 0}, ""
}

func readVersionCommand(commandPath string, workingDir string, args []string, failureMessage string) (*string, string) {
	command := append([]string{commandPath}, args...)
	result, issue := runCLI(command, workingDir, defaultCLITimeout)
	if issue != "" {
		return nil, issue
	}
	if result == nil || result.ExitCode != 0 || strings.TrimSpace(result.Output) == "" {
		return nil, failureMessage
	}
	version := strings.TrimSpace(result.Output)
	return &version, ""
}

func readOpenCodeSDKVersion() (*string, string) {
	sidecarRoot, err := defaultExternalAgentSidecarRoot()
	if err != nil {
		return nil, fmt.Sprintf("Failed to resolve @opencode-ai/sdk version: %v", err)
	}
	return readOpenCodeSDKVersionFromSidecarRoot(sidecarRoot)
}

func readOpenCodeSDKVersionFromSidecarRoot(sidecarRoot string) (*string, string) {
	packageJSONPath := filepath.Join(sidecarRoot, "node_modules", "@opencode-ai", "sdk", "package.json")
	content, err := os.ReadFile(packageJSONPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Sprintf("@opencode-ai/sdk is not installed (run pnpm install in %s)", sidecarRoot)
		}
		return nil, fmt.Sprintf("Failed to read @opencode-ai/sdk version: %v", err)
	}
	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		return nil, fmt.Sprintf("Failed to read @opencode-ai/sdk version: %v", err)
	}
	rawVersion, ok := payload["version"].(string)
	version := strings.TrimSpace(rawVersion)
	if !ok || version == "" {
		return nil, "@opencode-ai/sdk did not report a version"
	}
	return &version, ""
}

func readClaudeSDKVersion(pythonCommand string, workingDir string) (*string, string) {
	versionScript := `import importlib.metadata; print(importlib.metadata.version("claude-agent-sdk"))`
	return readVersionCommand(pythonCommand, workingDir, []string{"-c", versionScript}, "claude-agent-sdk did not report a version")
}

func defaultExternalAgentSidecarRoot() (string, error) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("resolve sidecar root: runtime caller unavailable")
	}
	return filepath.Clean(filepath.Join(
		filepath.Dir(currentFile),
		"..",
		"..",
		"backend",
		"setta",
		"agentic",
		"external_adapters",
		"sidecars",
	)), nil
}

func derefOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}
