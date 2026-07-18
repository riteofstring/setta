package chat

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

type ChatCodexDefaults struct {
	SchemaVersion int               `json:"schemaVersion"`
	Settings      ChatCodexSettings `json:"settings"`
}

type ChatCodexDefaultsView struct {
	Settings                 ChatCodexSettings                     `json:"settings"`
	EffectiveSettings        *ChatCodexEffectiveSettings           `json:"effectiveSettings"`
	Models                   []ChatModelOption                     `json:"models"`
	ReasoningEfforts         []ChatReasoningEffortOption           `json:"reasoningEfforts"`
	PermissionPresets        []ChatPermissionPreset                `json:"permissionPresets"`
	CurrentPermission        *ChatCodexEffectivePermissionSettings `json:"currentPermission"`
	SelectedModel            string                                `json:"selectedModel"`
	SelectedReasoningEffort  *ReasoningEffort                      `json:"selectedReasoningEffort"`
	SelectedPermissionPreset *ChatPermissionPresetID               `json:"selectedPermissionPreset"`
}

type ChatCodexDefaultOptions struct {
	EffectiveSettings        *ChatCodexEffectiveSettings
	Models                   []ChatModelOption
	ReasoningEfforts         []ChatReasoningEffortOption
	PermissionPresets        []ChatPermissionPreset
	CurrentPermission        *ChatCodexEffectivePermissionSettings
	SelectedModel            string
	SelectedReasoningEffort  *ReasoningEffort
	SelectedPermissionPreset *ChatPermissionPresetID
}

type HarnessCodexDefaultOptionsResolver interface {
	ResolveCodexDefaultOptions(context.Context, ChatCodexSettings) (ChatCodexDefaultOptions, error)
}

func DefaultChatCodexDefaults() ChatCodexDefaults {
	defaultPermission, ok := chatPermissionSettingsForPreset(ChatPermissionPresetDefault)
	if !ok {
		panic("default chat permission preset is missing")
	}
	return ChatCodexDefaults{
		SchemaVersion: SchemaVersion,
		Settings: ChatCodexSettings{
			Permission: &defaultPermission,
		},
	}
}

func (store *Store) LoadChatCodexDefaults() (ChatCodexDefaults, error) {
	path := store.chatCodexDefaultsPath()
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return DefaultChatCodexDefaults(), nil
		}
		return ChatCodexDefaults{}, &PersistenceError{Operation: "read chat codex defaults", Path: path, Err: err}
	}

	var defaults ChatCodexDefaults
	if err := readJSONFile(path, &defaults); err != nil {
		return ChatCodexDefaults{}, err
	}
	if err := validateChatCodexDefaults(defaults); err != nil {
		return ChatCodexDefaults{}, corruptStateError(path, err)
	}
	return defaults, nil
}

func (store *Store) SaveChatCodexDefaults(defaults ChatCodexDefaults) error {
	if err := validateChatCodexDefaults(defaults); err != nil {
		return corruptStateError(store.chatCodexDefaultsPath(), err)
	}
	return writeJSONFile(store.chatCodexDefaultsPath(), defaults)
}

func (store *Store) chatCodexDefaultsPath() string {
	return filepath.Join(store.appDataDir, settingsDirName, chatCodexDefaultsFileName)
}

func (service *Service) ReadChatCodexDefaults(ctx context.Context) (ChatCodexDefaultsView, error) {
	settings := service.currentChatCodexDefaultSettings()
	return service.chatCodexDefaultsView(ctx, settings)
}

func (service *Service) UpdateChatCodexDefaults(ctx context.Context, settings ChatCodexSettings, _ bool) (ChatCodexDefaultsView, error) {
	defaults := ChatCodexDefaults{
		SchemaVersion: SchemaVersion,
		Settings:      settings,
	}
	if err := validateChatCodexDefaults(defaults); err != nil {
		return ChatCodexDefaultsView{}, err
	}
	if err := service.validateChatCodexDefaultOptions(ctx, defaults.Settings); err != nil {
		return ChatCodexDefaultsView{}, err
	}
	if err := service.store.SaveChatCodexDefaults(defaults); err != nil {
		return ChatCodexDefaultsView{}, err
	}

	service.mu.Lock()
	service.codexDefaults = defaults
	service.mu.Unlock()

	return service.chatCodexDefaultsView(ctx, defaults.Settings)
}

func (service *Service) currentChatCodexDefaultSettings() ChatCodexSettings {
	service.mu.Lock()
	defer service.mu.Unlock()

	return cloneChatCodexSettings(service.codexDefaults.Settings)
}

func (service *Service) chatCodexDefaultsView(ctx context.Context, settings ChatCodexSettings) (ChatCodexDefaultsView, error) {
	options := chatCodexDefaultOptionsFromModels(settings, []ChatModelOption{})
	if resolver, ok := service.harness.(HarnessCodexDefaultOptionsResolver); ok {
		next, err := resolver.ResolveCodexDefaultOptions(ctx, settings)
		if err != nil {
			return ChatCodexDefaultsView{}, err
		}
		options = next
	}
	return ChatCodexDefaultsView{
		Settings:                 cloneChatCodexSettings(settings),
		EffectiveSettings:        options.EffectiveSettings,
		Models:                   nonNilModels(options.Models),
		ReasoningEfforts:         nonNilReasoningEfforts(options.ReasoningEfforts),
		PermissionPresets:        nonNilPermissionPresets(options.PermissionPresets),
		CurrentPermission:        options.CurrentPermission,
		SelectedModel:            options.SelectedModel,
		SelectedReasoningEffort:  options.SelectedReasoningEffort,
		SelectedPermissionPreset: options.SelectedPermissionPreset,
	}, nil
}

