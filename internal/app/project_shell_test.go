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
