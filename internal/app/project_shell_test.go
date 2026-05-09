package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/projectbackup"
	"setta/internal/projectshell"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
	"setta/internal/wsapi"

	"github.com/coder/websocket"
)

func TestAppSaveProjectRouteWritesJSONSourceFilesAndRecreatesMissingKeyPath(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = 61235
	prepareAppCurrentSession(t, cfg)

	paths, err := projectstate.ResolvePaths(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("resolve project-state paths: %v", err)
	}
	store, err := projectstate.NewStore(paths.Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new main project store: %v", err)
	}
	if err := store.Save(context.Background(), jsonSourceSaveAppTestDocument(t)); err != nil {
		t.Fatalf("seed main project store: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	saveRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSaveProject, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	if err != nil {
		t.Fatalf("new save request: %v", err)
	}
	saveRequest.Header.Set("Content-Type", "application/json")
	saveRequest.AddCookie(authCookie)

	saveResponse, err := http.DefaultClient.Do(saveRequest)
	if err != nil {
		t.Fatalf("save project: %v", err)
	}
	defer saveResponse.Body.Close()
	if saveResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(saveResponse.Body)
		t.Fatalf("expected save 200, got %d with body %q", saveResponse.StatusCode, string(body))
	}

	content, err := os.ReadFile(filepath.Join(cfg.Paths.WorkspaceRoot, "data", "source.json"))
	if err != nil {
		t.Fatalf("read saved json source file: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode saved json source file: %v", err)
	}
	if got := payload["config"].(map[string]any)["nested"].(map[string]any)["value"]; got != float64(1) {
		t.Fatalf("expected save route to recreate json source key path with value 1, got %#v", got)
	}
}

