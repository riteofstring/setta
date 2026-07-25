package runtime

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/codexaccount"
	"setta/internal/runtimecapability"
	"setta/internal/runtimeprovider"
)

const diagnosticTimeFormat = time.RFC3339

type codexAccountReader interface {
	Read(context.Context) (codexaccount.CodexAccountState, error)
}

type runtimeDiagnosticsConfig struct {
	AppDataDir                  string
	CodexAccountService         codexAccountReader
	CodexCommand                string
	CodexTimeout                time.Duration
	DiskSpacePath               string
	MinimumDiskFreeMiB          int
	Now                         func() time.Time
	PolicyPath                  string
	ProtectedRuntimeStateDir    string
	ReleaseMetadataPath         string
	RuntimeVersion              string
	WorkloadLeaseDiagnosticName string
	WorkloadLeaseManager        runtimeprovider.WorkloadLeaseManager
}

type runtimeDiagnosticsService struct {
	config runtimeDiagnosticsConfig
}

func newRuntimeDiagnosticsService(config runtimeDiagnosticsConfig) *runtimeDiagnosticsService {
	config = normalizeRuntimeDiagnosticsConfig(config)
	return &runtimeDiagnosticsService{config: config}
}

func normalizeRuntimeDiagnosticsConfig(config runtimeDiagnosticsConfig) runtimeDiagnosticsConfig {
	if config.CodexCommand == "" {
		config.CodexCommand = DefaultConfig().CodexCommand
	}
	if config.CodexTimeout <= 0 {
		config.CodexTimeout = DefaultConfig().CodexDiagnosticsTimeout
	}
	if config.DiskSpacePath == "" {
		config.DiskSpacePath = config.AppDataDir
	}
	if config.Now == nil {
		config.Now = time.Now
	}
	if config.PolicyPath == "" && config.AppDataDir != "" {
		config.PolicyPath = filepath.Join(config.AppDataDir, "runtime", "policy.json")
	}
	if config.ProtectedRuntimeStateDir == "" {
		config.ProtectedRuntimeStateDir = config.AppDataDir
	}
	if config.ReleaseMetadataPath == "" && config.AppDataDir != "" {
		config.ReleaseMetadataPath = filepath.Join(config.AppDataDir, "runtime-install", "current.json")
	}
	if config.WorkloadLeaseDiagnosticName == "" {
		config.WorkloadLeaseDiagnosticName = DefaultConfig().WorkloadLeaseDiagnosticName
	}
	return config
}

func (service *runtimeDiagnosticsService) RuntimeDiagnostics(ctx context.Context) runtimecapability.RuntimeDiagnostics {
	return runtimecapability.RuntimeDiagnostics{
		SettaRelease:   service.settaReleaseDiagnostic(),
		Codex:          service.codexDiagnostic(ctx),
		WorkloadLease:  service.workloadLeaseDiagnostic(ctx),
		Policy:         service.policyDiagnostic(),
		DiskSpace:      service.diskSpaceDiagnostic(),
		ProtectedState: service.protectedStateDiagnostic(),
	}
}

type installedReleaseMetadata struct {
	SchemaVersion int    `json:"schemaVersion"`
	Version       string `json:"version"`
}

