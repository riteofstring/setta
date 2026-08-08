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

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/notifications"
	"setta/internal/observability"
	"setta/internal/projectshell"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/terminals"
	"setta/internal/wsapi"

	"github.com/coder/websocket"
)

func TestAppServesProjectShellRenameAndNotificationRoutes(t *testing.T) {
	app, server, authCookie := newProjectShellLifecycleAppServer(t)
	notificationStore := seedProjectShellLifecycleNotification(t, app)

	renameResponse := postProjectShellLifecycleRoute(t, server.URL, authCookie, httpapi.RouteSetProjectConfigName, `{"projectConfigId":"project-alpha","newName":"Renamed Alpha"}`, "rename")
	defer renameResponse.Body.Close()
	assertProjectShellLifecyclePersistedProjectName(t, app, "Renamed Alpha")

	notificationsPayload := getProjectShellLifecycleNotifications(t, server.URL, authCookie)
	if len(notificationsPayload) != 1 || notificationsPayload[0].ID != "notification-1" {
		t.Fatalf("unexpected notifications payload %#v", notificationsPayload)
	}

	deletePayload := deleteProjectShellLifecycleNotification(t, server.URL, authCookie, "notification-1")
	if !deletePayload.Success {
		t.Fatalf("expected delete notification success true, got %#v", deletePayload)
	}
	assertProjectShellLifecycleNotificationsDeleted(t, notificationStore)
}

func seedProjectShellLifecycleNotification(t *testing.T, app *App) *notifications.Store {
	t.Helper()

	notificationStore, err := notifications.NewStore(app.Config().Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new notification store: %v", err)
	}
	if err := notificationStore.Write([]notifications.Notification{{
		ID:              "notification-1",
		ProjectConfigID: "project-alpha",
		Type:            realtime.NotificationTypeInfo,
		Message:         "Alpha note",
		Timestamp:       "2026-03-10T10:00:00Z",
	}}); err != nil {
		t.Fatalf("seed notifications: %v", err)
	}
	return notificationStore
}

func assertProjectShellLifecyclePersistedProjectName(t *testing.T, app *App, expected string) {
	t.Helper()

	persistedDocumentStore, err := projectstate.NewStore(app.ProjectStates().Paths().Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted project store: %v", err)
	}
	persistedDocument, err := persistedDocumentStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document: %v", err)
	}
	if got := persistedDocument.Projects["project-alpha"].Name; got != expected {
		t.Fatalf("expected persisted renamed project %q, got %q", expected, got)
	}
}

func getProjectShellLifecycleNotifications(t *testing.T, serverURL string, authCookie *http.Cookie) []notifications.Notification {
	t.Helper()

	getNotificationsResponse := postProjectShellLifecycleRoute(t, serverURL, authCookie, httpapi.RouteGetNotifications, `{"projectConfigId":"project-alpha"}`, "get notifications")
	defer getNotificationsResponse.Body.Close()
	var notificationsPayload []notifications.Notification
	if err := json.NewDecoder(getNotificationsResponse.Body).Decode(&notificationsPayload); err != nil {
		t.Fatalf("decode notifications payload: %v", err)
	}
	return notificationsPayload
}

func deleteProjectShellLifecycleNotification(t *testing.T, serverURL string, authCookie *http.Cookie, notificationID string) httpapi.DeleteNotificationResponse {
	t.Helper()

	deleteNotificationResponse := postProjectShellLifecycleRoute(t, serverURL, authCookie, httpapi.RouteDeleteNotification, `{"notificationId":"`+notificationID+`"}`, "delete notification")
	defer deleteNotificationResponse.Body.Close()
	var deleteNotificationPayload httpapi.DeleteNotificationResponse
	if err := json.NewDecoder(deleteNotificationResponse.Body).Decode(&deleteNotificationPayload); err != nil {
		t.Fatalf("decode delete notification payload: %v", err)
	}
	return deleteNotificationPayload
}

