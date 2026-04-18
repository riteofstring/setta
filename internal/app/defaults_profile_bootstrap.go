package app

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"

	"setta/internal/plugins"
	"setta/internal/settingsstate"
)

const (
	defaultsProfileBootstrapStateSchemaVersion = 1
	defaultsProfileBootstrapStateFileName      = "defaults_install_profile_bootstrap.json"
)

type defaultsProfileBootstrapState struct {
	SchemaVersion  int    `json:"schemaVersion"`
	ProfileID      string `json:"profileId"`
	ProfileVersion int    `json:"profileVersion"`
}

func bootstrapWorkspaceDefaultsInstallProfile(
	ctx context.Context,
	runtimeRoot string,
	settingsRuntime *settingsstate.Runtime,
	pluginService *plugins.Service,
) error {
	if settingsRuntime == nil || pluginService == nil {
		return nil
	}

	profile := plugins.DefaultsInstallProfile()
	alreadyBootstrapped, err := defaultsProfileBootstrapApplied(runtimeRoot, profile)
	if err != nil {
		return err
	}
	if alreadyBootstrapped {
		return nil
	}

	snapshot, err := pluginService.Rescan()
	if err != nil {
		return err
	}
	selections := profile.AvailableLanguageServerSelections(snapshot)
	if len(selections) != 0 {
		if _, err := settingsRuntime.MutateAndSave(ctx, func(document settingsstate.Document) (settingsstate.Document, error) {
			next, _, err := settingsstate.BootstrapLanguageServerSelections(document, selections)
			return next, err
		}); err != nil {
			return err
		}
	}

	return saveDefaultsProfileBootstrapState(runtimeRoot, profile)
}

func defaultsProfileBootstrapApplied(runtimeRoot string, profile plugins.InstallProfile) (bool, error) {
	statePath := defaultsProfileBootstrapStatePath(runtimeRoot)
	payload, err := os.ReadFile(statePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		return false, err
	}

	var state defaultsProfileBootstrapState
	if err := json.Unmarshal(payload, &state); err != nil {
		return false, err
	}
	if state.SchemaVersion != defaultsProfileBootstrapStateSchemaVersion {
		return false, nil
	}
	return state.ProfileID == profile.ID && state.ProfileVersion == profile.Version, nil
}

func saveDefaultsProfileBootstrapState(runtimeRoot string, profile plugins.InstallProfile) error {
	statePath := defaultsProfileBootstrapStatePath(runtimeRoot)
	if err := os.MkdirAll(filepath.Dir(statePath), 0o755); err != nil {
		return err
	}

	payload, err := json.MarshalIndent(defaultsProfileBootstrapState{
		SchemaVersion:  defaultsProfileBootstrapStateSchemaVersion,
		ProfileID:      profile.ID,
		ProfileVersion: profile.Version,
	}, "", "  ")
	if err != nil {
		return err
	}
	payload = append(payload, '\n')
	return os.WriteFile(statePath, payload, 0o644)
}

func defaultsProfileBootstrapStatePath(runtimeRoot string) string {
	return filepath.Join(runtimeRoot, defaultsProfileBootstrapStateFileName)
}
