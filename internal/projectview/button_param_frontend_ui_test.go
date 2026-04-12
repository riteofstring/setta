package projectview

import (
	"reflect"
	"testing"

	"setta/internal/projectstate"
)

func TestFrontendValueButtonParamUIConfigUsesGoOwnedButtonMetadata(t *testing.T) {
	config := FrontendValueButtonParamUIConfig()

	if got, want := config.DefaultActionMode, projectstate.FrontendButtonActionModeWebsocketListener; got != want {
		t.Fatalf("unexpected default action mode: %q", got)
	}

	if got, want := config.DefaultRequestMethod, projectstate.FrontendHTTPRequestMethodPost; got != want {
		t.Fatalf("unexpected default request method: %q", got)
	}

	if got, want := config.ActionModeOptions, []ButtonParamActionModeOption{
		{Value: projectstate.FrontendButtonActionModeWebsocketListener, Label: "Websocket listener"},
		{Value: projectstate.FrontendButtonActionModeHTTPRequest, Label: "HTTP request"},
		{Value: projectstate.FrontendButtonActionModeSettaAPI, Label: "Setta API"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected action mode options: %#v", got)
	}

	if got, want := config.RequestMethodOptions, []ButtonParamRequestMethodOption{
		{Value: projectstate.FrontendHTTPRequestMethodGet, Label: "GET"},
		{Value: projectstate.FrontendHTTPRequestMethodPost, Label: "POST"},
		{Value: projectstate.FrontendHTTPRequestMethodPut, Label: "PUT"},
		{Value: projectstate.FrontendHTTPRequestMethodPatch, Label: "PATCH"},
		{Value: projectstate.FrontendHTTPRequestMethodDelete, Label: "DELETE"},
		{Value: projectstate.FrontendHTTPRequestMethodHead, Label: "HEAD"},
		{Value: projectstate.FrontendHTTPRequestMethodOptions, Label: "OPTIONS"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected request method options: %#v", got)
	}
}