func (service *runtimeDiagnosticsService) settaReleaseDiagnostic() runtimecapability.SettaReleaseDiagnostic {
	diagnostic := runtimecapability.SettaReleaseDiagnostic{
		Status:         runtimecapability.DiagnosticStatusUnknown,
		RuntimeVersion: service.config.RuntimeVersion,
	}
	if service.config.ReleaseMetadataPath == "" {
		diagnostic.Status = runtimecapability.DiagnosticStatusUnavailable
		diagnostic.ReasonCode = "release_metadata_not_configured"
		return diagnostic
	}
	payload, err := os.ReadFile(service.config.ReleaseMetadataPath)
	if errors.Is(err, os.ErrNotExist) {
		diagnostic.ReasonCode = "release_metadata_not_found"
		return diagnostic
	}
	if err != nil {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "release_metadata_unreadable"
		return diagnostic
	}
	diagnostic.MetadataPresent = true

	var release installedReleaseMetadata
	if err := json.Unmarshal(payload, &release); err != nil {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "release_metadata_malformed"
		return diagnostic
	}
	if release.SchemaVersion <= 0 || strings.TrimSpace(release.Version) == "" {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "release_metadata_invalid"
		return diagnostic
	}
	diagnostic.MetadataValid = true
	diagnostic.InstalledVersion = release.Version
	if release.Version != service.config.RuntimeVersion {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "release_version_mismatch"
		return diagnostic
	}
	diagnostic.Status = runtimecapability.DiagnosticStatusOK
	return diagnostic
}

func (service *runtimeDiagnosticsService) codexDiagnostic(ctx context.Context) runtimecapability.CodexDiagnostic {
	binary := service.codexBinaryDiagnostic()
	authentication := service.codexAuthenticationDiagnostic(ctx, binary)
	return runtimecapability.CodexDiagnostic{
		Status:         aggregateDiagnosticStatus(binary.Status, authentication.Status),
		Binary:         binary,
		Authentication: authentication,
	}
}

func (service *runtimeDiagnosticsService) codexBinaryDiagnostic() runtimecapability.CodexBinaryDiagnostic {
	diagnostic := runtimecapability.CodexBinaryDiagnostic{
		Status:  runtimecapability.DiagnosticStatusUnavailable,
		Command: service.config.CodexCommand,
	}
	if strings.TrimSpace(service.config.CodexCommand) == "" {
		diagnostic.ReasonCode = "codex_command_not_configured"
		return diagnostic
	}
	if _, err := exec.LookPath(service.config.CodexCommand); err != nil {
		diagnostic.ReasonCode = "codex_binary_not_found"
		return diagnostic
	}
	diagnostic.Status = runtimecapability.DiagnosticStatusOK
	diagnostic.Present = true
	return diagnostic
}

func (service *runtimeDiagnosticsService) codexAuthenticationDiagnostic(
	ctx context.Context,
	binary runtimecapability.CodexBinaryDiagnostic,
) runtimecapability.CodexAuthenticationDiagnostic {
	diagnostic := runtimecapability.CodexAuthenticationDiagnostic{
		Status: runtimecapability.DiagnosticStatusUnavailable,
	}
	if binary.Status != runtimecapability.DiagnosticStatusOK {
		diagnostic.ReasonCode = "codex_binary_unavailable"
		return diagnostic
	}
	if service.config.CodexAccountService == nil {
		diagnostic.ReasonCode = "codex_account_service_not_configured"
		return diagnostic
	}
	readCtx, cancel := context.WithTimeout(ctx, service.config.CodexTimeout)
	defer cancel()
	state, err := service.config.CodexAccountService.Read(readCtx)
	if err != nil {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "codex_account_read_failed"
		return diagnostic
	}
	diagnostic.AccountStatus = string(state.Status)
	diagnostic.RequiresOpenAIAuth = state.RequiresOpenAIAuth
	if state.Account != nil {
		diagnostic.AccountType = string(state.Account.Type)
	}
	if state.Login != nil {
		diagnostic.LoginStatus = string(state.Login.Status)
	}
	switch state.Status {
	case codexaccount.AccountStatusSignedIn:
		diagnostic.Status = runtimecapability.DiagnosticStatusOK
	case codexaccount.AccountStatusUnauthenticated:
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "codex_not_signed_in"
	case codexaccount.AccountStatusLoginInProgress:
		diagnostic.Status = runtimecapability.DiagnosticStatusUnknown
		diagnostic.ReasonCode = "codex_login_in_progress"
	case codexaccount.AccountStatusUnavailable:
		diagnostic.Status = runtimecapability.DiagnosticStatusUnavailable
		diagnostic.ReasonCode = "codex_account_unavailable"
	default:
		diagnostic.Status = runtimecapability.DiagnosticStatusUnknown
		diagnostic.ReasonCode = "codex_account_status_unknown"
	}
	return diagnostic
}

