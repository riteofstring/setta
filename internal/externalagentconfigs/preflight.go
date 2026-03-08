package externalagentconfigs

import (
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"strings"
)

type Status struct {
	ConfigID    string   `json:"configId"`
	Name        string   `json:"name"`
	ToolType    ToolType `json:"toolType"`
	RunMode     RunMode  `json:"runMode"`
	Supported   bool     `json:"supported"`
	Available   bool     `json:"available"`
	Issues      []string `json:"issues"`
	BaseURL     *string  `json:"baseUrl,omitempty"`
	WorkingDir  *string  `json:"workingDir,omitempty"`
	CommandPath *string  `json:"commandPath,omitempty"`
}

type Checker interface {
	Check(config Config) (Status, error)
}

type SystemCheckerOptions struct {
	WorkspaceRoot string
}

type SystemChecker struct {
	workspaceRoot string
}

func NewSystemChecker(options SystemCheckerOptions) (*SystemChecker, error) {
	workspaceRoot := strings.TrimSpace(options.WorkspaceRoot)
	if workspaceRoot == "" {
		return nil, ErrWorkspaceRequired
	}
	return &SystemChecker{workspaceRoot: workspaceRoot}, nil
}

func (c *SystemChecker) Check(config Config) (Status, error) {
	normalized, err := normalizeConfig(config, 0)
	if err != nil {
		return Status{}, err
	}
	issues := []string{}
	supported := isSupported(normalized.ToolType, normalized.RunMode)
	if !supported {
		issues = append(issues, fmt.Sprintf("Run mode %s not supported for %s", normalized.RunMode, normalized.ToolType))
	}
	workingDir, workingDirIssue := c.resolveWorkingDir(normalized)
	if workingDirIssue != "" {
		issues = append(issues, workingDirIssue)
	}
	baseURL, baseURLIssue := validateBaseURL(normalized)
	if baseURLIssue != "" {
		issues = append(issues, baseURLIssue)
	}
	commandPath, commandIssue := c.resolveCommandPath(normalized)
	if commandIssue != "" {
		issues = append(issues, commandIssue)
	}
	if normalized.ToolType == ToolTypeOpenCode && normalized.RunMode == RunModeSDK && strings.TrimSpace(derefOptionalString(normalized.BaseURL)) == "" {
		if _, err := exec.LookPath("opencode"); err != nil {
			issues = append(issues, "opencode CLI not found (install opencode CLI)")
		}
	}

	status := Status{
		ConfigID:    normalized.ID,
		Name:        normalized.Name,
		ToolType:    normalized.ToolType,
		RunMode:     normalized.RunMode,
		Supported:   supported,
		Available:   supported && len(issues) == 0,
		Issues:      append([]string(nil), issues...),
		BaseURL:     baseURL,
		WorkingDir:  workingDir,
		CommandPath: commandPath,
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
	case config.ToolType == ToolTypeOpenCode && (config.RunMode == RunModeSDK || config.RunMode == RunModeServer):
		return "node"
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
