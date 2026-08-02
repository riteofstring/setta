package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
	"setta/internal/wsapi"

	"github.com/coder/websocket"
)

func newAppWebsocketBroadcastTestApp(t *testing.T, cfg config.Config) *App {
	t.Helper()

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	return app
}

func readAppProjectStateUpdate(
	t *testing.T,
	harness appWebsocketMutationHarness,
	projectID string,
	completedOpID string,
	label string,
	maxReads int,
) realtime.ProjectStateUpdateContent {
	t.Helper()

	envelope := readAppRouteEnvelopeUntilType(t, harness.conn, realtime.MessageTypeUpdateFrontendProjectState, maxReads)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode %s project state update: %v", label, err)
	}
	if content.ProjectState.ProjectConfig.ID != projectID {
		t.Fatalf("expected %s state update for %q, got %q", label, projectID, content.ProjectState.ProjectConfig.ID)
	}
	if completedOpID != "" && !containsAppString(content.CompletedOpIDs, completedOpID) {
		t.Fatalf("expected completed %s in websocket update, got %#v", completedOpID, content.CompletedOpIDs)
	}
	return content
}

func countAppProjectStateChildrenForParent(parentSectionMap map[string]*string, parentID string) int {
	count := 0
	for _, parent := range parentSectionMap {
		if parent != nil && *parent == parentID {
			count++
		}
	}
	return count
}

func findAppAgentProfileSnapshotEntry(profiles []agentprofiles.Profile, profileID string) (agentprofiles.Profile, bool) {
	for _, profile := range profiles {
		if profile.ID == profileID {
			return profile, true
		}
	}
	return agentprofiles.Profile{}, false
}

func readAppRenameRefactorBroadcasts(
	t *testing.T,
	harness appWebsocketMutationHarness,
	projectID string,
	frontendOpID string,
) (realtime.ProjectStateUpdateContent, realtime.RenameRefactorBroadcastContent) {
	t.Helper()

	var projectUpdate realtime.ProjectStateUpdateContent
	var renamePrompt realtime.RenameRefactorBroadcastContent
	for range 6 {
		envelope := readAppRouteEnvelope(t, harness.conn)
		switch envelope.MessageType {
		case realtime.MessageTypeUpdateFrontendProjectState:
			if err := json.Unmarshal(envelope.Content, &projectUpdate); err != nil {
				t.Fatalf("decode project state update content: %v", err)
			}
			if projectUpdate.ProjectState.ProjectConfig.ID != projectID {
				t.Fatalf("expected %s state update, got %q", projectID, projectUpdate.ProjectState.ProjectConfig.ID)
			}
			if !containsAppString(projectUpdate.CompletedOpIDs, frontendOpID) {
				t.Fatalf("expected completed rename op in websocket project update, got %#v", projectUpdate.CompletedOpIDs)
			}
		case realtime.MessageTypeReturnRenameRefactorResults:
			if err := json.Unmarshal(envelope.Content, &renamePrompt); err != nil {
				t.Fatalf("decode rename refactor content: %v", err)
			}
		}
		if projectUpdate.ProjectState.ProjectConfig.ID != "" && renamePrompt.ProjectConfigID != "" {
			return projectUpdate, renamePrompt
		}
	}
	t.Fatalf("expected websocket project update and rename prompt for %s", frontendOpID)
	return projectUpdate, renamePrompt
}

