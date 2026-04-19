package uisettings

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/plugins"
	"setta/internal/projectstate"
	appdefinition "setta/plugins/setta-json-render-app-gen/backend/appdefinition"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

func TestNewCoreRegistryListsBoundedCoreEntries(t *testing.T) {
	t.Parallel()

	runtime := openCoreRegistryRuntime(t)
	registry := mustNewCoreRegistry(t, runtime, t.TempDir())

	entries := registry.ListEntries(SourceFilterCore)
	ids := make([]string, 0, len(entries))
	for _, entry := range entries {
		ids = append(ids, entry.SettingID)
	}
	expected := []string{
		"core.project.name",
		"core.project.show_param_display_names",
		"core.run_instructions.python_codegen_enabled",
		"core.watch_code.enabled",
		"core.watch_code.files",
		"core.watch_code.folders",
	}
	if !reflect.DeepEqual(ids, expected) {
		t.Fatalf("expected core entry ids %#v, got %#v", expected, ids)
	}
}

func TestRegistrySearchRanksCoreSettingBySynonym(t *testing.T) {
	t.Parallel()

	runtime := openCoreRegistryRuntime(t)
	registry := mustNewCoreRegistry(t, runtime, t.TempDir())

	results, err := registry.Search("watch toggle", 3, SourceFilterCore)
	if err != nil {
		t.Fatalf("search registry: %v", err)
	}
	if len(results) == 0 {
		t.Fatal("expected search results")
	}
	if results[0].SettingID != "core.watch_code.enabled" {
		t.Fatalf("expected top result core.watch_code.enabled, got %#v", results[0])
	}
}

func TestScopedRegistryWithoutPluginServiceBuildsCoreOnlyRegistryAndEmptyPluginMetadata(t *testing.T) {
	t.Parallel()

	runtime := openCoreRegistryRuntime(t)
	registry := mustNewScopedRegistry(t, ScopedRegistryOptions{
		Runtime:       runtime,
		WorkspaceRoot: t.TempDir(),
	})

	if len(registry.knownPluginIDs) != 0 {
		t.Fatalf("expected no known plugin ids, got %#v", registry.knownPluginIDs)
	}
	if len(registry.knownPluginSettingIDs) != 0 {
		t.Fatalf("expected no known plugin setting ids, got %#v", registry.knownPluginSettingIDs)
	}
	if len(registry.invalidPluginSettings) != 0 {
		t.Fatalf("expected no invalid plugin settings, got %#v", registry.invalidPluginSettings)
	}
	if len(registry.pluginStatusByPluginID) != 0 {
		t.Fatalf("expected no plugin status metadata, got %#v", registry.pluginStatusByPluginID)
	}

	projectNameEntry, ok, err := registry.Get("core.project.name")
	if err != nil {
		t.Fatalf("get core.project.name: %v", err)
	}
	if !ok {
		t.Fatal("expected core.project.name entry")
	}
	if projectNameEntry.Metadata.Source != SourceCore {
		t.Fatalf("expected core.project.name to stay core-sourced, got %#v", projectNameEntry.Metadata.Source)
	}
	if _, ok, err := registry.Get("core.app.spec_path"); err != nil {
		t.Fatalf("get core.app.spec_path: %v", err)
	} else if ok {
		t.Fatal("expected app UI settings to be absent without the app plugin")
	}
}

