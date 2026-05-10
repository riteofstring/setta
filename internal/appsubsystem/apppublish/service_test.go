package apppublish

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/deployments"
	"setta/internal/projectstate"
)

func TestNewServiceRequiresProviderPackager(t *testing.T) {
	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	catalogRoot, err := deployments.DefaultCatalogRoot(settaFilesRoot)
	if err != nil {
		t.Fatalf("default catalog root: %v", err)
	}
	catalog, err := deployments.NewCatalog(deployments.CatalogOptions{Root: catalogRoot})
	if err != nil {
		t.Fatalf("new deployment catalog: %v", err)
	}

	_, err = NewService(deployments.AppPublisherOptions{
		Catalog:        catalog,
		SettaFilesRoot: settaFilesRoot,
		WorkspaceRoot:  workspaceRoot,
	}, "setta-json-render-app-gen")
	if !errors.Is(err, deployments.ErrAppPublishProviderPackageRequired) {
		t.Fatalf("expected provider package requirement, got %v", err)
	}
}

func TestPublishSerializesAppDefinitionAndAppSpecWithProjectStateRevision(t *testing.T) {
	const pluginID = "setta-json-render-app-gen"

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	appSpecStore := appspec.MustForPlugin(pluginID)
	storage := appdefinition.MustStorageForPlugin(pluginID)
	initialDefinition := appdefinition.AppDefinition{
		AppSpecVersion: "v1",
		CatalogID:      appspec.DefaultCatalogID,
		AppSpecPath:    appSpecStore.DefaultPath(),
	}
	initialDocument := storage.WithStoredDocumentAppDefinition(
		appPublishTestDocument(),
		mustMarshalAppPublishTestDefinition(t, initialDefinition),
	)

	blockedSaveStarted := make(chan struct{}, 1)
	releaseBlockedSave := make(chan struct{})
	store, err := projectstate.NewStore(
		filepath.Join(settaFilesRoot, projectstate.MainFileName),
		projectstate.StoreOptions{},
	)
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(context.Background(), initialDocument); err != nil {
		t.Fatalf("save initial project state: %v", err)
	}
	runtime, err := projectstate.OpenRuntimeWithOptions(
		context.Background(),
		store,
		projectstate.RuntimeOptions{
			BeforeSave: func(_ context.Context, snapshot projectstate.Snapshot) error {
				if snapshot.Revision != 2 {
					return nil
				}
				select {
				case blockedSaveStarted <- struct{}{}:
				default:
				}
				<-releaseBlockedSave
				return nil
			},
		},
	)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	if err := appSpecStore.Write(settaFilesRoot, initialDefinition.AppSpecPath, appPublishSingleRunSpec("old-root")); err != nil {
		t.Fatalf("write initial app spec: %v", err)
	}

	catalogRoot, err := deployments.DefaultCatalogRoot(settaFilesRoot)
	if err != nil {
		t.Fatalf("default catalog root: %v", err)
	}
	catalog, err := deployments.NewCatalog(deployments.CatalogOptions{Root: catalogRoot})
	if err != nil {
		t.Fatalf("new deployment catalog: %v", err)
	}
	publisher, err := NewService(deployments.AppPublisherOptions{
		Catalog:        catalog,
		SettaFilesRoot: settaFilesRoot,
		WorkspaceRoot:  workspaceRoot,
		PackageProviderPlugin: func(targetRoot string) (deployments.AppProviderPackageState, error) {
			if err := os.MkdirAll(targetRoot, 0o755); err != nil {
				return deployments.AppProviderPackageState{}, err
			}
			return deployments.AppProviderPackageState{
				EnabledPluginIDs: []string{pluginID},
				PluginConfigByID: map[string]any{},
			}, nil
		},
	}, pluginID)
	if err != nil {
		t.Fatalf("new app publish service: %v", err)
	}

	nextVersion := "v2"
	nextActions := map[string]any{
		"run2": map[string]any{"type": "run"},
	}
	setResult := make(chan error, 1)
	go func() {
		_, _, err := appdefinition.NewAppDefinitionService(runtime, pluginID).SetAppDefinition(
			context.Background(),
			appdefinition.SetInput{
				AppSpec:        appPublishTwoRunSpec("new-root"),
				AppSpecVersion: &nextVersion,
				Actions:        &nextActions,
			},
		)
		setResult <- err
	}()
	<-blockedSaveStarted

	publishResult := make(chan appPublishTestResult, 1)
	go func() {
		result, err := publisher.Publish(context.Background(), deployments.AppPublishRequest{
			DeploymentName: "coherent-app",
			ProjectID:      "project-alpha",
			ProjectState:   runtime,
		})
		publishResult <- appPublishTestResult{result: result, err: err}
	}()

	select {
	case result := <-publishResult:
		t.Fatalf("publish completed while app-definition mutation was blocked: result=%#v err=%v", result.result, result.err)
	case <-time.After(100 * time.Millisecond):
	}

	close(releaseBlockedSave)
	if err := <-setResult; err != nil {
		t.Fatalf("set next app definition: %v", err)
	}
	result := <-publishResult
	if result.err != nil {
		t.Fatalf("publish app deployment: %v", result.err)
	}

	publishedDefinition := mustDecodeAppPublishTestDefinition(
		t,
		storage.StoredDocumentAppDefinitionRaw(result.result.Snapshot),
	)
	if publishedDefinition.AppSpecVersion != "v2" {
		t.Fatalf("expected published definition v2, got %#v", publishedDefinition)
	}
	if len(publishedDefinition.Actions) == 0 {
		t.Fatalf("expected published definition to include run2 action metadata, got %#v", publishedDefinition)
	}
	publishedAppSpec, err := appSpecStore.Read(result.result.Metadata.DeploymentRoot, publishedDefinition.AppSpecPath)
	if err != nil {
		t.Fatalf("read published app spec: %v", err)
	}
	if got := appPublishRootKey(publishedAppSpec); got != "new-root" {
		t.Fatalf("expected published app spec from new revision, got root key %q", got)
	}
}