func TestAppAgentProfileMutationsBroadcastAgentProfilesUpdated(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	harness := newAppWebsocketMutationHarness(t, cfg)
	createResponse := postAppRouteJSONOK(
		t,
		harness,
		httpapi.RouteCreateAgentProfile,
		`{"name":"Planner","description":"Planning profile","systemPrompt":"Plan tasks","enableBackgroundSummaryFill":true,"enableLlmChatTitles":true,"engineConfigId":"engine-1","toolAllowlist":["tool.a"],"memoryScope":"workspace"}`,
	)
	created := decodeAppJSONResponse[agentprofiles.Profile](t, createResponse, "create agent profile")

	createdSnapshot := readAppMutationContent[realtime.AgentProfilesUpdatedContent](t, harness.conn, realtime.MessageTypeAgentProfilesUpdated, "agent profile create")
	if _, ok := findAppAgentProfileSnapshotEntry(createdSnapshot.Profiles, created.ID); !ok {
		t.Fatalf("expected created agent profile id %q in websocket payload, got %#v", created.ID, createdSnapshot.Profiles)
	}

	updateResponse := postAppRouteJSONOK(
		t,
		harness,
		httpapi.RouteUpdateAgentProfile,
		`{"profile":{"id":"`+created.ID+`","name":"Planner v2","description":"Updated profile","systemPrompt":"Plan better","enableBackgroundSummaryFill":true,"enableLlmChatTitles":true,"engineConfigId":"engine-2","toolAllowlist":["tool.b"],"memoryScope":"project"}}`,
	)
	updateResponse.Body.Close()

	updatedSnapshot := readAppMutationContent[realtime.AgentProfilesUpdatedContent](t, harness.conn, realtime.MessageTypeAgentProfilesUpdated, "agent profile update")
	updated, ok := findAppAgentProfileSnapshotEntry(updatedSnapshot.Profiles, created.ID)
	if !ok {
		t.Fatalf("expected updated agent profile id %q in websocket payload, got %#v", created.ID, updatedSnapshot.Profiles)
	}
	if updated.Name != "Planner v2" {
		t.Fatalf("expected updated agent profile name, got %#v", updated)
	}

	deleteResponse := postAppRouteJSONOK(t, harness, httpapi.RouteDeleteAgentProfile, `{"profileId":"`+created.ID+`"}`)
	deleteResponse.Body.Close()

	deletedSnapshot := readAppMutationContent[realtime.AgentProfilesUpdatedContent](t, harness.conn, realtime.MessageTypeAgentProfilesUpdated, "agent profile delete")
	if _, ok := findAppAgentProfileSnapshotEntry(deletedSnapshot.Profiles, created.ID); ok {
		t.Fatalf("expected deleted agent profile id %q to be absent, got %#v", created.ID, deletedSnapshot.Profiles)
	}
}

func TestAppSaveSettingsProjectMaterializesLiveSettings(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	harness := newAppWebsocketMutationHarness(t, cfg)
	app := harness.app

	if _, err := app.SettingsState().MutateAndSave(context.Background(), func(document settingsstate.Document) (settingsstate.Document, error) {
		document["backend"].(map[string]any)["autoRefetchCallableParamsOnLspMismatch"] = false
		return document, nil
	}); err != nil {
		t.Fatalf("seed live settings runtime: %v", err)
	}

	if _, err := app.ProjectStates().Settings().MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		return appSettingsProjectMaterializerTestDocument(
			t,
			filepath.Join(cfg.Paths.SettaFilesRoot, settingsstate.DefaultFileName),
		), nil
	}); err != nil {
		t.Fatalf("save settings project runtime: %v", err)
	}

	websocketPayload := readAppMutationContent[settingsstate.Document](t, harness.conn, realtime.MessageTypeUpdateSettings, "settings materialization")
	if got := websocketPayload["backend"].(map[string]any)["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected websocket renameRefactorMode ALWAYS_RENAME, got %#v", got)
	}
	if got := websocketPayload["backend"].(map[string]any)["autosave"]; got != false {
		t.Fatalf("expected websocket autosave false, got %#v", got)
	}
	if got := websocketPayload["backend"].(map[string]any)["autoRefetchCallableParamsOnLspMismatch"]; got != false {
		t.Fatalf("expected websocket mismatch-refetch false to survive materialization, got %#v", got)
	}

	runtimeDocument := app.SettingsState().Snapshot().Document
	if got := runtimeDocument["terminalSectionDefault"].(map[string]any)["size"].(map[string]any)["height"]; got != float64(222) {
		t.Fatalf("expected runtime terminal height 222, got %#v", got)
	}
	if got := runtimeDocument["backend"].(map[string]any)["autoRefetchCallableParamsOnLspMismatch"]; got != false {
		t.Fatalf("expected runtime mismatch-refetch false to survive materialization, got %#v", got)
	}

	content, err := os.ReadFile(filepath.Join(cfg.Paths.SettaFilesRoot, settingsstate.DefaultFileName))
	if err != nil {
		t.Fatalf("read persisted settings file: %v", err)
	}
	var persisted settingsstate.Document
	if err := json.Unmarshal(content, &persisted); err != nil {
		t.Fatalf("decode persisted settings file: %v", err)
	}
	if got := persisted["backend"].(map[string]any)["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected persisted renameRefactorMode ALWAYS_RENAME, got %#v", got)
	}
	if got := persisted["backend"].(map[string]any)["autoRefetchCallableParamsOnLspMismatch"]; got != false {
		t.Fatalf("expected persisted mismatch-refetch false to survive materialization, got %#v", got)
	}
}