func assertProjectShellLifecycleNotificationsDeleted(t *testing.T, notificationStore *notifications.Store) {
	t.Helper()

	remainingNotifications, err := notificationStore.List()
	if err != nil {
		t.Fatalf("list remaining notifications: %v", err)
	}
	if len(remainingNotifications) != 0 {
		t.Fatalf("expected deleted notifications, got %#v", remainingNotifications)
	}
}

func TestAppSetProjectConfigNameRouteBroadcastsProjectAndMetadataUpdates(t *testing.T) {
	_, server, authCookie := newProjectShellLifecycleAppServer(t)
	conn := dialProjectShellLifecycleFrontend(t, server.URL, authCookie)
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	renameResponse := postProjectShellLifecycleRoute(t, server.URL, authCookie, httpapi.RouteSetProjectConfigName, `{"projectConfigId":"project-alpha","newName":"Renamed Alpha"}`, "rename")
	defer renameResponse.Body.Close()
	assertProjectConfigRenameBroadcasts(t, conn)
	assertNoAppRouteEnvelopeOfType(t, conn, realtime.MessageTypeAllProjectMetadata, 250*time.Millisecond)
}

func assertProjectConfigRenameBroadcasts(t *testing.T, conn *websocket.Conn) {
	t.Helper()

	var (
		foundProjectUpdate  bool
		foundMetadataUpdate bool
	)
	for range 6 {
		envelope := readAppRouteEnvelope(t, conn)
		switch envelope.MessageType {
		case realtime.MessageTypeUpdateFrontendProjectState:
			var payload realtime.ProjectStateUpdateContent
			if err := json.Unmarshal(envelope.Content, &payload); err != nil {
				t.Fatalf("decode project update payload: %v", err)
			}
			if payload.ProjectState.ProjectConfig.ID != "project-alpha" {
				t.Fatalf("unexpected project update %#v", payload)
			}
			if payload.ProjectState.ProjectConfig.Name != "Renamed Alpha" {
				t.Fatalf("expected renamed project update, got %#v", payload)
			}
			foundProjectUpdate = true
		case realtime.MessageTypeAllProjectMetadata:
			var payload projectshell.AllProjectMetadata
			if err := json.Unmarshal(envelope.Content, &payload); err != nil {
				t.Fatalf("decode metadata update payload: %v", err)
			}
			if len(payload.ProjectMetadata) != 1 || payload.ProjectMetadata[0].Name != "Renamed Alpha" {
				t.Fatalf("unexpected metadata update %#v", payload)
			}
			foundMetadataUpdate = true
		}
		if foundProjectUpdate && foundMetadataUpdate {
			break
		}
	}

	if !foundProjectUpdate {
		t.Fatal("expected project-state websocket update after rename")
	}
	if !foundMetadataUpdate {
		t.Fatal("expected all-project-metadata websocket update after rename")
	}
}

func TestAppSetDefaultProjectRouteBroadcastsMetadataUpdate(t *testing.T) {
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
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		document.Projects["project-beta"] = projectstate.Project{
			ID:   "project-beta",
			Name: "Beta",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
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

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSetAsDefaultProject, strings.NewReader(`{"projectConfigId":"project-beta"}`))
	if err != nil {
		t.Fatalf("new set default request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("set default project: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected set default 200, got %d with body %q", response.StatusCode, string(body))
	}

	persistedDocumentStore, err := projectstate.NewStore(app.ProjectStates().Paths().Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted project store: %v", err)
	}
	persistedDocument, err := persistedDocumentStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document: %v", err)
	}
	if persistedDocument.DefaultProjectID != "project-beta" {
		t.Fatalf("expected persisted default project-beta, got %q", persistedDocument.DefaultProjectID)
	}

	metadataEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeAllProjectMetadata, 8)
	var metadataPayload projectshell.AllProjectMetadata
	if err := json.Unmarshal(metadataEnvelope.Content, &metadataPayload); err != nil {
		t.Fatalf("decode metadata payload: %v", err)
	}
	if metadataPayload.DefaultProjectConfigID == nil || *metadataPayload.DefaultProjectConfigID != "project-beta" {
		t.Fatalf("expected websocket default project-beta, got %#v", metadataPayload.DefaultProjectConfigID)
	}

	assertNoAppRouteEnvelopeOfType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 250*time.Millisecond)
}

