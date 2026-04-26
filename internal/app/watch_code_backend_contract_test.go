package app

import (
	"testing"

	"setta/internal/plugins"
	"setta/internal/watchcodecontracts"
)

func TestWatchCodeBackendContractDrivesRouteAndUISettingMatching(t *testing.T) {
	t.Parallel()

	const pluginID = "setta-watch-code"
	for _, suffix := range watchcodecontracts.BackendRouteSuffixes() {
		gotPluginID, gotSuffix, ok := watchcodecontracts.ParseBackendRoutePath(
			watchcodecontracts.BackendRoutePath(pluginID, suffix),
		)
		if !ok || gotPluginID != pluginID || gotSuffix != suffix {
			t.Fatalf("expected route suffix %q to parse for %q, got plugin=%q suffix=%q ok=%v", suffix, pluginID, gotPluginID, gotSuffix, ok)
		}
	}

	if _, _, ok := watchcodecontracts.ParseBackendRoutePath(watchcodecontracts.BackendRoutePath(pluginID, "missing")); ok {
		t.Fatal("expected unknown Watch Code backend route suffix to be rejected")
	}
	if _, _, ok := watchcodecontracts.ParseBackendRoutePath("/plugins/" + pluginID + "/watch-code/ enabled"); ok {
		t.Fatal("expected route suffixes with segment whitespace to be rejected")
	}

	for _, setting := range watchcodecontracts.BackendUISettings() {
		writeHandlerID := setting.WriteHandlerID
		registration := plugins.PluginRegisteredUISetting{
			PluginID:       pluginID,
			LocalSettingID: setting.LocalSettingID,
			ReadHandlerID:  setting.ReadHandlerID,
			WriteHandlerID: &writeHandlerID,
		}
		if !watchCodeBackendUISettingRegistration(registration) {
			t.Fatalf("expected Watch Code UI setting registration %#v to match shared contract", registration)
		}
		if !watchcodecontracts.IsBackendReadHandlerID(setting.ReadHandlerID) {
			t.Fatalf("expected read handler %q to match shared contract", setting.ReadHandlerID)
		}
		if !watchcodecontracts.IsBackendWriteHandlerID(setting.WriteHandlerID) {
			t.Fatalf("expected write handler %q to match shared contract", setting.WriteHandlerID)
		}
	}
}