func TestAppBroadcastsAndHydratesLSPDiagnostics(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	harness := newAppWebsocketMutationHarness(t, cfg)
	app := harness.app

	seedAppLSPCodeSectionProjectWithSource(t, app, "__fixture_error__\n")
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save lsp diagnostics project: %v", err)
	}

	websocketPayload := readAppMutationContent[projectstate.LSPDiagnosticsPayload](t, harness.conn, realtime.MessageTypeLSPDiagnostics, "lsp diagnostics websocket")
	assertAppLSPDiagnosticsPayload(t, websocketPayload)

	response := postAppRouteJSONOK(t, harness, httpapi.RouteGetLatestLSPDiagnostics, `{"projectConfigId":"project-alpha"}`)
	routePayload := decodeAppJSONResponse[projectstate.LSPDiagnosticsPayload](t, response, "latest diagnostics")
	assertAppLSPDiagnosticsPayload(t, routePayload)
}

func appSettingsProjectMaterializerTestDocument(t *testing.T, sharedSettingsPath string) projectstate.Document {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "settings-home",
		Projects: map[string]projectstate.Project{
			"settings-home": {
				ID:   "settings-home",
				Name: "Settings Home",
				TopLevelSectionIDs: []string{
					"backend-section",
					"terminal-section",
				},
				SectionVariantMap: map[string]string{
					"backend-section":  "backend-variant",
					"terminal-section": "terminal-variant",
				},
				Sections: map[string]projectstate.Section{
					"backend-section": {
						ID:               "backend-section",
						Name:             "backend",
						VariantIDs:       []string{"backend-variant"},
						DefaultVariantID: "backend-variant",
					},
					"terminal-section": {
						ID:               "terminal-section",
						Name:             "terminalSectionDefault",
						VariantIDs:       []string{"terminal-variant"},
						DefaultVariantID: "terminal-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"backend-variant": {
						ID:     "backend-variant",
						Name:   sharedSettingsPath,
						ImplID: "backend-impl",
					},
					"terminal-variant": {
						ID:     "terminal-variant",
						Name:   sharedSettingsPath,
						ImplID: "terminal-impl",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"backend-impl": {
						ID:   "backend-impl",
						Kind: projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{
							"id":"backend-impl",
							"type":"Dict",
							"isJsonSource":true,
							"jsonSourceKeys":["backend"],
							"topLevelParamId":"backend-root",
							"codeObjVariantMap":{
								"backend-root":"backend-root-variant",
								"rename-setting":"rename-setting-variant",
								"autosave-setting":"autosave-setting-variant"
							}
						}`),
					},
					"terminal-impl": {
						ID:   "terminal-impl",
						Kind: projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{
							"id":"terminal-impl",
							"type":"Dict",
							"isJsonSource":true,
							"jsonSourceKeys":["terminalSectionDefault"],
							"topLevelParamId":"terminal-root",
							"codeObjVariantMap":{
								"terminal-root":"terminal-root-variant",
								"size-setting":"size-setting-variant",
								"height-setting":"height-setting-variant"
							}
						}`),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"backend-root": {
						ID:               "backend-root",
						Name:             "backend",
						VariantIDs:       []string{"backend-root-variant"},
						DefaultVariantID: "backend-root-variant",
					},
					"rename-setting": {
						ID:               "rename-setting",
						Name:             "renameRefactorMode",
						VariantIDs:       []string{"rename-setting-variant"},
						DefaultVariantID: "rename-setting-variant",
					},
					"autosave-setting": {
						ID:               "autosave-setting",
						Name:             "autosave",
						VariantIDs:       []string{"autosave-setting-variant"},
						DefaultVariantID: "autosave-setting-variant",
					},
					"terminal-root": {
						ID:               "terminal-root",
						Name:             "terminalSectionDefault",
						VariantIDs:       []string{"terminal-root-variant"},
						DefaultVariantID: "terminal-root-variant",
					},
					"size-setting": {
						ID:               "size-setting",
						Name:             "size",
						VariantIDs:       []string{"size-setting-variant"},
						DefaultVariantID: "size-setting-variant",
					},
					"height-setting": {
						ID:               "height-setting",
						Name:             "height",
						VariantIDs:       []string{"height-setting-variant"},
						DefaultVariantID: "height-setting-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"backend-root-variant": {
						ID:     "backend-root-variant",
						ImplID: "backend-root-impl",
					},
					"rename-setting-variant": {
						ID:     "rename-setting-variant",
						ImplID: "rename-setting-impl",
					},
					"autosave-setting-variant": {
						ID:     "autosave-setting-variant",
						ImplID: "autosave-setting-impl",
					},
					"terminal-root-variant": {
						ID:     "terminal-root-variant",
						ImplID: "terminal-root-impl",
					},
					"size-setting-variant": {
						ID:     "size-setting-variant",
						ImplID: "size-setting-impl",
					},
					"height-setting-variant": {
						ID:     "height-setting-variant",
						ImplID: "height-setting-impl",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"backend-root-impl": {
						ID:   "backend-root-impl",
						Type: "NestedParam",
						Payload: projectstate.RawJSON(`{
							"id":"backend-root-impl",
							"type":"NestedParam",
							"children":["rename-setting","autosave-setting"]
						}`),
					},
					"rename-setting-impl": {
						ID:   "rename-setting-impl",
						Type: "TextParam",
						Payload: projectstate.RawJSON(`{
							"id":"rename-setting-impl",
							"type":"TextParam",
							"value":"ALWAYS_RENAME"
						}`),
					},
					"autosave-setting-impl": {
						ID:   "autosave-setting-impl",
						Type: "SwitchParam",
						Payload: projectstate.RawJSON(`{
							"id":"autosave-setting-impl",
							"type":"SwitchParam",
							"value":"false"
						}`),
					},
					"terminal-root-impl": {
						ID:   "terminal-root-impl",
						Type: "NestedParam",
						Payload: projectstate.RawJSON(`{
							"id":"terminal-root-impl",
							"type":"NestedParam",
							"children":["size-setting"]
						}`),
					},
					"size-setting-impl": {
						ID:   "size-setting-impl",
						Type: "NestedParam",
						Payload: projectstate.RawJSON(`{
							"id":"size-setting-impl",
							"type":"NestedParam",
							"children":["height-setting"]
						}`),
					},
					"height-setting-impl": {
						ID:   "height-setting-impl",
						Type: "TextParam",
						Payload: projectstate.RawJSON(`{
							"id":"height-setting-impl",
							"type":"TextParam",
							"value":"222"
						}`),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize settings project document: %v", err)
	}
	return document
}

func TestAppBroadcastsDedupedWatchCodeSignatureWarnings(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app := newAppWebsocketBroadcastTestApp(t, cfg)
	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  json.RawMessage(`{"language":"python"}`),
				},
			},
		}
		setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
			Registry: map[string]projectstate.WatchCodeRegistryEntry{
				"pkg.missing.MissingFunc:function": {
					CallableName: "MissingFunc",
					SourcePath:   "pkg/missing.py",
				},
			},
		})
		return document, nil
	}); err != nil {
		t.Fatalf("seed watch code project: %v", err)
	}

	harness := newAppWebsocketMutationHarnessForApp(t, app)
	warningBroadcaster := codeUpdateService{
		watchCodeWarnings: newWatchCodeWarningTracker(func() (string, bool) {
			return testAppWatchCodeProviderPluginID, true
		}),
		frontendWebsocketHub: app.websocketHub,
	}
	snapshot := app.ProjectStates().Main().Snapshot()
	attempts := map[string]projectstate.SignatureHelpStatus{
		"MissingFunc": projectstate.SignatureHelpStatusNoMatch,
	}
	if err := warningBroadcaster.broadcastWatchCodeWarnings(context.Background(), snapshot.Document, []string{"project-alpha"}, attempts); err != nil {
		t.Fatalf("broadcast watch code warning: %v", err)
	}

	envelope := readAppRouteEnvelopeUntilType(t, harness.conn, realtime.MessageTypeNotification, 4)
	var notification realtime.NotificationContent
	if err := json.Unmarshal(envelope.Content, &notification); err != nil {
		t.Fatalf("decode notification content: %v", err)
	}
	if notification.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha warning notification, got %#v", notification)
	}
	if notification.Type != realtime.NotificationTypeWarning {
		t.Fatalf("expected warning notification type, got %#v", notification)
	}
	if notification.Message != "Watch Code could not resolve params for MissingFunc. Verify the module import path or add imports in gen code prefix." {
		t.Fatalf("unexpected warning notification %#v", notification)
	}
	if !notification.Temporary {
		t.Fatalf("expected temporary warning notification, got %#v", notification)
	}
	if notification.Timestamp == "" {
		t.Fatalf("expected warning notification timestamp, got %#v", notification)
	}

	if err := warningBroadcaster.broadcastWatchCodeWarnings(context.Background(), snapshot.Document, []string{"project-alpha"}, attempts); err != nil {
		t.Fatalf("broadcast duplicate watch code warning: %v", err)
	}

	assertNoAppRouteEnvelopeOfType(t, harness.conn, realtime.MessageTypeNotification, 750*time.Millisecond)
}

