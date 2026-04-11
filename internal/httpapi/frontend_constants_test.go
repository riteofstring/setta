package httpapi

import (
	"slices"
	"testing"
	"time"

	"setta/internal/artifacts"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/externalagents"
	"setta/internal/managedchat"
	"setta/internal/projectstate"
	"setta/internal/scriptablechat"
	"setta/internal/transcriptionsessions"
	"setta/internal/wsapi"
)

func TestFrontendValueCUsesAuthoritativeRuntimeValues(t *testing.T) {
	got := FrontendValueC()
	uploadPolicies := artifacts.DefaultUploadPolicies()

	if got.ChatAttachmentsAllowedPrefixes == nil {
		t.Fatalf("chat attachment prefixes should be an empty slice, not nil")
	}
	if !slices.Equal(got.ChatAttachmentsAllowedPrefixes, uploadPolicies.Chat.AllowedMimePrefixes) {
		t.Fatalf("chat attachment prefixes mismatch: got %v want %v", got.ChatAttachmentsAllowedPrefixes, uploadPolicies.Chat.AllowedMimePrefixes)
	}
	if got.DropzoneAllowedPrefixes == nil {
		t.Fatalf("dropzone prefixes should be an empty slice, not nil")
	}
	if !slices.Equal(got.DropzoneAllowedPrefixes, uploadPolicies.Generic.AllowedMimePrefixes) {
		t.Fatalf("dropzone prefixes mismatch: got %v want %v", got.DropzoneAllowedPrefixes, uploadPolicies.Generic.AllowedMimePrefixes)
	}
	if got.AuthCookieRefreshWindowSeconds != int(auth.DefaultAuthRefreshWindow/time.Second) {
		t.Fatalf("unexpected auth refresh window: got %d want %d", got.AuthCookieRefreshWindowSeconds, int(auth.DefaultAuthRefreshWindow/time.Second))
	}
	if got.DefaultHost != config.DefaultServerHost {
		t.Fatalf("unexpected default host: got %q want %q", got.DefaultHost, config.DefaultServerHost)
	}
	if got.DefaultPort != config.DefaultServerPort {
		t.Fatalf("unexpected default port: got %d want %d", got.DefaultPort, config.DefaultServerPort)
	}
	if got.RealtimeBinaryMaxBytes != transcriptionsessions.DefaultAppendPCMMaxBytes {
		t.Fatalf("unexpected realtime binary max bytes: got %d want %d", got.RealtimeBinaryMaxBytes, transcriptionsessions.DefaultAppendPCMMaxBytes)
	}
	if got.SettingsProjectName != string(projectstate.TargetSettings) {
		t.Fatalf("unexpected settings project name: got %q want %q", got.SettingsProjectName, string(projectstate.TargetSettings))
	}
	if got.SettaTerminalReady != wsapi.TerminalReadyMessage {
		t.Fatalf("unexpected terminal ready message: got %q want %q", got.SettaTerminalReady, wsapi.TerminalReadyMessage)
	}
	if got.WSTerminalResize != wsapi.TerminalMessageTypeResize {
		t.Fatalf("unexpected terminal resize message: got %q want %q", got.WSTerminalResize, wsapi.TerminalMessageTypeResize)
	}
}

