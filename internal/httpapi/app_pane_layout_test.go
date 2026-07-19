package httpapi

import (
	"net/http"
	"os"
	"strings"
	"testing"

	"setta/internal/applayout"
)

func TestAppPaneLayoutEndpointsPersistGlobally(t *testing.T) {
	handler, appDataDir := newAppPaneLayoutHandler(t)
	layout := appPaneLayout()

	saved := postJSON[applayout.AppPaneLayout](t, handler, "/app/panes/layout/save", SaveAppPaneLayoutRequest{
		Layout: layout,
	}, http.StatusOK)
	if saved.FocusedPaneID != "app_pane_master" {
		t.Fatalf("saved focusedPaneID = %q, want app_pane_master", saved.FocusedPaneID)
	}

	read := getJSON[applayout.AppPaneLayoutReadResult](t, handler, "/app/panes/layout", http.StatusOK)
	if read.Layout == nil {
		t.Fatal("read layout is nil")
	}
	if read.Layout.Panes[1].SurfaceKind != applayout.AppPaneSurfaceKindConversation {
		t.Fatalf("conversation pane kind = %q", read.Layout.Panes[1].SurfaceKind)
	}
	if read.Layout.Panes[1].ConversationConfig == nil ||
		read.Layout.Panes[1].ConversationConfig.ConversationID != "conversation_api" {
		t.Fatalf("conversation config = %+v, want conversation_api", read.Layout.Panes[1].ConversationConfig)
	}
	if _, err := os.Stat(applayout.StateFilePath(appDataDir)); err != nil {
		t.Fatalf("stat app pane layout state: %v", err)
	}
}

func TestAppPaneLayoutReadEndpointReturnsMissingLayout(t *testing.T) {
	handler, _ := newAppPaneLayoutHandler(t)

	read := getJSON[applayout.AppPaneLayoutReadResult](t, handler, "/app/panes/layout", http.StatusOK)
	if read.Layout != nil {
		t.Fatalf("layout = %+v, want nil", read.Layout)
	}
}

func TestAppPaneLayoutEndpointRejectsEasyButtonPane(t *testing.T) {
	handler, _ := newAppPaneLayoutHandler(t)
	layout := appPaneLayout()
	layout.Panes[1].SurfaceKind = applayout.AppPaneSurfaceKind("easy-button")

	errResponse := postJSON[ErrorResponse](t, handler, "/app/panes/layout/save", SaveAppPaneLayoutRequest{
		Layout: layout,
	}, http.StatusInternalServerError)
	if errResponse.Error.Code != "corrupt_app_pane_layout_state" {
		t.Fatalf("error code = %q, want corrupt_app_pane_layout_state", errResponse.Error.Code)
	}
	if !strings.Contains(errResponse.Error.Message, "surfaceKind is unsupported: easy-button") {
		t.Fatalf("error message = %q, want unsupported easy-button surface kind", errResponse.Error.Message)
	}
}

func TestAppPaneLayoutEndpointRequiresService(t *testing.T) {
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		Metadata: BackendMetadata{Name: BackendName, Version: "test"},
	})

	errResponse := getJSON[ErrorResponse](t, handler, "/app/panes/layout", http.StatusServiceUnavailable)
	if errResponse.Error.Code != "app_pane_layout_service_unavailable" {
		t.Fatalf("error code = %q, want app_pane_layout_service_unavailable", errResponse.Error.Code)
	}
}

func newAppPaneLayoutHandler(t *testing.T) (http.Handler, string) {
	t.Helper()

	appDataDir := t.TempDir()
	store, err := applayout.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new app pane layout store: %v", err)
	}
	service, err := applayout.NewService(store)
	if err != nil {
		t.Fatalf("new app pane layout service: %v", err)
	}
	return newAuthenticatedTestHandler(t, HandlerConfig{
		AppPaneLayoutService: service,
		Metadata:             BackendMetadata{Name: BackendName, Version: "test"},
	}), appDataDir
}

func appPaneLayout() applayout.AppPaneLayout {
	return applayout.AppPaneLayout{
		SchemaVersion: applayout.SchemaVersion,
		FocusedPaneID: "app_pane_master",
		Columns: []applayout.AppPaneColumn{
			{
				ColumnID:       "app_column_0",
				IdealWidthSpec: applayout.AppPaneColumnWidthSpec{Unit: applayout.AppPaneColumnWidthUnitPX, Value: 640},
				Index:          0,
				PaneIDs:        []string{"app_pane_master", "app_pane_conversation"},
				PlaneIndex:     0,
				SlotIndex:      0,
				WidthSpec:      applayout.AppPaneColumnWidthSpec{Unit: applayout.AppPaneColumnWidthUnitPX, Value: 720},
			},
		},
		Panes: []applayout.AppPane{
			{
				ColumnID:     "app_column_0",
				Heat:         0,
				MasterConfig: &applayout.MasterPaneConfig{},
				PaneID:       "app_pane_master",
				Sequence:     0,
				Subtitle:     "Global coordinator",
				SurfaceID:    "app_surface_master",
				SurfaceKind:  applayout.AppPaneSurfaceKindMaster,
				Title:        "Setta",
				Tone:         applayout.AppPaneToneSlate,
				Weight:       1.6,
			},
			{
				ColumnID: "app_column_0",
				ConversationConfig: &applayout.ConversationPaneConfig{
					ConversationID: "conversation_api",
					PresentationIdentity: applayout.ConversationPanePresentationIdentity{
						Subtitle: "Topic conversation",
						Title:    "Topic",
						Tone:     applayout.AppPaneToneCyan,
					},
					ResourceBindings: []applayout.ConversationPaneResourceBinding{},
				},
				Heat:        37,
				PaneID:      "app_pane_conversation",
				Sequence:    1,
				Subtitle:    "Topic conversation",
				SurfaceID:   "app_surface_conversation",
				SurfaceKind: applayout.AppPaneSurfaceKindConversation,
				Title:       "Topic",
				Tone:        applayout.AppPaneToneCyan,
				Weight:      1,
			},
		},
	}
}