func TestAppWatchCodeFileUpdatesBroadcastProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppWatchCodeProviderFixture(t, cfg)

	watchDir := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg")
	if err := os.MkdirAll(watchDir, 0o755); err != nil {
		t.Fatalf("mkdir watch dir: %v", err)
	}

	app := newAppWebsocketBroadcastTestApp(t, cfg)

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  json.RawMessage(`{"language":"python"}`),
				},
			},
		}
		setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
			Folders: []projectstate.WatchCodeFolder{
				{Path: "pkg", Recursive: false},
			},
		})
		return document, nil
	}); err != nil {
		t.Fatalf("seed watch code project: %v", err)
	}
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save watch code project: %v", err)
	}

	harness := newAppWebsocketMutationHarnessForApp(t, app)

	watchFile := filepath.Join(watchDir, "created.py")
	if err := os.WriteFile(watchFile, []byte("def created(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write watched file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(_ projectstate.Project, projectData projectstate.WatchCodePluginProjectData) bool {
		entry, ok := projectData.Registry["pkg.created.created:function"]
		return ok && len(entry.SectionIDs) == 1 && entry.SectionsCount == 1
	})

	createEnvelope := readAppRouteEnvelopeUntilType(t, harness.conn, realtime.MessageTypeUpdateFrontendProjectState, 6)
	var createContent realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(createEnvelope.Content, &createContent); err != nil {
		t.Fatalf("decode create project state update content: %v", err)
	}
	if createContent.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha create state update, got %q", createContent.ProjectState.ProjectConfig.ID)
	}
	createWatchCodeData := mustAppWebsocketWatchCodeProjectData(t, createContent.ProjectState.PluginData)
	createEntry, ok := createWatchCodeData.Registry["pkg.created.created:function"]
	if !ok {
		t.Fatalf("expected watch code registry entry in websocket update, got %#v", createWatchCodeData.Registry)
	}
	if len(createEntry.SectionIDs) != 1 {
		t.Fatalf("expected one created section id in websocket update, got %#v", createEntry)
	}
	createdSectionID := createEntry.SectionIDs[0]
	if _, ok := createContent.ProjectState.Sections[createdSectionID]; !ok {
		t.Fatalf("expected created section %q in websocket update, got %#v", createdSectionID, createContent.ProjectState.Sections)
	}

	if err := os.Remove(watchFile); err != nil {
		t.Fatalf("remove watched file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(_ projectstate.Project, projectData projectstate.WatchCodePluginProjectData) bool {
		return len(projectData.Registry) == 0
	})

	deleteEnvelope := readAppRouteEnvelopeUntilType(t, harness.conn, realtime.MessageTypeUpdateFrontendProjectState, 6)
	var deleteContent realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(deleteEnvelope.Content, &deleteContent); err != nil {
		t.Fatalf("decode delete project state update content: %v", err)
	}
	if deleteContent.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha delete state update, got %q", deleteContent.ProjectState.ProjectConfig.ID)
	}
	deleteWatchCodeData := mustAppWebsocketWatchCodeProjectData(t, deleteContent.ProjectState.PluginData)
	if len(deleteWatchCodeData.Registry) != 0 {
		t.Fatalf("expected empty watch code registry after delete, got %#v", deleteWatchCodeData.Registry)
	}
	if _, ok := deleteContent.ProjectState.Sections[createdSectionID]; ok {
		t.Fatalf("expected deleted watch code section %q to be absent, got %#v", createdSectionID, deleteContent.ProjectState.Sections[createdSectionID])
	}
}