func TestFrontendValueTransportRouteConstantsUsesAuthoritativeRouteConstants(t *testing.T) {
	got := FrontendValueTransportRouteConstants()

	if got.APIPrefix != RouteAPIPrefix {
		t.Fatalf("unexpected api prefix: got %q want %q", got.APIPrefix, RouteAPIPrefix)
	}
	if got.Root.BootstrapPage != RouteBootstrapPage {
		t.Fatalf("unexpected bootstrap route: got %q want %q", got.Root.BootstrapPage, RouteBootstrapPage)
	}
	if got.Root.ToolsCall != RouteMCPToolCall {
		t.Fatalf("unexpected tools call route: got %q want %q", got.Root.ToolsCall, RouteMCPToolCall)
	}
	if got.Binary.Upload != RouteBinaryUpload {
		t.Fatalf("unexpected binary upload route: got %q want %q", got.Binary.Upload, RouteBinaryUpload)
	}
	if got.Binary.Download != RouteBinaryDownload {
		t.Fatalf("unexpected binary download route: got %q want %q", got.Binary.Download, RouteBinaryDownload)
	}
	if got.Websocket.Frontend != wsapi.RouteFrontend {
		t.Fatalf("unexpected frontend websocket route: got %q want %q", got.Websocket.Frontend, wsapi.RouteFrontend)
	}
	if got.Websocket.ListenerByID != wsapi.RouteListenerByID {
		t.Fatalf("unexpected listener websocket route: got %q want %q", got.Websocket.ListenerByID, wsapi.RouteListenerByID)
	}
	if got.Websocket.TerminalBySection != wsapi.RouteTerminalBySection {
		t.Fatalf("unexpected terminal websocket route: got %q want %q", got.Websocket.TerminalBySection, wsapi.RouteTerminalBySection)
	}
	if got.ServerModeBoundary.Launch != RouteLaunch {
		t.Fatalf("unexpected launch route: got %q want %q", got.ServerModeBoundary.Launch, RouteLaunch)
	}
	if got.Status.RevealPathInOSFileExplorer != RouteRevealPathInOSFileExplorer {
		t.Fatalf("unexpected reveal-path route: got %q want %q", got.Status.RevealPathInOSFileExplorer, RouteRevealPathInOSFileExplorer)
	}
	if got.LauncherManagement.GetLauncherStatus != RouteGetLauncherStatus {
		t.Fatalf("unexpected launcher-status route: got %q want %q", got.LauncherManagement.GetLauncherStatus, RouteGetLauncherStatus)
	}
	if got.FileBrowser.GetFileBrowserRoot != RouteGetFileBrowserRoot {
		t.Fatalf("unexpected file-browser root route: got %q want %q", got.FileBrowser.GetFileBrowserRoot, RouteGetFileBrowserRoot)
	}
	if got.SettaAPIPresets.CreateTopLevelSection != RouteCreateTopLevelSection {
		t.Fatalf("unexpected create-top-level-section route: got %q want %q", got.SettaAPIPresets.CreateTopLevelSection, RouteCreateTopLevelSection)
	}
}

func TestFrontendValueSettaFilesLocationPolicyConfigUsesAuthoritativeConfigValues(t *testing.T) {
	got := FrontendValueSettaFilesLocationPolicyConfig()

	wantRequested := make([]FrontendSettaFilesLocation, 0, len(config.RequestedFilesLocations()))
	for _, value := range config.RequestedFilesLocations() {
		wantRequested = append(wantRequested, FrontendSettaFilesLocation(value))
	}
	if !slices.Equal(got.Requested, wantRequested) {
		t.Fatalf("unexpected requested setta files locations: got %v want %v", got.Requested, wantRequested)
	}

	wantResolved := make([]FrontendResolvedSettaFilesLocation, 0, len(config.ResolvedFilesLocations()))
	for _, value := range config.ResolvedFilesLocations() {
		wantResolved = append(wantResolved, FrontendResolvedSettaFilesLocation(value))
	}
	if !slices.Equal(got.Resolved, wantResolved) {
		t.Fatalf("unexpected resolved setta files locations: got %v want %v", got.Resolved, wantResolved)
	}
}

func TestFrontendValueChatRunTypesByNameUsesAuthoritativeRunTypeConstants(t *testing.T) {
	got := FrontendValueChatRunTypesByName()
	want := FrontendChatRunTypeSet{
		managedchat.RunTypeManagedChat:       true,
		externalagents.RunTypeExternalAgent:  true,
		scriptablechat.RunTypeScriptableChat: true,
	}
	if len(got) != len(want) {
		t.Fatalf("unexpected chat run type set length: got %d want %d", len(got), len(want))
	}
	for key, wantValue := range want {
		if got[key] != wantValue {
			t.Fatalf("unexpected chat run type membership for %q: got %v want %v", key, got[key], wantValue)
		}
	}
}