func TestScopedRegistryIncludesRequiredRevealActivationMetadata(t *testing.T) {
	t.Parallel()

	runtime := openCoreRegistryRuntime(t)
	registry := mustNewScopedRegistry(t, ScopedRegistryOptions{
		Runtime:       runtime,
		WorkspaceRoot: t.TempDir(),
	})

	expectedSteps := map[string]RevealActivationStep{
		"core.project_ai_settings.llm_api_keys": {
			Type:      RevealActivationProjectAIAccordion,
			ItemValue: "project-ai-settings-llm-api-keys",
		},
		"core.project_ai_settings.agent_profiles": {
			Type:      RevealActivationProjectAIAccordion,
			ItemValue: "project-ai-settings-agent-profiles",
		},
		"core.project_ai_settings.prompt_templates": {
			Type:      RevealActivationProjectAIAccordion,
			ItemValue: "project-ai-settings-prompt-templates",
		},
		"core.project_ai_settings.external_agents": {
			Type:      RevealActivationProjectAIAccordion,
			ItemValue: "project-ai-settings-external-agents",
		},
		"core.run_instructions.python_codegen_enabled": {
			Type:      RevealActivationRunInstructions,
			ItemValue: "run-instructions-codegen-targets",
		},
	}

	for settingID, expected := range expectedSteps {
		entry, ok, err := registry.Get(settingID)
		if err != nil {
			t.Fatalf("get %s: %v", settingID, err)
		}
		if !ok {
			t.Fatalf("expected registry entry for %s", settingID)
		}
		found := false
		for _, step := range entry.Metadata.RevealActivationSteps {
			if step.Type == expected.Type && step.ItemValue == expected.ItemValue {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected reveal activation step %#v for %s, got %#v", expected, settingID, entry.Metadata.RevealActivationSteps)
		}
		if settingID == "core.run_instructions.python_codegen_enabled" && entry.Metadata.Location.OverviewTabKey != string(OverviewTabNameRunInstructions) {
			t.Fatalf(
				"expected %s overview tab %s, got %q",
				settingID,
				OverviewTabNameRunInstructions,
				entry.Metadata.Location.OverviewTabKey,
			)
		}
	}
}

func TestScopedRegistryIncludesPluginOwnedAppUISettingsWhenAppPluginEnabled(t *testing.T) {
	t.Parallel()

	runtime := openCoreRegistryRuntime(t)
	registry := mustNewAppScopedRegistry(t, runtime, t.TempDir())

	entry, ok, err := registry.Get("core.app.spec_path")
	if err != nil {
		t.Fatalf("get core.app.spec_path: %v", err)
	}
	if !ok {
		t.Fatal("expected plugin-owned app spec path UI setting")
	}
	if entry.Metadata.Source != SourcePlugin {
		t.Fatalf("expected app spec path to be plugin-sourced, got %#v", entry.Metadata.Source)
	}
	if entry.Metadata.PluginID != plugins.AppSubsystemPluginID {
		t.Fatalf("expected app spec path plugin id %q, got %#v", plugins.AppSubsystemPluginID, entry.Metadata.PluginID)
	}
}

func TestRegistryMissingSettingErrorReportsPluginAvailabilityFailures(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		registry *Registry
		wantCode ErrorCode
		wantMsg  string
	}{
		{
			name: "inactive plugin state",
			registry: &Registry{
				knownPluginIDs: map[string]struct{}{"plugin.alpha": {}},
				pluginStatusByPluginID: map[string]pluginRegistryStatus{
					"plugin.alpha": {ObservedStates: []string{"inactive"}},
				},
			},
			wantCode: ErrorCodePluginUnavailable,
			wantMsg:  "Plugin plugin.alpha is unavailable (state=inactive).",
		},
		{
			name: "missing runtime entry",
			registry: &Registry{
				knownPluginIDs: map[string]struct{}{"plugin.alpha": {}},
				pluginStatusByPluginID: map[string]pluginRegistryStatus{
					"plugin.alpha": {
						ObservedStates:        []string{"active"},
						RuntimeEntryAvailable: false,
						SupportsUISettings:    true,
					},
				},
			},
			wantCode: ErrorCodePluginUnavailable,
			wantMsg:  "Plugin plugin.alpha is unavailable (state=active, runtime entry missing).",
		},
		{
			name: "missing ui settings capability",
			registry: &Registry{
				knownPluginIDs: map[string]struct{}{"plugin.alpha": {}},
				pluginStatusByPluginID: map[string]pluginRegistryStatus{
					"plugin.alpha": {
						ObservedStates:        []string{"active"},
						RuntimeEntryAvailable: true,
						SupportsUISettings:    false,
					},
				},
			},
			wantCode: ErrorCodePluginUnavailable,
			wantMsg:  "Plugin plugin.alpha is unavailable for UI setting access (registerPane capability not effective).",
		},
		{
			name: "invalid plugin setting",
			registry: &Registry{
				knownPluginIDs: map[string]struct{}{"plugin.alpha": {}},
				invalidPluginSettings: map[string]SettingError{
					buildPluginSettingID("plugin.alpha", "theme_mode"): {
						Code:    ErrorCodePluginUnavailable,
						Message: "Plugin plugin.alpha setting theme_mode is unavailable for UI setting access (bad schema).",
					},
				},
				pluginStatusByPluginID: map[string]pluginRegistryStatus{
					"plugin.alpha": {
						ObservedStates:        []string{"active"},
						RuntimeEntryAvailable: true,
						SupportsUISettings:    true,
					},
				},
			},
			wantCode: ErrorCodePluginUnavailable,
			wantMsg:  "Plugin plugin.alpha setting theme_mode is unavailable for UI setting access (bad schema).",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := tt.registry.MissingSettingError(buildPluginSettingID("plugin.alpha", "theme_mode"))
			var settingErr *SettingError
			if !errors.As(err, &settingErr) {
				t.Fatalf("expected SettingError, got %T (%v)", err, err)
			}
			if settingErr.Code != tt.wantCode {
				t.Fatalf("expected code %q, got %q", tt.wantCode, settingErr.Code)
			}
			if settingErr.Message != tt.wantMsg {
				t.Fatalf("expected message %q, got %q", tt.wantMsg, settingErr.Message)
			}
		})
	}
}