func TestAppSetSectionNameRouteBroadcastsRenamePromptAndProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app := newAppWebsocketBroadcastTestApp(t, cfg)

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = renameRefactorServiceTestProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed rename refactor project: %v", err)
	}
	if _, err := app.SettingsState().Mutate(func(document settingsstate.Document) (settingsstate.Document, error) {
		next := renameRefactorSettingsDocument(t, projectstate.RenameRefactorModeAlwaysAsk)
		return next, nil
	}); err != nil {
		t.Fatalf("seed rename refactor settings: %v", err)
	}

	harness := newAppWebsocketMutationHarnessForApp(t, app)
	response := postAppRouteJSONOK(
		t,
		harness,
		httpapi.RouteSetSectionName,
		`{"projectConfigId":"project-alpha","sectionId":"source","name":"Renamed Section","frontendOpId":"rename-op-1"}`,
	)
	response.Body.Close()

	_, prompt := readAppRenameRefactorBroadcasts(t, harness, "project-alpha", "rename-op-1")
	if prompt.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha rename prompt, got %q", prompt.ProjectConfigID)
	}
	if prompt.FrontendOpID != "rename-op-1" {
		t.Fatalf("expected rename-op-1 prompt, got %q", prompt.FrontendOpID)
	}
	if prompt.RenameMode != projectstate.RenameRefactorModeAlwaysAsk {
		t.Fatalf("expected ALWAYS_ASK rename mode, got %q", prompt.RenameMode)
	}
	if len(prompt.ChangedNodeValues) != 1 {
		t.Fatalf("expected one changed node value, got %#v", prompt.ChangedNodeValues)
	}
	if prompt.ChangedNodeValues[0].NewValue != "state.Renamed_Section + state.Renamed_Section" {
		t.Fatalf("unexpected rename prompt new value %q", prompt.ChangedNodeValues[0].NewValue)
	}
}

