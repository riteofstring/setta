package projectstate

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"

	"setta/internal/statefs"
)

const (
	MainFileName     = "project.json"
	SettingsFileName = "setta-settings-project.json"
)

type Target string

const (
	TargetMain     Target = "main"
	TargetSettings Target = "settings"
)

type Paths struct {
	Main     string
	Settings string
}

type RegistryOptions struct {
	MainRuntime     RuntimeOptions
	SettingsRuntime RuntimeOptions
}

type Registry struct {
	paths    Paths
	main     *Runtime
	settings *Runtime
}

func ResolvePaths(settaFilesRoot string) (Paths, error) {
	resolvedRoot, err := statefs.NormalizePath(settaFilesRoot, "")
	if err != nil {
		return Paths{}, fmt.Errorf("resolve project-state root: %w", err)
	}

	return Paths{
		Main:     filepath.Join(resolvedRoot, MainFileName),
		Settings: filepath.Join(resolvedRoot, SettingsFileName),
	}, nil
}

func OpenRegistryWithOptions(ctx context.Context, settaFilesRoot string, storeOpts StoreOptions, options RegistryOptions) (*Registry, error) {
	paths, err := ResolvePaths(settaFilesRoot)
	if err != nil {
		return nil, err
	}

	mainStore, err := NewStore(paths.Main, storeOpts)
	if err != nil {
		return nil, fmt.Errorf("create main project store: %w", err)
	}
	mainRuntime, err := OpenRuntimeWithOptions(ctx, mainStore, options.MainRuntime)
	if err != nil {
		return nil, fmt.Errorf("open main project runtime: %w", err)
	}

	settingsStore, err := NewStore(paths.Settings, storeOpts)
	if err != nil {
		_ = mainRuntime.Close()
		return nil, fmt.Errorf("create settings project store: %w", err)
	}
	settingsRuntime, err := OpenRuntimeWithOptions(ctx, settingsStore, options.SettingsRuntime)
	if err != nil {
		_ = mainRuntime.Close()
		return nil, fmt.Errorf("open settings project runtime: %w", err)
	}

	return &Registry{
		paths:    paths,
		main:     mainRuntime,
		settings: settingsRuntime,
	}, nil
}

func (r *Registry) Paths() Paths {
	if r == nil {
		return Paths{}
	}
	return r.paths
}

func (r *Registry) Main() *Runtime {
	if r == nil {
		return nil
	}
	return r.main
}

func (r *Registry) Settings() *Runtime {
	if r == nil {
		return nil
	}
	return r.settings
}

func (r *Registry) Close() error {
	if r == nil {
		return nil
	}
	return errors.Join(r.main.Close(), r.settings.Close())
}
