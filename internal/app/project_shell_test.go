package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/notifications"
	"setta/internal/observability"
	"setta/internal/projectshell"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
	"setta/internal/terminals"
	"setta/internal/wsapi"
)

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

func TestAppServesProjectShellRenameAndNotificationRoutes(t *testing.T) {
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
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	notificationStore, err := notifications.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new notification store: %v", err)
	}
	if err := notificationStore.Write([]notifications.Notification{
		{
			ID:              "notification-1",
			ProjectConfigID: "project-alpha",
			Type:            notifications.TypeInfo,
			Message:         "Alpha note",
			Timestamp:       "2026-03-10T10:00:00Z",
		},
	}); err != nil {
		t.Fatalf("seed notifications: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	renameRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSetProjectConfigName, strings.NewReader(`{"projectConfigId":"project-alpha","newName":"Renamed Alpha"}`))
	if err != nil {
		t.Fatalf("new rename request: %v", err)
	}
	renameRequest.Header.Set("Content-Type", "application/json")
	renameRequest.AddCookie(authCookie)

	renameResponse, err := http.DefaultClient.Do(renameRequest)
	if err != nil {
		t.Fatalf("rename project config: %v", err)
	}
	defer renameResponse.Body.Close()
	if renameResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(renameResponse.Body)
		t.Fatalf("expected rename 200, got %d with body %q", renameResponse.StatusCode, string(body))
	}

	persistedDocumentStore, err := projectstate.NewStore(app.ProjectStates().Paths().Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted project store: %v", err)
	}
	persistedDocument, err := persistedDocumentStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document: %v", err)
	}
	if got := persistedDocument.Projects["project-alpha"].Name; got != "Renamed Alpha" {
		t.Fatalf("expected persisted renamed project, got %q", got)
	}

	getNotificationsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetNotifications, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	if err != nil {
		t.Fatalf("new get notifications request: %v", err)
	}
	getNotificationsRequest.Header.Set("Content-Type", "application/json")
	getNotificationsRequest.AddCookie(authCookie)

	getNotificationsResponse, err := http.DefaultClient.Do(getNotificationsRequest)
	if err != nil {
		t.Fatalf("get notifications: %v", err)
	}
	defer getNotificationsResponse.Body.Close()
	if getNotificationsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(getNotificationsResponse.Body)
		t.Fatalf("expected notifications 200, got %d with body %q", getNotificationsResponse.StatusCode, string(body))
	}

	var notificationsPayload []notifications.Notification
	if err := json.NewDecoder(getNotificationsResponse.Body).Decode(&notificationsPayload); err != nil {
		t.Fatalf("decode notifications payload: %v", err)
	}
	if len(notificationsPayload) != 1 || notificationsPayload[0].ID != "notification-1" {
		t.Fatalf("unexpected notifications payload %#v", notificationsPayload)
	}

	deleteNotificationRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteDeleteNotification, strings.NewReader(`{"notificationId":"notification-1"}`))
	if err != nil {
		t.Fatalf("new delete notification request: %v", err)
	}
	deleteNotificationRequest.Header.Set("Content-Type", "application/json")
	deleteNotificationRequest.AddCookie(authCookie)

	deleteNotificationResponse, err := http.DefaultClient.Do(deleteNotificationRequest)
	if err != nil {
		t.Fatalf("delete notification: %v", err)
	}
	defer deleteNotificationResponse.Body.Close()
	if deleteNotificationResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deleteNotificationResponse.Body)
		t.Fatalf("expected delete notification 200, got %d with body %q", deleteNotificationResponse.StatusCode, string(body))
	}

	remainingNotifications, err := notificationStore.List()
	if err != nil {
		t.Fatalf("list remaining notifications: %v", err)
	}
	if len(remainingNotifications) != 0 {
		t.Fatalf("expected deleted notifications, got %#v", remainingNotifications)
	}
}