func TestAppSetStateMachineSectionSettingsRouteBroadcastsProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app := newAppWebsocketBroadcastTestApp(t, cfg)

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = websocketStateMachineTestProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed workflow project: %v", err)
	}

	harness := newAppWebsocketMutationHarnessForApp(t, app)
	response := postAppRouteJSONOK(
		t,
		harness,
		httpapi.RouteSetStateMachineSectionSettings,
		`{"projectConfigId":"project-alpha","sectionId":"gate-section","machineGroupId":"workflow-a","label":"Decision","gateType":"XOR","frontendOpId":"workflow-section-op"}`,
	)
	response.Body.Close()

	// The overview pane does not apply a local optimistic patch for this toggle,
	// so the websocket update is what clears the stale eye/hide affordances live.
	content := readAppProjectStateUpdate(t, harness, "project-alpha", "workflow-section-op", "workflow section settings", 4)
	if len(content.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending op ids after successful workflow update, got %#v", content.PendingOpIDs)
	}
}

func TestAppChildSectionIncrementerRoutesBroadcastProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app := newAppWebsocketBroadcastTestApp(t, cfg)

	project, listRootID := websocketIncrementerTestProject(t)
	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("seed incrementer project: %v", err)
	}

	harness := newAppWebsocketMutationHarnessForApp(t, app)
	createResponse := postAppRouteJSONOK(
		t,
		harness,
		httpapi.RouteCreateChildSectionsViaIncrementer,
		`{"projectConfigId":"project-alpha","calledBy":"`+listRootID+`","implType":"Callable","numChildren":1,"frontendOpId":"incrementer-op-create"}`,
	)
	createResponse.Body.Close()
	createContent := readAppProjectStateUpdate(t, harness, "project-alpha", "incrementer-op-create", "incrementer create", 4)
	childCountAfterCreate := countAppProjectStateChildrenForParent(createContent.ProjectState.ParentSectionMap, listRootID)
	if childCountAfterCreate != 1 {
		t.Fatalf("expected one live child after incrementer create, got %d in %#v", childCountAfterCreate, createContent.ProjectState.ParentSectionMap)
	}

	deleteResponse := postAppRouteJSONOK(
		t,
		harness,
		httpapi.RouteDeleteChildSectionsViaDecrementer,
		`{"projectConfigId":"project-alpha","calledBy":"`+listRootID+`","numChildren":1,"frontendOpId":"incrementer-op-delete"}`,
	)
	deleteResponse.Body.Close()
	deleteContent := readAppProjectStateUpdate(t, harness, "project-alpha", "incrementer-op-delete", "incrementer delete", 4)
	childCountAfterDelete := countAppProjectStateChildrenForParent(deleteContent.ProjectState.ParentSectionMap, listRootID)
	if childCountAfterDelete != 0 {
		t.Fatalf("expected no live children after incrementer delete, got %d in %#v", childCountAfterDelete, deleteContent.ProjectState.ParentSectionMap)
	}
	listRootVariantID, ok := project.SectionVariantMap[listRootID]
	if !ok {
		t.Fatalf("expected list root variant for %q", listRootID)
	}
	listRootVariant, ok := project.SectionVariants[listRootVariantID]
	if !ok {
		t.Fatalf("expected list root variant %q", listRootVariantID)
	}
	listRootPayload, ok := deleteContent.ProjectState.SectionImpls[listRootVariant.ImplID]
	if !ok {
		t.Fatalf("expected list root impl payload %q after delete", listRootVariant.ImplID)
	}
	var listRootPayloadObject map[string]any
	if err := json.Unmarshal(listRootPayload, &listRootPayloadObject); err != nil {
		t.Fatalf("decode list root payload after delete: %v", err)
	}
	children, ok := listRootPayloadObject["children"].([]any)
	if !ok {
		t.Fatalf("expected list root children array after delete, got %#v", listRootPayloadObject["children"])
	}
	if len(children) != 0 {
		t.Fatalf("expected list root children to be empty after delete, got %#v", children)
	}
}