func TestAppServesProjectShellLifecycleRoutes(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	app, server, authCookie := newProjectShellLifecycleAppServer(t)
	createdName := createProjectShellLifecycleConfig(t, server.URL, authCookie)
	persistedStore := newProjectShellLifecyclePersistedStore(t, app)

	currentDocument := app.ProjectStates().Main().Snapshot().Document
	createdProjectID := assertProjectShellLifecycleCreatedProject(t, currentDocument, createdName)

	mutateProjectShellLifecycleAlphaName(t, app)
	saveProjectShellLifecycleConfig(t, server.URL, authCookie)
	assertProjectShellLifecycleSavedAlpha(t, persistedStore)

	saveAsProjectShellLifecycleConfig(t, server.URL, authCookie)
	persistedDocument := loadProjectShellLifecycleDocument(t, persistedStore, "after save-as")
	clonedProjectID := assertProjectShellLifecycleClonedProject(t, persistedDocument)

	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         "delete-project-terminal",
		ProjectID:  clonedProjectID,
		AllowInput: false,
	}); err != nil {
		t.Fatalf("open terminal session: %v", err)
	}
	if _, ok := app.Terminals().Session("delete-project-terminal"); !ok {
		t.Fatal("expected terminal session to exist before delete")
	}

	deleteProjectShellLifecycleConfig(t, server.URL, authCookie, clonedProjectID)
	assertProjectShellLifecycleDelete(t, app, persistedStore, clonedProjectID, createdProjectID)
}

func newProjectShellLifecycleAppServer(t *testing.T) (*App, *httptest.Server, *http.Cookie) {
	t.Helper()

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

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
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = appProjectShellTestProjectWithWindowing()
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	t.Cleanup(server.Close)
	authCookie := newAppTestAuthCookie(t, app)
	return app, server, authCookie
}

func createProjectShellLifecycleConfig(t *testing.T, serverURL string, authCookie *http.Cookie) string {
	t.Helper()

	response := postProjectShellLifecycleRoute(t, serverURL, authCookie, httpapi.RouteCreateProjectConfig, `{"previewImgColor":"bg-orange-500/60 dark:bg-orange-600/30"}`, "create")
	defer response.Body.Close()
	var createdName string
	if err := json.NewDecoder(response.Body).Decode(&createdName); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if createdName == "" {
		t.Fatal("expected non-empty created name")
	}
	return createdName
}

func newProjectShellLifecyclePersistedStore(t *testing.T, app *App) *projectstate.Store {
	t.Helper()

	persistedStore, err := projectstate.NewStore(app.ProjectStates().Paths().Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted project store: %v", err)
	}
	return persistedStore
}

func assertProjectShellLifecycleCreatedProject(t *testing.T, document projectstate.Document, createdName string) string {
	t.Helper()

	for projectID, project := range document.Projects {
		if project.Name == createdName {
			if len(project.ViewModes) != 1 {
				t.Fatalf("expected created project to have one view mode, got %#v", project.ViewModes)
			}
			assertAppDefaultGeneratedPythonProjectScaffold(t, project)
			return projectID
		}
	}
	t.Fatalf("expected created project in %#v", document.Projects)
	return ""
}

func mutateProjectShellLifecycleAlphaName(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		if err := document.SetProjectName("project-alpha", "Unsaved Alpha"); err != nil {
			return projectstate.Document{}, err
		}
		return document, nil
	}); err != nil {
		t.Fatalf("mutate runtime before save: %v", err)
	}
}

func saveProjectShellLifecycleConfig(t *testing.T, serverURL string, authCookie *http.Cookie) {
	t.Helper()

	response := postProjectShellLifecycleRoute(t, serverURL, authCookie, httpapi.RouteSaveProject, `{"projectConfigId":"project-alpha"}`, "save")
	defer response.Body.Close()
}

