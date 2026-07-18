package chat

import (
	"encoding/json"
	"fmt"
	"path/filepath"

	"setta/internal/codexapp"
)

type codexWorkspaceWriteSandboxPolicy struct {
	Type                string   `json:"type"`
	WritableRoots       []string `json:"writableRoots"`
	NetworkAccess       bool     `json:"networkAccess"`
	ExcludeSlashTmp     bool     `json:"excludeSlashTmp"`
	ExcludeTmpdirEnvVar bool     `json:"excludeTmpdirEnvVar"`
}

type codexReadOnlySandboxPolicyValue struct {
	Type          string `json:"type"`
	NetworkAccess bool   `json:"networkAccess"`
}

func enforceCodexRepositoryBoundarySettings(settings *codexCommandThreadSettings) error {
	settings.ApprovalPolicy = codexApprovalPolicyNever
	settings.ActivePermissionProfileExtends = ""
	switch settings.ActivePermissionProfileID {
	case "", codexPermissionProfileWorkspace:
		settings.ActivePermissionProfileID = codexPermissionProfileWorkspace
	case codexPermissionProfileReadOnly:
	default:
		return fmt.Errorf("codex permission profile %q is outside Setta's repository boundary", settings.ActivePermissionProfileID)
	}
	return nil
}

func codexSandboxMode(settings codexCommandThreadSettings) (string, error) {
	switch settings.ActivePermissionProfileID {
	case codexPermissionProfileReadOnly:
		return "read-only", nil
	case "", codexPermissionProfileWorkspace:
		return "workspace-write", nil
	default:
		return "", fmt.Errorf("codex permission profile %q is outside Setta's repository boundary", settings.ActivePermissionProfileID)
	}
}

func codexRepositorySandboxPolicy(workspaceRoot string, settings codexCommandThreadSettings) (codexapp.SandboxPolicy, error) {
	if workspaceRoot == "" || !filepath.IsAbs(workspaceRoot) {
		return nil, fmt.Errorf("codex workspace root must be absolute: %q", workspaceRoot)
	}
	var value any
	switch settings.ActivePermissionProfileID {
	case codexPermissionProfileReadOnly:
		value = codexReadOnlySandboxPolicyValue{Type: "readOnly", NetworkAccess: false}
	case "", codexPermissionProfileWorkspace:
		value = codexWorkspaceWriteSandboxPolicy{
			Type:                "workspaceWrite",
			WritableRoots:       []string{},
			NetworkAccess:       false,
			ExcludeSlashTmp:     true,
			ExcludeTmpdirEnvVar: true,
		}
	default:
		return nil, fmt.Errorf("codex permission profile %q is outside Setta's repository boundary", settings.ActivePermissionProfileID)
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("encode codex repository sandbox policy: %w", err)
	}
	return codexapp.SandboxPolicy(payload), nil
}