func TestRegistryReadValueReturnsDefaultedAppMetadataOnFreshProject(t *testing.T) {
	t.Parallel()

	runtime := openCoreRegistryRuntime(t)
	registry := mustNewAppScopedRegistry(t, runtime, t.TempDir())
	expectedAppDefinition, expectedAppSpecPath, expectedThemeMode := effectiveAppMetadata(t, runtime)

	catalogID, err := registry.ReadValue(context.Background(), "project-alpha", "core.app.catalog_id")
	if err != nil {
		t.Fatalf("read app catalog id: %v", err)
	}
	specVersion, err := registry.ReadValue(context.Background(), "project-alpha", "core.app.spec_version")
	if err != nil {
		t.Fatalf("read app spec version: %v", err)
	}
	specPath, err := registry.ReadValue(context.Background(), "project-alpha", "core.app.spec_path")
	if err != nil {
		t.Fatalf("read app spec path: %v", err)
	}
	themeMode, err := registry.ReadValue(context.Background(), "project-alpha", "core.app.theme_mode")
	if err != nil {
		t.Fatalf("read app theme mode: %v", err)
	}
	projectName, err := registry.ReadValue(context.Background(), "project-alpha", "core.project.name")
	if err != nil {
		t.Fatalf("read project name: %v", err)
	}
	pythonCodegenEnabled, err := registry.ReadValue(context.Background(), "project-alpha", "core.run_instructions.python_codegen_enabled")
	if err != nil {
		t.Fatalf("read python codegen enabled: %v", err)
	}

	if catalogID != expectedAppDefinition.CatalogID {
		t.Fatalf("expected default catalog id %q, got %#v", expectedAppDefinition.CatalogID, catalogID)
	}
	if specVersion != expectedAppDefinition.AppSpecVersion {
		t.Fatalf("expected default app spec version %q, got %#v", expectedAppDefinition.AppSpecVersion, specVersion)
	}
	if specPath != expectedAppSpecPath {
		t.Fatalf("expected default app spec path %q, got %#v", expectedAppSpecPath, specPath)
	}
	if themeMode != expectedThemeMode {
		t.Fatalf("expected default app theme mode %q, got %#v", expectedThemeMode, themeMode)
	}
	if projectName != "Alpha" {
		t.Fatalf("expected project name Alpha, got %#v", projectName)
	}
	if pythonCodegenEnabled != false {
		t.Fatalf("expected python codegen disabled, got %#v", pythonCodegenEnabled)
	}
}

func TestRegistryWriteValueNormalizesSpecPathThroughProjectStateOwner(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	registry := mustNewAppScopedRegistry(t, runtime, root)

	result, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.app.spec_path",
		"  "+filepath.Join(root, filepath.FromSlash(appspec.RootPath()), "ui-settings.json")+"  ",
		appspec.DefaultPath(),
	)
	if err != nil {
		t.Fatalf("write app spec path: %v", err)
	}
	if result.OldValue != appspec.DefaultPath() {
		t.Fatalf("expected old spec path %q, got %#v", appspec.DefaultPath(), result.OldValue)
	}
	expectedPath := appspec.JoinPath("ui-settings.json")
	if result.NewValue != expectedPath {
		t.Fatalf("expected normalized spec path %q, got %#v", expectedPath, result.NewValue)
	}
	if result.NormalizedValue != expectedPath {
		t.Fatalf("expected normalized value %q, got %#v", expectedPath, result.NormalizedValue)
	}
}

