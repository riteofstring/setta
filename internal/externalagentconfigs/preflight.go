package externalagentconfigs

import (
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"strings"

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
	EnvVars     EnvVarStatus `json:"envVars"`
}

type Checker interface {
	Check(config Config) (Status, error)
}

type SystemCheckerOptions struct {
	WorkspaceRoot         string
	ProcessEnv            map[string]string
	PluginAdapterProvider PluginExternalAgentAdapterProvider
}

type SystemChecker struct {
	workspaceRoot         string
	processEnv            map[string]string
	pluginAdapterProvider PluginExternalAgentAdapterProvider
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
	return &SystemChecker{
		workspaceRoot:         workspaceRoot,
		processEnv:            processEnv,
		pluginAdapterProvider: options.PluginAdapterProvider,
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
	pluginAdapter, pluginResolutionIssue, pluginRunModeSupported, err := c.resolvePluginAdapter(normalized)
	if err != nil {
		return Status{}, err
	}
	effectiveEnvVarWhitelist := append([]string(nil), normalized.EnvVarWhitelist...)
	if pluginResolutionIssue != "" {
		supported = false
		addIssue(pluginResolutionIssue, true)
	} else if normalized.ToolType == ToolTypePlugin {
		effectiveEnvVarWhitelist = append(effectiveEnvVarWhitelist, pluginAdapter.EnvVarWhitelist...)
		supported = pluginRunModeSupported
		if !supported {
			addIssue(fmt.Sprintf("Run mode %s not supported for %s", normalized.RunMode, normalized.ToolType), true)
		}
	} else if !supported {
		addIssue(fmt.Sprintf("Run mode %s not supported for %s", normalized.RunMode, normalized.ToolType), true)
	}
	envVars := ResolveWhitelistedEnvVars(c.workspaceRoot, c.processEnv, effectiveEnvVarWhitelist)
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
	if workingDirIssue != "" {
		addIssue(workingDirIssue, true)
	}
	baseURL, baseURLIssue := validateBaseURL(normalized)
	if baseURLIssue != "" {
		addIssue(baseURLIssue, true)
	}
	commandPath, commandIssue := c.resolveCommandPath(normalized, pluginAdapter)
	if commandIssue != "" {
		addIssue(commandIssue, true)
	}
	if normalized.ToolType == ToolTypeClaudeCode && normalized.RunMode == RunModeSDK {
		pythonCommand, err := ResolveClaudePythonCommand()
		if err != nil {
			addIssue(fmt.Sprintf("Claude bridge python unavailable (%v)", err), true)
		} else if err := CheckClaudeSDKImport(pythonCommand); err != nil {
			addIssue(fmt.Sprintf("claude-agent-sdk not available for %s", pythonCommand), true)
		}
	}
	if normalized.ToolType == ToolTypeOpenCode && normalized.RunMode == RunModeSDK && strings.TrimSpace(derefOptionalString(normalized.BaseURL)) == "" {
		if _, err := exec.LookPath("opencode"); err != nil {
			addIssue("opencode CLI not found (install opencode CLI)", true)
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
		EnvVars: EnvVarStatus{
			Present: append([]string(nil), envVars.Status.Present...),
			Missing: append([]string(nil), envVars.Status.Missing...),
		},
	}
	return status, nil
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

func (c *SystemChecker) resolvePluginAdapter(config Config) (*PluginExternalAgentAdapter, string, bool, error) {
	if config.ToolType != ToolTypePlugin {
		return nil, "", false, nil
	}
	pluginAdapterID := strings.TrimSpace(derefOptionalString(config.PluginAdapterID))
	if pluginAdapterID == "" {
		return nil, "pluginAdapterId is required for plugin external agents", false, nil
	}
	if c.pluginAdapterProvider == nil {
		return nil, fmt.Sprintf("Plugin external agent adapter is not registered: %s", pluginAdapterID), false, nil
	}
	adapters, err := c.pluginAdapterProvider.RegisteredExternalAgentAdapters()
	if err != nil {
		return nil, "", false, err
	}
	for _, adapter := range adapters {
		if strings.TrimSpace(adapter.AdapterID) != pluginAdapterID {
			continue
		}
		runModeSupported := false
		for _, runMode := range adapter.RunModes {
			if strings.TrimSpace(runMode) == string(config.RunMode) {
				runModeSupported = true
				break
			}
		}
		resolved := adapter
		return &resolved, "", runModeSupported, nil
	}
	return nil, fmt.Sprintf("Plugin external agent adapter is not registered: %s", pluginAdapterID), false, nil
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

func (c *SystemChecker) resolveCommandPath(config Config, pluginAdapter *PluginExternalAgentAdapter) (*string, string) {
	commandName := defaultCommand(config, pluginAdapter)
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
		if config.ToolType == ToolTypePlugin {
			return nil, fmt.Sprintf("Plugin external agent command not found (%s)", commandName)
		}
		return nil, fmt.Sprintf("Command not found (%s)", commandName)
	}
	normalized := resolved
	return &normalized, ""
}

func defaultCommand(config Config, pluginAdapter *PluginExternalAgentAdapter) string {
	switch {
	case config.ToolType == ToolTypeCodex && config.RunMode == RunModeAppServer:
		return "codex"
	case config.ToolType == ToolTypeClaudeCode && config.RunMode == RunModeSDK:
		return "claude"
	case config.ToolType == ToolTypeOpenCode && (config.RunMode == RunModeSDK || config.RunMode == RunModeServer):
		return "node"
	case config.ToolType == ToolTypePlugin && pluginAdapter != nil:
		return strings.TrimSpace(pluginAdapter.Command)
	default:
		return ""
	}
}

func derefOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}
