package runtime

import (
	"errors"
	"fmt"
	"io"
	"net/netip"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/httpapi"
	"setta/internal/runtimeidentity"
	"setta/internal/runtimeprovider"
)

type Config struct {
	AllowRemote                            bool
	AllowedHTTPSOrigins                    []string
	AllowedRequestHosts                    []string
	AppDataDir                             string
	BootstrapDeviceDisplayName             string
	ChatHarness                            ChatHarnessMode
	CodexCommand                           string
	CodexDiagnosticsTimeout                time.Duration
	DisableAutomaticCartographerProcessing bool
	DiskSpacePath                          string
	Host                                   string
	// EnableLocalCredentialIssuer explicitly hosts the bounded credential
	// authority used by local development and deterministic app workflows. It
	// defaults to false and must remain false in cloud runtime configuration,
	// where the external Setta control plane is authoritative.
	EnableLocalCredentialIssuer bool
	MinimumDiskFreeMiB          int
	PolicyPath                  string
	Port                        int
	ProtectedRuntimeStateDir    string
	ReleaseMetadataPath         string
	RuntimeDisplayName          string
	SkipBootstrapDeviceSession  bool
	Version                     string
	WorkloadLeaseDiagnosticName string
	WorkloadLeaseManager        runtimeprovider.WorkloadLeaseManager
	Stdout                      io.Writer
	Stderr                      io.Writer
	ShutdownTimeout             time.Duration
}

type ChatHarnessMode string

const (
	ChatHarnessCodex            ChatHarnessMode = "codex"
	ChatHarnessScriptedWorkflow ChatHarnessMode = "scripted-workflow"
)

func DefaultConfig() Config {
	return Config{
		AppDataDir:                  "",
		BootstrapDeviceDisplayName:  "Setta Desktop (local)",
		ChatHarness:                 ChatHarnessCodex,
		CodexCommand:                "codex",
		CodexDiagnosticsTimeout:     2 * time.Second,
		Host:                        "127.0.0.1",
		Port:                        0,
		Version:                     "dev",
		WorkloadLeaseDiagnosticName: "setta-agent",
		Stdout:                      io.Discard,
		Stderr:                      io.Discard,
		ShutdownTimeout:             5 * time.Second,
	}
}

func (config Config) Validate() error {
	if err := validateAppDataDir(config.AppDataDir); err != nil {
		return err
	}
	if !validChatHarnessMode(config.ChatHarness) {
		return fmt.Errorf("unsupported chat harness mode: %s", config.ChatHarness)
	}
	if err := httpapi.ValidateRuntimeEndpointAccess(httpapi.RuntimeEndpointAccessConfig{
		AllowedHTTPSOrigins: config.AllowedHTTPSOrigins,
		AllowedRequestHosts: config.AllowedRequestHosts,
	}); err != nil {
		return err
	}
	if err := validateCodexConfig(config); err != nil {
		return err
	}
	if err := validateRuntimeHostAndDisk(config); err != nil {
		return err
	}
	if err := validateRuntimeDiagnosticPaths(config); err != nil {
		return err
	}
	if err := validateBootstrapConfig(config); err != nil {
		return err
	}
	if err := config.validateHostBinding(); err != nil {
		return err
	}
	if err := validatePort(config.Port); err != nil {
		return err
	}
	if err := validateRuntimeDisplayNameOverride(config.RuntimeDisplayName); err != nil {
		return err
	}
	return validateRuntimeVersionAndShutdown(config)
}

func validateCodexConfig(config Config) error {
	if strings.TrimSpace(config.CodexCommand) == "" {
		return errors.New("codex command is required")
	}
	if config.CodexDiagnosticsTimeout <= 0 {
		return errors.New("codex diagnostics timeout must be positive")
	}
	return nil
}

func validateRuntimeHostAndDisk(config Config) error {
	if config.Host == "" {
		return errors.New("host is required")
	}
	if config.MinimumDiskFreeMiB < 0 {
		return fmt.Errorf("minimum disk free MiB must not be negative: %d", config.MinimumDiskFreeMiB)
	}
	return nil
}

func validateBootstrapConfig(config Config) error {
	if !config.SkipBootstrapDeviceSession && config.BootstrapDeviceDisplayName == "" {
		return errors.New("bootstrap device display name is required")
	}
	if config.EnableLocalCredentialIssuer && !config.SkipBootstrapDeviceSession {
		return errors.New("local credential issuer requires legacy bootstrap device sessions to be disabled")
	}
	return nil
}

func validateRuntimeVersionAndShutdown(config Config) error {
	if config.Version == "" {
		return errors.New("version is required")
	}
	if config.ShutdownTimeout <= 0 {
		return errors.New("shutdown timeout must be positive")
	}
	return nil
}

func validateRuntimeDiagnosticPaths(config Config) error {
	for label, path := range map[string]string{
		"disk space path":             config.DiskSpacePath,
		"policy path":                 config.PolicyPath,
		"protected runtime state dir": config.ProtectedRuntimeStateDir,
		"release metadata path":       config.ReleaseMetadataPath,
	} {
		if path != "" && !filepath.IsAbs(path) {
			return fmt.Errorf("%s must be absolute: %s", label, path)
		}
	}
	return nil
}

func validateRuntimeDisplayNameOverride(displayName string) error {
	if strings.TrimSpace(displayName) == "" {
		return nil
	}
	if _, err := runtimeidentity.NormalizeDisplayName(displayName); err != nil {
		return fmt.Errorf("runtime display name is invalid: %w", err)
	}
	return nil
}

func validateAppDataDir(appDataDir string) error {
	if appDataDir == "" {
		return errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	return nil
}

func (config Config) validateHostBinding() error {
	addr, err := netip.ParseAddr(config.Host)
	if err != nil {
		return fmt.Errorf("host must be a numeric IP address: %w", err)
	}
	if !addr.IsLoopback() && !config.AllowRemote {
		return fmt.Errorf("host must be loopback unless allow remote is enabled: %s", config.Host)
	}
	return nil
}

func validatePort(port int) error {
	if port < 0 || port > 65535 {
		return fmt.Errorf("port must be between 0 and 65535: %d", port)
	}
	return nil
}