func assertProjectShellLifecycleSavedAlpha(t *testing.T, persistedStore *projectstate.Store) {
	t.Helper()

	persistedDocument := loadProjectShellLifecycleDocument(t, persistedStore, "after save")
	if got := persistedDocument.Projects["project-alpha"].Name; got != "Unsaved Alpha" {
		t.Fatalf("expected persisted Unsaved Alpha, got %q", got)
	}
}

func saveAsProjectShellLifecycleConfig(t *testing.T, serverURL string, authCookie *http.Cookie) {
	t.Helper()

	response := postProjectShellLifecycleRoute(t, serverURL, authCookie, httpapi.RouteSaveAsNewProjectConfig, `{"projectConfigId":"project-alpha","newConfigName":"Cloned Alpha","withRefs":true}`, "save-as")
	defer response.Body.Close()
}

func assertProjectShellLifecycleClonedProject(t *testing.T, persistedDocument projectstate.Document) string {
	t.Helper()

	clonedProjectID := ""
	for projectID, project := range persistedDocument.Projects {
		if project.Name == "Cloned Alpha" {
			clonedProjectID = projectID
		}
	}
	if clonedProjectID == "" {
		t.Fatalf("expected cloned project in %#v", persistedDocument.Projects)
	}
	clonedProject := persistedDocument.Projects[clonedProjectID]
	if clonedProject.ProjectChatWindowing == nil {
		t.Fatal("expected cloned live windowing state")
	}
	if len(clonedProject.ProjectChatWindowing.Order) != 0 || clonedProject.ProjectChatWindowing.NextInstanceNumber != 1 {
		t.Fatalf("expected withRefs save-as to seed empty live windowing, got %#v", clonedProject.ProjectChatWindowing)
	}
	if clonedProject.WindowSpaces["space-1"].WindowsByID["chat-window"].ChatID != nil {
		t.Fatalf("expected saved window-space chat id cleared, got %#v", clonedProject.WindowSpaces["space-1"].WindowsByID["chat-window"].ChatID)
	}
	return clonedProjectID
}

func deleteProjectShellLifecycleConfig(t *testing.T, serverURL string, authCookie *http.Cookie, projectID string) {
	t.Helper()

	response := postProjectShellLifecycleRoute(t, serverURL, authCookie, httpapi.RouteDeleteProjectConfigs, `{"ids":["`+projectID+`"]}`, "delete")
	defer response.Body.Close()
}

func assertProjectShellLifecycleDelete(t *testing.T, app *App, persistedStore *projectstate.Store, clonedProjectID string, createdProjectID string) {
	t.Helper()

	if _, ok := app.Terminals().Session("delete-project-terminal"); ok {
		t.Fatal("expected project delete to reclaim terminal session")
	}

	persistedDocument := loadProjectShellLifecycleDocument(t, persistedStore, "after delete")
	if _, ok := persistedDocument.Projects[clonedProjectID]; ok {
		t.Fatalf("expected deleted project removed from persisted document, got %#v", persistedDocument.Projects)
	}
	if _, ok := persistedDocument.Projects[createdProjectID]; !ok {
		t.Fatalf("expected created project to remain after delete, got %#v", persistedDocument.Projects)
	}
}

func postProjectShellLifecycleRoute(t *testing.T, serverURL string, authCookie *http.Cookie, route string, body string, label string) *http.Response {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+route, strings.NewReader(body))
	if err != nil {
		t.Fatalf("new %s request: %v", label, err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("%s project config: %v", label, err)
	}
	if response.StatusCode != http.StatusOK {
		responseBody, _ := io.ReadAll(response.Body)
		_ = response.Body.Close()
		t.Fatalf("expected %s 200, got %d with body %q", label, response.StatusCode, string(responseBody))
	}
	return response
}

func loadProjectShellLifecycleDocument(t *testing.T, persistedStore *projectstate.Store, label string) projectstate.Document {
	t.Helper()

	persistedDocument, err := persistedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document %s: %v", label, err)
	}
	return persistedDocument
}