type appPublishTestResult struct {
	result deployments.AppPublishResult
	err    error
}

func appPublishTestDocument() projectstate.Document {
	windowing := projectstate.DefaultProjectChatWindowingState()
	document := projectstate.NewDocument()
	document.DefaultProjectID = "project-alpha"
	document.Projects["project-alpha"] = projectstate.Project{
		ID:                   "project-alpha",
		Name:                 "Alpha",
		ProjectChatWindowing: &windowing,
	}
	return document
}

func appPublishSingleRunSpec(rootKey string) map[string]any {
	return map[string]any{
		"root": map[string]any{
			"key":  rootKey,
			"type": "ActionButton",
			"props": map[string]any{
				"label":  "Run",
				"action": "run",
			},
		},
		"elements": map[string]any{},
	}
}

func appPublishTwoRunSpec(rootKey string) map[string]any {
	return map[string]any{
		"root": map[string]any{
			"key":  rootKey,
			"type": "Stack",
			"children": []any{
				map[string]any{
					"key":  "run-1",
					"type": "ActionButton",
					"props": map[string]any{
						"label":  "Run",
						"action": "run",
					},
				},
				map[string]any{
					"key":  "run-2",
					"type": "ActionButton",
					"props": map[string]any{
						"label":  "Run again",
						"action": "run2",
					},
				},
			},
		},
		"elements": map[string]any{},
	}
}

func appPublishRootKey(appSpec any) string {
	payload, ok := appSpec.(map[string]any)
	if !ok {
		return ""
	}
	root, ok := payload["root"].(map[string]any)
	if !ok {
		return ""
	}
	key, _ := root["key"].(string)
	return key
}

func mustMarshalAppPublishTestDefinition(
	t *testing.T,
	definition appdefinition.AppDefinition,
) projectstate.RawJSON {
	t.Helper()

	encoded, err := json.Marshal(definition)
	if err != nil {
		t.Fatalf("marshal app definition: %v", err)
	}
	return projectstate.RawJSON(encoded)
}

func mustDecodeAppPublishTestDefinition(
	t *testing.T,
	raw projectstate.RawJSON,
) appdefinition.AppDefinition {
	t.Helper()

	var definition appdefinition.AppDefinition
	if err := json.Unmarshal(raw, &definition); err != nil {
		t.Fatalf("decode app definition: %v", err)
	}
	return definition
}
