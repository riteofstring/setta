package externalagentconfigs

import (
	"strings"

	"setta/internal/llmconfig"
)

const (
	managedAPIKeysCorruptIssue     = ".env API key store metadata is corrupt; open LLM settings and save API keys to repair."
	managedAPIKeysUnavailableIssue = ".env API key store is unavailable; check filesystem path and permissions."
)

type EnvVarStatus struct {
	Present []string `json:"present"`
	Missing []string `json:"missing"`
}

type EnvVarResolution struct {
	EnvVars          map[string]string
	Status           EnvVarStatus
	CorruptionIssue  string
	UnavailableIssue string
}

func ResolveWhitelistedEnvVars(workspaceRoot string, managedAPIKeysLockRoot string, processEnv map[string]string, whitelist []string) EnvVarResolution {
	normalized := normalizeStringList(whitelist)
	resolution := EnvVarResolution{
		EnvVars: map[string]string{},
		Status: EnvVarStatus{
			Present: []string{},
			Missing: []string{},
		},
	}
	if len(normalized) == 0 {
		return resolution
	}

	managedAPIKeysResult := llmconfig.ReadManagedAPIKeysWithStatusInLockRoot(
		llmconfig.ManagedAPIKeysPath(workspaceRoot),
		managedAPIKeysLockRoot,
	)
	for _, name := range normalized {
		processValue := processEnv[name]
		if strings.TrimSpace(processValue) != "" {
			resolution.EnvVars[name] = processValue
			resolution.Status.Present = append(resolution.Status.Present, name)
			continue
		}
		managedValue := managedAPIKeysResult.APIKeys[name]
		if strings.TrimSpace(managedValue) != "" {
			resolution.EnvVars[name] = managedValue
			resolution.Status.Present = append(resolution.Status.Present, name)
			continue
		}
		resolution.Status.Missing = append(resolution.Status.Missing, name)
	}

	if managedAPIKeysResult.Corrupt {
		resolution.CorruptionIssue = managedAPIKeysCorruptIssue
	} else if managedAPIKeysResult.ErrorCode == llmconfig.ManagedAPIKeysUnavailableErrorCode {
		resolution.UnavailableIssue = managedAPIKeysUnavailableIssue
	}

	return resolution
}

func cloneStringMap(input map[string]string) map[string]string {
	if input == nil {
		return nil
	}
	cloned := make(map[string]string, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}
