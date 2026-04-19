package httpapi

import (
	"reflect"
	"slices"
	"testing"
	"time"

	"setta/internal/appspec"
	"setta/internal/artifacts"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/externalagents"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
	"setta/internal/scriptablechat"
	"setta/internal/transcriptionprofiles"
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

func TestFrontendValueSettaAPIPresetConfigUsesAuthoritativePresetContracts(t *testing.T) {
	got := FrontendValueSettaAPIPresetConfig()

	if got.RuntimeValueTokens.ProjectConfigID != frontendSettaAPIPresetProjectConfigIDToken {
		t.Fatalf("unexpected project-config token: got %q want %q", got.RuntimeValueTokens.ProjectConfigID, frontendSettaAPIPresetProjectConfigIDToken)
	}
	if got.RuntimeValueTokens.EmptySpacePosition != frontendSettaAPIPresetEmptySpacePositionToken {
		t.Fatalf("unexpected empty-space token: got %q want %q", got.RuntimeValueTokens.EmptySpacePosition, frontendSettaAPIPresetEmptySpacePositionToken)
	}
	if len(got.Presets) != 3 {
		t.Fatalf("unexpected preset count: got %d want %d", len(got.Presets), 3)
	}

	createPreset := got.Presets[0]
	if createPreset.Route != RouteCreateTopLevelSection {
		t.Fatalf("unexpected create preset route: got %q want %q", createPreset.Route, RouteCreateTopLevelSection)
	}
	if createPreset.Label != "Create top-level section" {
		t.Fatalf("unexpected create preset label: got %q", createPreset.Label)
	}
	if gotValue, ok := createPreset.BodyTemplate["projectConfigId"].(string); !ok || gotValue != frontendSettaAPIPresetProjectConfigIDToken {
		t.Fatalf("unexpected create preset projectConfigId: %#v", createPreset.BodyTemplate["projectConfigId"])
	}
	if gotValue, ok := createPreset.BodyTemplate["implType"].(projectstate.FrontendSectionType); !ok || gotValue != projectstate.FrontendSectionTypeTextBlock {
		t.Fatalf("unexpected create preset implType: %#v", createPreset.BodyTemplate["implType"])
	}
	implOverrides, ok := createPreset.BodyTemplate["implOverrides"].(map[string]any)
	if !ok {
		t.Fatalf("unexpected create preset implOverrides type: %#v", createPreset.BodyTemplate["implOverrides"])
	}
	if gotValue, ok := implOverrides["type"].(projectstate.FrontendSectionType); !ok || gotValue != projectstate.FrontendSectionTypeTextBlock {
		t.Fatalf("unexpected create preset implOverrides.type: %#v", implOverrides["type"])
	}
	if gotValue, ok := implOverrides["text"].(string); !ok || gotValue != "Hello" {
		t.Fatalf("unexpected create preset implOverrides.text: %#v", implOverrides["text"])
	}
	if gotValue, ok := createPreset.BodyTemplate["position"].(string); !ok || gotValue != frontendSettaAPIPresetEmptySpacePositionToken {
		t.Fatalf("unexpected create preset position token: %#v", createPreset.BodyTemplate["position"])
	}

	projectConfigOnlyRoutes := []string{RouteGetLatestProjectState, RouteSaveProject}
	for idx, route := range projectConfigOnlyRoutes {
		preset := got.Presets[idx+1]
		if preset.Route != route {
			t.Fatalf("unexpected project-config preset route at %d: got %q want %q", idx, preset.Route, route)
		}
		if len(preset.BodyTemplate) != 1 {
			t.Fatalf("unexpected project-config preset body size at %d: got %d want %d", idx, len(preset.BodyTemplate), 1)
		}
		if gotValue, ok := preset.BodyTemplate["projectConfigId"].(string); !ok || gotValue != frontendSettaAPIPresetProjectConfigIDToken {
			t.Fatalf("unexpected project-config preset token at %d: %#v", idx, preset.BodyTemplate["projectConfigId"])
		}
	}

	got.Presets[0].BodyTemplate["projectConfigId"] = "mutated"
	gotAgain := FrontendValueSettaAPIPresetConfig()
	if gotAgain.Presets[0].BodyTemplate["projectConfigId"] != frontendSettaAPIPresetProjectConfigIDToken {
		t.Fatalf("expected preset body template to be cloned, got %#v", gotAgain.Presets[0].BodyTemplate["projectConfigId"])
	}
}

func TestFrontendValueTranscriptionProfileUIConfigUsesAuthoritativeProfileMetadata(t *testing.T) {
	got := FrontendValueTranscriptionProfileUIConfig()

	if got.DefaultName != transcriptionprofiles.DefaultProfileName {
		t.Fatalf("unexpected default name: got %q want %q", got.DefaultName, transcriptionprofiles.DefaultProfileName)
	}
	if got.DefaultTransportMode != transcriptionprofiles.TransportModeAuto {
		t.Fatalf("unexpected default transport mode: got %q want %q", got.DefaultTransportMode, transcriptionprofiles.TransportModeAuto)
	}
	if got.DefaultChunkMs != transcriptionprofiles.DefaultChunkMs {
		t.Fatalf("unexpected default chunkMs: got %d want %d", got.DefaultChunkMs, transcriptionprofiles.DefaultChunkMs)
	}
	if got.MinChunkMs != transcriptionprofiles.MinChunkMs {
		t.Fatalf("unexpected min chunkMs: got %d want %d", got.MinChunkMs, transcriptionprofiles.MinChunkMs)
	}
	if got.MaxChunkMs != transcriptionprofiles.MaxChunkMs {
		t.Fatalf("unexpected max chunkMs: got %d want %d", got.MaxChunkMs, transcriptionprofiles.MaxChunkMs)
	}
	if got.TransportModes.Auto != transcriptionprofiles.TransportModeAuto {
		t.Fatalf("unexpected auto transport mode: got %q want %q", got.TransportModes.Auto, transcriptionprofiles.TransportModeAuto)
	}
	if got.TransportModes.File != transcriptionprofiles.TransportModeFile {
		t.Fatalf("unexpected file transport mode: got %q want %q", got.TransportModes.File, transcriptionprofiles.TransportModeFile)
	}
	if got.TransportModes.Realtime != transcriptionprofiles.TransportModeRealtime {
		t.Fatalf("unexpected realtime transport mode: got %q want %q", got.TransportModes.Realtime, transcriptionprofiles.TransportModeRealtime)
	}
	if want := []TranscriptionProfileTransportModeOption{
		{Value: transcriptionprofiles.TransportModeAuto, Label: "auto"},
		{Value: transcriptionprofiles.TransportModeFile, Label: "file"},
		{Value: transcriptionprofiles.TransportModeRealtime, Label: "realtime"},
	}; !reflect.DeepEqual(got.TransportModeOptions, want) {
		t.Fatalf("unexpected transport mode options: %#v", got.TransportModeOptions)
	}

	got.TransportModeOptions[0].Label = "mutated"
	gotAgain := FrontendValueTranscriptionProfileUIConfig()
	if gotAgain.TransportModeOptions[0].Label != "auto" {
		t.Fatalf("expected transport mode options to be cloned, got %#v", gotAgain.TransportModeOptions)
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

func TestFrontendValueToolNameNormalizationConfigUsesAuthoritativeToolNames(t *testing.T) {
	got := FrontendValueToolNameNormalizationConfig()
	if got.MCPPrefix != mcpx.ToolNameMCPPrefix {
		t.Fatalf("unexpected MCP prefix: got %q want %q", got.MCPPrefix, mcpx.ToolNameMCPPrefix)
	}
	if got.SinglePrefix != mcpx.DefaultServerSingleTool {
		t.Fatalf("unexpected single prefix: got %q want %q", got.SinglePrefix, mcpx.DefaultServerSingleTool)
	}
	if got.DoublePrefix != mcpx.DefaultServerDoubleTool {
		t.Fatalf("unexpected double prefix: got %q want %q", got.DoublePrefix, mcpx.DefaultServerDoubleTool)
	}
	if got.AskUserQuestionToolAlias != mcpx.AskUserQuestionAlias {
		t.Fatalf("unexpected AskUserQuestion tool alias: got %q want %q", got.AskUserQuestionToolAlias, mcpx.AskUserQuestionAlias)
	}
	if got.AskUserQuestionToolName != mcpx.AskUserQuestionToolName {
		t.Fatalf("unexpected AskUserQuestion tool name: got %q want %q", got.AskUserQuestionToolName, mcpx.AskUserQuestionToolName)
	}
	if got.ApprovalToolName != externalagents.ApprovalToolName {
		t.Fatalf("unexpected approval tool name: got %q want %q", got.ApprovalToolName, externalagents.ApprovalToolName)
	}
	if got.TodoWriteToolName != externalagents.TodoWriteToolName {
		t.Fatalf("unexpected TodoWrite tool name: got %q want %q", got.TodoWriteToolName, externalagents.TodoWriteToolName)
	}
}

func TestFrontendValueAppSpecPatchPolicyConfigUsesAuthoritativeAppSpecPatchPolicy(t *testing.T) {
	got := FrontendValueAppSpecPatchPolicyConfig()
	want := appspec.DefaultPatchPolicy()

	if got.CommentPrefix != want.CommentPrefix {
		t.Fatalf("unexpected patch comment prefix: got %q want %q", got.CommentPrefix, want.CommentPrefix)
	}
	if got.RootPath != want.RootPath {
		t.Fatalf("unexpected patch root path: got %q want %q", got.RootPath, want.RootPath)
	}
	if got.ElementsPathPrefix != want.ElementsPathPrefix {
		t.Fatalf("unexpected patch elements path prefix: got %q want %q", got.ElementsPathPrefix, want.ElementsPathPrefix)
	}
	if got.RootResetValue != want.RootResetValue {
		t.Fatalf("unexpected patch root reset value: got %q want %q", got.RootResetValue, want.RootResetValue)
	}
	if !slices.Equal(got.AllowedOps, want.AllowedOps) {
		t.Fatalf("unexpected allowed patch ops: got %v want %v", got.AllowedOps, want.AllowedOps)
	}
	if !slices.Equal(got.ValueOptionalOps, want.ValueOptionalOps) {
		t.Fatalf("unexpected optional-value patch ops: got %v want %v", got.ValueOptionalOps, want.ValueOptionalOps)
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