func TestRegistryWriteValueRejectsInvalidWatchCodeFolderShape(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	registry := mustNewCoreRegistry(t, runtime, root)

	_, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.watch_code.folders",
		[]any{
			map[string]any{
				"path":      "./backend",
				"recursive": "not-a-boolean",
			},
		},
		nil,
	)
	settingErr, ok := err.(*SettingError)
	if !ok {
		t.Fatalf("expected SettingError, got %T (%v)", err, err)
	}
	if settingErr.Code != ErrorCodeInvalidValueType {
		t.Fatalf("expected invalid_value_type, got %q", settingErr.Code)
	}
}

func TestRegistryWriteValueRejectsUnsupportedWatchCodeFolderProperties(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	registry := mustNewCoreRegistry(t, runtime, root)

	_, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.watch_code.folders",
		[]any{
			map[string]any{
				"path":      "./backend",
				"recursive": true,
				"extra":     "not-allowed",
			},
		},
		nil,
	)
	settingErr, ok := err.(*SettingError)
	if !ok {
		t.Fatalf("expected SettingError, got %T (%v)", err, err)
	}
	if settingErr.Code != ErrorCodeInvalidValueType {
		t.Fatalf("expected invalid_value_type, got %q", settingErr.Code)
	}
	if !strings.Contains(settingErr.Message, "unsupported properties") {
		t.Fatalf("expected unsupported properties message, got %q", settingErr.Message)
	}
}

func TestRegistryWriteValueMapsStaleCompareAndSetToMutationFailed(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	registry := mustNewCoreRegistry(t, runtime, root)

	_, _, err := runtime.CompareAndSetShowParamDisplayNames(context.Background(), "project-alpha", true, nil)
	if err != nil {
		t.Fatalf("seed show param display names: %v", err)
	}

	_, err = registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.project.show_param_display_names",
		false,
		false,
	)
	settingErr, ok := err.(*SettingError)
	if !ok {
		t.Fatalf("expected SettingError, got %T (%v)", err, err)
	}
	if settingErr.Code != ErrorCodeMutationFailed {
		t.Fatalf("expected mutation_failed, got %q", settingErr.Code)
	}
}

func TestRegistryWriteValueRoundTripsProjectNameAndPythonCodegenEnabled(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	registry := mustNewCoreRegistry(t, runtime, root)

	projectNameResult, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.project.name",
		"  Renamed Project  ",
		"Alpha",
	)
	if err != nil {
		t.Fatalf("write project name: %v", err)
	}
	if projectNameResult.OldValue != "Alpha" {
		t.Fatalf("expected old project name Alpha, got %#v", projectNameResult.OldValue)
	}
	if projectNameResult.NewValue != "Renamed Project" {
		t.Fatalf("expected new project name Renamed Project, got %#v", projectNameResult.NewValue)
	}
	if projectNameResult.NormalizedValue != "Renamed Project" {
		t.Fatalf("expected normalized project name Renamed Project, got %#v", projectNameResult.NormalizedValue)
	}

	pythonCodegenResult, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.run_instructions.python_codegen_enabled",
		true,
		false,
	)
	if err != nil {
		t.Fatalf("write python codegen enabled: %v", err)
	}
	if pythonCodegenResult.OldValue != false {
		t.Fatalf("expected old python codegen state false, got %#v", pythonCodegenResult.OldValue)
	}
	if pythonCodegenResult.NewValue != true {
		t.Fatalf("expected new python codegen state true, got %#v", pythonCodegenResult.NewValue)
	}
	if pythonCodegenResult.NormalizedValue != true {
		t.Fatalf("expected normalized python codegen state true, got %#v", pythonCodegenResult.NormalizedValue)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after writes: %v", err)
	}
	if project.Name != "Renamed Project" {
		t.Fatalf("expected persisted project name Renamed Project, got %#v", project.Name)
	}
	if !project.HasPythonCodegenTarget() {
		t.Fatal("expected python codegen target to be enabled after write")
	}
}