func TestAppCreateProjectConfigRouteIgnoresLSPInitializationFailure(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("SETTA_LSP_COMMAND", "true")
	t.Setenv("SETTA_LSP_ARGS", "")

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	// Project creation should not fail just because diagnostics cannot start.
	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = appProjectShellTestProjectWithWindowing()
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	createRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteCreateProjectConfig, strings.NewReader(`{"previewImgColor":"bg-orange-500/60 dark:bg-orange-600/30"}`))
	if err != nil {
		t.Fatalf("new create request: %v", err)
	}
	createRequest.Header.Set("Content-Type", "application/json")
	createRequest.AddCookie(authCookie)

	createResponse, err := http.DefaultClient.Do(createRequest)
	if err != nil {
		t.Fatalf("create project config: %v", err)
	}
	defer createResponse.Body.Close()
	if createResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(createResponse.Body)
		t.Fatalf("expected create 200 when lsp init fails, got %d with body %q", createResponse.StatusCode, string(body))
	}

	var createdName string
	if err := json.NewDecoder(createResponse.Body).Decode(&createdName); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if createdName == "" {
		t.Fatal("expected non-empty created name")
	}

	persistedStore, err := projectstate.NewStore(app.ProjectStates().Paths().Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted project store: %v", err)
	}
	var persistedDocument projectstate.Document

	foundCreatedProject := false
	for _, project := range app.ProjectStates().Main().Snapshot().Document.Projects {
		if project.Name == createdName {
			foundCreatedProject = true
			break
		}
	}
	if !foundCreatedProject {
		t.Fatalf("expected created project %q in %#v", createdName, app.ProjectStates().Main().Snapshot().Document.Projects)
	}

	if err := app.ProjectStates().Main().Close(); err != nil {
		t.Fatalf("close main project runtime: %v", err)
	}
	persistedDocument, err = persistedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document after close: %v", err)
	}
	for _, project := range persistedDocument.Projects {
		if project.Name == createdName {
			return
		}
	}
	t.Fatalf("expected persisted created project %q in %#v", createdName, persistedDocument.Projects)
}

func TestAppProjectRuntimeCreateProjectDefaultScaffold(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	snapshot, createdProjectID, _, err := app.ProjectStates().Main().CreateProject(
		context.Background(),
		"bg-orange-500/60 dark:bg-orange-600/30",
	)
	if err != nil {
		t.Fatalf("create project through app runtime: %v", err)
	}
	project, err := snapshot.Document.ProjectByID(createdProjectID)
	if err != nil {
		t.Fatalf("lookup created project: %v", err)
	}
	assertAppDefaultGeneratedPythonProjectScaffold(t, project)
}

func TestAppProjectRuntimeCreateProjectDefaultScaffoldOnRepoWorkspace(t *testing.T) {
	repoRoot := appTestRepoRoot(t)
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Paths.WorkspaceRoot = repoRoot
	cfg.Paths.SettaHome = filepath.Join(t.TempDir(), ".setta-development")
	cfg.Paths.ProfileLookupHome = cfg.Paths.SettaHome
	cfg.Paths.SettaFilesRoot = filepath.Join(t.TempDir(), "setta_files_dev")
	cfg.Paths.RuntimeRoot = filepath.Join(cfg.Paths.SettaFilesRoot, "runtime")
	cfg.User.GlobalSettaFilesBase = filepath.Join(cfg.Paths.SettaHome, "setta_files")

	copyAppTestDir(t, filepath.Join(repoRoot, "setta_files_dev"), cfg.Paths.SettaFilesRoot)
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	snapshot, createdProjectID, _, err := app.ProjectStates().Main().CreateProject(
		context.Background(),
		"bg-orange-500/60 dark:bg-orange-600/30",
	)
	if err != nil {
		t.Fatalf("create project through repo workspace runtime: %v", err)
	}
	project, err := snapshot.Document.ProjectByID(createdProjectID)
	if err != nil {
		t.Fatalf("lookup created project: %v", err)
	}
	assertAppDefaultGeneratedPythonProjectScaffold(t, project)
}

