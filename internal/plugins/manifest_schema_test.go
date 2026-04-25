package plugins

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"testing"
)

func TestPluginManifestSchemaTracksRuntimeContract(t *testing.T) {
	repoRoot := workerRPCTestRepoRoot(t)
	schemaPath := filepath.Join(
		repoRoot,
		"backend",
		"setta",
		"plugins",
		"schemas",
		"setta.plugin.schema.json",
	)
	schemaPayload, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("read plugin manifest schema: %v", err)
	}

	var schema map[string]any
	if err := json.Unmarshal(schemaPayload, &schema); err != nil {
		t.Fatalf("decode plugin manifest schema: %v", err)
	}

	properties := schemaPropertyMap(t, schema, "properties")
	frontendProperties := schemaPropertyMap(t, schemaObject(t, properties, "frontend"), "properties")
	buildProperties := schemaPropertyMap(t, schemaObject(t, frontendProperties, "build"), "properties")
	featureProperties := schemaPropertyMap(t, schemaObject(t, properties, "featureCapabilities"), "properties")
	appSubsystemProperties := schemaPropertyMap(t, schemaObject(t, featureProperties, "appSubsystem"), "properties")
	capabilities := schemaStringArray(
		t,
		schemaObject(t, schemaObject(t, properties, "capabilities"), "items"),
		"enum",
	)

	wantCapabilities := make([]string, 0, len(resolverKnownPluginCapabilities))
	for capability := range resolverKnownPluginCapabilities {
		wantCapabilities = append(wantCapabilities, capability)
	}
	slices.Sort(wantCapabilities)
	slices.Sort(capabilities)
	if !reflect.DeepEqual(capabilities, wantCapabilities) {
		t.Fatalf("expected schema capability enum %v, got %v", wantCapabilities, capabilities)
	}

	packageManagers := schemaStringArray(t, buildProperties, "packageManager", "enum")
	if !reflect.DeepEqual(packageManagers, []string{pluginFrontendBuildPackageManagerPNPM}) {
		t.Fatalf("expected schema frontend.build.packageManager enum [%q], got %v", pluginFrontendBuildPackageManagerPNPM, packageManagers)
	}

	wantAppSubsystemFields := []string{
		"appAuthoringUi",
		"appPreviewUi",
		"appGenerationChatModes",
		"appDeploymentRuntime",
	}
	gotAppSubsystemFields := make([]string, 0, len(appSubsystemProperties))
	for field := range appSubsystemProperties {
		gotAppSubsystemFields = append(gotAppSubsystemFields, field)
	}
	slices.Sort(wantAppSubsystemFields)
	slices.Sort(gotAppSubsystemFields)
	if !reflect.DeepEqual(gotAppSubsystemFields, wantAppSubsystemFields) {
		t.Fatalf("expected schema featureCapabilities.appSubsystem fields %v, got %v", wantAppSubsystemFields, gotAppSubsystemFields)
	}
}

func schemaPropertyMap(t *testing.T, object map[string]any, key string) map[string]any {
	t.Helper()

	rawValue, ok := object[key]
	if !ok {
		t.Fatalf("expected schema key %q", key)
	}
	value, ok := rawValue.(map[string]any)
	if !ok {
		t.Fatalf("expected schema key %q to be an object, got %T", key, rawValue)
	}
	return value
}

func schemaObject(t *testing.T, object map[string]any, key string) map[string]any {
	t.Helper()

	return schemaPropertyMap(t, object, key)
}

func schemaStringArray(t *testing.T, object map[string]any, keys ...string) []string {
	t.Helper()

	current := object
	for index := 0; index < len(keys)-1; index++ {
		current = schemaObject(t, current, keys[index])
	}
	rawValues, ok := current[keys[len(keys)-1]]
	if !ok {
		t.Fatalf("expected schema key %q", keys[len(keys)-1])
	}
	valuesAny, ok := rawValues.([]any)
	if !ok {
		t.Fatalf("expected schema key %q to be an array, got %T", keys[len(keys)-1], rawValues)
	}
	values := make([]string, 0, len(valuesAny))
	for _, rawValue := range valuesAny {
		value, ok := rawValue.(string)
		if !ok {
			t.Fatalf("expected schema array value to be a string, got %T", rawValue)
		}
		values = append(values, value)
	}
	return values
}
