package externalagentconfigs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
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

type preflightIssues struct {
	items         []string
	blockingCount int
}

type preparedPreflightStatus struct {
	normalized       Config
	supported        bool
	envVars          EnvVarResolution
	workingDir       *string
	workingDirIssue  string
	baseURL          *string
	baseURLIssue     string
	commandPath      *string
	commandPathIssue string
	cacheFingerprint string
	sdkVersion       *string
	cliVersion       *string
	issues           preflightIssues
}

func (i *preflightIssues) add(issue string, blocking bool) {
	if strings.TrimSpace(issue) == "" {
		return
	}
	i.items = append(i.items, issue)
	if blocking {
		i.blockingCount++
	}
}

func cloneStatus(status Status) Status {
	cloned := status
	cloned.Issues = append([]string(nil), status.Issues...)
	cloned.BaseURL = cloneStringPtr(status.BaseURL)
	cloned.WorkingDir = cloneStringPtr(status.WorkingDir)
	cloned.CommandPath = cloneStringPtr(status.CommandPath)
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
	prepared, err := c.prepareStatus(config)
	if err != nil {
		return Status{}, err
	}
	if cached, ok := c.loadCachedStatus(prepared.normalized.ID, prepared.cacheFingerprint); ok {
		return cached, nil
	}
	prepared.probeRuntimeVersions(c.workspaceRoot)
	status := prepared.status()
	c.storeCachedStatus(prepared.normalized.ID, prepared.cacheFingerprint, status)
	return status, nil
}

func (c *SystemChecker) prepareStatus(config Config) (preparedPreflightStatus, error) {
	normalized, err := normalizeConfig(config, 0)
	if err != nil {
		return preparedPreflightStatus{}, err
	}
	prepared := preparedPreflightStatus{
		normalized: normalized,
		supported:  isSupported(normalized.ToolType, normalized.RunMode),
	}
	prepared.collectSupportAndEnvIssues(c)
	prepared.resolvePaths(c)
	fingerprint, err := prepared.buildCacheFingerprint()
	if err != nil {
		return preparedPreflightStatus{}, err
	}
	prepared.cacheFingerprint = fingerprint
	return prepared, nil
}

func (p *preparedPreflightStatus) collectSupportAndEnvIssues(c *SystemChecker) {
	if !p.supported {
		p.issues.add(fmt.Sprintf("Run mode %s not supported for %s", p.normalized.RunMode, p.normalized.ToolType), true)
	}
	effectiveEnvVarWhitelist := append([]string(nil), p.normalized.EnvVarWhitelist...)
	p.envVars = ResolveWhitelistedEnvVars(c.workspaceRoot, c.managedAPIKeysLockRoot, c.processEnv, effectiveEnvVarWhitelist)
	managedStoreIssueBlocks := len(p.envVars.Status.Missing) > 0
	if p.envVars.CorruptionIssue != "" {
		p.issues.add(p.envVars.CorruptionIssue, managedStoreIssueBlocks)
	}
	if p.envVars.UnavailableIssue != "" {
		p.issues.add(p.envVars.UnavailableIssue, managedStoreIssueBlocks)
	}
	if len(p.envVars.Status.Missing) > 0 {
		p.issues.add(fmt.Sprintf("Missing env vars: %s", strings.Join(p.envVars.Status.Missing, ", ")), true)
	}
}

func (p *preparedPreflightStatus) resolvePaths(c *SystemChecker) {
	p.workingDir, p.workingDirIssue = c.resolveWorkingDir(p.normalized)
	p.baseURL, p.baseURLIssue = validateBaseURL(p.normalized)
	p.commandPath, p.commandPathIssue = c.resolveCommandPath(p.normalized)
	p.issues.add(p.workingDirIssue, true)
	p.issues.add(p.baseURLIssue, true)
	p.issues.add(p.commandPathIssue, true)
}

func (p preparedPreflightStatus) buildCacheFingerprint() (string, error) {
	return buildPreflightCacheFingerprint(preflightCacheFingerprint{
		Config:           cloneConfig(p.normalized),
		PresentEnvVars:   append([]string(nil), p.envVars.Status.Present...),
		MissingEnvVars:   append([]string(nil), p.envVars.Status.Missing...),
		CorruptionIssue:  p.envVars.CorruptionIssue,
		UnavailableIssue: p.envVars.UnavailableIssue,
		WorkingDir:       cloneStringPtr(p.workingDir),
		WorkingDirIssue:  p.workingDirIssue,
		BaseURL:          cloneStringPtr(p.baseURL),
		BaseURLIssue:     p.baseURLIssue,
		CommandPath:      cloneStringPtr(p.commandPath),
		CommandPathIssue: p.commandPathIssue,
	})
}

func (p *preparedPreflightStatus) probeRuntimeVersions(workspaceRoot string) {
	switch {
	case p.normalized.ToolType == ToolTypeClaudeCode && p.normalized.RunMode == RunModeSDK:
		p.sdkVersion = probeClaudeSDKVersion(workspaceRoot, &p.issues)
	case p.normalized.ToolType == ToolTypeCodex && p.normalized.RunMode == RunModeAppServer:
		p.cliVersion = probeCodexCLIVersion(workspaceRoot, p.commandPath, &p.issues)
	}
}

func probeClaudeSDKVersion(workspaceRoot string, issues *preflightIssues) *string {
	pythonCommand, err := ResolveClaudePythonCommand()
	if err != nil {
		issues.add(fmt.Sprintf("Claude bridge python unavailable (%v)", err), true)
		return nil
	}
	version, issue := readClaudeSDKVersion(pythonCommand, workspaceRoot)
	if issue == "" {
		return version
	}
	if err := CheckClaudeSDKImport(pythonCommand); err != nil {
		issues.add(fmt.Sprintf("claude-agent-sdk not available for %s", pythonCommand), true)
		return nil
	}
	issues.add(issue, true)
	return nil
}

func probeCodexCLIVersion(workspaceRoot string, commandPath *string, issues *preflightIssues) *string {
	if commandPath == nil {
		return nil
	}
	version, issue := readVersionCommand(*commandPath, workspaceRoot, []string{"--version"}, "Failed to read codex CLI version")
	if issue != "" {
		issues.add(issue, true)
		return nil
	}
	return version
}

func (p preparedPreflightStatus) status() Status {
	return Status{
		ConfigID:    p.normalized.ID,
		Name:        p.normalized.Name,
		ToolType:    p.normalized.ToolType,
		RunMode:     p.normalized.RunMode,
		Supported:   p.supported,
		Available:   p.supported && p.issues.blockingCount == 0,
		Issues:      append([]string(nil), p.issues.items...),
		BaseURL:     p.baseURL,
		WorkingDir:  p.workingDir,
		CommandPath: p.commandPath,
		SDKVersion:  cloneStringPtr(p.sdkVersion),
		CLIVersion:  cloneStringPtr(p.cliVersion),
		EnvVars: EnvVarStatus{
			Present: append([]string(nil), p.envVars.Status.Present...),
			Missing: append([]string(nil), p.envVars.Status.Missing...),
		},
	}
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

func readClaudeSDKVersion(pythonCommand string, workingDir string) (*string, string) {
	versionScript := `import importlib.metadata; print(importlib.metadata.version("claude-agent-sdk"))`
	return readVersionCommand(pythonCommand, workingDir, []string{"-c", versionScript}, "claude-agent-sdk did not report a version")
}

func derefOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}
