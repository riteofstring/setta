package deployments

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/projectstate"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

func TestAppPublisherRequiresAppDefinition(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()

	runtime, _, _ := openSharePublishRuntime(t, settaFilesRoot, simpleProjectDocument(false))
	publisher := openTestAppPublisher(t, settaFilesRoot, workspaceRoot, runtime, time.Date(2026, 3, 8, 17, 0, 0, 0, time.UTC))

	_, err := publisher.Publish(context.Background(), AppPublishRequest{
		ProjectState:   runtime,
		ProjectID:      "project-alpha",
		DeploymentName: "demo-app",
	})
	if !errors.Is(err, ErrAppPublishAppDefinitionMissing) {
		t.Fatalf("expected missing app definition error, got %v", err)
	}
}

func TestAppPublisherRequiresConfiguredAppSpecPath(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()

	runtime, _, _ := openSharePublishRuntime(t, settaFilesRoot, appPublishDocument(&projectstate.AppDefinition{}))
	publisher := openTestAppPublisher(t, settaFilesRoot, workspaceRoot, runtime, time.Date(2026, 3, 8, 17, 10, 0, 0, time.UTC))

	_, err := publisher.Publish(context.Background(), AppPublishRequest{
		ProjectState:   runtime,
		ProjectID:      "project-alpha",
		DeploymentName: "demo-app",
	})
	if !errors.Is(err, ErrAppPublishAppSpecPathRequired) {
		t.Fatalf("expected missing app spec path error, got %v", err)
	}
}

func TestAppPublisherRejectsInvalidStoredAppSpec(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	appSpecPath := "app_specs/custom.json"
	writeAppSpecFile(t, settaFilesRoot, appSpecPath, map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "MissingComponent",
		},
		"elements": map[string]any{},
	})

	runtime, _, _ := openSharePublishRuntime(t, settaFilesRoot, appPublishDocument(&projectstate.AppDefinition{
		AppSpecPath: appSpecPath,
	}))
	publisher := openTestAppPublisher(t, settaFilesRoot, workspaceRoot, runtime, time.Date(2026, 3, 8, 17, 20, 0, 0, time.UTC))

	_, err := publisher.Publish(context.Background(), AppPublishRequest{
		ProjectState:   runtime,
		ProjectID:      "project-alpha",
		DeploymentName: "demo-app",
	})
	if !errors.Is(err, ErrAppPublishAppSpecInvalid) {
		t.Fatalf("expected invalid app spec error, got %v", err)
	}
	var validationErr *AppPublishValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected app publish validation error, got %T", err)
	}
	if len(validationErr.Issues) == 0 {
		t.Fatal("expected validation issues for invalid app spec")
	}
}

func TestAppPublisherPublishesRelativeAppSpecPathWithAppPolicyDefaults(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	appSpecPath := "app_specs/custom.json"
	appSpecPayload := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}
	writeAppSpecFile(t, settaFilesRoot, appSpecPath, appSpecPayload)

	runtime, _, _ := openSharePublishRuntime(t, settaFilesRoot, appPublishDocument(&projectstate.AppDefinition{
		AppSpecPath: appSpecPath,
	}))
	publisher := openTestAppPublisher(t, settaFilesRoot, workspaceRoot, runtime, time.Date(2026, 3, 8, 17, 30, 0, 0, time.UTC))

	result, err := publisher.Publish(context.Background(), AppPublishRequest{
		ProjectState:   runtime,
		ProjectID:      "project-alpha",
		DeploymentName: "demo-app",
	})
	if err != nil {
		t.Fatalf("publish app deployment: %v", err)
	}

	if result.Manifest.DeploymentType != TypeApp {
		t.Fatalf("expected app manifest type, got %q", result.Manifest.DeploymentType)
	}
	if result.Policy.AllowRun != true {
		t.Fatalf("expected app deployments to allow run by default, got %#v", result.Policy)
	}
	if result.Policy.AllowVariantChanges {
		t.Fatalf("expected app deployments to disable variant changes by default, got %#v", result.Policy)
	}
	if result.Policy.AllowLayoutChanges {
		t.Fatalf("expected app deployments to disable layout changes by default, got %#v", result.Policy)
	}

	manifest, err := LoadManifest(result.Metadata.DeploymentRoot)
	if err != nil {
		t.Fatalf("load deployment manifest: %v", err)
	}
	if manifest.DeploymentType != TypeApp {
		t.Fatalf("expected persisted app manifest type, got %q", manifest.DeploymentType)
	}
	policy, err := LoadPolicy(result.Metadata.DeploymentRoot)
	if err != nil {
		t.Fatalf("load deployment policy: %v", err)
	}
	if policy != result.Policy {
		t.Fatalf("expected persisted app policy %#v, got %#v", result.Policy, policy)
	}

	publishedDocument := loadPublishedDocument(t, result.Metadata.DeploymentRoot)
	if publishedDocument.AppDefinition == nil {
		t.Fatal("expected published app definition")
	}
	if publishedDocument.AppDefinition.AppSpecPath != appSpecPath {
		t.Fatalf("expected published app spec path %q, got %q", appSpecPath, publishedDocument.AppDefinition.AppSpecPath)
	}
	publishedSpec, err := appspec.Read(result.Metadata.DeploymentRoot, appSpecPath)
	if err != nil {
		t.Fatalf("read published app spec: %v", err)
	}
	assertJSONValuesEqual(t, publishedSpec, appSpecPayload)
}

