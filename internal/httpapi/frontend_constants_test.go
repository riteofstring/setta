package httpapi

import (
	"slices"
	"testing"
	"time"

	"setta/internal/artifacts"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/projectstate"
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