func assertAppDefaultGeneratedPythonProjectScaffold(t *testing.T, project projectstate.Project) {
	t.Helper()

	if len(project.CodegenTargets) != 1 || project.CodegenTargets[0].Language != string(projectstate.CodeLanguagePython) {
		t.Fatalf("expected created project to persist the default python codegen target, got %#v", project.CodegenTargets)
	}
	if project.GeneratedCodeBinding == nil {
		t.Fatal("expected created project generated code binding")
	}
	if project.GeneratedCodeBinding.Path != projectstate.GeneratedPythonCodeRelativePath(project.Name) {
		t.Fatalf("unexpected created project generated code path %q", project.GeneratedCodeBinding.Path)
	}
	if len(project.TopLevelSectionIDs) != 1 || len(project.TopLevelSections) != 1 {
		t.Fatalf("expected created project to persist one top-level generated section, got ids=%#v layouts=%#v", project.TopLevelSectionIDs, project.TopLevelSections)
	}
	sectionID := project.TopLevelSectionIDs[0]
	section, ok := project.Sections[sectionID]
	if !ok {
		t.Fatalf("expected persisted created section %q, got %#v", sectionID, project.Sections)
	}
	if section.Name != projectstate.GeneratedPythonCodeSectionName {
		t.Fatalf(
			"expected persisted created section name %q, got %q",
			projectstate.GeneratedPythonCodeSectionName,
			section.Name,
		)
	}
	variant, ok := project.SectionVariants[section.DefaultVariantID]
	if !ok {
		t.Fatalf("expected generated python variant %q, got %#v", section.DefaultVariantID, project.SectionVariants)
	}
	impl, ok := project.SectionImpls[variant.ImplID]
	if !ok {
		t.Fatalf("expected generated python impl %q, got %#v", variant.ImplID, project.SectionImpls)
	}
	if !strings.Contains(string(impl.Payload), "class SettaState:") {
		t.Fatalf("expected generated python payload to include wrapper class, got %q", string(impl.Payload))
	}
	if !strings.Contains(string(impl.Payload), "pass") {
		t.Fatalf("expected generated python payload to include empty-body pass, got %q", string(impl.Payload))
	}
	if project.ProjectChatWindowing == nil {
		t.Fatal("expected persisted created project chat windowing state")
	}
	if len(project.ProjectChatWindowing.InstancesByID) != 0 {
		t.Fatalf("expected no created project chat windows, got %#v", project.ProjectChatWindowing.InstancesByID)
	}
	if len(project.ProjectChatWindowing.Order) != 0 {
		t.Fatalf("expected empty created project chat window order, got %#v", project.ProjectChatWindowing.Order)
	}
	if project.ProjectChatWindowing.NextInstanceNumber != 1 {
		t.Fatalf("expected next instance number 1, got %d", project.ProjectChatWindowing.NextInstanceNumber)
	}
}

func TestAppProjectShellLifecycleRoutesBroadcastMetadataAndSaveNotification(t *testing.T) {
	_, server, authCookie := newProjectShellLifecycleAppServer(t)
	conn := dialProjectShellLifecycleFrontend(t, server.URL, authCookie)
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	createResponse := postProjectShellLifecycleRoute(t, server.URL, authCookie, httpapi.RouteCreateProjectConfig, `{"previewImgColor":"bg-orange-500/60 dark:bg-orange-600/30"}`, "create")
	defer createResponse.Body.Close()
	assertProjectShellBroadcastMetadataCount(t, readProjectShellLifecycleMetadata(t, conn, "create"), 2)

	saveAsResponse := postProjectShellLifecycleRoute(t, server.URL, authCookie, httpapi.RouteSaveAsNewProjectConfig, `{"projectConfigId":"project-alpha","newConfigName":"Cloned Alpha","withRefs":true}`, "save-as")
	defer saveAsResponse.Body.Close()
	clonedProjectID := assertProjectShellBroadcastMetadataProject(t, readProjectShellLifecycleMetadata(t, conn, "save-as"), "Cloned Alpha")

	deleteResponse := postProjectShellLifecycleRoute(t, server.URL, authCookie, httpapi.RouteDeleteProjectConfigs, `{"ids":["`+clonedProjectID+`"]}`, "delete")
	defer deleteResponse.Body.Close()
	assertProjectShellBroadcastMetadataAbsent(t, readProjectShellLifecycleMetadata(t, conn, "delete"), "Cloned Alpha")

	saveResponse := postProjectShellLifecycleRoute(t, server.URL, authCookie, httpapi.RouteSaveProject, `{"projectConfigId":"project-alpha"}`, "save")
	defer saveResponse.Body.Close()
	assertProjectShellBroadcastSaveNotification(t, conn)
}