func TestScopedRegistryProjectAISettingsExposeReadOnlyCountEntries(t *testing.T) {
	t.Parallel()

	registry := mustNewScopedRegistry(t, ScopedRegistryOptions{
		Runtime:       openCoreRegistryRuntime(t),
		WorkspaceRoot: t.TempDir(),
		ProjectAISettings: ProjectAISettingProviders{
			LLMAPIKeys: func(context.Context) (int, error) {
				return 2, nil
			},
			AgentProfiles: func(context.Context) (int, error) {
				return 3, nil
			},
			PromptTemplates: func(context.Context) (int, error) {
				return 4, nil
			},
			ExternalAgents: func(context.Context) (int, error) {
				return 1, nil
			},
		},
	})

	expected := map[string]struct {
		query          string
		count          int
		accordionValue string
	}{
		"core.project_ai_settings.llm_api_keys": {
			query:          "llm api keys",
			count:          2,
			accordionValue: "project-ai-settings-llm-api-keys",
		},
		"core.project_ai_settings.agent_profiles": {
			query:          "agent profiles",
			count:          3,
			accordionValue: "project-ai-settings-agent-profiles",
		},
		"core.project_ai_settings.prompt_templates": {
			query:          "prompt templates",
			count:          4,
			accordionValue: "project-ai-settings-prompt-templates",
		},
		"core.project_ai_settings.external_agents": {
			query:          "external agents",
			count:          1,
			accordionValue: "project-ai-settings-external-agents",
		},
	}

	for settingID, expectation := range expected {
		results, err := registry.Search(expectation.query, 5, SourceFilterCore)
		if err != nil {
			t.Fatalf("search %q: %v", expectation.query, err)
		}
		found := false
		for _, result := range results {
			if result.SettingID == settingID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected search %q to include %s, got %#v", expectation.query, settingID, results)
		}

		entry, ok, err := registry.Get(settingID)
		if err != nil {
			t.Fatalf("get %s: %v", settingID, err)
		}
		if !ok {
			t.Fatalf("expected registry entry for %s", settingID)
		}
		if entry.Metadata.Mutability != MutabilityReadOnly {
			t.Fatalf("expected %s to be read-only, got %q", settingID, entry.Metadata.Mutability)
		}
		if entry.Metadata.Location.OverviewTabKey != string(OverviewTabNameProjectAISettings) {
			t.Fatalf("expected %s overview tab %s, got %q", settingID, OverviewTabNameProjectAISettings, entry.Metadata.Location.OverviewTabKey)
		}
		if entry.Metadata.Highlight.AnchorID != settingID {
			t.Fatalf("expected %s anchor id %s, got %q", settingID, settingID, entry.Metadata.Highlight.AnchorID)
		}
		if len(entry.Metadata.RevealActivationSteps) != 1 {
			t.Fatalf("expected one reveal activation step for %s, got %#v", settingID, entry.Metadata.RevealActivationSteps)
		}
		if entry.Metadata.RevealActivationSteps[0].Type != RevealActivationProjectAIAccordion {
			t.Fatalf("expected project-ai accordion step for %s, got %#v", settingID, entry.Metadata.RevealActivationSteps[0])
		}
		if entry.Metadata.RevealActivationSteps[0].ItemValue != expectation.accordionValue {
			t.Fatalf("expected accordion item %q for %s, got %#v", expectation.accordionValue, settingID, entry.Metadata.RevealActivationSteps[0].ItemValue)
		}

		value, err := registry.ReadValue(context.Background(), "project-alpha", settingID)
		if err != nil {
			t.Fatalf("read %s: %v", settingID, err)
		}
		if value != expectation.count {
			t.Fatalf("expected %s value %d, got %#v", settingID, expectation.count, value)
		}

		_, err = registry.WriteValue(context.Background(), "project-alpha", settingID, 0, nil)
		settingErr, ok := err.(*SettingError)
		if !ok {
			t.Fatalf("expected SettingError for read-only %s write, got %T (%v)", settingID, err, err)
		}
		if settingErr.Code != ErrorCodeSettingReadOnly {
			t.Fatalf("expected setting_read_only for %s, got %q", settingID, settingErr.Code)
		}
	}
}

func TestRegistryWriteValueProjectNameSameValueIsNoOp(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	registry := mustNewCoreRegistry(t, runtime, root)

	result, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.project.name",
		"  Alpha  ",
		nil,
	)
	if err != nil {
		t.Fatalf("write same-value project name: %v", err)
	}
	if result.Changed {
		t.Fatalf("expected project name no-op, got %#v", result)
	}
	if result.OldValue != "Alpha" || result.NewValue != "Alpha" || result.NormalizedValue != "Alpha" {
		t.Fatalf("expected Alpha old/new/normalized values, got %#v", result)
	}
}