func (service *runtimeDiagnosticsService) workloadLeaseDiagnostic(ctx context.Context) runtimecapability.WorkloadLeaseDiagnostic {
	diagnostic := runtimecapability.WorkloadLeaseDiagnostic{
		Status:    runtimecapability.DiagnosticStatusUnavailable,
		LeaseName: service.config.WorkloadLeaseDiagnosticName,
	}
	if service.config.WorkloadLeaseManager == nil {
		diagnostic.ReasonCode = "workload_lease_manager_not_configured"
		return diagnostic
	}
	diagnostic.Configured = true
	if strings.TrimSpace(service.config.WorkloadLeaseDiagnosticName) == "" {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "workload_lease_name_not_configured"
		return diagnostic
	}
	lease, found, err := service.config.WorkloadLeaseManager.Inspect(ctx, service.config.WorkloadLeaseDiagnosticName)
	if err != nil {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "workload_lease_inspect_failed"
		return diagnostic
	}
	if !found {
		diagnostic.Status = runtimecapability.DiagnosticStatusOK
		return diagnostic
	}
	if lease.StartedAt.IsZero() || lease.ExpiresAt.IsZero() {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "workload_lease_malformed"
		return diagnostic
	}
	diagnostic.Active = true
	diagnostic.StartedAt = lease.StartedAt.UTC().Format(diagnosticTimeFormat)
	diagnostic.ExpiresAt = lease.ExpiresAt.UTC().Format(diagnosticTimeFormat)
	if !lease.ExpiresAt.After(service.config.Now().UTC()) {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "workload_lease_expired"
		return diagnostic
	}
	diagnostic.Status = runtimecapability.DiagnosticStatusOK
	return diagnostic
}

type runtimePolicySnapshot struct {
	SchemaVersion int                         `json:"schemaVersion"`
	Rules         []runtimePolicySnapshotRule `json:"rules"`
}

type runtimePolicySnapshotRule struct {
	Action  string `json:"action"`
	Domain  string `json:"domain"`
	Include string `json:"include"`
}

func (service *runtimeDiagnosticsService) policyDiagnostic() runtimecapability.PolicyDiagnostic {
	diagnostic := runtimecapability.PolicyDiagnostic{
		Status: runtimecapability.DiagnosticStatusUnknown,
	}
	if service.config.PolicyPath == "" {
		diagnostic.Status = runtimecapability.DiagnosticStatusUnavailable
		diagnostic.ReasonCode = "policy_path_not_configured"
		return diagnostic
	}
	diagnostic.Configured = true
	payload, err := os.ReadFile(service.config.PolicyPath)
	if errors.Is(err, os.ErrNotExist) {
		diagnostic.ReasonCode = "policy_not_found"
		return diagnostic
	}
	if err != nil {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "policy_unreadable"
		return diagnostic
	}
	diagnostic.Present = true
	var policy runtimePolicySnapshot
	if err := json.Unmarshal(payload, &policy); err != nil {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "policy_malformed"
		return diagnostic
	}
	if err := validateRuntimePolicySnapshot(policy); err != nil {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "policy_invalid"
		return diagnostic
	}
	diagnostic.Status = runtimecapability.DiagnosticStatusOK
	diagnostic.SchemaVersion = policy.SchemaVersion
	diagnostic.RuleCount = len(policy.Rules)
	return diagnostic
}

