package uisettings

import (
	"context"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/appspec"
	"setta/internal/projectstate"
)

func TestNewCoreRegistryListsBoundedCoreEntries(t *testing.T) {
	t.Parallel()

	runtime := openCoreRegistryRuntime(t)
	registry, err := NewCoreRegistry(runtime, t.TempDir())
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

	entries := registry.ListEntries(SourceFilterCore)
	ids := make([]string, 0, len(entries))
	for _, entry := range entries {
		ids = append(ids, entry.SettingID)
	}
	expected := []string{
		"core.app.catalog_id",
		"core.app.spec_path",
		"core.app.spec_version",
		"core.app.theme_mode",
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
	registry, err := NewCoreRegistry(runtime, t.TempDir())
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

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
	registry, err := NewScopedRegistry(ScopedRegistryOptions{
		Runtime:       runtime,
		WorkspaceRoot: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("new scoped registry without plugin service: %v", err)
	}

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
}

func TestScopedRegistryIncludesRequiredRevealActivationMetadata(t *testing.T) {
	t.Parallel()

	runtime := openCoreRegistryRuntime(t)
	registry, err := NewScopedRegistry(ScopedRegistryOptions{
		Runtime:       runtime,
		WorkspaceRoot: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("new scoped registry: %v", err)
	}

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
		if settingID == "core.run_instructions.python_codegen_enabled" && entry.Metadata.Location.OverviewTabKey != "RunInstructions" {
			t.Fatalf(
				"expected %s overview tab RunInstructions, got %q",
				settingID,
				entry.Metadata.Location.OverviewTabKey,
			)
		}
	}
}

func TestRegistryReadValueReturnsDefaultedAppMetadataOnFreshProject(t *testing.T) {
	t.Parallel()

	runtime := openCoreRegistryRuntime(t)
	registry, err := NewCoreRegistry(runtime, t.TempDir())
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

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

	if catalogID != appspec.DefaultCatalogID {
		t.Fatalf("expected default catalog id %q, got %#v", appspec.DefaultCatalogID, catalogID)
	}
	if specVersion != projectstate.DefaultAppSpecVersion() {
		t.Fatalf("expected default app spec version %q, got %#v", projectstate.DefaultAppSpecVersion(), specVersion)
	}
	if specPath != appspec.DefaultPath() {
		t.Fatalf("expected default app spec path %q, got %#v", appspec.DefaultPath(), specPath)
	}
	if themeMode != projectstate.DefaultAppThemeMode() {
		t.Fatalf("expected default app theme mode %q, got %#v", projectstate.DefaultAppThemeMode(), themeMode)
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
	registry, err := NewCoreRegistry(runtime, root)
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

	result, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.app.spec_path",
		"  "+filepath.Join(root, "app_specs", "ui-settings.json")+"  ",
		appspec.DefaultPath(),
	)
	if err != nil {
		t.Fatalf("write app spec path: %v", err)
	}
	if result.OldValue != appspec.DefaultPath() {
		t.Fatalf("expected old spec path %q, got %#v", appspec.DefaultPath(), result.OldValue)
	}
	if result.NewValue != "app_specs/ui-settings.json" {
		t.Fatalf("expected normalized spec path app_specs/ui-settings.json, got %#v", result.NewValue)
	}
	if result.NormalizedValue != "app_specs/ui-settings.json" {
		t.Fatalf("expected normalized value app_specs/ui-settings.json, got %#v", result.NormalizedValue)
	}
}

func TestRegistryWriteValueRejectsInvalidWatchCodeFolderShape(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	registry, err := NewCoreRegistry(runtime, root)
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

	_, err = registry.WriteValue(
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
	registry, err := NewCoreRegistry(runtime, root)
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

	_, err = registry.WriteValue(
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
	registry, err := NewCoreRegistry(runtime, root)
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

	_, _, err = runtime.CompareAndSetShowParamDisplayNames(context.Background(), "project-alpha", true, nil)
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
	registry, err := NewCoreRegistry(runtime, root)
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

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

	registry, err := NewScopedRegistry(ScopedRegistryOptions{
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
	if err != nil {
		t.Fatalf("new scoped registry: %v", err)
	}

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
		if entry.Metadata.Location.OverviewTabKey != "ProjectAISettings" {
			t.Fatalf("expected %s overview tab ProjectAISettings, got %q", settingID, entry.Metadata.Location.OverviewTabKey)
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
	registry, err := NewCoreRegistry(runtime, root)
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

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

	registry, err := NewCoreRegistry(runtime, root)
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

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
	registry, err := NewCoreRegistry(runtime, root)
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

	const nextSpecPath = "app_specs/ui-settings-test-app.json"
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
	if got := projectstate.EffectiveAppSpecPath(runtime.Snapshot().Document); got != nextSpecPath {
		t.Fatalf("expected effective app spec path %q, got %q", nextSpecPath, got)
	}
}

func openCoreRegistryRuntime(t *testing.T) *projectstate.Runtime {
	t.Helper()
	return openCoreRegistryPersistedRuntime(t, t.TempDir())
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
	runtime, err := projectstate.OpenRuntime(context.Background(), store)
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