func (service *Service) validateChatCodexDefaultOptions(ctx context.Context, settings ChatCodexSettings) error {
	resolver, ok := service.harness.(HarnessCodexDefaultOptionsResolver)
	if !ok {
		return nil
	}
	options, err := resolver.ResolveCodexDefaultOptions(ctx, settings)
	if err != nil {
		return err
	}
	if settings.Model == "" {
		if settings.ReasoningEffort != nil {
			return errors.New("chat codex default reasoning effort requires a default model")
		}
		return nil
	}
	model, ok := modelOptionByModel(options.Models, settings.Model)
	if !ok {
		return fmt.Errorf("chat codex default model %s was not present in model options", settings.Model)
	}
	if settings.ReasoningEffort == nil {
		return nil
	}
	if _, ok := reasoningEffortOptionByEffort(model.SupportedReasoningEfforts, *settings.ReasoningEffort); !ok {
		return fmt.Errorf("chat codex default reasoning effort %s is not supported by model %s", *settings.ReasoningEffort, settings.Model)
	}
	return nil
}

func (harness *CodexHarness) ResolveCodexDefaultOptions(ctx context.Context, settings ChatCodexSettings) (ChatCodexDefaultOptions, error) {
	session, err := harness.manager.NewSession(ctx)
	if err != nil {
		return ChatCodexDefaultOptions{}, commandError(ChatCommandErrorCodexRPC, "start codex app-server: "+err.Error(), err)
	}
	defer session.Close()

	models, err := listCodexModelOptions(ctx, session)
	if err != nil {
		return ChatCodexDefaultOptions{}, err
	}
	presets, err := codexPermissionPresetsForSession(ctx, session)
	if err != nil {
		return ChatCodexDefaultOptions{}, err
	}
	return chatCodexDefaultOptionsFromModelsAndPresets(settings, models, presets), nil
}

func (harness *FakeHarness) ResolveCodexDefaultOptions(_ context.Context, settings ChatCodexSettings) (ChatCodexDefaultOptions, error) {
	return chatCodexDefaultOptionsFromModels(settings, fakeModelOptions()), nil
}

func (harness *ScriptedWorkflowHarness) ResolveCodexDefaultOptions(_ context.Context, settings ChatCodexSettings) (ChatCodexDefaultOptions, error) {
	return chatCodexDefaultOptionsFromModels(settings, fakeModelOptions()), nil
}

func chatCodexDefaultOptionsFromModels(settings ChatCodexSettings, models []ChatModelOption) ChatCodexDefaultOptions {
	return chatCodexDefaultOptionsFromModelsAndPresets(settings, models, BuiltinChatPermissionPresets())
}

func chatCodexDefaultOptionsFromModelsAndPresets(settings ChatCodexSettings, models []ChatModelOption, permissionPresets []ChatPermissionPreset) ChatCodexDefaultOptions {
	commandSettings := codexCommandThreadSettings{
		Model: settings.Model,
	}
	if settings.ReasoningEffort != nil {
		commandSettings.ReasoningEffort = *settings.ReasoningEffort
	}
	if settings.Permission != nil {
		commandSettings.ApprovalPolicy = settings.Permission.ApprovalPolicy
		commandSettings.ActivePermissionProfileID = settings.Permission.Permissions
	}
	if commandSettings.Model != "" {
		if next, err := codexCommandSettingsWithDisplayLabelsFromModels(commandSettings, models); err == nil {
			commandSettings = next
		}
	}
	permission := chatCodexEffectivePermissionSettings(
		commandSettings.ApprovalPolicy,
		commandSettings.ActivePermissionProfileID,
		commandSettings.ActivePermissionProfileExtends,
	)
	return ChatCodexDefaultOptions{
		EffectiveSettings:        chatCodexEffectiveSettingsFromCommandSettings(commandSettings),
		Models:                   nonNilModels(models),
		ReasoningEfforts:         reasoningEffortsForSelectedModel(models, commandSettings.Model),
		PermissionPresets:        nonNilPermissionPresets(permissionPresets),
		CurrentPermission:        permission,
		SelectedModel:            commandSettings.Model,
		SelectedReasoningEffort:  reasoningEffortResult(commandSettings.ReasoningEffort),
		SelectedPermissionPreset: selectedPermissionPresetResult(permission),
	}
}

func validateChatCodexDefaults(defaults ChatCodexDefaults) error {
	if defaults.SchemaVersion != SchemaVersion {
		return fmt.Errorf("chat codex defaults have unsupported schemaVersion %d", defaults.SchemaVersion)
	}
	if defaults.Settings.Permission == nil {
		return errors.New("chat codex defaults permission is required")
	}
	if err := validateChatCodexSettings("chat_defaults", defaults.Settings); err != nil {
		return err
	}
	return nil
}

func cloneChatCodexSettings(settings ChatCodexSettings) ChatCodexSettings {
	clone := settings
	if settings.ReasoningEffort != nil {
		effort := *settings.ReasoningEffort
		clone.ReasoningEffort = &effort
	}
	if settings.Permission != nil {
		permission := *settings.Permission
		clone.Permission = &permission
	}
	return clone
}