func dialProjectShellLifecycleFrontend(t *testing.T, serverURL string, authCookie *http.Cookie) *websocket.Conn {
	t.Helper()

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(serverURL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	return conn
}

func readProjectShellLifecycleMetadata(t *testing.T, conn *websocket.Conn, label string) projectshell.AllProjectMetadata {
	t.Helper()

	metadataEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeAllProjectMetadata, 8)
	var payload projectshell.AllProjectMetadata
	if err := json.Unmarshal(metadataEnvelope.Content, &payload); err != nil {
		t.Fatalf("decode %s metadata payload: %v", label, err)
	}
	return payload
}

func assertProjectShellBroadcastMetadataCount(t *testing.T, payload projectshell.AllProjectMetadata, expected int) {
	t.Helper()

	if len(payload.ProjectMetadata) != expected {
		t.Fatalf("expected %d projects in metadata, got %#v", expected, payload.ProjectMetadata)
	}
}

func assertProjectShellBroadcastMetadataProject(t *testing.T, payload projectshell.AllProjectMetadata, name string) string {
	t.Helper()

	for _, metadata := range payload.ProjectMetadata {
		if metadata.Name == name {
			return metadata.ID
		}
	}
	t.Fatalf("expected %s in metadata %#v", name, payload.ProjectMetadata)
	return ""
}

func assertProjectShellBroadcastMetadataAbsent(t *testing.T, payload projectshell.AllProjectMetadata, name string) {
	t.Helper()

	for _, metadata := range payload.ProjectMetadata {
		if metadata.Name == name {
			t.Fatalf("did not expect deleted project in metadata %#v", payload.ProjectMetadata)
		}
	}
}

func assertProjectShellBroadcastSaveNotification(t *testing.T, conn *websocket.Conn) {
	t.Helper()

	notificationEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeNotification, 4)
	var notificationPayload realtime.NotificationContent
	if err := json.Unmarshal(notificationEnvelope.Content, &notificationPayload); err != nil {
		t.Fatalf("decode save notification payload: %v", err)
	}
	if notificationPayload.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected save notification for project-alpha, got %#v", notificationPayload)
	}
	if notificationPayload.Type != realtime.NotificationTypeSave {
		t.Fatalf("expected save notification type, got %#v", notificationPayload)
	}
	if notificationPayload.Message != "Saved!" {
		t.Fatalf("unexpected save notification payload %#v", notificationPayload)
	}
	if notificationPayload.Temporary {
		t.Fatalf("expected non-temporary save notification, got %#v", notificationPayload)
	}
	if notificationPayload.Timestamp == "" {
		t.Fatalf("expected save notification timestamp, got %#v", notificationPayload)
	}
}