func validateRuntimePolicySnapshot(policy runtimePolicySnapshot) error {
	if policy.SchemaVersion <= 0 {
		return errors.New("schema version is required")
	}
	for _, rule := range policy.Rules {
		switch rule.Action {
		case string(runtimeprovider.NetworkRuleAllow), string(runtimeprovider.NetworkRuleDeny):
		default:
			return errors.New("unsupported rule action")
		}
		if (strings.TrimSpace(rule.Domain) == "") == (strings.TrimSpace(rule.Include) == "") {
			return errors.New("policy rule must set exactly one target")
		}
	}
	return nil
}

func (service *runtimeDiagnosticsService) diskSpaceDiagnostic() runtimecapability.DiskSpaceDiagnostic {
	diagnostic := runtimecapability.DiskSpaceDiagnostic{
		Status:         runtimecapability.DiagnosticStatusUnavailable,
		MinimumFreeMiB: service.config.MinimumDiskFreeMiB,
	}
	if service.config.DiskSpacePath == "" {
		diagnostic.ReasonCode = "disk_space_path_not_configured"
		return diagnostic
	}
	stats, err := runtimeDiskStats(service.config.DiskSpacePath)
	if err != nil {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "disk_space_unavailable"
		return diagnostic
	}
	diagnostic.AvailableMiB = bytesToMiB(stats.AvailableBytes)
	diagnostic.TotalMiB = bytesToMiB(stats.TotalBytes)
	if service.config.MinimumDiskFreeMiB > 0 && diagnostic.AvailableMiB < service.config.MinimumDiskFreeMiB {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "disk_space_below_minimum"
		return diagnostic
	}
	diagnostic.Status = runtimecapability.DiagnosticStatusOK
	return diagnostic
}

func (service *runtimeDiagnosticsService) protectedStateDiagnostic() runtimecapability.ProtectedStateDiagnostic {
	diagnostic := runtimecapability.ProtectedStateDiagnostic{
		Status: runtimecapability.DiagnosticStatusUnavailable,
	}
	if service.config.ProtectedRuntimeStateDir == "" {
		diagnostic.ReasonCode = "protected_state_not_configured"
		return diagnostic
	}
	stat, err := os.Stat(service.config.ProtectedRuntimeStateDir)
	if errors.Is(err, os.ErrNotExist) {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "protected_state_not_found"
		return diagnostic
	}
	if err != nil {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "protected_state_unreadable"
		return diagnostic
	}
	diagnostic.Present = true
	diagnostic.Directory = stat.IsDir()
	if !stat.IsDir() {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "protected_state_not_directory"
		return diagnostic
	}
	diagnostic.OwnerOnlyWritable = stat.Mode().Perm()&0o022 == 0
	if !diagnostic.OwnerOnlyWritable {
		diagnostic.Status = runtimecapability.DiagnosticStatusFailing
		diagnostic.ReasonCode = "protected_state_group_or_world_writable"
		return diagnostic
	}
	diagnostic.Status = runtimecapability.DiagnosticStatusOK
	return diagnostic
}

func aggregateDiagnosticStatus(statuses ...runtimecapability.DiagnosticStatus) runtimecapability.DiagnosticStatus {
	result := runtimecapability.DiagnosticStatusOK
	for _, status := range statuses {
		switch status {
		case runtimecapability.DiagnosticStatusFailing:
			return runtimecapability.DiagnosticStatusFailing
		case runtimecapability.DiagnosticStatusUnavailable:
			if result != runtimecapability.DiagnosticStatusUnknown {
				result = runtimecapability.DiagnosticStatusUnavailable
			}
		case runtimecapability.DiagnosticStatusUnknown:
			result = runtimecapability.DiagnosticStatusUnknown
		}
	}
	return result
}

func bytesToMiB(bytes uint64) int {
	const mib = 1024 * 1024
	if bytes == 0 {
		return 0
	}
	value := bytes / mib
	if value > uint64(maxInt()) {
		return maxInt()
	}
	return int(value)
}

func maxInt() int {
	return int(^uint(0) >> 1)
}
