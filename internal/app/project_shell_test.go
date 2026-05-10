package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
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
	cfg := newSettingsProjectTestConfig(t)

	app := startSettingsProjectApp(t, cfg)
	shutdownSettingsProjectApp(t, app, "initial app")
	seedSettingsProjectDisplayNameBackfillFixture(t, cfg)

	restarted := startSettingsProjectAppFixture(t, cfg)
	t.Cleanup(func() {
		restarted.close(t, "restarted app")
	})

	expectedDisplayNames := settingsProjectDisplayNameBackfillExpectedNames()
	loadSettingsPayload := postSettingsProjectAPI[projectview.SingleConfig](t, restarted, httpapi.RouteLoadProjectConfig, `{"projectConfigName":"settings"}`)
	assertSettingsProjectRouteCodeObjDisplayNames(t, loadSettingsPayload, expectedDisplayNames)
	assertSettingsProjectRouteSectionAutoHeight(t, loadSettingsPayload, "gui")

	latestStatePayload := postSettingsProjectAPI[httpapi.ProjectStateSingleConfigWithCompletedOpIDs](t, restarted, httpapi.RouteGetLatestProjectState, `{"projectConfigId":"settings"}`)
	assertSettingsProjectRouteCodeObjDisplayNames(t, latestStatePayload.ProjectState, expectedDisplayNames)
	assertSettingsProjectRouteSectionAutoHeight(t, latestStatePayload.ProjectState, "gui")

	repairedProject := loadPersistedSettingsProject(t, restarted.app)
	assertSettingsProjectPersistedCodeObjDisplayNames(t, repairedProject, expectedDisplayNames)
	assertSettingsProjectPersistedSectionAutoHeight(t, repairedProject, "gui")
}

func seedSettingsProjectDisplayNameBackfillFixture(t *testing.T, cfg config.Config) {
	t.Helper()

	settingsStore, err := projectstate.NewStore(
		filepath.Join(cfg.Paths.SettaFilesRoot, projectstate.SettingsFileName),
		projectstate.StoreOptions{},
	)
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
}

func settingsProjectDisplayNameBackfillExpectedNames() map[string]string {
	return map[string]string{
		"gui":                "Custom GUI Label",
		"languageServer":     "",
		"renameRefactorMode": "Rename Refactor Mode",
	}
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
