package runtime

import (
	"errors"
	"fmt"
	"net/netip"
	"path/filepath"
	"strings"

	"setta/internal/runtimeidentity"
)

func (config Config) Validate() error {
	if err := config.validateRuntimePaths(); err != nil {
		return err
	}
	if err := config.validateChatHarnessMode(); err != nil {
		return err
	}
	if err := config.validateNetworkBinding(); err != nil {
		return err
	}
	if err := validateRuntimeDisplayNameOverride(config.RuntimeDisplayName); err != nil {
		return err
	}
	if err := config.validateProcessSettings(); err != nil {
		return err
	}
	return nil
}

func (config Config) validateRuntimePaths() error {
	if err := validateAppDataDir(config.AppDataDir); err != nil {
		return err
	}
	return validateBundledSettaCLIDir(config.BundledSettaCLIDir)
}

func (config Config) validateChatHarnessMode() error {
	if !validChatHarnessMode(config.ChatHarness) {
		return fmt.Errorf("unsupported chat harness mode: %s", config.ChatHarness)
	}
	return nil
}

func (config Config) validateNetworkBinding() error {
	if config.Host == "" {
		return errors.New("host is required")
	}
	if err := config.validateHostBinding(); err != nil {
		return err
	}
	return validatePort(config.Port)
}

func (config Config) validateProcessSettings() error {
	if !config.SkipBootstrapDeviceSession && config.BootstrapDeviceDisplayName == "" {
		return errors.New("bootstrap device display name is required")
	}
	if config.Version == "" {
		return errors.New("version is required")
	}
	if config.ShutdownTimeout <= 0 {
		return errors.New("shutdown timeout must be positive")
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