func TestAppSaveProjectRouteClearsPersistedJSONSourceValuesAfterWrite(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = 61237
	prepareAppCurrentSession(t, cfg)

	if err := os.MkdirAll(filepath.Join(cfg.Paths.WorkspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(cfg.Paths.WorkspaceRoot, "data", "source.json"), []byte("{\"alpha\":{\"fresh\":2}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	paths, err := projectstate.ResolvePaths(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("resolve project-state paths: %v", err)
	}
	store, err := projectstate.NewStore(paths.Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new main project store: %v", err)
	}
	if err := store.Save(context.Background(), jsonSourceStartupLoadAppTestDocument(t)); err != nil {
		t.Fatalf("seed main project store: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	saveRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSaveProject, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	if err != nil {
		t.Fatalf("new save request: %v", err)
	}
	saveRequest.Header.Set("Content-Type", "application/json")
	saveRequest.AddCookie(authCookie)

	saveResponse, err := http.DefaultClient.Do(saveRequest)
	if err != nil {
		t.Fatalf("save project: %v", err)
	}
	defer saveResponse.Body.Close()
	if saveResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(saveResponse.Body)
		t.Fatalf("expected save 200, got %d with body %q", saveResponse.StatusCode, string(body))
	}

	content, err := os.ReadFile(filepath.Join(cfg.Paths.WorkspaceRoot, "data", "source.json"))
	if err != nil {
		t.Fatalf("read saved json source file: %v", err)
	}
	var savedPayload map[string]any
	if err := json.Unmarshal(content, &savedPayload); err != nil {
		t.Fatalf("decode saved json source file: %v", err)
	}
	if got := savedPayload["alpha"].(map[string]any)["fresh"]; got != float64(2) {
		t.Fatalf("expected saved json source value 2, got %#v", got)
	}

	liveProject := app.ProjectStates().Main().Snapshot().Document.Projects["project-alpha"]
	liveTargetPayload, err := liveProject.EffectiveSectionPayload("json-section-a", "json-variant-a")
	if err != nil {
		t.Fatalf("effective live target payload after save: %v", err)
	}
	assertProjectShellJSONSourceLeafValue(
		t,
		liveProject,
		projectShellPayloadStringMap(liveTargetPayload, "codeObjVariantMap"),
		projectShellPayloadString(liveTargetPayload, "topLevelParamId"),
		"fresh",
		"2",
	)

	persistedDocument, err := store.LoadRaw(context.Background())
	if err != nil {
		t.Fatalf("load persisted project document: %v", err)
	}
	persistedProject := persistedDocument.Projects["project-alpha"]
	persistedTargetPayload, err := persistedProject.EffectiveSectionPayload("json-section-a", "json-variant-a")
	if err != nil {
		t.Fatalf("effective persisted target payload after save: %v", err)
	}
	assertProjectShellJSONSourceLeafValue(
		t,
		persistedProject,
		projectShellPayloadStringMap(persistedTargetPayload, "codeObjVariantMap"),
		projectShellPayloadString(persistedTargetPayload, "topLevelParamId"),
		"fresh",
		"",
	)
}

func TestAppSaveProjectRouteCreatesAutobackupBeforeProjectOverwrite(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = 61238
	prepareAppCurrentSession(t, cfg)

	paths, err := projectstate.ResolvePaths(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("resolve project-state paths: %v", err)
	}
	store, err := projectstate.NewStore(paths.Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new main project store: %v", err)
	}
	if err := store.Save(context.Background(), jsonSourceSaveAppTestDocument(t)); err != nil {
		t.Fatalf("seed main project store: %v", err)
	}
	originalContent, err := os.ReadFile(paths.Main)
	if err != nil {
		t.Fatalf("read seeded project document: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	saveRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSaveProject, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	if err != nil {
		t.Fatalf("new save request: %v", err)
	}
	saveRequest.Header.Set("Content-Type", "application/json")
	saveRequest.AddCookie(authCookie)

	saveResponse, err := http.DefaultClient.Do(saveRequest)
	if err != nil {
		t.Fatalf("save project: %v", err)
	}
	defer saveResponse.Body.Close()
	if saveResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(saveResponse.Body)
		t.Fatalf("expected save 200, got %d with body %q", saveResponse.StatusCode, string(body))
	}

	backups, err := projectbackup.ListFiles(projectbackup.BackupDir(cfg.Paths.SettaFilesRoot))
	if err != nil {
		t.Fatalf("list created backups: %v", err)
	}
	if len(backups) != 1 {
		t.Fatalf("expected one created autobackup, got %#v", backups)
	}
	backupContent, err := os.ReadFile(backups[0].Path)
	if err != nil {
		t.Fatalf("read created backup: %v", err)
	}
	if string(backupContent) != string(originalContent) {
		t.Fatalf("expected autobackup to snapshot pre-save project bytes")
	}

	currentContent, err := os.ReadFile(paths.Main)
	if err != nil {
		t.Fatalf("read current project document: %v", err)
	}
	if string(currentContent) == string(originalContent) {
		t.Fatal("expected save route to overwrite project document after creating autobackup")
	}
}

func TestAppStartupLoadsSharedJSONSourceSectionsFromDisk(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = 61236
	prepareAppCurrentSession(t, cfg)

	if err := os.MkdirAll(filepath.Join(cfg.Paths.WorkspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(cfg.Paths.WorkspaceRoot, "data", "source.json"), []byte("{\"alpha\":{\"fresh\":2}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	paths, err := projectstate.ResolvePaths(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("resolve project-state paths: %v", err)
	}
	store, err := projectstate.NewStore(paths.Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new main project store: %v", err)
	}
	if err := store.Save(context.Background(), jsonSourceStartupLoadAppTestDocument(t)); err != nil {
		t.Fatalf("seed main project store: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	project := app.ProjectStates().Main().Snapshot().Document.Projects["project-alpha"]
	targetPayload, err := project.EffectiveSectionPayload("json-section-a", "json-variant-a")
	if err != nil {
		t.Fatalf("effective target payload after app startup: %v", err)
	}
	peerPayload, err := project.EffectiveSectionPayload("json-section-b", "json-variant-b")
	if err != nil {
		t.Fatalf("effective peer payload after app startup: %v", err)
	}
	if projectShellPayloadBool(targetPayload, "jsonSourceMissing") {
		t.Fatal("expected target variant missing flag cleared")
	}
	if projectShellPayloadBool(peerPayload, "jsonSourceMissing") {
		t.Fatal("expected peer variant missing flag cleared")
	}
	assertProjectShellJSONSourceFreshValue(t, project, projectShellPayloadStringMap(targetPayload, "codeObjVariantMap"), projectShellPayloadString(targetPayload, "topLevelParamId"))
	assertProjectShellJSONSourceFreshValue(t, project, projectShellPayloadStringMap(peerPayload, "codeObjVariantMap"), projectShellPayloadString(peerPayload, "topLevelParamId"))
}

func TestAppJSONSourceWatcherReloadsRelativeVariantPathsAndBroadcastsProjectState(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = 61238
	prepareAppCurrentSession(t, cfg)

	if err := os.MkdirAll(filepath.Join(cfg.Paths.WorkspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(cfg.Paths.WorkspaceRoot, "data", "source.json"), []byte("{\"alpha\":{\"fresh\":2}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	paths, err := projectstate.ResolvePaths(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("resolve project-state paths: %v", err)
	}
	store, err := projectstate.NewStore(paths.Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new main project store: %v", err)
	}
	if err := store.Save(context.Background(), jsonSourceStartupLoadAppTestDocument(t)); err != nil {
		t.Fatalf("seed main project store: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	if err := os.WriteFile(filepath.Join(cfg.Paths.WorkspaceRoot, "data", "source.json"), []byte("{\"alpha\":{\"fresh\":3}}\n"), 0o644); err != nil {
		t.Fatalf("rewrite json source payload: %v", err)
	}

	updateEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 20)
	var updatePayload realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(updateEnvelope.Content, &updatePayload); err != nil {
		t.Fatalf("decode project update payload: %v", err)
	}
	if updatePayload.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha websocket update, got %#v", updatePayload.ProjectState.ProjectConfig.ID)
	}

	project := app.ProjectStates().Main().Snapshot().Document.Projects["project-alpha"]
	targetPayload, err := project.EffectiveSectionPayload("json-section-a", "json-variant-a")
	if err != nil {
		t.Fatalf("effective target payload after watcher reload: %v", err)
	}
	peerPayload, err := project.EffectiveSectionPayload("json-section-b", "json-variant-b")
	if err != nil {
		t.Fatalf("effective peer payload after watcher reload: %v", err)
	}
	assertProjectShellJSONSourceLeafValue(
		t,
		project,
		projectShellPayloadStringMap(targetPayload, "codeObjVariantMap"),
		projectShellPayloadString(targetPayload, "topLevelParamId"),
		"fresh",
		"3",
	)
	assertProjectShellJSONSourceLeafValue(
		t,
		project,
		projectShellPayloadStringMap(peerPayload, "codeObjVariantMap"),
		projectShellPayloadString(peerPayload, "topLevelParamId"),
		"fresh",
		"3",
	)
}

func TestAppServesProjectShellReadRoutes(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-beta"
		document.Projects["project-beta"] = projectstate.Project{
			ID:   "project-beta",
			Name: "Beta",
		}
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	metadataRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLoadAllProjectMetadata, strings.NewReader("null"))
	if err != nil {
		t.Fatalf("new metadata request: %v", err)
	}
	metadataRequest.Header.Set("Content-Type", "application/json")
	metadataRequest.AddCookie(authCookie)

	metadataResponse, err := http.DefaultClient.Do(metadataRequest)
	if err != nil {
		t.Fatalf("load all project metadata: %v", err)
	}
	defer metadataResponse.Body.Close()
	if metadataResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(metadataResponse.Body)
		t.Fatalf("expected metadata 200, got %d with body %q", metadataResponse.StatusCode, string(body))
	}

	var metadataPayload projectshell.AllProjectMetadata
	if err := json.NewDecoder(metadataResponse.Body).Decode(&metadataPayload); err != nil {
		t.Fatalf("decode metadata payload: %v", err)
	}
	if metadataPayload.DefaultProjectConfigID == nil || *metadataPayload.DefaultProjectConfigID != "project-beta" {
		t.Fatalf("expected default project-beta, got %#v", metadataPayload.DefaultProjectConfigID)
	}
	if len(metadataPayload.ProjectMetadata) != 2 {
		t.Fatalf("expected two metadata entries, got %#v", metadataPayload.ProjectMetadata)
	}
	if metadataPayload.ProjectMetadata[0].ID != "project-alpha" || metadataPayload.ProjectMetadata[1].ID != "project-beta" {
		t.Fatalf("unexpected metadata ordering %#v", metadataPayload.ProjectMetadata)
	}

	projectRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"Alpha"}`))
	if err != nil {
		t.Fatalf("new project request: %v", err)
	}
	projectRequest.Header.Set("Content-Type", "application/json")
	projectRequest.AddCookie(authCookie)

	projectResponse, err := http.DefaultClient.Do(projectRequest)
	if err != nil {
		t.Fatalf("load project config: %v", err)
	}
	defer projectResponse.Body.Close()
	if projectResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(projectResponse.Body)
		t.Fatalf("expected project config 200, got %d with body %q", projectResponse.StatusCode, string(body))
	}

	var projectPayload projectview.SingleConfig
	if err := json.NewDecoder(projectResponse.Body).Decode(&projectPayload); err != nil {
		t.Fatalf("decode project payload: %v", err)
	}
	if projectPayload.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha, got %q", projectPayload.ProjectConfig.ID)
	}
	if projectPayload.ProjectConfig.Name != "Alpha" {
		t.Fatalf("expected Alpha, got %q", projectPayload.ProjectConfig.Name)
	}
}

func jsonSourceSaveAppTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	project, err := projectstate.Project{
		ID:                      "project-alpha",
		Name:                    "Project Alpha",
		AllowJSONSourceKeyEdits: true,
		ProjectChatWindowing:    &projectstate.ProjectChatWindowingState{InstancesByID: map[string]projectstate.ProjectChatWindowInstance{}, Order: []string{}},
		SectionVariantMap: map[string]string{
			"json-section": "json-variant",
		},
		Sections: map[string]projectstate.Section{
			"json-section": {
				ID:               "json-section",
				Name:             "JSON Section",
				VariantIDs:       []string{"json-variant"},
				DefaultVariantID: "json-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"json-variant": {
				ID:     "json-variant",
				Name:   "data/source.json",
				ImplID: "json-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"json-impl": {
				ID:   "json-impl",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustRawJSONValue(t, map[string]any{
					"id":              "json-impl",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{"config", "nested"},
					"topLevelParamId": "root",
					"codeObjVariantMap": map[string]any{
						"root":       "root-variant",
						"value-leaf": "value-leaf-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"root": {
				ID:               "root",
				Name:             "root",
				VariantIDs:       []string{"root-variant"},
				DefaultVariantID: "root-variant",
			},
			"value-leaf": {
				ID:               "value-leaf",
				Name:             "value",
				VariantIDs:       []string{"value-leaf-variant"},
				DefaultVariantID: "value-leaf-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"root-variant": {
				ID:               "root-variant",
				ImplID:           "root-impl",
				NonPresetImplIDs: []string{"root-impl"},
			},
			"value-leaf-variant": {
				ID:               "value-leaf-variant",
				ImplID:           "value-leaf-impl",
				NonPresetImplIDs: []string{"value-leaf-impl"},
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"root-impl": {
				ID:   "root-impl",
				Type: "NestedParam",
				Payload: mustRawJSONValue(t, map[string]any{
					"id":       "root-impl",
					"type":     "NestedParam",
					"children": []string{"value-leaf"},
				}),
			},
			"value-leaf-impl": {
				ID:   "value-leaf-impl",
				Type: "CodeParam",
				Payload: mustRawJSONValue(t, map[string]any{
					"id":    "value-leaf-impl",
					"type":  "CodeParam",
					"value": "1",
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize json source save app project: %v", err)
	}

	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
		},
	}
}

func jsonSourceStartupLoadAppTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	project, err := projectstate.Project{
		ID:                      "project-alpha",
		Name:                    "Project Alpha",
		AllowJSONSourceKeyEdits: true,
		ProjectChatWindowing:    &projectstate.ProjectChatWindowingState{InstancesByID: map[string]projectstate.ProjectChatWindowInstance{}, Order: []string{}},
		SectionVariantMap: map[string]string{
			"json-section-a": "json-variant-a",
			"json-section-b": "json-variant-b",
		},
		Sections: map[string]projectstate.Section{
			"json-section-a": {
				ID:               "json-section-a",
				Name:             "JSON Source A",
				VariantIDs:       []string{"json-variant-a"},
				DefaultVariantID: "json-variant-a",
			},
			"json-section-b": {
				ID:               "json-section-b",
				Name:             "JSON Source B",
				VariantIDs:       []string{"json-variant-b"},
				DefaultVariantID: "json-variant-b",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"json-variant-a": {
				ID:     "json-variant-a",
				Name:   "data/source.json",
				ImplID: "json-impl-a",
			},
			"json-variant-b": {
				ID:     "json-variant-b",
				Name:   "data/source.json",
				ImplID: "json-impl-b",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"json-impl-a": {
				ID:   "json-impl-a",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustRawJSONValue(t, map[string]any{
					"id":              "json-impl-a",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{"alpha"},
					"topLevelParamId": "old-root-a",
					"codeObjVariantMap": map[string]any{
						"old-root-a": "old-root-variant-a",
						"old-leaf-a": "old-leaf-variant-a",
					},
				}),
			},
			"json-impl-b": {
				ID:   "json-impl-b",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustRawJSONValue(t, map[string]any{
					"id":              "json-impl-b",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{"alpha"},
					"topLevelParamId": "old-root-b",
					"codeObjVariantMap": map[string]any{
						"old-root-b": "old-root-variant-b",
						"old-leaf-b": "old-leaf-variant-b",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"old-root-a": {
				ID:               "old-root-a",
				Name:             "alpha",
				VariantIDs:       []string{"old-root-variant-a"},
				DefaultVariantID: "old-root-variant-a",
			},
			"old-leaf-a": {
				ID:               "old-leaf-a",
				Name:             "target-leaf",
				VariantIDs:       []string{"old-leaf-variant-a"},
				DefaultVariantID: "old-leaf-variant-a",
			},
			"old-root-b": {
				ID:               "old-root-b",
				Name:             "alpha",
				VariantIDs:       []string{"old-root-variant-b"},
				DefaultVariantID: "old-root-variant-b",
			},
			"old-leaf-b": {
				ID:               "old-leaf-b",
				Name:             "peer-leaf",
				VariantIDs:       []string{"old-leaf-variant-b"},
				DefaultVariantID: "old-leaf-variant-b",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"old-root-variant-a": {
				ID:               "old-root-variant-a",
				ImplID:           "old-root-impl-a",
				NonPresetImplIDs: []string{"old-root-impl-a"},
			},
			"old-leaf-variant-a": {
				ID:               "old-leaf-variant-a",
				ImplID:           "old-leaf-impl-a",
				NonPresetImplIDs: []string{"old-leaf-impl-a"},
			},
			"old-root-variant-b": {
				ID:               "old-root-variant-b",
				ImplID:           "old-root-impl-b",
				NonPresetImplIDs: []string{"old-root-impl-b"},
			},
			"old-leaf-variant-b": {
				ID:               "old-leaf-variant-b",
				ImplID:           "old-leaf-impl-b",
				NonPresetImplIDs: []string{"old-leaf-impl-b"},
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"old-root-impl-a": {
				ID:   "old-root-impl-a",
				Type: "NestedParam",
				Payload: mustRawJSONValue(t, map[string]any{
					"id":       "old-root-impl-a",
					"type":     "NestedParam",
					"children": []string{"old-leaf-a"},
				}),
			},
			"old-leaf-impl-a": {
				ID:   "old-leaf-impl-a",
				Type: "CodeParam",
				Payload: mustRawJSONValue(t, map[string]any{
					"id":    "old-leaf-impl-a",
					"type":  "CodeParam",
					"value": "1",
				}),
			},
			"old-root-impl-b": {
				ID:   "old-root-impl-b",
				Type: "NestedParam",
				Payload: mustRawJSONValue(t, map[string]any{
					"id":       "old-root-impl-b",
					"type":     "NestedParam",
					"children": []string{"old-leaf-b"},
				}),
			},
			"old-leaf-impl-b": {
				ID:   "old-leaf-impl-b",
				Type: "CodeParam",
				Payload: mustRawJSONValue(t, map[string]any{
					"id":    "old-leaf-impl-b",
					"type":  "CodeParam",
					"value": "2",
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize json source startup-load app project: %v", err)
	}

	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
		},
	}
}

func assertProjectShellJSONSourceFreshValue(t *testing.T, project projectstate.Project, codeObjVariantMap map[string]string, topLevelParamID string) {
	t.Helper()

	assertProjectShellJSONSourceLeafValue(t, project, codeObjVariantMap, topLevelParamID, "fresh", "2")
}

func assertProjectShellJSONSourceLeafValue(t *testing.T, project projectstate.Project, codeObjVariantMap map[string]string, topLevelParamID string, expectedName string, expectedValue string) {
	t.Helper()

	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, topLevelParamID)
	if err != nil {
		t.Fatalf("effective root payload after app startup load: %v", err)
	}
	childIDs := projectShellPayloadStringArray(rootPayload, "children")
	if len(childIDs) != 1 {
		t.Fatalf("expected one refreshed child, got %#v", childIDs)
	}
	childPayload, childCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[0])
	if err != nil {
		t.Fatalf("effective child payload after app startup load: %v", err)
	}
	if childCodeObj.Name != expectedName {
		t.Fatalf("expected child name %s, got %q", expectedName, childCodeObj.Name)
	}
	if got := projectShellPayloadString(childPayload, "value"); got != expectedValue {
		t.Fatalf("expected child value %s, got %q", expectedValue, got)
	}
}

func projectShellPayloadString(payload map[string]any, key string) string {
	value, _ := payload[key].(string)
	return value
}

func projectShellPayloadStringArray(payload map[string]any, key string) []string {
	rawEntries, _ := payload[key].([]any)
	output := make([]string, 0, len(rawEntries))
	for _, rawEntry := range rawEntries {
		entry, ok := rawEntry.(string)
		if !ok || strings.TrimSpace(entry) == "" {
			continue
		}
		output = append(output, entry)
	}
	return output
}

func projectShellPayloadStringMap(payload map[string]any, key string) map[string]string {
	rawEntries, _ := payload[key].(map[string]any)
	output := make(map[string]string, len(rawEntries))
	for entryKey, rawValue := range rawEntries {
		value, ok := rawValue.(string)
		if !ok || strings.TrimSpace(value) == "" {
			continue
		}
		output[entryKey] = value
	}
	return output
}

func projectShellPayloadBool(payload map[string]any, key string) bool {
	value, _ := payload[key].(bool)
	return value
}

func TestAppLoadProjectConfigServesDedicatedSettingsProjectRuntime(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	loadSettingsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"settings"}`))
	if err != nil {
		t.Fatalf("new settings load request: %v", err)
	}
	loadSettingsRequest.Header.Set("Content-Type", "application/json")
	loadSettingsRequest.AddCookie(authCookie)

	loadSettingsResponse, err := http.DefaultClient.Do(loadSettingsRequest)
	if err != nil {
		t.Fatalf("load settings project config: %v", err)
	}
	defer loadSettingsResponse.Body.Close()
	if loadSettingsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(loadSettingsResponse.Body)
		t.Fatalf("expected settings project config 200, got %d with body %q", loadSettingsResponse.StatusCode, string(body))
	}

	var loadSettingsPayload projectview.SingleConfig
	if err := json.NewDecoder(loadSettingsResponse.Body).Decode(&loadSettingsPayload); err != nil {
		t.Fatalf("decode settings project payload: %v", err)
	}
	if loadSettingsPayload.ProjectConfig.ID != settingsstate.SettingsProjectID {
		t.Fatalf("expected settings project id %q, got %q", settingsstate.SettingsProjectID, loadSettingsPayload.ProjectConfig.ID)
	}
	if loadSettingsPayload.ProjectConfig.Name != settingsstate.SettingsProjectName {
		t.Fatalf("expected settings project name %q, got %q", settingsstate.SettingsProjectName, loadSettingsPayload.ProjectConfig.Name)
	}
	if len(loadSettingsPayload.Sections) != 46 {
		t.Fatalf("expected 46 settings sections, got %d", len(loadSettingsPayload.Sections))
	}
	if len(loadSettingsPayload.ProjectConfig.ViewModes) != 5 {
		t.Fatalf("expected 5 settings view modes, got %d", len(loadSettingsPayload.ProjectConfig.ViewModes))
	}
	if loadSettingsPayload.ProjectConfig.ActiveViewModeID == nil || *loadSettingsPayload.ProjectConfig.ActiveViewModeID == "" {
		t.Fatal("expected settings project active view mode id")
	}
	assertSettingsProjectViewModeRouteContract(t, loadSettingsPayload)
	assertSettingsProjectRouteBootstrapMetadataContract(
		t,
		loadSettingsPayload,
		filepath.Join(cfg.Paths.SettaFilesRoot, settingsstate.DefaultFileName),
	)

	latestStateRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"settings"}`))
	if err != nil {
		t.Fatalf("new settings latest-state request: %v", err)
	}
	latestStateRequest.Header.Set("Content-Type", "application/json")
	latestStateRequest.AddCookie(authCookie)

	latestStateResponse, err := http.DefaultClient.Do(latestStateRequest)
	if err != nil {
		t.Fatalf("get settings latest project state: %v", err)
	}
	defer latestStateResponse.Body.Close()
	if latestStateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(latestStateResponse.Body)
		t.Fatalf("expected settings latest state 200, got %d with body %q", latestStateResponse.StatusCode, string(body))
	}

	var latestStatePayload httpapi.ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.NewDecoder(latestStateResponse.Body).Decode(&latestStatePayload); err != nil {
		t.Fatalf("decode settings latest project state payload: %v", err)
	}
	if latestStatePayload.ProjectState.ProjectConfig.ID != settingsstate.SettingsProjectID {
		t.Fatalf("expected latest-state settings project id %q, got %q", settingsstate.SettingsProjectID, latestStatePayload.ProjectState.ProjectConfig.ID)
	}
	if latestStatePayload.ProjectState.ProjectConfig.Name != settingsstate.SettingsProjectName {
		t.Fatalf("expected latest-state settings project name %q, got %q", settingsstate.SettingsProjectName, latestStatePayload.ProjectState.ProjectConfig.Name)
	}
	assertSettingsProjectViewModeRouteContract(t, latestStatePayload.ProjectState)
	assertSettingsProjectRouteBootstrapMetadataContract(
		t,
		latestStatePayload.ProjectState,
		filepath.Join(cfg.Paths.SettaFilesRoot, settingsstate.DefaultFileName),
	)
}

func TestAppSettingsProjectLoadRoutesRehydrateFromLiveSettingsSnapshot(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	settingsDocument := app.SettingsState().Snapshot().Document
	settingsDocument["backend"].(map[string]any)["renameRefactorMode"] = "NEVER_RENAME"
	saveSettingsBody, err := json.Marshal(httpapi.SaveSettingsRequest{Settings: settingsDocument})
	if err != nil {
		t.Fatalf("marshal save settings request: %v", err)
	}

	saveSettingsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSaveSettings, strings.NewReader(string(saveSettingsBody)))
	if err != nil {
		t.Fatalf("new save settings request: %v", err)
	}
	saveSettingsRequest.Header.Set("Content-Type", "application/json")
	saveSettingsRequest.AddCookie(authCookie)

	saveSettingsResponse, err := http.DefaultClient.Do(saveSettingsRequest)
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}
	defer saveSettingsResponse.Body.Close()
	if saveSettingsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(saveSettingsResponse.Body)
		t.Fatalf("expected save settings 200, got %d with body %q", saveSettingsResponse.StatusCode, string(body))
	}

	loadSettingsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"settings"}`))
	if err != nil {
		t.Fatalf("new settings load request: %v", err)
	}
	loadSettingsRequest.Header.Set("Content-Type", "application/json")
	loadSettingsRequest.AddCookie(authCookie)

	loadSettingsResponse, err := http.DefaultClient.Do(loadSettingsRequest)
	if err != nil {
		t.Fatalf("load settings project config after settings save: %v", err)
	}
	defer loadSettingsResponse.Body.Close()
	if loadSettingsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(loadSettingsResponse.Body)
		t.Fatalf("expected settings project config 200, got %d with body %q", loadSettingsResponse.StatusCode, string(body))
	}

	var loadSettingsPayload projectview.SingleConfig
	if err := json.NewDecoder(loadSettingsResponse.Body).Decode(&loadSettingsPayload); err != nil {
		t.Fatalf("decode settings load payload: %v", err)
	}
	if got := settingsProjectViewCodeObjValue(t, loadSettingsPayload, "settings-codeobj-impl__backend__backend__renameRefactorMode"); got != "NEVER_RENAME" {
		t.Fatalf("expected load renameRefactorMode NEVER_RENAME, got %q", got)
	}
	if got := settingsProjectViewCodeObjChoices(t, loadSettingsPayload, "settings-codeobj-impl__backend__backend__renameRefactorMode"); !reflect.DeepEqual(got, []string{"ALWAYS_ASK", "ALWAYS_RENAME", "NEVER_RENAME"}) {
		t.Fatalf("expected load renameRefactorMode choices %#v, got %#v", []string{"ALWAYS_ASK", "ALWAYS_RENAME", "NEVER_RENAME"}, got)
	}

	latestStateRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"settings"}`))
	if err != nil {
		t.Fatalf("new latest-state request: %v", err)
	}
	latestStateRequest.Header.Set("Content-Type", "application/json")
	latestStateRequest.AddCookie(authCookie)

	latestStateResponse, err := http.DefaultClient.Do(latestStateRequest)
	if err != nil {
		t.Fatalf("get latest project state after settings save: %v", err)
	}
	defer latestStateResponse.Body.Close()
	if latestStateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(latestStateResponse.Body)
		t.Fatalf("expected latest project state 200, got %d with body %q", latestStateResponse.StatusCode, string(body))
	}

	var latestStatePayload httpapi.ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.NewDecoder(latestStateResponse.Body).Decode(&latestStatePayload); err != nil {
		t.Fatalf("decode latest-state payload: %v", err)
	}
	if got := settingsProjectViewCodeObjValue(t, latestStatePayload.ProjectState, "settings-codeobj-impl__backend__backend__renameRefactorMode"); got != "NEVER_RENAME" {
		t.Fatalf("expected latest-state renameRefactorMode NEVER_RENAME, got %q", got)
	}
	if got := settingsProjectViewCodeObjChoices(t, latestStatePayload.ProjectState, "settings-codeobj-impl__backend__backend__renameRefactorMode"); !reflect.DeepEqual(got, []string{"ALWAYS_ASK", "ALWAYS_RENAME", "NEVER_RENAME"}) {
		t.Fatalf("expected latest-state renameRefactorMode choices %#v, got %#v", []string{"ALWAYS_ASK", "ALWAYS_RENAME", "NEVER_RENAME"}, got)
	}
}

func TestAppSettingsProjectLoadRoutesPreserveExistingDisplayNamesAndBackfillNewCodeObjs(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	if err := app.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown app: %v", err)
	}

	settingsStore, err := projectstate.NewStore(filepath.Join(cfg.Paths.SettaFilesRoot, projectstate.SettingsFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted settings project store: %v", err)
	}
	settingsDocument, err := settingsStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted settings project document: %v", err)
	}
	settingsProject := settingsDocument.Projects[settingsstate.SettingsProjectID]

	guiCodeObj := settingsProjectPersistedCodeObjByName(t, settingsProject.CodeObjs, "gui")
	guiCodeObj.DisplayName = "Custom GUI Label"
	settingsProject.CodeObjs[guiCodeObj.ID] = guiCodeObj

	languageServerCodeObj := settingsProjectPersistedCodeObjByName(t, settingsProject.CodeObjs, "languageServer")
	languageServerCodeObj.DisplayName = ""
	settingsProject.CodeObjs[languageServerCodeObj.ID] = languageServerCodeObj
	if err := removeSettingsProjectSectionAutoHeight(&settingsProject, "gui"); err != nil {
		t.Fatalf("remove settings gui auto height: %v", err)
	}

	if err := removeSettingsProjectCodeObjectByID(
		&settingsProject,
		"settings-section-impl__backend",
		"settings-codeobj__backend__backend__renameRefactorMode",
		"settings-codeobj-variant__backend__backend__renameRefactorMode",
		"settings-codeobj-impl__backend__backend__renameRefactorMode",
		"settings-codeobj-impl__backend__backend",
	); err != nil {
		t.Fatalf("remove settings renameRefactorMode code object: %v", err)
	}
	settingsDocument.Projects[settingsstate.SettingsProjectID] = settingsProject
	if err := settingsStore.Save(context.Background(), settingsDocument); err != nil {
		t.Fatalf("save corrupted settings project document: %v", err)
	}

	restartedApp, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("restart app: %v", err)
	}
	t.Cleanup(func() {
		if err := restartedApp.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown restarted app: %v", err)
		}
	})

	server := httptest.NewServer(restartedApp.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, restartedApp)

	loadSettingsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"settings"}`))
	if err != nil {
		t.Fatalf("new settings load request: %v", err)
	}
	loadSettingsRequest.Header.Set("Content-Type", "application/json")
	loadSettingsRequest.AddCookie(authCookie)

	loadSettingsResponse, err := http.DefaultClient.Do(loadSettingsRequest)
	if err != nil {
		t.Fatalf("load settings project config after restart: %v", err)
	}
	defer loadSettingsResponse.Body.Close()
	if loadSettingsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(loadSettingsResponse.Body)
		t.Fatalf("expected settings project config 200, got %d with body %q", loadSettingsResponse.StatusCode, string(body))
	}

	var loadSettingsPayload projectview.SingleConfig
	if err := json.NewDecoder(loadSettingsResponse.Body).Decode(&loadSettingsPayload); err != nil {
		t.Fatalf("decode settings load payload: %v", err)
	}
	assertSettingsProjectRouteCodeObjDisplayNames(
		t,
		loadSettingsPayload,
		map[string]string{
			"gui":                "Custom GUI Label",
			"languageServer":     "",
			"renameRefactorMode": "Rename Refactor Mode",
		},
	)
	assertSettingsProjectRouteSectionAutoHeight(t, loadSettingsPayload, "gui")

	latestStateRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"settings"}`))
	if err != nil {
		t.Fatalf("new latest-state request: %v", err)
	}
	latestStateRequest.Header.Set("Content-Type", "application/json")
	latestStateRequest.AddCookie(authCookie)

	latestStateResponse, err := http.DefaultClient.Do(latestStateRequest)
	if err != nil {
		t.Fatalf("get latest project state after restart: %v", err)
	}
	defer latestStateResponse.Body.Close()
	if latestStateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(latestStateResponse.Body)
		t.Fatalf("expected latest project state 200, got %d with body %q", latestStateResponse.StatusCode, string(body))
	}

	var latestStatePayload httpapi.ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.NewDecoder(latestStateResponse.Body).Decode(&latestStatePayload); err != nil {
		t.Fatalf("decode latest-state payload: %v", err)
	}
	assertSettingsProjectRouteCodeObjDisplayNames(
		t,
		latestStatePayload.ProjectState,
		map[string]string{
			"gui":                "Custom GUI Label",
			"languageServer":     "",
			"renameRefactorMode": "Rename Refactor Mode",
		},
	)
	assertSettingsProjectRouteSectionAutoHeight(t, latestStatePayload.ProjectState, "gui")

	repairedStore, err := projectstate.NewStore(restartedApp.ProjectStates().Paths().Settings, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open repaired settings project store: %v", err)
	}
	repairedDocument, err := repairedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load repaired settings project document: %v", err)
	}
	repairedProject, err := repairedDocument.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("repaired settings project by id: %v", err)
	}
	assertSettingsProjectPersistedCodeObjDisplayNames(
		t,
		repairedProject,
		map[string]string{
			"gui":                "Custom GUI Label",
			"languageServer":     "",
			"renameRefactorMode": "Rename Refactor Mode",
		},
	)
	assertSettingsProjectPersistedSectionAutoHeight(t, repairedProject, "gui")
}

func TestAppSettingsProjectStartupRejectsMissingVisibleSectionLayoutInPersistedDocument(
	t *testing.T,
) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	if err := app.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown app: %v", err)
	}

	settingsStore, err := projectstate.NewStore(filepath.Join(cfg.Paths.SettaFilesRoot, projectstate.SettingsFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted settings project store: %v", err)
	}
	settingsDocument, err := settingsStore.LoadRaw(context.Background())
	if err != nil {
		t.Fatalf("load persisted settings project document: %v", err)
	}
	settingsProject := settingsDocument.Projects[settingsstate.SettingsProjectID]
	paramDefaultsViewMode := settingsProject.ViewModes["settings-param-defaults"]
	delete(paramDefaultsViewMode.TopLevelSections, "settings-section__buttonParamCodeObjDefault")
	settingsProject.ViewModes["settings-param-defaults"] = paramDefaultsViewMode
	settingsDocument.Projects[settingsstate.SettingsProjectID] = settingsProject
	writeRawProjectStateDocument(t, settingsStore.Path(), settingsDocument)

	_, err = New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if !errors.Is(err, projectstate.ErrPersistedProjectViewModesRequireRepair) {
		t.Fatalf("expected invalid persisted settings project to fail closed, got %v", err)
	}
}

func TestAppSettingsProjectSaveProjectRoutePreservesReservedSettingsName(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	authCookie := newAppTestAuthCookie(t, app)

	loadSettingsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"settings"}`))
	if err != nil {
		t.Fatalf("new settings load request: %v", err)
	}
	loadSettingsRequest.Header.Set("Content-Type", "application/json")
	loadSettingsRequest.AddCookie(authCookie)

	loadSettingsResponse, err := http.DefaultClient.Do(loadSettingsRequest)
	if err != nil {
		t.Fatalf("load settings project config: %v", err)
	}
	defer loadSettingsResponse.Body.Close()
	if loadSettingsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(loadSettingsResponse.Body)
		t.Fatalf("expected settings project config 200, got %d with body %q", loadSettingsResponse.StatusCode, string(body))
	}

	var loadSettingsPayload projectview.SingleConfig
	if err := json.NewDecoder(loadSettingsResponse.Body).Decode(&loadSettingsPayload); err != nil {
		t.Fatalf("decode settings load payload: %v", err)
	}
	if loadSettingsPayload.ProjectConfig.Name != settingsstate.SettingsProjectName {
		t.Fatalf("expected settings project name %q, got %q", settingsstate.SettingsProjectName, loadSettingsPayload.ProjectConfig.Name)
	}
	if loadSettingsPayload.ProjectConfig.ActiveViewModeID == nil {
		t.Fatal("expected initial settings active view mode id")
	}
	initialActiveViewModeID := *loadSettingsPayload.ProjectConfig.ActiveViewModeID

	saveProjectRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSaveProject,
		strings.NewReader(`{"projectConfigId":"settings"}`),
	)
	if err != nil {
		t.Fatalf("new save project request: %v", err)
	}
	saveProjectRequest.Header.Set("Content-Type", "application/json")
	saveProjectRequest.AddCookie(authCookie)

	saveProjectResponse, err := http.DefaultClient.Do(saveProjectRequest)
	if err != nil {
		t.Fatalf("save settings project: %v", err)
	}
	defer saveProjectResponse.Body.Close()
	if saveProjectResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(saveProjectResponse.Body)
		t.Fatalf("expected save project 200, got %d with body %q", saveProjectResponse.StatusCode, string(body))
	}

	server.Close()
	if err := app.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown app after settings project save: %v", err)
	}

	restartedApp, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new restarted app: %v", err)
	}
	t.Cleanup(func() {
		if err := restartedApp.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown restarted app: %v", err)
		}
	})

	restartedServer := httptest.NewServer(restartedApp.Handler())
	defer restartedServer.Close()

	restartedAuthCookie := newAppTestAuthCookie(t, restartedApp)

	restartedLoadRequest, err := http.NewRequest(http.MethodPost, restartedServer.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"settings"}`))
	if err != nil {
		t.Fatalf("new restarted settings load request: %v", err)
	}
	restartedLoadRequest.Header.Set("Content-Type", "application/json")
	restartedLoadRequest.AddCookie(restartedAuthCookie)

	restartedLoadResponse, err := http.DefaultClient.Do(restartedLoadRequest)
	if err != nil {
		t.Fatalf("load restarted settings project config: %v", err)
	}
	defer restartedLoadResponse.Body.Close()
	if restartedLoadResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartedLoadResponse.Body)
		t.Fatalf("expected restarted settings project config 200, got %d with body %q", restartedLoadResponse.StatusCode, string(body))
	}

	var restartedLoadPayload projectview.SingleConfig
	if err := json.NewDecoder(restartedLoadResponse.Body).Decode(&restartedLoadPayload); err != nil {
		t.Fatalf("decode restarted settings project payload: %v", err)
	}
	if restartedLoadPayload.ProjectConfig.Name != settingsstate.SettingsProjectName {
		t.Fatalf("expected restarted settings project name %q, got %q", settingsstate.SettingsProjectName, restartedLoadPayload.ProjectConfig.Name)
	}
	if restartedLoadPayload.ProjectConfig.ActiveViewModeID == nil || *restartedLoadPayload.ProjectConfig.ActiveViewModeID != initialActiveViewModeID {
		t.Fatalf("expected restarted active view mode %q, got %#v", initialActiveViewModeID, restartedLoadPayload.ProjectConfig.ActiveViewModeID)
	}

	restartedLatestRequest, err := http.NewRequest(http.MethodPost, restartedServer.URL+"/api"+httpapi.RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"settings"}`))
	if err != nil {
		t.Fatalf("new restarted latest-state request: %v", err)
	}
	restartedLatestRequest.Header.Set("Content-Type", "application/json")
	restartedLatestRequest.AddCookie(restartedAuthCookie)

	restartedLatestResponse, err := http.DefaultClient.Do(restartedLatestRequest)
	if err != nil {
		t.Fatalf("load restarted latest settings project state: %v", err)
	}
	defer restartedLatestResponse.Body.Close()
	if restartedLatestResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartedLatestResponse.Body)
		t.Fatalf("expected restarted latest settings project state 200, got %d with body %q", restartedLatestResponse.StatusCode, string(body))
	}

	var restartedLatestPayload httpapi.ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.NewDecoder(restartedLatestResponse.Body).Decode(&restartedLatestPayload); err != nil {
		t.Fatalf("decode restarted latest settings project payload: %v", err)
	}
	if restartedLatestPayload.ProjectState.ProjectConfig.Name != settingsstate.SettingsProjectName {
		t.Fatalf("expected restarted latest settings project name %q, got %q", settingsstate.SettingsProjectName, restartedLatestPayload.ProjectState.ProjectConfig.Name)
	}
	if restartedLatestPayload.ProjectState.ProjectConfig.ActiveViewModeID == nil || *restartedLatestPayload.ProjectState.ProjectConfig.ActiveViewModeID != initialActiveViewModeID {
		t.Fatalf("expected restarted latest active view mode %q, got %#v", initialActiveViewModeID, restartedLatestPayload.ProjectState.ProjectConfig.ActiveViewModeID)
	}

	persistedStore, err := projectstate.NewStore(restartedApp.ProjectStates().Paths().Settings, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted settings project store: %v", err)
	}
	persistedDocument, err := persistedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted settings project document: %v", err)
	}
	persistedProject, err := persistedDocument.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("persisted settings project by id: %v", err)
	}
	if persistedProject.Name != settingsstate.SettingsProjectName {
		t.Fatalf("expected persisted settings project name %q, got %q", settingsstate.SettingsProjectName, persistedProject.Name)
	}
	if persistedProject.ActiveViewModeID != initialActiveViewModeID {
		t.Fatalf("expected persisted active view mode %q, got %q", initialActiveViewModeID, persistedProject.ActiveViewModeID)
	}
}