func TestAppCreateTopLevelSectionRouteBroadcastsProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	defaultWindowing := projectstate.DefaultProjectChatWindowingState()
	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:                   "project-alpha",
			Name:                 "Alpha",
			ProjectChatWindowing: &defaultWindowing,
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project: %v", err)
	}

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

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteCreateTopLevelSection,
		strings.NewReader(`{"projectConfigId":"project-alpha","implType":"Callable","frontendOpId":"create-top-level-op"}`),
	)
	if err != nil {
		t.Fatalf("new create top-level section request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post create top-level section: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200 from create top-level section, got %d with body %q", response.StatusCode, string(body))
	}

	var createResult projectstate.CreateTopLevelSectionResult
	if err := json.NewDecoder(response.Body).Decode(&createResult); err != nil {
		t.Fatalf("decode create top-level section response: %v", err)
	}
	if strings.TrimSpace(createResult.SectionID) == "" {
		t.Fatalf("expected created section id, got %#v", createResult)
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if _, ok := content.ProjectState.Sections[createResult.SectionID]; !ok {
		t.Fatalf("expected websocket update to include created section %q", createResult.SectionID)
	}
	completedCreateOp := false
	for _, completedOpID := range content.CompletedOpIDs {
		if completedOpID == "create-top-level-op" {
			completedCreateOp = true
			break
		}
	}
	if !completedCreateOp {
		t.Fatalf("expected completed create op in websocket update, got %#v", content.CompletedOpIDs)
	}
	if len(content.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending op ids after create, got %#v", content.PendingOpIDs)
	}
}

func TestAppDeleteSectionsRouteBroadcastsProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
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

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteDeleteSections,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionIds":["allowed-callable-section"],"frontendOpId":"delete-section-op"}`),
	)
	if err != nil {
		t.Fatalf("new delete sections request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post delete sections: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if _, ok := content.ProjectState.Sections["allowed-callable-section"]; ok {
		t.Fatalf("expected websocket update to remove deleted section, got %#v", content.ProjectState.Sections["allowed-callable-section"])
	}
	if _, ok := content.ProjectState.ProjectConfig.SectionVariantMap["allowed-callable-section"]; ok {
		t.Fatalf("expected websocket update to remove deleted section variant mapping, got %#v", content.ProjectState.ProjectConfig.SectionVariantMap)
	}
	if !containsAppString(content.CompletedOpIDs, "delete-section-op") {
		t.Fatalf("expected completed delete-section-op in websocket update, got %#v", content.CompletedOpIDs)
	}
	if len(content.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending op ids after delete, got %#v", content.PendingOpIDs)
	}
}

func TestAppSetCodeRouteBroadcastsProjectStateUpdateForWatchCodeBoundSection(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppWatchCodeProviderFixture(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	seedAppWatchCodeBoundSectionProject(t, app)

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

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-main","code":"def sorted(iterable):\n    return iterable\n","frontendOpId":"set-code-op"}`),
	)
	if err != nil {
		t.Fatalf("new set code request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if !containsAppString(content.CompletedOpIDs, "set-code-op") {
		t.Fatalf("expected completed set-code-op in websocket update, got %#v", content.CompletedOpIDs)
	}
	if len(content.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending op ids after set code, got %#v", content.PendingOpIDs)
	}
	watchCodeData := mustAppWebsocketWatchCodeProjectData(t, content.ProjectState.PluginData)
	entry, ok := watchCodeData.Registry["pkg.bound.sorted:function"]
	if !ok {
		t.Fatalf("expected websocket update to include derived watch code entry, got %#v", watchCodeData.Registry)
	}
	if len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
		t.Fatalf("expected websocket update to include one callable section binding, got %#v", entry)
	}
}

func mustAppWebsocketWatchCodeProjectData(
	t *testing.T,
	pluginData map[string]projectstate.RawJSON,
) projectstate.WatchCodePluginProjectData {
	t.Helper()

	payload, ok := pluginData[testAppWatchCodeProviderPluginID]
	if !ok {
		t.Fatalf("expected websocket update to include %q plugin data, got %#v", testAppWatchCodeProviderPluginID, pluginData)
	}
	var projectData projectstate.WatchCodePluginProjectData
	if err := json.Unmarshal(payload, &projectData); err != nil {
		t.Fatalf("decode watch code project plugin data: %v", err)
	}
	return projectData.Normalized()
}