func TestRegistryWriteValuePythonCodegenEnabledSameValueIsNoOpAndPreservesTargetOrder(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	if _, err := runtime.SetProjectCodegenTargets(
		context.Background(),
		"project-alpha",
		[]projectstate.ProjectCodegenTarget{
			{
				Language: string(projectstate.CodeLanguagePython),
			},
			{
				Language: "plugin.codegen.target",
			},
		},
		projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		}),
		projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		}),
	); err != nil {
		t.Fatalf("seed codegen targets: %v", err)
	}

	registry := mustNewCoreRegistry(t, runtime, root)

	result, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.run_instructions.python_codegen_enabled",
		true,
		nil,
	)
	if err != nil {
		t.Fatalf("write same-value python codegen enabled: %v", err)
	}
	if result.Changed {
		t.Fatalf("expected python codegen no-op, got %#v", result)
	}
	if result.OldValue != true || result.NewValue != true || result.NormalizedValue != true {
		t.Fatalf("expected true old/new/normalized values, got %#v", result)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after no-op codegen write: %v", err)
	}
	if len(project.CodegenTargets) != 2 {
		t.Fatalf("expected two codegen targets after no-op write, got %#v", project.CodegenTargets)
	}
	if project.CodegenTargets[0].Language != string(projectstate.CodeLanguagePython) {
		t.Fatalf("expected python target to remain first, got %#v", project.CodegenTargets)
	}
	if project.CodegenTargets[1].Language != "plugin.codegen.target" {
		t.Fatalf("expected plugin target to remain second, got %#v", project.CodegenTargets)
	}
}

func TestRegistryWriteValueAppSpecPathRoundTripsOnFreshProject(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	registry := mustNewAppScopedRegistry(t, runtime, root)

	nextSpecPath := appspec.JoinPath("ui-settings-test-app.json")
	result, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.app.spec_path",
		nextSpecPath,
		appspec.DefaultPath(),
	)
	if err != nil {
		t.Fatalf("write app spec path: %v", err)
	}
	if result.NewValue != nextSpecPath || result.NormalizedValue != nextSpecPath {
		t.Fatalf("expected new app spec path %q, got %#v", nextSpecPath, result)
	}

	value, err := registry.ReadValue(context.Background(), "project-alpha", "core.app.spec_path")
	if err != nil {
		t.Fatalf("read app spec path after write: %v", err)
	}
	if value != nextSpecPath {
		t.Fatalf("expected app spec path %q after write, got %#v", nextSpecPath, value)
	}
	if _, got, _ := effectiveAppMetadata(t, runtime); got != nextSpecPath {
		t.Fatalf("expected effective app spec path %q, got %q", nextSpecPath, got)
	}
}

func TestRegistryWriteValueWatchCodeFilesRoundTrips(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	registry := mustNewCoreRegistry(t, runtime, root)

	nextFiles := []string{"backend/setta/api/listener.py", "frontend/src/components/App/appTheme.ts"}
	expectedFiles := []any{nextFiles[0], nextFiles[1]}
	result, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.watch_code.files",
		[]any{nextFiles[0], nextFiles[1]},
		nil,
	)
	if err != nil {
		t.Fatalf("write watch code files: %v", err)
	}
	if result.Changed != true {
		t.Fatalf("expected watch code files write to change state, got %#v", result)
	}
	if !reflect.DeepEqual(result.NewValue, expectedFiles) {
		t.Fatalf("expected new watch code files %#v, got %#v", expectedFiles, result.NewValue)
	}
	if !reflect.DeepEqual(result.NormalizedValue, expectedFiles) {
		t.Fatalf("expected normalized watch code files %#v, got %#v", expectedFiles, result.NormalizedValue)
	}

	value, err := registry.ReadValue(context.Background(), "project-alpha", "core.watch_code.files")
	if err != nil {
		t.Fatalf("read watch code files after write: %v", err)
	}
	if !reflect.DeepEqual(value, expectedFiles) {
		t.Fatalf("expected watch code files %#v after write, got %#v", expectedFiles, value)
	}
}

