package httpapi

import (
	"context"
	"testing"

	"setta/internal/config"
	"setta/internal/pythonsdkcontracts"
)

func TestConfigInfoServiceReflectsConfig(t *testing.T) {
	t.Parallel()

	service := NewConfigInfoService(config.Config{
		Server: config.Server{Mode: config.ModeShare},
		Paths: config.Paths{
			WorkspaceRoot:         "/workspace",
			DeploymentRoot:        "/deployment",
			SettaHome:             "/setta-home",
			ProfileLookupHome:     "/profiles",
			ProfileName:           "default",
			SettaFilesRoot:        "/setta-files",
			ResolvedFilesLocation: config.ResolvedFilesLocationGlobal,
			RuntimeRoot:           "/runtime",
		},
		User: config.UserConfig{
			GlobalSettaFilesBase: "/global-setta",
			AutoMode:             config.AutoModeCreateGlobal,
		},
	}, "setta_auth")

	if got := service.ServerMode(context.Background()); got != string(config.ModeShare) {
		t.Fatalf("server mode = %q, want %q", got, config.ModeShare)
	}

	info := service.RuntimeInfo(context.Background())
	if info.Mode != string(config.ModeShare) {
		t.Fatalf("runtime info mode = %q, want %q", info.Mode, config.ModeShare)
	}
	if info.Paths.DeploymentRoot != "/deployment" {
		t.Fatalf("deployment root = %q, want %q", info.Paths.DeploymentRoot, "/deployment")
	}
	if info.Paths.SettaFilesLocation != string(config.ResolvedFilesLocationGlobal) {
		t.Fatalf("setta files location = %q, want %q", info.Paths.SettaFilesLocation, config.ResolvedFilesLocationGlobal)
	}
	if info.Policy.AutoMode != string(config.AutoModeCreateGlobal) {
		t.Fatalf("auto mode = %q, want %q", info.Policy.AutoMode, config.AutoModeCreateGlobal)
	}
	if info.Auth.AuthCookieName != "setta_auth" {
		t.Fatalf("auth cookie name = %q, want %q", info.Auth.AuthCookieName, "setta_auth")
	}

	handshake := service.SDKRuntimeHandshake(context.Background())
	if handshake.SDKContractVersion != pythonsdkcontracts.SDKContractVersion {
		t.Fatalf(
			"sdk contract version = %d, want %d",
			handshake.SDKContractVersion,
			pythonsdkcontracts.SDKContractVersion,
		)
	}
}