func TestAppPublisherPublishesAbsoluteAppSpecPathAsDeploymentRelativePath(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	appSpecPath := "app_specs/custom.json"
	appSpecPayload := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}
	writeAppSpecFile(t, settaFilesRoot, appSpecPath, appSpecPayload)
	absoluteAppSpecPath := filepath.Join(settaFilesRoot, filepath.FromSlash(appSpecPath))

	runtime, _, _ := openSharePublishRuntime(t, settaFilesRoot, appPublishDocument(&projectstate.AppDefinition{
		AppSpecPath: absoluteAppSpecPath,
	}))
	publisher := openTestAppPublisher(t, settaFilesRoot, workspaceRoot, runtime, time.Date(2026, 3, 8, 17, 40, 0, 0, time.UTC))

	result, err := publisher.Publish(context.Background(), AppPublishRequest{
		ProjectState:   runtime,
		ProjectID:      "project-alpha",
		DeploymentName: "demo-app",
	})
	if err != nil {
		t.Fatalf("publish app deployment: %v", err)
	}

	publishedDocument := loadPublishedDocument(t, result.Metadata.DeploymentRoot)
	if publishedDocument.AppDefinition == nil {
		t.Fatal("expected published app definition")
	}
	if publishedDocument.AppDefinition.AppSpecPath != appSpecPath {
		t.Fatalf("expected rebased app spec path %q, got %q", appSpecPath, publishedDocument.AppDefinition.AppSpecPath)
	}

	publishedSpec, err := appspec.Read(result.Metadata.DeploymentRoot, appSpecPath)
	if err != nil {
		t.Fatalf("read published app spec: %v", err)
	}
	assertJSONValuesEqual(t, publishedSpec, appSpecPayload)
}

func TestAppPublisherRejectsRunSnapshotModeNever(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	appSpecPath := "app_specs/custom.json"
	writeAppSpecFile(t, settaFilesRoot, appSpecPath, map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	})

	runtime, _, _ := openSharePublishRuntime(t, settaFilesRoot, appPublishDocument(&projectstate.AppDefinition{
		AppSpecPath: appSpecPath,
	}))
	publisher := openTestAppPublisher(t, settaFilesRoot, workspaceRoot, runtime, time.Date(2026, 3, 8, 17, 50, 0, 0, time.UTC))

	never := RunSnapshotModeNever
	_, err := publisher.Publish(context.Background(), AppPublishRequest{
		ProjectState:   runtime,
		ProjectID:      "project-alpha",
		DeploymentName: "demo-app",
		PolicyOverrides: &AppPolicyOverrides{
			RunSnapshotMode: &never,
		},
	})
	if !errors.Is(err, ErrDeploymentRunSnapshotModeNeverDenied) {
		t.Fatalf("expected never snapshot mode rejection, got %v", err)
	}
}

func TestAppPublisherCopiesListenerEntrypoint(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	appSpecPath := "app_specs/custom.json"
	writeAppSpecFile(t, settaFilesRoot, appSpecPath, map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	})
	listenerRelativePath := filepath.ToSlash(filepath.Join("listeners", "app.py"))
	listenerSourcePath := filepath.Join(workspaceRoot, "listeners", "app.py")
	writeTextFile(t, listenerSourcePath, "print('listener')\n")

	runtime, _, _ := openSharePublishRuntime(t, settaFilesRoot, appPublishDocument(&projectstate.AppDefinition{
		AppSpecPath: appSpecPath,
	}))
	publisher := openTestAppPublisher(t, settaFilesRoot, workspaceRoot, runtime, time.Date(2026, 3, 8, 18, 0, 0, 0, time.UTC))

	result, err := publisher.Publish(context.Background(), AppPublishRequest{
		ProjectState:       runtime,
		ProjectID:          "project-alpha",
		DeploymentName:     "demo-app",
		ListenerEntrypoint: listenerRelativePath,
		ListenerEnabled:    true,
	})
	if err != nil {
		t.Fatalf("publish app deployment: %v", err)
	}

	if result.Manifest.Listener == nil {
		t.Fatal("expected listener config in app manifest")
	}
	if result.Manifest.Listener.Entrypoint != "listener/app.py" {
		t.Fatalf("expected listener entrypoint listener/app.py, got %q", result.Manifest.Listener.Entrypoint)
	}
	content, err := os.ReadFile(filepath.Join(result.Metadata.DeploymentRoot, "listener", "app.py"))
	if err != nil {
		t.Fatalf("read copied listener entrypoint: %v", err)
	}
	if string(content) != "print('listener')\n" {
		t.Fatalf("unexpected listener file content %q", string(content))
	}
}