func TestAppSetProjectConfigNameRouteBroadcastsProjectAndMetadataUpdates(t *testing.T) {
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

	renameRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSetProjectConfigName, strings.NewReader(`{"projectConfigId":"project-alpha","newName":"Renamed Alpha"}`))
	if err != nil {
		t.Fatalf("new rename request: %v", err)
	}
	renameRequest.Header.Set("Content-Type", "application/json")
	renameRequest.AddCookie(authCookie)

	renameResponse, err := http.DefaultClient.Do(renameRequest)
	if err != nil {
		t.Fatalf("rename project config: %v", err)
	}
	defer renameResponse.Body.Close()
	if renameResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(renameResponse.Body)
		t.Fatalf("expected rename 200, got %d with body %q", renameResponse.StatusCode, string(body))
	}

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

	assertNoAppRouteEnvelopeOfType(t, conn, realtime.MessageTypeAllProjectMetadata, 250*time.Millisecond)
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

	metadataEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeAllProjectMetadata, 4)
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
			ID:                      "project-alpha",
			Name:                    "Alpha",
			AllowJSONSourceKeyEdits: true,
		}
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
		t.Fatalf("expected create 200, got %d with body %q", createResponse.StatusCode, string(body))
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
	persistedDocument, err := persistedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document after create: %v", err)
	}

	createdProjectID := ""
	for projectID, project := range persistedDocument.Projects {
		if project.Name == createdName {
			createdProjectID = projectID
			if len(project.ViewModes) != 1 {
				t.Fatalf("expected created project to have one view mode, got %#v", project.ViewModes)
			}
		}
	}
	if createdProjectID == "" {
		t.Fatalf("expected created project in %#v", persistedDocument.Projects)
	}

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		if err := document.SetProjectName("project-alpha", "Unsaved Alpha"); err != nil {
			return projectstate.Document{}, err
		}
		return document, nil
	}); err != nil {
		t.Fatalf("mutate runtime before save: %v", err)
	}

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

	persistedDocument, err = persistedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document after save: %v", err)
	}
	if got := persistedDocument.Projects["project-alpha"].Name; got != "Unsaved Alpha" {
		t.Fatalf("expected persisted Unsaved Alpha, got %q", got)
	}

	saveAsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSaveAsNewProjectConfig, strings.NewReader(`{"projectConfigId":"project-alpha","newConfigName":"Cloned Alpha","withRefs":true}`))
	if err != nil {
		t.Fatalf("new save-as request: %v", err)
	}
	saveAsRequest.Header.Set("Content-Type", "application/json")
	saveAsRequest.AddCookie(authCookie)

	saveAsResponse, err := http.DefaultClient.Do(saveAsRequest)
	if err != nil {
		t.Fatalf("save as new project config: %v", err)
	}
	defer saveAsResponse.Body.Close()
	if saveAsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(saveAsResponse.Body)
		t.Fatalf("expected save-as 200, got %d with body %q", saveAsResponse.StatusCode, string(body))
	}

	persistedDocument, err = persistedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document after save-as: %v", err)
	}
	clonedProjectID := ""
	for projectID, project := range persistedDocument.Projects {
		if project.Name == "Cloned Alpha" {
			clonedProjectID = projectID
		}
	}
	if clonedProjectID == "" {
		t.Fatalf("expected cloned project in %#v", persistedDocument.Projects)
	}

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

	deleteRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteDeleteProjectConfigs, strings.NewReader(`{"ids":["`+clonedProjectID+`"]}`))
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

	if _, ok := app.Terminals().Session("delete-project-terminal"); ok {
		t.Fatal("expected project delete to reclaim terminal session")
	}

	persistedDocument, err = persistedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document after delete: %v", err)
	}
	if _, ok := persistedDocument.Projects[clonedProjectID]; ok {
		t.Fatalf("expected deleted project removed from persisted document, got %#v", persistedDocument.Projects)
	}
	if _, ok := persistedDocument.Projects[createdProjectID]; !ok {
		t.Fatalf("expected created project to remain after delete, got %#v", persistedDocument.Projects)
	}
}

func TestAppProjectShellLifecycleRoutesBroadcastMetadataAndSaveNotification(t *testing.T) {
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
		t.Fatalf("expected create 200, got %d with body %q", createResponse.StatusCode, string(body))
	}

	metadataEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeAllProjectMetadata, 4)
	var metadataPayload projectshell.AllProjectMetadata
	if err := json.Unmarshal(metadataEnvelope.Content, &metadataPayload); err != nil {
		t.Fatalf("decode create metadata payload: %v", err)
	}
	if len(metadataPayload.ProjectMetadata) != 2 {
		t.Fatalf("expected two projects after create, got %#v", metadataPayload.ProjectMetadata)
	}

	saveAsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSaveAsNewProjectConfig, strings.NewReader(`{"projectConfigId":"project-alpha","newConfigName":"Cloned Alpha","withRefs":true}`))
	if err != nil {
		t.Fatalf("new save-as request: %v", err)
	}
	saveAsRequest.Header.Set("Content-Type", "application/json")
	saveAsRequest.AddCookie(authCookie)

	saveAsResponse, err := http.DefaultClient.Do(saveAsRequest)
	if err != nil {
		t.Fatalf("save as new project config: %v", err)
	}
	defer saveAsResponse.Body.Close()
	if saveAsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(saveAsResponse.Body)
		t.Fatalf("expected save-as 200, got %d with body %q", saveAsResponse.StatusCode, string(body))
	}

	metadataEnvelope = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeAllProjectMetadata, 4)
	if err := json.Unmarshal(metadataEnvelope.Content, &metadataPayload); err != nil {
		t.Fatalf("decode save-as metadata payload: %v", err)
	}
	clonedProjectID := ""
	foundClonedProject := false
	for _, metadata := range metadataPayload.ProjectMetadata {
		if metadata.Name == "Cloned Alpha" {
			foundClonedProject = true
			clonedProjectID = metadata.ID
		}
	}
	if !foundClonedProject {
		t.Fatalf("expected Cloned Alpha in metadata %#v", metadataPayload.ProjectMetadata)
	}

	deleteRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteDeleteProjectConfigs, strings.NewReader(`{"ids":["`+clonedProjectID+`"]}`))
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

	metadataEnvelope = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeAllProjectMetadata, 4)
	if err := json.Unmarshal(metadataEnvelope.Content, &metadataPayload); err != nil {
		t.Fatalf("decode delete metadata payload: %v", err)
	}
	for _, metadata := range metadataPayload.ProjectMetadata {
		if metadata.Name == "Cloned Alpha" {
			t.Fatalf("did not expect deleted project in metadata %#v", metadataPayload.ProjectMetadata)
		}
	}

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