func TestRegistryWriteValueAppThemeModeRoundTripsOnFreshProject(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	registry := mustNewAppScopedRegistry(t, runtime, root)
	_, _, expectedOldThemeMode := effectiveAppMetadata(t, runtime)

	result, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.app.theme_mode",
		"  dark  ",
		expectedOldThemeMode,
	)
	if err != nil {
		t.Fatalf("write app theme mode: %v", err)
	}
	if result.OldValue != expectedOldThemeMode {
		t.Fatalf("expected old app theme mode %q, got %#v", expectedOldThemeMode, result.OldValue)
	}
	if result.NewValue != "dark" || result.NormalizedValue != "dark" {
		t.Fatalf("expected dark new/normalized app theme mode, got %#v", result)
	}

	value, err := registry.ReadValue(context.Background(), "project-alpha", "core.app.theme_mode")
	if err != nil {
		t.Fatalf("read app theme mode after write: %v", err)
	}
	if value != "dark" {
		t.Fatalf("expected app theme mode dark after write, got %#v", value)
	}
}

func openCoreRegistryRuntime(t *testing.T) *projectstate.Runtime {
	t.Helper()
	return openCoreRegistryPersistedRuntime(t, t.TempDir())
}

func mustNewCoreRegistry(t *testing.T, runtime *projectstate.Runtime, workspaceRoot string) *Registry {
	t.Helper()

	registry, err := NewCoreRegistry(runtime, workspaceRoot)
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}
	return registry
}

func mustNewScopedRegistry(t *testing.T, options ScopedRegistryOptions) *Registry {
	t.Helper()

	registry, err := NewScopedRegistry(options)
	if err != nil {
		t.Fatalf("new scoped registry: %v", err)
	}
	return registry
}

func mustNewAppScopedRegistry(t *testing.T, runtime *projectstate.Runtime, workspaceRoot string) *Registry {
	t.Helper()

	service := appdefinition.NewAppDefinitionService(runtime)
	return mustNewScopedRegistry(t, ScopedRegistryOptions{
		Runtime:       runtime,
		WorkspaceRoot: workspaceRoot,
		PluginService: &testPluginRuntimeService{
			runtimeResponse: newActiveAppSubsystemPluginRuntimeResponse(),
		},
		ContributedEntryBuilders: []RuntimeEntryBuilder{
			func(runtimeResponse plugins.PluginRuntimeResponse) ([]RuntimeEntry, error) {
				if runtimeResponse.FeatureCapabilities == nil || !runtimeResponse.FeatureCapabilities.AppSubsystem.PluginEnabled {
					return nil, nil
				}
				return buildTestAppUISettingEntries(service), nil
			},
		},
	})
}

func newActiveAppSubsystemPluginRuntimeResponse() plugins.PluginRuntimeResponse {
	return plugins.PluginRuntimeResponse{
		FeatureCapabilities: &plugins.PluginFeatureCapabilities{
			AppSubsystem: plugins.PluginAppSubsystemCapabilities{
				PluginID:       plugins.AppSubsystemPluginID,
				PluginEnabled:  true,
				AppAuthoringUI: true,
			},
		},
		List: plugins.PluginListResponse{
			Plugins: []plugins.PluginListEntry{
				{
					PluginID: plugins.AppSubsystemPluginID,
				},
			},
		},
		Status: plugins.PluginStatusResponse{
			Plugins: []plugins.PluginStatusEntry{
				{
					PluginID: plugins.AppSubsystemPluginID,
					State:    plugins.PluginRuntimeStateActive,
				},
			},
		},
	}
}