func openTestAppPublisher(
	t *testing.T,
	settaFilesRoot string,
	workspaceRoot string,
	runtime *projectstate.Runtime,
	publishedAt time.Time,
) *AppPublisher {
	t.Helper()

	catalogRoot, err := DefaultCatalogRoot(settaFilesRoot)
	if err != nil {
		t.Fatalf("default catalog root: %v", err)
	}
	catalog, err := NewCatalog(CatalogOptions{Root: catalogRoot})
	if err != nil {
		t.Fatalf("new deployment catalog: %v", err)
	}
	publisher, err := NewAppPublisher(AppPublisherOptions{
		Catalog:              catalog,
		SettaFilesRoot:       settaFilesRoot,
		WorkspaceRoot:        workspaceRoot,
		AppDefinitionService: testAppDefinitionService{runtime: runtime},
		Now: func() time.Time {
			return publishedAt
		},
	})
	if err != nil {
		t.Fatalf("new app publisher: %v", err)
	}
	return publisher
}

type testAppDefinitionService struct {
	runtime *projectstate.Runtime
}

func (s testAppDefinitionService) GetAppDefinition(_ context.Context) (projectstate.AppDefinitionReadResult, error) {
	return projectstate.AppDefinitionReadResult{}, errors.New("not implemented")
}

func (s testAppDefinitionService) GetEffectiveAppDefinition(_ context.Context) (projectstate.AppDefinition, error) {
	return projectstate.AppDefinition{}, errors.New("not implemented")
}

func (s testAppDefinitionService) GetEffectiveAppSpecPath(_ context.Context) (string, error) {
	return "", errors.New("not implemented")
}

func (s testAppDefinitionService) GetEffectiveAppThemeMode(_ context.Context) (string, error) {
	return "", errors.New("not implemented")
}

func (s testAppDefinitionService) ValidateAppDefinition(
	_ context.Context,
	input projectstate.ValidateAppDefinitionInput,
) (projectstate.AppDefinitionValidationResult, error) {
	current := projectstate.AppDefinition{}
	if s.runtime != nil && s.runtime.Snapshot().Document.AppDefinition != nil {
		current = s.runtime.Snapshot().Document.AppDefinition.Clone()
	}
	if strings.TrimSpace(current.AppSpecVersion) == "" {
		current.AppSpecVersion = "v1"
	}
	if strings.TrimSpace(current.CatalogID) == "" {
		current.CatalogID = appspec.DefaultCatalogID
	}

	definition, err := testAppspecDefinition(current)
	if err != nil {
		return projectstate.AppDefinitionValidationResult{}, err
	}
	validationErrors, warnings := appspec.ValidateDefinitionPayload(input.AppSpec, definition)
	if validationErrors == nil {
		validationErrors = []appspec.AppValidationIssue{}
	}
	if warnings == nil {
		warnings = []appspec.AppValidationIssue{}
	}
	return projectstate.AppDefinitionValidationResult{
		Errors:       testProjectStateValidationIssues(validationErrors),
		Warnings:     testProjectStateValidationIssues(warnings),
		Capabilities: testProjectStateValidationCapabilities(appspec.BuildCapabilities(definition)),
	}, nil
}

func (s testAppDefinitionService) SetAppDefinition(_ context.Context, _ projectstate.SetAppDefinitionInput) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error) {
	return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, errors.New("not implemented")
}

func (s testAppDefinitionService) StreamAppDefinition(_ context.Context, _ projectstate.StreamAppDefinitionInput) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error) {
	return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, errors.New("not implemented")
}

func (s testAppDefinitionService) UpdateAppDefinition(_ context.Context, _ any) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error) {
	return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, errors.New("not implemented")
}

func (s testAppDefinitionService) CompareAndSetAppDefinitionCatalogID(_ context.Context, _ string, _ *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, errors.New("not implemented")
}

