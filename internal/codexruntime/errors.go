package codexruntime

import (
	"errors"
	"fmt"
	"strings"
)

const (
	CapabilityRuntimeResolution      = "runtime_resolution"
	CapabilityRuntimeExecutable      = "runtime_executable"
	CapabilityRuntimeIntegrity       = "runtime_integrity"
	CapabilityRuntimeVersion         = "runtime_version"
	CapabilityAppServerEntrypoint    = "app_server_entrypoint"
	CapabilityExplicitSessionSource  = "explicit_session_source"
	CapabilityStartupProbeInitialize = "startup_probe_initialize"
	CapabilityStartupProbeThreadList = "startup_probe_thread_list"
	CapabilityStartupProbeThreadRead = "startup_probe_thread_read"
	CapabilityStartupProbeTurnsList  = "startup_probe_thread_turns_list"
	CapabilityStartupProbeGoalGet    = "startup_probe_thread_goal_get"
	CapabilityStartupProbeGoalSet    = "startup_probe_thread_goal_set"
	CapabilityStartupProbeGoalClear  = "startup_probe_thread_goal_clear"
	CapabilityStartupProbeSettings   = "startup_probe_thread_settings_update"
)

type IncompatibleProviderError struct {
	Provider             string
	Capability           string
	Selection            string
	BinaryPath           string
	ResolvedBinaryPath   string
	VersionOutput        string
	AppServerEntrypoint  string
	AppServerArgs        []string
	CodexSourceCommit    string
	ProtocolSchemaCommit string
	ArtifactSHA256       string
	Message              string
	Err                  error
}

var _ error = (*IncompatibleProviderError)(nil)

func (err *IncompatibleProviderError) Error() string {
	provider := err.Provider
	if provider == "" {
		provider = ProviderCodex
	}
	message := err.Message
	if message == "" {
		message = "provider runtime is incompatible"
	}
	parts := []string{
		fmt.Sprintf("%s provider unavailable: %s", provider, message),
	}
	parts = appendProviderErrorDetail(parts, "failed capability", err.Capability)
	parts = appendProviderErrorDetail(parts, "binary", err.BinaryPath)
	if err.ResolvedBinaryPath != err.BinaryPath {
		parts = appendProviderErrorDetail(parts, "resolvedBinary", err.ResolvedBinaryPath)
	}
	parts = appendProviderErrorDetail(parts, "version", err.VersionOutput)
	parts = appendProviderErrorDetail(parts, "entrypoint", err.AppServerEntrypoint)
	if len(err.AppServerArgs) > 0 {
		parts = append(parts, "args="+strings.Join(err.AppServerArgs, " "))
	}
	parts = appendProviderErrorDetail(parts, "codexSourceCommit", err.CodexSourceCommit)
	parts = appendProviderErrorDetail(parts, "protocolSchemaCommit", err.ProtocolSchemaCommit)
	parts = appendProviderErrorDetail(parts, "sha256", err.ArtifactSHA256)
	if err.Err != nil {
		parts = append(parts, "cause="+err.Err.Error())
	}
	return strings.Join(parts, "; ")
}

func appendProviderErrorDetail(parts []string, label string, value string) []string {
	if value == "" {
		return parts
	}
	return append(parts, label+"="+value)
}

func (err *IncompatibleProviderError) Unwrap() error {
	return err.Err
}

func IsIncompatibleProviderError(err error) (*IncompatibleProviderError, bool) {
	var incompatible *IncompatibleProviderError
	if errors.As(err, &incompatible) {
		return incompatible, true
	}
	return nil, false
}

func incompatibleError(capability string, identity RuntimeIdentity, message string, cause error) error {
	return &IncompatibleProviderError{
		Provider:             ProviderCodex,
		Capability:           capability,
		Selection:            identity.Selection,
		BinaryPath:           identity.BinaryPath,
		ResolvedBinaryPath:   identity.ResolvedBinaryPath,
		VersionOutput:        identity.VersionOutput,
		AppServerEntrypoint:  identity.AppServerEntrypoint,
		AppServerArgs:        append([]string{}, identity.AppServerArgs...),
		CodexSourceCommit:    RequiredCodexSourceCommit,
		ProtocolSchemaCommit: RequiredProtocolSchemaCommit,
		ArtifactSHA256:       identity.ArtifactSHA256,
		Message:              message,
		Err:                  cause,
	}
}