func buildTestAppUISettingEntries(service projectstate.AppDefinitionRuntime) []RuntimeEntry {
	nonEmptyStringSchema := ValueSchema{Type: ValueTypeString, MinLength: testIntPointer(1)}
	themeModeSchema := ValueSchema{Type: ValueTypeString, EnumValues: []any{"auto", "dark", "light"}}

	return []RuntimeEntry{
		NewCompareAndSetEntry(
			buildTestAppEntryMetadata(
				"core.app.catalog_id",
				"App Catalog ID",
				[]string{"app catalog", "catalog id"},
				"Catalog id for the app definition.",
				nonEmptyStringSchema,
			),
			func(ctx context.Context, _ string) (any, error) {
				definition, err := service.GetEffectiveAppDefinition(ctx)
				if err != nil {
					return nil, err
				}
				return definition.CatalogID, nil
			},
			NormalizeOptionalNonEmptyStringWrite,
			func(ctx context.Context, _ string, nextValue string, expected *string) (projectstate.CompareAndSetResult[string], error) {
				_, result, err := service.CompareAndSetAppDefinitionCatalogID(ctx, nextValue, expected)
				return result, err
			},
			ComparableMutationResult[string],
		),
		NewCompareAndSetEntry(
			buildTestAppEntryMetadata(
				"core.app.spec_version",
				"App Spec Version",
				[]string{"app version", "spec version"},
				"Version marker for the app definition schema payload.",
				nonEmptyStringSchema,
			),
			func(ctx context.Context, _ string) (any, error) {
				definition, err := service.GetEffectiveAppDefinition(ctx)
				if err != nil {
					return nil, err
				}
				return definition.AppSpecVersion, nil
			},
			NormalizeOptionalNonEmptyStringWrite,
			func(ctx context.Context, _ string, nextValue string, expected *string) (projectstate.CompareAndSetResult[string], error) {
				_, result, err := service.CompareAndSetAppDefinitionSpecVersion(ctx, nextValue, expected)
				return result, err
			},
			ComparableMutationResult[string],
		),
		NewCompareAndSetEntry(
			buildTestAppEntryMetadata(
				"core.app.spec_path",
				"App Spec Path",
				[]string{"app path", "spec path"},
				"Filesystem path where app spec JSON is saved.",
				nonEmptyStringSchema,
			),
			func(ctx context.Context, _ string) (any, error) {
				return service.GetEffectiveAppSpecPath(ctx)
			},
			NormalizeOptionalNonEmptyStringWrite,
			func(ctx context.Context, _ string, nextValue string, expected *string) (projectstate.CompareAndSetResult[string], error) {
				_, result, err := service.CompareAndSetAppDefinitionSpecPath(ctx, nextValue, expected)
				return result, err
			},
			ComparableMutationResult[string],
		),
		NewCompareAndSetEntry(
			buildTestAppEntryMetadata(
				"core.app.theme_mode",
				"App Theme Mode",
				[]string{"theme mode", "app theme", "light mode", "dark mode"},
				"Theme mode for the app definition.",
				themeModeSchema,
			),
			func(ctx context.Context, _ string) (any, error) {
				return service.GetEffectiveAppThemeMode(ctx)
			},
			NormalizeOptionalThemeModeWrite,
			func(ctx context.Context, _ string, nextValue string, expected *string) (projectstate.CompareAndSetResult[string], error) {
				_, result, err := service.CompareAndSetAppDefinitionThemeMode(ctx, nextValue, expected)
				return result, err
			},
			ComparableMutationResult[string],
		),
	}
}

func buildTestAppEntryMetadata(
	settingID string,
	title string,
	synonyms []string,
	description string,
	valueSchema ValueSchema,
) Entry {
	return Entry{
		SettingID:   settingID,
		Title:       title,
		Synonyms:    append([]string(nil), synonyms...),
		Description: description,
		Location: Location{
			Side:           SideLeft,
			OverviewTabKey: string(OverviewTabNameApp),
		},
		Highlight: Highlight{
			Strategy: HighlightStrategyDOMAnchor,
			AnchorID: settingID,
		},
		Source:      SourcePlugin,
		PluginID:    plugins.AppSubsystemPluginID,
		Mutability:  MutabilityWritable,
		ValueSchema: valueSchema,
	}
}

func testIntPointer(value int) *int {
	return &value
}

func openCoreRegistryPersistedRuntime(t *testing.T, root string) *projectstate.Runtime {
	t.Helper()

	store, err := projectstate.NewStore(filepath.Join(root, "project.json"), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime, err := projectstate.OpenRuntimeWithOptions(context.Background(), store, projectstate.RuntimeOptions{})
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})
	return runtime
}

func effectiveAppMetadata(
	t *testing.T,
	runtime *projectstate.Runtime,
) (projectstate.AppDefinition, string, string) {
	t.Helper()

	service := appdefinition.NewAppDefinitionService(runtime)
	definition, err := service.GetEffectiveAppDefinition(context.Background())
	if err != nil {
		t.Fatalf("get effective app definition: %v", err)
	}
	specPath, err := service.GetEffectiveAppSpecPath(context.Background())
	if err != nil {
		t.Fatalf("get effective app spec path: %v", err)
	}
	themeMode, err := service.GetEffectiveAppThemeMode(context.Background())
	if err != nil {
		t.Fatalf("get effective app theme mode: %v", err)
	}
	return definition, specPath, themeMode
}