func (s testAppDefinitionService) CompareAndSetAppDefinitionSpecVersion(_ context.Context, _ string, _ *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, errors.New("not implemented")
}

func (s testAppDefinitionService) CompareAndSetAppDefinitionSpecPath(_ context.Context, _ string, _ *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, errors.New("not implemented")
}

func (s testAppDefinitionService) CompareAndSetAppDefinitionThemeMode(_ context.Context, _ string, _ *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, errors.New("not implemented")
}

func testProjectStateValidationIssues(
	issues []appspec.AppValidationIssue,
) []projectstate.AppDefinitionValidationIssue {
	if len(issues) == 0 {
		return []projectstate.AppDefinitionValidationIssue{}
	}
	converted := make([]projectstate.AppDefinitionValidationIssue, 0, len(issues))
	for _, issue := range issues {
		converted = append(converted, projectstate.AppDefinitionValidationIssue{
			Message:     issue.Message,
			ElementKey:  issue.ElementKey,
			ElementType: issue.ElementType,
		})
	}
	return converted
}

func testProjectStateValidationCapabilities(
	capabilities appspec.AppCapabilities,
) projectstate.AppDefinitionCapabilities {
	features := make(map[string]bool, len(capabilities.Features))
	for key, enabled := range capabilities.Features {
		features[key] = enabled
	}
	return projectstate.AppDefinitionCapabilities{
		CatalogID:          capabilities.CatalogID,
		CatalogVersion:     capabilities.CatalogVersion,
		AppSpecVersion:     capabilities.AppSpecVersion,
		ThemeSchemaVersion: capabilities.ThemeSchemaVersion,
		Features:           features,
	}
}

func testAppspecDefinition(definition projectstate.AppDefinition) (appspec.Definition, error) {
	dataBindings, err := testDecodeAppDefinitionJSONObject(definition.DataBindings, "appDefinition.dataBindings")
	if err != nil {
		return appspec.Definition{}, err
	}
	actions, err := testDecodeAppDefinitionJSONObject(definition.Actions, "appDefinition.actions")
	if err != nil {
		return appspec.Definition{}, err
	}
	theme, err := testDecodeAppDefinitionJSONObject(definition.Theme, "appDefinition.theme")
	if err != nil {
		return appspec.Definition{}, err
	}
	assets, err := testDecodeAppDefinitionJSONArray(definition.Assets, "appDefinition.assets")
	if err != nil {
		return appspec.Definition{}, err
	}
	return appspec.Definition{
		AppSpecVersion: definition.AppSpecVersion,
		CatalogID:      definition.CatalogID,
		ActionMap:      actions,
		DataBindings:   dataBindings,
		Theme:          theme,
		Assets:         assets,
	}, nil
}

func testDecodeAppDefinitionJSONObject(raw projectstate.RawJSON, field string) (map[string]any, error) {
	if len(strings.TrimSpace(string(raw))) == 0 {
		return nil, nil
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("decode %s: %w", field, err)
	}
	if value == nil {
		return nil, nil
	}
	object, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%s must be a JSON object", field)
	}
	return object, nil
}

func testDecodeAppDefinitionJSONArray(raw projectstate.RawJSON, field string) ([]any, error) {
	if len(strings.TrimSpace(string(raw))) == 0 {
		return nil, nil
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("decode %s: %w", field, err)
	}
	if value == nil {
		return nil, nil
	}
	array, ok := value.([]any)
	if !ok {
		return nil, fmt.Errorf("%s must be a JSON array", field)
	}
	return array, nil
}

func appPublishDocument(appDefinition *projectstate.AppDefinition) projectstate.Document {
	document := simpleProjectDocument(false)
	document.AppDefinition = appDefinition
	normalized, err := document.Normalized()
	if err != nil {
		panic(err)
	}
	return normalized
}

func writeAppSpecFile(t *testing.T, root string, path string, payload any) {
	t.Helper()

	if err := appspec.Write(root, path, payload); err != nil {
		t.Fatalf("write app spec %q: %v", path, err)
	}
}

func assertJSONValuesEqual(t *testing.T, got any, want any) {
	t.Helper()

	normalizedGot := normalizeJSONValue(t, got)
	normalizedWant := normalizeJSONValue(t, want)
	if !reflect.DeepEqual(normalizedGot, normalizedWant) {
		t.Fatalf("expected json value %#v, got %#v", normalizedWant, normalizedGot)
	}
}

func normalizeJSONValue(t *testing.T, value any) any {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("encode json value: %v", err)
	}
	var normalized any
	if err := json.Unmarshal(encoded, &normalized); err != nil {
		t.Fatalf("decode json value: %v", err)
	}
	return normalized
}