func TestAppMoveSectionsRouteBroadcastsProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	project, dictSectionID, listSectionID := websocketMoveSectionsTestProject(t)
	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("seed move sections project: %v", err)
	}

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

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteMoveSections,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionIds":["`+listSectionID+`"],"newParentId":"`+dictSectionID+`","newIndex":0,"frontendOpId":"move-sections-op"}`),
	)
	if err != nil {
		t.Fatalf("new move sections request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post move sections: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if !containsAppString(content.CompletedOpIDs, "move-sections-op") {
		t.Fatalf("expected completed move-sections-op in websocket update, got %#v", content.CompletedOpIDs)
	}
	if len(content.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending op ids after move, got %#v", content.PendingOpIDs)
	}
	if parent := content.ProjectState.ParentSectionMap[listSectionID]; parent == nil || *parent != dictSectionID {
		t.Fatalf("expected moved list parent %q, got %#v", dictSectionID, parent)
	}

	dictVariantID := content.ProjectState.ProjectConfig.SectionVariantMap[dictSectionID]
	dictImplID := content.ProjectState.SectionVariants[dictVariantID].Impl
	var dictPayload struct {
		Children []string `json:"children"`
	}
	if err := json.Unmarshal(content.ProjectState.SectionImpls[dictImplID], &dictPayload); err != nil {
		t.Fatalf("decode dict impl payload: %v", err)
	}
	if len(dictPayload.Children) != 1 || dictPayload.Children[0] != listSectionID {
		t.Fatalf("expected moved list child in websocket update, got %#v", dictPayload.Children)
	}
}

func TestAppCreateNewSectionVariantRouteBroadcastsProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
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

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteCreateNewSectionVariant,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section","frontendOpId":"create-section-variant-op"}`),
	)
	if err != nil {
		t.Fatalf("new create section variant request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post create section variant: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if !containsAppString(content.CompletedOpIDs, "create-section-variant-op") {
		t.Fatalf("expected completed create-section-variant-op in websocket update, got %#v", content.CompletedOpIDs)
	}

	sectionCore := content.ProjectState.Sections["allowed-callable-section"]
	if len(sectionCore.Variants) < 2 {
		t.Fatalf("expected allowed-callable-section to gain a variant, got %#v", sectionCore.Variants)
	}
	activeVariantID := content.ProjectState.ProjectConfig.SectionVariantMap["allowed-callable-section"]
	if activeVariantID == "" {
		t.Fatal("expected active variant after section variant creation")
	}
	if got := content.ProjectState.SectionVariants[activeVariantID].Name; got == "" {
		t.Fatal("expected created section variant name in websocket update")
	}
}

func TestAppSetSectionVariantRouteBroadcastsProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = websocketSetSectionVariantCodegenProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed section variant codegen project: %v", err)
	}

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

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetSectionVariant,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"callable-section","variantId":"callable-variant-2","frontendOpId":"set-section-variant-op"}`),
	)
	if err != nil {
		t.Fatalf("new set section variant request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set section variant: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if !containsAppString(content.CompletedOpIDs, "set-section-variant-op") {
		t.Fatalf("expected completed set-section-variant-op in websocket update, got %#v", content.CompletedOpIDs)
	}
	if got := content.ProjectState.ProjectConfig.SectionVariantMap["callable-section"]; got != "callable-variant-2" {
		t.Fatalf("expected websocket update to select callable-variant-2, got %q", got)
	}
	generatedSectionID := content.ProjectState.SingletonSections.GenPythonCode
	if generatedSectionID == nil || *generatedSectionID == "" {
		t.Fatalf("expected generated python singleton in websocket update, got %#v", content.ProjectState.SingletonSections)
	}
	generatedVariantID := content.ProjectState.ProjectConfig.SectionVariantMap[*generatedSectionID]
	if generatedVariantID == "" {
		t.Fatalf("expected generated python variant mapping for %q", *generatedSectionID)
	}
	generatedImplID := content.ProjectState.SectionVariants[generatedVariantID].Impl
	payload := string(content.ProjectState.SectionImpls[generatedImplID])
	if !strings.Contains(payload, `sorted(`) {
		t.Fatalf("expected websocket update to include regenerated python for sorted variant, got %q", payload)
	}
}
