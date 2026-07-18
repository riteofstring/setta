package chat

import (
	"encoding/json"
	"testing"
)

func TestCodexRepositorySandboxPolicyRestrictsWorkspaceWrites(t *testing.T) {
	policy, err := codexRepositorySandboxPolicy("/tmp/workspace", codexCommandThreadSettings{
		ActivePermissionProfileID: codexPermissionProfileWorkspace,
	})
	if err != nil {
		t.Fatalf("repository sandbox policy: %v", err)
	}
	var value map[string]any
	if err := json.Unmarshal(policy, &value); err != nil {
		t.Fatalf("decode repository sandbox policy: %v", err)
	}
	if value["type"] != "workspaceWrite" || value["networkAccess"] != false || value["excludeSlashTmp"] != true || value["excludeTmpdirEnvVar"] != true {
		t.Fatalf("sandbox policy = %+v, want workspace-only writes with network and temp roots disabled", value)
	}
	writableRoots, ok := value["writableRoots"].([]any)
	if !ok || len(writableRoots) != 0 {
		t.Fatalf("sandbox writableRoots = %+v, want no roots beyond the workspace", value["writableRoots"])
	}
}

func TestCodexRepositorySandboxPolicyKeepsReadOnlyPresetReadOnly(t *testing.T) {
	policy, err := codexRepositorySandboxPolicy("/tmp/workspace", codexCommandThreadSettings{
		ActivePermissionProfileID: codexPermissionProfileReadOnly,
	})
	if err != nil {
		t.Fatalf("read-only sandbox policy: %v", err)
	}
	var value map[string]any
	if err := json.Unmarshal(policy, &value); err != nil {
		t.Fatalf("decode read-only sandbox policy: %v", err)
	}
	if value["type"] != "readOnly" || value["networkAccess"] != false {
		t.Fatalf("sandbox policy = %+v, want read-only without network", value)
	}
}

func TestCodexRepositoryBoundaryRejectsBroaderPermissionProfiles(t *testing.T) {
	settings := codexCommandThreadSettings{
		ApprovalPolicy:            codexApprovalPolicyNever,
		ActivePermissionProfileID: ":danger-full-access",
	}
	if err := enforceCodexRepositoryBoundarySettings(&settings); err == nil {
		t.Fatal("broader permission profile was accepted")
	}
	if _, err := codexRepositorySandboxPolicy("/tmp/workspace", settings); err == nil {
		t.Fatal("broader permission profile received a sandbox policy")
	}
}

func TestCodexRepositoryBoundaryOverridesProviderApprovalDefaults(t *testing.T) {
	settings := codexCommandThreadSettings{ApprovalPolicy: codexApprovalPolicyOnRequest}
	if err := enforceCodexRepositoryBoundarySettings(&settings); err != nil {
		t.Fatalf("enforce repository boundary: %v", err)
	}
	if settings.ApprovalPolicy != codexApprovalPolicyNever || settings.ActivePermissionProfileID != codexPermissionProfileWorkspace {
		t.Fatalf("settings = %+v, want non-escalatable workspace access", settings)
	}
}