func TestAppDeleteProjectConfigsSyncsWatchCodeServiceConfigs(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppWatchCodeProviderFixture(t, cfg)

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: string(projectstate.CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
			"project-beta": {
				ID:   "project-beta",
				Name: "Beta",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: string(projectstate.CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}
	setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
		Files: []string{"pkg/alpha.py"},
	})
	setAppWatchCodePluginProjectData(t, &document, "project-beta", projectstate.WatchCodePluginProjectData{
		Folders: []projectstate.WatchCodeFolder{
			{Path: "pkg/beta", Recursive: true},
		},
	})
	if err := saveAppMainProjectDocument(t, cfg, document); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
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

	betaDir := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg", "beta")
	if err := os.MkdirAll(betaDir, 0o755); err != nil {
		t.Fatalf("mkdir beta dir: %v", err)
	}
	betaFile := filepath.Join(betaDir, "beta.py")
	if err := os.WriteFile(betaFile, []byte("def beta(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write beta watched file: %v", err)
	}

	waitForAppWatchCodeCallable(t, app, "project-beta", "pkg.beta.beta.beta:function", betaFile)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	deleteRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteDeleteProjectConfigs, strings.NewReader(`{"ids":["project-beta"]}`))
	if err != nil {
		t.Fatalf("new delete request: %v", err)
	}
	deleteRequest.Header.Set("Content-Type", "application/json")
	deleteRequest.AddCookie(authCookie)

	deleteResponse, err := http.DefaultClient.Do(deleteRequest)
	if err != nil {
		t.Fatalf("delete project configs: %v", err)
	}
	defer deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deleteResponse.Body)
		t.Fatalf("expected delete 200, got %d with body %q", deleteResponse.StatusCode, string(body))
	}

	waitForAppProjectMissing(t, app, "project-beta")

	alphaDir := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg")
	if err := os.MkdirAll(alphaDir, 0o755); err != nil {
		t.Fatalf("mkdir alpha dir: %v", err)
	}
	alphaFile := filepath.Join(alphaDir, "alpha.py")
	if err := os.WriteFile(alphaFile, []byte("def alpha(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write alpha watched file: %v", err)
	}

	waitForAppWatchCodeCallable(t, app, "project-alpha", "pkg.alpha.alpha:function", alphaFile)
}

func appProjectShellTestProjectWithWindowing() projectstate.Project {
	return projectstate.Project{
		ID:                      "project-alpha",
		Name:                    "Alpha",
		AllowJSONSourceKeyEdits: true,
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID:   "focus",
				Name: "Focus",
			},
		},
		ActiveViewModeID: "focus",
		WindowSpaces: map[string]projectstate.WindowSpaceConfig{
			"space-1": {
				ID:        "space-1",
				Name:      "Copied Layout",
				SortIndex: 0,
				Order:     []string{"chat-window"},
				WindowsByID: map[string]projectstate.WindowSpaceWindow{
					"chat-window": {
						SurfaceKind:      projectstate.WindowSpaceSurfaceKindProjectChat,
						Mode:             projectstate.ChatWindowModeProjectAI,
						Title:            appProjectShellTestStringPointer("Project Chat"),
						ChatID:           appProjectShellTestStringPointer("saved-chat"),
						ZIndex:           2,
						NormalizedBounds: projectstate.NormalizedFloatingWindowBounds{X: 0.1, Y: 0.2, Width: 0.5, Height: 0.4},
					},
				},
			},
		},
		ProjectChatWindowing: &projectstate.ProjectChatWindowingState{
			InstancesByID: map[string]projectstate.ProjectChatWindowInstance{
				"project-window": {
					InstanceID: "project-window",
					Placement:  projectstate.ChatWindowPlacementFloating,
					Mode:       projectstate.ChatWindowModeProjectAI,
					Title:      appProjectShellTestStringPointer("Project Chat"),
					ChatID:     appProjectShellTestStringPointer("live-chat"),
					ZIndex:     4,
					Bounds: projectstate.ChatWindowBounds{
						X:      48,
						Y:      64,
						Width:  520,
						Height: 360,
					},
				},
			},
			Order:              []string{"project-window"},
			NextInstanceNumber: 3,
		},
	}
}

func appProjectShellTestStringPointer(value string) *string {
	return &value
}

func writeRawProjectStateDocument(t *testing.T, path string, document projectstate.Document) {
	t.Helper()

	content, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		t.Fatalf("marshal raw project state document: %v", err)
	}
	content = append(content, '\n')
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write raw project state document: %v", err)
	}
}