func TestAppSettingsProjectLoadRoutesRepairAndPersistMissingRequiredViewMode(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	authCookie := newAppTestAuthCookie(t, app)

	loadSettingsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"settings"}`))
	if err != nil {
		t.Fatalf("new settings load request: %v", err)
	}
	loadSettingsRequest.Header.Set("Content-Type", "application/json")
	loadSettingsRequest.AddCookie(authCookie)

	loadSettingsResponse, err := http.DefaultClient.Do(loadSettingsRequest)
	if err != nil {
		t.Fatalf("load settings project config: %v", err)
	}
	defer loadSettingsResponse.Body.Close()
	if loadSettingsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(loadSettingsResponse.Body)
		t.Fatalf("expected settings project config 200, got %d with body %q", loadSettingsResponse.StatusCode, string(body))
	}

	deleteViewModeRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteDeleteViewMode, strings.NewReader(`{"projectConfigId":"settings","viewModeId":"settings-all"}`))
	if err != nil {
		t.Fatalf("new delete view mode request: %v", err)
	}
	deleteViewModeRequest.Header.Set("Content-Type", "application/json")
	deleteViewModeRequest.AddCookie(authCookie)

	deleteViewModeResponse, err := http.DefaultClient.Do(deleteViewModeRequest)
	if err != nil {
		t.Fatalf("delete settings view mode: %v", err)
	}
	defer deleteViewModeResponse.Body.Close()
	if deleteViewModeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deleteViewModeResponse.Body)
		t.Fatalf("expected delete view mode 200, got %d with body %q", deleteViewModeResponse.StatusCode, string(body))
	}

	server.Close()
	if err := app.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown app after delete: %v", err)
	}

	restartedApp, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new restarted app: %v", err)
	}
	t.Cleanup(func() {
		if err := restartedApp.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown restarted app: %v", err)
		}
	})

	restartedServer := httptest.NewServer(restartedApp.Handler())
	defer restartedServer.Close()

	restartedAuthCookie := newAppTestAuthCookie(t, restartedApp)

	restartedLoadRequest, err := http.NewRequest(http.MethodPost, restartedServer.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"settings"}`))
	if err != nil {
		t.Fatalf("new restarted settings load request: %v", err)
	}
	restartedLoadRequest.Header.Set("Content-Type", "application/json")
	restartedLoadRequest.AddCookie(restartedAuthCookie)

	restartedLoadResponse, err := http.DefaultClient.Do(restartedLoadRequest)
	if err != nil {
		t.Fatalf("load restarted settings project config: %v", err)
	}
	defer restartedLoadResponse.Body.Close()
	if restartedLoadResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartedLoadResponse.Body)
		t.Fatalf("expected restarted settings project config 200, got %d with body %q", restartedLoadResponse.StatusCode, string(body))
	}

	var restartedLoadPayload projectview.SingleConfig
	if err := json.NewDecoder(restartedLoadResponse.Body).Decode(&restartedLoadPayload); err != nil {
		t.Fatalf("decode restarted settings project payload: %v", err)
	}
	if len(restartedLoadPayload.ProjectConfig.ViewModes) != 5 {
		t.Fatalf("expected 5 settings view modes after repair, got %d", len(restartedLoadPayload.ProjectConfig.ViewModes))
	}
	if _, ok := restartedLoadPayload.ProjectConfig.ViewModes["settings-all"]; !ok {
		t.Fatal("expected restarted settings payload to restore settings-all view mode")
	}

	restartedLatestRequest, err := http.NewRequest(http.MethodPost, restartedServer.URL+"/api"+httpapi.RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"settings"}`))
	if err != nil {
		t.Fatalf("new restarted latest-state request: %v", err)
	}
	restartedLatestRequest.Header.Set("Content-Type", "application/json")
	restartedLatestRequest.AddCookie(restartedAuthCookie)

	restartedLatestResponse, err := http.DefaultClient.Do(restartedLatestRequest)
	if err != nil {
		t.Fatalf("load restarted latest settings project state: %v", err)
	}
	defer restartedLatestResponse.Body.Close()
	if restartedLatestResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartedLatestResponse.Body)
		t.Fatalf("expected restarted latest settings project state 200, got %d with body %q", restartedLatestResponse.StatusCode, string(body))
	}

	var restartedLatestPayload httpapi.ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.NewDecoder(restartedLatestResponse.Body).Decode(&restartedLatestPayload); err != nil {
		t.Fatalf("decode restarted latest settings project payload: %v", err)
	}
	if len(restartedLatestPayload.ProjectState.ProjectConfig.ViewModes) != 5 {
		t.Fatalf("expected latest settings payload to expose 5 repaired view modes, got %d", len(restartedLatestPayload.ProjectState.ProjectConfig.ViewModes))
	}
	if _, ok := restartedLatestPayload.ProjectState.ProjectConfig.ViewModes["settings-all"]; !ok {
		t.Fatal("expected restarted latest settings payload to restore settings-all view mode")
	}

	persistedStore, err := projectstate.NewStore(restartedApp.ProjectStates().Paths().Settings, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted settings project store: %v", err)
	}
	persistedDocument, err := persistedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted settings project document: %v", err)
	}
	persistedProject, err := persistedDocument.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("persisted settings project by id: %v", err)
	}
	if len(persistedProject.ViewModes) != 5 {
		t.Fatalf("expected persisted repaired settings project to have 5 view modes, got %d", len(persistedProject.ViewModes))
	}
	if _, ok := persistedProject.ViewModes["settings-all"]; !ok {
		t.Fatal("expected persisted repaired settings project to restore settings-all view mode")
	}
}

func TestAppSettingsProjectLoadRoutesRepairDeletedActiveViewModeAndReprojectLayout(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	if err := app.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown app: %v", err)
	}

	settingsStore, err := projectstate.NewStore(filepath.Join(cfg.Paths.SettaFilesRoot, projectstate.SettingsFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted settings project store: %v", err)
	}
	settingsDocument, err := settingsStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted settings project document: %v", err)
	}
	settingsProject := settingsDocument.Projects[settingsstate.SettingsProjectID]
	delete(settingsProject.ViewModes, "settings-core")
	settingsProject.ActiveViewModeID = "settings-core"
	settingsProject.IsEditingViewMode = true
	settingsProject.Viewport = &projectstate.Viewport{X: 80, Y: 40, Zoom: 1.3}
	settingsProject.ViewportInitialized = true
	settingsDocument.Projects[settingsstate.SettingsProjectID] = settingsProject
	if err := settingsStore.Save(context.Background(), settingsDocument); err != nil {
		t.Fatalf("save corrupted settings project document: %v", err)
	}

	restartedApp, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("restart app: %v", err)
	}
	t.Cleanup(func() {
		if err := restartedApp.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown restarted app: %v", err)
		}
	})

	restartedServer := httptest.NewServer(restartedApp.Handler())
	defer restartedServer.Close()

	restartedAuthCookie := newAppTestAuthCookie(t, restartedApp)

	restartedLoadRequest, err := http.NewRequest(http.MethodPost, restartedServer.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"settings"}`))
	if err != nil {
		t.Fatalf("new restarted settings load request: %v", err)
	}
	restartedLoadRequest.Header.Set("Content-Type", "application/json")
	restartedLoadRequest.AddCookie(restartedAuthCookie)

	restartedLoadResponse, err := http.DefaultClient.Do(restartedLoadRequest)
	if err != nil {
		t.Fatalf("load restarted settings project config: %v", err)
	}
	defer restartedLoadResponse.Body.Close()
	if restartedLoadResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartedLoadResponse.Body)
		t.Fatalf("expected restarted settings project config 200, got %d with body %q", restartedLoadResponse.StatusCode, string(body))
	}

	var restartedLoadPayload projectview.SingleConfig
	if err := json.NewDecoder(restartedLoadResponse.Body).Decode(&restartedLoadPayload); err != nil {
		t.Fatalf("decode restarted settings project payload: %v", err)
	}
	if len(restartedLoadPayload.ProjectConfig.ViewModes) != 5 {
		t.Fatalf("expected 5 settings view modes after repair, got %d", len(restartedLoadPayload.ProjectConfig.ViewModes))
	}
	if restartedLoadPayload.ProjectConfig.IsEditingViewMode {
		t.Fatal("expected repaired settings load payload to exit view-edit mode")
	}
	if restartedLoadPayload.ProjectConfig.ActiveViewModeID == nil {
		t.Fatal("expected repaired settings load payload to expose an active view mode")
	}
	activeLoadViewMode, ok := restartedLoadPayload.ProjectConfig.ViewModes[*restartedLoadPayload.ProjectConfig.ActiveViewModeID]
	if !ok {
		t.Fatalf("expected repaired active view mode %q to exist", *restartedLoadPayload.ProjectConfig.ActiveViewModeID)
	}
	if !reflect.DeepEqual(restartedLoadPayload.ProjectConfig.TopLevelSections, activeLoadViewMode.TopLevelSections) {
		t.Fatal("expected repaired settings load payload to reproject the active view mode layout")
	}
	if !reflect.DeepEqual(restartedLoadPayload.ProjectConfig.Viewport, activeLoadViewMode.Viewport) {
		t.Fatal("expected repaired settings load payload to reproject the active view mode viewport")
	}
	if restartedLoadPayload.ProjectConfig.ViewportInitialized != activeLoadViewMode.ViewportInitialized {
		t.Fatal("expected repaired settings load payload to reproject viewportInitialized")
	}

	restartedLatestRequest, err := http.NewRequest(http.MethodPost, restartedServer.URL+"/api"+httpapi.RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"settings"}`))
	if err != nil {
		t.Fatalf("new restarted latest-state request: %v", err)
	}
	restartedLatestRequest.Header.Set("Content-Type", "application/json")
	restartedLatestRequest.AddCookie(restartedAuthCookie)

	restartedLatestResponse, err := http.DefaultClient.Do(restartedLatestRequest)
	if err != nil {
		t.Fatalf("load restarted latest settings project state: %v", err)
	}
	defer restartedLatestResponse.Body.Close()
	if restartedLatestResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartedLatestResponse.Body)
		t.Fatalf("expected restarted latest settings project state 200, got %d with body %q", restartedLatestResponse.StatusCode, string(body))
	}

	var restartedLatestPayload httpapi.ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.NewDecoder(restartedLatestResponse.Body).Decode(&restartedLatestPayload); err != nil {
		t.Fatalf("decode restarted latest settings project payload: %v", err)
	}
	if len(restartedLatestPayload.ProjectState.ProjectConfig.ViewModes) != 5 {
		t.Fatalf("expected latest settings payload to expose 5 repaired view modes, got %d", len(restartedLatestPayload.ProjectState.ProjectConfig.ViewModes))
	}
	if restartedLatestPayload.ProjectState.ProjectConfig.IsEditingViewMode {
		t.Fatal("expected repaired latest settings payload to exit view-edit mode")
	}
	if restartedLatestPayload.ProjectState.ProjectConfig.ActiveViewModeID == nil {
		t.Fatal("expected repaired latest settings payload to expose an active view mode")
	}
	activeLatestViewMode, ok := restartedLatestPayload.ProjectState.ProjectConfig.ViewModes[*restartedLatestPayload.ProjectState.ProjectConfig.ActiveViewModeID]
	if !ok {
		t.Fatalf("expected latest repaired active view mode %q to exist", *restartedLatestPayload.ProjectState.ProjectConfig.ActiveViewModeID)
	}
	if !reflect.DeepEqual(restartedLatestPayload.ProjectState.ProjectConfig.TopLevelSections, activeLatestViewMode.TopLevelSections) {
		t.Fatal("expected repaired latest settings payload to reproject the active view mode layout")
	}
	if !reflect.DeepEqual(restartedLatestPayload.ProjectState.ProjectConfig.Viewport, activeLatestViewMode.Viewport) {
		t.Fatal("expected repaired latest settings payload to reproject the active view mode viewport")
	}
	if restartedLatestPayload.ProjectState.ProjectConfig.ViewportInitialized != activeLatestViewMode.ViewportInitialized {
		t.Fatal("expected repaired latest settings payload to reproject viewportInitialized")
	}

	repairedStore, err := projectstate.NewStore(restartedApp.ProjectStates().Paths().Settings, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open repaired settings project store: %v", err)
	}
	repairedDocument, err := repairedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load repaired settings project document: %v", err)
	}
	repairedProject, err := repairedDocument.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("repaired settings project by id: %v", err)
	}
	if repairedProject.IsEditingViewMode {
		t.Fatal("expected repaired persisted settings project to exit view-edit mode")
	}
	activePersistedViewMode, ok := repairedProject.ViewModes[repairedProject.ActiveViewModeID]
	if !ok {
		t.Fatalf("expected persisted repaired active view mode %q to exist", repairedProject.ActiveViewModeID)
	}
	if !reflect.DeepEqual(repairedProject.TopLevelSections, activePersistedViewMode.TopLevelSections) {
		t.Fatal("expected repaired persisted settings project to reproject the active view mode layout")
	}
	if !reflect.DeepEqual(repairedProject.Viewport, activePersistedViewMode.Viewport) {
		t.Fatal("expected repaired persisted settings project to reproject the active view mode viewport")
	}
	if repairedProject.ViewportInitialized != activePersistedViewMode.ViewportInitialized {
		t.Fatal("expected repaired persisted settings project to reproject viewportInitialized")
	}
}

func TestAppStartupRebuildsMissingRequiredSettingsSection(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	if err := app.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown app: %v", err)
	}

	settingsStore, err := projectstate.NewStore(filepath.Join(cfg.Paths.SettaFilesRoot, projectstate.SettingsFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted settings project store: %v", err)
	}
	settingsDocument, err := settingsStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted settings project document: %v", err)
	}
	settingsProject := settingsDocument.Projects[settingsstate.SettingsProjectID]
	removeSettingsProjectSectionByName(&settingsProject, "spreadsheetSectionDefault")
	settingsDocument.Projects[settingsstate.SettingsProjectID] = settingsProject
	if err := settingsStore.Save(context.Background(), settingsDocument); err != nil {
		t.Fatalf("save corrupted settings project document: %v", err)
	}

	restartedApp, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("expected app startup to rebuild missing required settings section, got %v", err)
	}
	t.Cleanup(func() {
		if err := restartedApp.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown restarted app: %v", err)
		}
	})

	repairedStore, err := projectstate.NewStore(restartedApp.ProjectStates().Paths().Settings, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open rebuilt settings project store: %v", err)
	}
	repairedDocument, err := repairedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load rebuilt settings project document: %v", err)
	}
	repairedProject, err := repairedDocument.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("rebuilt settings project by id: %v", err)
	}
	if _, ok := repairedProject.Sections["settings-section__spreadsheetSectionDefault"]; !ok {
		t.Fatal("expected startup rebuild to restore spreadsheetSectionDefault")
	}
}

func TestAppStartupBackfillsMissingCodeObjsWithinExistingSettingsSections(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	if err := app.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown app: %v", err)
	}

	settingsStore, err := projectstate.NewStore(filepath.Join(cfg.Paths.SettaFilesRoot, projectstate.SettingsFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted settings project store: %v", err)
	}
	settingsDocument, err := settingsStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted settings project document: %v", err)
	}
	settingsProject := settingsDocument.Projects[settingsstate.SettingsProjectID]
	samples := []settingsProjectCodeObjBackfillSample{
		{
			sectionImplID:  "settings-section-impl__backend",
			codeObjID:      "settings-codeobj__backend__backend__autosave",
			codeObjVariant: "settings-codeobj-variant__backend__backend__autosave",
			codeObjImplID:  "settings-codeobj-impl__backend__backend__autosave",
			parentImplID:   "settings-codeobj-impl__backend__backend",
			expectedType:   "SwitchParam",
		},
		{
			sectionImplID:  "settings-section-impl__backend",
			codeObjID:      "settings-codeobj__backend__backend__renameRefactorMode",
			codeObjVariant: "settings-codeobj-variant__backend__backend__renameRefactorMode",
			codeObjImplID:  "settings-codeobj-impl__backend__backend__renameRefactorMode",
			parentImplID:   "settings-codeobj-impl__backend__backend",
			expectedType:   "DropdownParam",
			expectedChoices: []string{
				"ALWAYS_ASK",
				"ALWAYS_RENAME",
				"NEVER_RENAME",
			},
		},
		{
			sectionImplID:  "settings-section-impl__gui",
			codeObjID:      "settings-codeobj__gui__gui__gridColor",
			codeObjVariant: "settings-codeobj-variant__gui__gui__gridColor",
			codeObjImplID:  "settings-codeobj-impl__gui__gui__gridColor",
			parentImplID:   "settings-codeobj-impl__gui__gui",
			expectedType:   "ColorPickerParam",
		},
		{
			sectionImplID:  "settings-section-impl__sectionSizingPolicy",
			codeObjID:      "settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__metaControlByType",
			codeObjVariant: "settings-codeobj-variant__sectionSizingPolicy__sectionSizingPolicy__metaControlByType",
			codeObjImplID:  "settings-codeobj-impl__sectionSizingPolicy__sectionSizingPolicy__metaControlByType",
			parentImplID:   "settings-codeobj-impl__sectionSizingPolicy__sectionSizingPolicy",
			expectedType:   "NestedParam",
		},
	}
	for _, sample := range samples {
		if err := removeSettingsProjectCodeObjectByID(
			&settingsProject,
			sample.sectionImplID,
			sample.codeObjID,
			sample.codeObjVariant,
			sample.codeObjImplID,
			sample.parentImplID,
		); err != nil {
			t.Fatalf("remove settings code object %q: %v", sample.codeObjID, err)
		}
	}
	settingsDocument.Projects[settingsstate.SettingsProjectID] = settingsProject
	if err := settingsStore.Save(context.Background(), settingsDocument); err != nil {
		t.Fatalf("save corrupted settings project document: %v", err)
	}

	restartedApp, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("restart app: %v", err)
	}
	t.Cleanup(func() {
		if err := restartedApp.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown restarted app: %v", err)
		}
	})

	repairedStore, err := projectstate.NewStore(restartedApp.ProjectStates().Paths().Settings, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open repaired settings project store: %v", err)
	}
	repairedDocument, err := repairedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load repaired settings project document: %v", err)
	}
	repairedProject, err := repairedDocument.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("repaired settings project by id: %v", err)
	}
	assertSettingsProjectPersistedParamImplMappingContract(t, repairedProject, samples)
}

type settingsProjectCodeObjBackfillSample struct {
	sectionImplID   string
	codeObjID       string
	codeObjVariant  string
	codeObjImplID   string
	parentImplID    string
	expectedType    string
	expectedChoices []string
}

func removeSettingsProjectSectionByName(project *projectstate.Project, sectionName string) {
	sectionID := ""
	for candidateID, section := range project.Sections {
		if section.Name == sectionName {
			sectionID = candidateID
			break
		}
	}
	if sectionID == "" {
		return
	}

	variantID := project.SectionVariantMap[sectionID]
	delete(project.SectionVariantMap, sectionID)
	delete(project.Sections, sectionID)
	delete(project.TopLevelSections, sectionID)
	filteredSectionIDs := make([]string, 0, len(project.TopLevelSectionIDs))
	for _, topLevelSectionID := range project.TopLevelSectionIDs {
		if topLevelSectionID == sectionID {
			continue
		}
		filteredSectionIDs = append(filteredSectionIDs, topLevelSectionID)
	}
	project.TopLevelSectionIDs = filteredSectionIDs

	if variantID != "" {
		sectionVariant := project.SectionVariants[variantID]
		delete(project.SectionVariants, variantID)
		if sectionVariant.ImplID != "" {
			delete(project.SectionImpls, sectionVariant.ImplID)
		}
	}

	for viewModeID, viewMode := range project.ViewModes {
		delete(viewMode.VisibilityBySectionID, sectionID)
		delete(viewMode.TopLevelSections, sectionID)
		project.ViewModes[viewModeID] = viewMode
	}
}

func removeSettingsProjectCodeObjectByID(
	project *projectstate.Project,
	sectionImplID string,
	codeObjID string,
	codeObjVariantID string,
	codeObjImplID string,
	parentCodeObjImplID string,
) error {
	delete(project.CodeObjs, codeObjID)
	delete(project.CodeObjVariants, codeObjVariantID)
	delete(project.CodeObjImpls, codeObjImplID)

	sectionImpl := project.SectionImpls[sectionImplID]
	var sectionPayload map[string]any
	if err := json.Unmarshal(sectionImpl.Payload, &sectionPayload); err != nil {
		return err
	}
	codeObjVariantMap, ok := sectionPayload["codeObjVariantMap"].(map[string]any)
	if !ok {
		return errors.New("settings section payload missing codeObjVariantMap")
	}
	delete(codeObjVariantMap, codeObjID)
	encodedSectionPayload, err := json.Marshal(sectionPayload)
	if err != nil {
		return err
	}
	sectionImpl.Payload = encodedSectionPayload
	project.SectionImpls[sectionImplID] = sectionImpl

	parentImpl := project.CodeObjImpls[parentCodeObjImplID]
	var parentPayload map[string]any
	if err := json.Unmarshal(parentImpl.Payload, &parentPayload); err != nil {
		return err
	}
	rawChildren, ok := parentPayload["children"].([]any)
	if !ok {
		return errors.New("settings parent code object payload missing children")
	}
	filteredChildren := make([]string, 0, len(rawChildren))
	for _, rawChild := range rawChildren {
		childID, ok := rawChild.(string)
		if !ok {
			return errors.New("settings parent code object child must be a string")
		}
		if childID == codeObjID {
			continue
		}
		filteredChildren = append(filteredChildren, childID)
	}
	parentPayload["children"] = filteredChildren
	encodedParentPayload, err := json.Marshal(parentPayload)
	if err != nil {
		return err
	}
	parentImpl.Payload = encodedParentPayload
	project.CodeObjImpls[parentCodeObjImplID] = parentImpl
	return nil
}

func removeSettingsProjectSectionAutoHeight(
	project *projectstate.Project,
	sectionName string,
) error {
	sectionID := ""
	for candidateID, section := range project.Sections {
		if section.Name == sectionName {
			sectionID = candidateID
			break
		}
	}
	if sectionID == "" {
		return fmt.Errorf("missing settings section %q", sectionName)
	}
	variantID := project.SectionVariantMap[sectionID]
	implID := project.SectionVariants[variantID].ImplID
	sectionImpl := project.SectionImpls[implID]
	var payload map[string]any
	if err := json.Unmarshal(sectionImpl.Payload, &payload); err != nil {
		return err
	}
	size, ok := payload["size"].(map[string]any)
	if !ok {
		return errors.New("settings section payload missing size")
	}
	delete(size, "height")
	encodedPayload, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	sectionImpl.Payload = encodedPayload
	project.SectionImpls[implID] = sectionImpl
	return nil
}

func assertSettingsProjectPersistedParamImplMappingContract(
	t *testing.T,
	project projectstate.Project,
	samples []settingsProjectCodeObjBackfillSample,
) {
	t.Helper()

	for _, sample := range samples {
		if _, ok := project.CodeObjs[sample.codeObjID]; !ok {
			t.Fatalf("expected repaired settings code object %q", sample.codeObjID)
		}
		impl, ok := project.CodeObjImpls[sample.codeObjImplID]
		if !ok {
			t.Fatalf("expected repaired settings code object impl %q", sample.codeObjImplID)
		}
		if impl.Type != sample.expectedType {
			t.Fatalf("expected repaired settings code object impl %q type %q, got %q", sample.codeObjImplID, sample.expectedType, impl.Type)
		}
		payload := settingsProjectPersistedCodeObjImplPayload(t, impl)
		if got := payload["type"]; got != sample.expectedType {
			t.Fatalf("expected repaired settings payload %q type %q, got %#v", sample.codeObjImplID, sample.expectedType, got)
		}
		if len(sample.expectedChoices) == 0 {
			continue
		}
		rawChoices, ok := payload["choices"].([]any)
		if !ok {
			t.Fatalf("expected repaired settings payload %q choices, got %#v", sample.codeObjImplID, payload["choices"])
		}
		choices := make([]string, 0, len(rawChoices))
		for _, rawChoice := range rawChoices {
			choice, ok := rawChoice.(string)
			if !ok {
				t.Fatalf("expected repaired settings payload %q choice string, got %#v", sample.codeObjImplID, rawChoice)
			}
			choices = append(choices, choice)
		}
		if !reflect.DeepEqual(choices, sample.expectedChoices) {
			t.Fatalf("expected repaired settings payload %q choices %#v, got %#v", sample.codeObjImplID, sample.expectedChoices, choices)
		}
	}
}

func settingsProjectPersistedCodeObjImplPayload(
	t *testing.T,
	impl projectstate.CodeObjectImpl,
) map[string]any {
	t.Helper()

	var payload map[string]any
	if err := json.Unmarshal(impl.Payload, &payload); err != nil {
		t.Fatalf("decode persisted settings code object impl %q: %v", impl.ID, err)
	}
	return payload
}

func settingsProjectViewCodeObjValue(t *testing.T, payload projectview.SingleConfig, implID string) string {
	t.Helper()

	rawPayload, ok := payload.CodeObjImpls[implID]
	if !ok {
		t.Fatalf("expected code object impl %q", implID)
	}
	var decoded struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(rawPayload, &decoded); err != nil {
		t.Fatalf("decode code object impl %q: %v", implID, err)
	}
	return decoded.Value
}

func settingsProjectViewCodeObjChoices(t *testing.T, payload projectview.SingleConfig, implID string) []string {
	t.Helper()

	rawPayload, ok := payload.CodeObjImpls[implID]
	if !ok {
		t.Fatalf("expected code object impl %q", implID)
	}
	var decoded struct {
		Choices []string `json:"choices"`
	}
	if err := json.Unmarshal(rawPayload, &decoded); err != nil {
		t.Fatalf("decode code object impl %q choices: %v", implID, err)
	}
	return decoded.Choices
}

func assertSettingsProjectViewModeRouteContract(
	t *testing.T,
	payload projectview.SingleConfig,
) {
	t.Helper()

	expectedViewModeNames := []string{
		"Core",
		"Section Defaults Structure and Code",
		"Section Defaults Content and Media",
		"Param Defaults",
		"All Settings",
	}
	orderedViewModes := make([]projectstate.ViewMode, 0, len(payload.ProjectConfig.ViewModes))
	for _, viewMode := range payload.ProjectConfig.ViewModes {
		orderedViewModes = append(orderedViewModes, viewMode)
	}
	sort.Slice(orderedViewModes, func(i int, j int) bool {
		if orderedViewModes[i].SortIndex != orderedViewModes[j].SortIndex {
			return orderedViewModes[i].SortIndex < orderedViewModes[j].SortIndex
		}
		if orderedViewModes[i].Name != orderedViewModes[j].Name {
			return orderedViewModes[i].Name < orderedViewModes[j].Name
		}
		return orderedViewModes[i].ID < orderedViewModes[j].ID
	})
	if len(orderedViewModes) != len(expectedViewModeNames) {
		t.Fatalf("expected %d settings view modes, got %d", len(expectedViewModeNames), len(orderedViewModes))
	}
	for idx, expectedName := range expectedViewModeNames {
		if orderedViewModes[idx].Name != expectedName {
			t.Fatalf("expected settings view mode %d to be %q, got %q", idx, expectedName, orderedViewModes[idx].Name)
		}
		if orderedViewModes[idx].Viewport != nil {
			t.Fatalf("expected settings view mode %q viewport to default to nil, got %#v", expectedName, orderedViewModes[idx].Viewport)
		}
		if orderedViewModes[idx].ViewportInitialized {
			t.Fatalf("expected settings view mode %q viewportInitialized to default to false", expectedName)
		}
	}

	sectionIDByName := make(map[string]string, len(payload.Sections))
	for sectionID, section := range payload.Sections {
		sectionIDByName[section.Name] = sectionID
	}

	assertSettingsPayloadViewModeLayouts(
		t,
		settingsPayloadViewModeByName(t, payload.ProjectConfig.ViewModes, "Core"),
		sectionIDByName,
		[]string{
			"shortcuts",
			"gui",
			"backend",
			"sectionSizingPolicy",
			"languageServer",
		},
		0,
	)
	assertSettingsPayloadViewModeLayouts(
		t,
		settingsPayloadViewModeByName(t, payload.ProjectConfig.ViewModes, "Param Defaults"),
		sectionIDByName,
		[]string{
			"buttonParamCodeObjDefault",
			"codeCallableCodeObjDefault",
			"codeParamCodeObjDefault",
		},
		0,
	)
	assertSettingsPayloadViewModeLayouts(
		t,
		settingsPayloadViewModeByName(t, payload.ProjectConfig.ViewModes, "Section Defaults Structure and Code"),
		sectionIDByName,
		[]string{
			"stateMachineStartSectionDefault",
			"stateMachineGateSectionDefault",
			"stateMachineEndSectionDefault",
		},
		9,
	)
	assertSettingsPayloadViewModeLayouts(
		t,
		settingsPayloadViewModeByName(t, payload.ProjectConfig.ViewModes, "All Settings"),
		sectionIDByName,
		[]string{
			"shortcuts",
			"gui",
			"backend",
			"chatWindowing",
		},
		0,
	)
}

func settingsPayloadViewModeByName(
	t *testing.T,
	viewModes map[string]projectstate.ViewMode,
	viewModeName string,
) projectstate.ViewMode {
	t.Helper()
	for _, viewMode := range viewModes {
		if viewMode.Name == viewModeName {
			return viewMode
		}
	}
	t.Fatalf("expected settings payload view mode %q", viewModeName)
	return projectstate.ViewMode{}
}

func assertSettingsProjectRouteBootstrapMetadataContract(
	t *testing.T,
	payload projectview.SingleConfig,
	expectedSharedSettingsPath string,
) {
	t.Helper()

	for sectionID, section := range payload.Sections {
		variantID, ok := payload.ProjectConfig.SectionVariantMap[sectionID]
		if !ok {
			t.Fatalf("expected section variant map entry for %q", section.Name)
		}
		variant, ok := payload.SectionVariants[variantID]
		if !ok {
			t.Fatalf("expected section variant %q for %q", variantID, section.Name)
		}
		if variant.Name != expectedSharedSettingsPath {
			t.Fatalf("expected route section variant %q name %q, got %q", section.Name, expectedSharedSettingsPath, variant.Name)
		}
		sectionImplPayload := settingsPayloadSectionImplByID(t, payload, variant.Impl)
		if sectionImplPayload["configLanguage"] != "json" {
			t.Fatalf("expected settings route payload section %q configLanguage json, got %#v", section.Name, sectionImplPayload["configLanguage"])
		}
		isJSONSource, ok := sectionImplPayload["isJsonSource"].(bool)
		if !ok || !isJSONSource {
			t.Fatalf("expected settings route payload section %q to stay JSON-source backed, got %#v", section.Name, sectionImplPayload["isJsonSource"])
		}
		jsonSourceKeys, ok := sectionImplPayload["jsonSourceKeys"].([]any)
		if !ok || len(jsonSourceKeys) != 1 || jsonSourceKeys[0] != section.Name {
			t.Fatalf("expected settings route payload section %q jsonSourceKeys [%q], got %#v", section.Name, section.Name, sectionImplPayload["jsonSourceKeys"])
		}
		size, ok := sectionImplPayload["size"].(map[string]any)
		if !ok {
			t.Fatalf("expected settings route payload section %q to include size", section.Name)
		}
		width, ok := size["width"].(float64)
		if !ok {
			t.Fatalf("expected settings route payload section %q width to be numeric, got %#v", section.Name, size["width"])
		}
		if width != 550 {
			t.Fatalf("expected settings route payload section %q width 550, got %v", section.Name, width)
		}
		if got := size["height"]; got != "auto" {
			t.Fatalf("expected settings route payload section %q height auto, got %#v", section.Name, got)
		}
	}

	expectedDisplayNames := map[string]string{
		"gui":                         "GUI",
		"languageServer":              "Language Server",
		"iFrameSectionDefault":        "IFrame Section Default",
		"genPythonCodeSectionDefault": "Generated Python Code Section Default",
	}
	for sectionName, expectedDisplayName := range expectedDisplayNames {
		section := settingsPayloadSectionByName(t, payload.Sections, sectionName)
		if section.DisplayName != "" {
			t.Fatalf("expected route section %q display name to stay blank, got %q", sectionName, section.DisplayName)
		}
		codeObj := settingsPayloadCodeObjByName(t, payload.CodeObjs, sectionName)
		if codeObj.DisplayName != expectedDisplayName {
			t.Fatalf("expected route root code obj %q display name %q, got %q", sectionName, expectedDisplayName, codeObj.DisplayName)
		}
	}
}

func settingsPayloadSectionByName(
	t *testing.T,
	sections map[string]projectview.Core,
	sectionName string,
) projectview.Core {
	t.Helper()
	for _, section := range sections {
		if section.Name == sectionName {
			return section
		}
	}
	t.Fatalf("expected settings route section %q", sectionName)
	return projectview.Core{}
}

func settingsPayloadCodeObjByName(
	t *testing.T,
	codeObjs map[string]projectview.Core,
	codeObjName string,
) projectview.Core {
	t.Helper()
	for _, codeObj := range codeObjs {
		if codeObj.Name == codeObjName {
			return codeObj
		}
	}
	t.Fatalf("expected settings route code obj %q", codeObjName)
	return projectview.Core{}
}

func settingsProjectPersistedCodeObjByName(
	t *testing.T,
	codeObjs map[string]projectstate.CodeObject,
	codeObjName string,
) projectstate.CodeObject {
	t.Helper()
	for _, codeObj := range codeObjs {
		if codeObj.Name == codeObjName {
			return codeObj
		}
	}
	t.Fatalf("expected persisted settings code object %q", codeObjName)
	return projectstate.CodeObject{}
}

func assertSettingsProjectRouteCodeObjDisplayNames(
	t *testing.T,
	payload projectview.SingleConfig,
	expected map[string]string,
) {
	t.Helper()
	for codeObjName, expectedDisplayName := range expected {
		codeObj := settingsPayloadCodeObjByName(t, payload.CodeObjs, codeObjName)
		if codeObj.DisplayName != expectedDisplayName {
			t.Fatalf("expected route code object %q display name %q, got %q", codeObjName, expectedDisplayName, codeObj.DisplayName)
		}
	}
}

func assertSettingsProjectPersistedCodeObjDisplayNames(
	t *testing.T,
	project projectstate.Project,
	expected map[string]string,
) {
	t.Helper()
	for codeObjName, expectedDisplayName := range expected {
		codeObj := settingsProjectPersistedCodeObjByName(t, project.CodeObjs, codeObjName)
		if codeObj.DisplayName != expectedDisplayName {
			t.Fatalf("expected persisted code object %q display name %q, got %q", codeObjName, expectedDisplayName, codeObj.DisplayName)
		}
	}
}

func assertSettingsProjectRouteSectionAutoHeight(
	t *testing.T,
	payload projectview.SingleConfig,
	sectionName string,
) {
	t.Helper()
	section := settingsPayloadSectionByName(t, payload.Sections, sectionName)
	variantID := payload.ProjectConfig.SectionVariantMap[section.ID]
	variant, ok := payload.SectionVariants[variantID]
	if !ok {
		t.Fatalf("expected route section variant %q for %q", variantID, sectionName)
	}
	sectionImplPayload := settingsPayloadSectionImplByID(t, payload, variant.Impl)
	size, ok := sectionImplPayload["size"].(map[string]any)
	if !ok {
		t.Fatalf("expected route section %q size payload", sectionName)
	}
	if got := size["height"]; got != "auto" {
		t.Fatalf("expected route section %q height auto, got %#v", sectionName, got)
	}
}

func assertSettingsProjectPersistedSectionAutoHeight(
	t *testing.T,
	project projectstate.Project,
	sectionName string,
) {
	t.Helper()
	sectionID := ""
	for candidateID, section := range project.Sections {
		if section.Name == sectionName {
			sectionID = candidateID
			break
		}
	}
	if sectionID == "" {
		t.Fatalf("expected persisted settings section %q", sectionName)
	}
	variantID := project.SectionVariantMap[sectionID]
	implID := project.SectionVariants[variantID].ImplID
	sectionImpl := project.SectionImpls[implID]
	var payload map[string]any
	if err := json.Unmarshal(sectionImpl.Payload, &payload); err != nil {
		t.Fatalf("decode persisted settings section %q impl: %v", sectionName, err)
	}
	size, ok := payload["size"].(map[string]any)
	if !ok {
		t.Fatalf("expected persisted settings section %q size payload", sectionName)
	}
	if got := size["height"]; got != "auto" {
		t.Fatalf("expected persisted settings section %q height auto, got %#v", sectionName, got)
	}
}

func settingsProjectPersistedViewModeLayoutContainsSection(
	project projectstate.Project,
	viewModeID string,
	sectionID string,
) bool {
	viewMode, ok := project.ViewModes[viewModeID]
	if !ok {
		return false
	}
	_, ok = viewMode.TopLevelSections[sectionID]
	return ok
}

func settingsPayloadSectionImplByID(
	t *testing.T,
	payload projectview.SingleConfig,
	implID string,
) map[string]any {
	t.Helper()
	encoded, ok := payload.SectionImpls[implID]
	if !ok {
		t.Fatalf("expected settings route section impl %q", implID)
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal settings route section impl %q: %v", implID, err)
	}
	return decoded
}

func assertSettingsPayloadViewModeLayouts(
	t *testing.T,
	viewMode projectstate.ViewMode,
	sectionIDByName map[string]string,
	sectionNames []string,
	startIndex int,
) {
	t.Helper()
	for idx, sectionName := range sectionNames {
		sectionID, ok := sectionIDByName[sectionName]
		if !ok {
			t.Fatalf("expected settings section %q", sectionName)
		}
		layout, ok := viewMode.TopLevelSections[sectionID]
		if !ok {
			t.Fatalf("expected payload view mode %q to include layout for %q", viewMode.Name, sectionName)
		}
		expectedIndex := startIndex + idx
		expectedX := float64(expectedIndex%3) * 600
		expectedY := float64(expectedIndex/3) * 600
		if layout.X != expectedX || layout.Y != expectedY {
			t.Fatalf(
				"expected payload view mode %q section %q at (%v, %v), got (%v, %v)",
				viewMode.Name,
				sectionName,
				expectedX,
				expectedY,
				layout.X,
				layout.Y,
			)
		}
		if !viewMode.VisibilityBySectionID[sectionID] {
			t.Fatalf("expected payload view mode %q to mark %q visible", viewMode.Name, sectionName)
		}
	}
}
