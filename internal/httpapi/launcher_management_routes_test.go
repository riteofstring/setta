package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/launcher"
	"setta/internal/modes"
)

func TestRegisterLauncherManagementRoutesReportsNotInstalled(t *testing.T) {
	t.Parallel()

	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, defaultSettaHome, newLauncherManagementService(t))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetLauncherStatus, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected launcher status 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload LauncherStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode launcher status payload: %v", err)
	}
	if !payload.Ok || payload.Installed == nil || *payload.Installed {
		t.Fatalf("unexpected launcher status payload %#v", payload)
	}
	if payload.UpdateCapability == nil || *payload.UpdateCapability != launcher.LauncherUpdateCapabilityUnsupported {
		t.Fatalf("expected unsupported update capability, got %#v", payload.UpdateCapability)
	}
}

func TestRegisterLauncherManagementRoutesHonorsScopedSettaHome(t *testing.T) {
	t.Parallel()

	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	scopedSettaHome := filepath.Join(t.TempDir(), ".setta-scoped")
	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, defaultSettaHome, newLauncherManagementService(t))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodGet,
		"/api"+RouteGetLauncherStatus+"?setta_home="+url.QueryEscape(scopedSettaHome),
		nil,
	)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected scoped launcher status 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload LauncherStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode scoped launcher status payload: %v", err)
	}
	expectedSettaHome, err := launcher.ResolveScopedSettaHome(defaultSettaHome, scopedSettaHome)
	if err != nil {
		t.Fatalf("resolve expected scoped setta home: %v", err)
	}
	if payload.SettaHome == nil || *payload.SettaHome != expectedSettaHome {
		t.Fatalf("expected scoped setta home %q, got %#v", expectedSettaHome, payload.SettaHome)
	}
}

func TestRegisterLauncherManagementRoutesUsesDefaultSettaHomeWhenScopeBlank(t *testing.T) {
	t.Parallel()

	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, defaultSettaHome, newLauncherManagementService(t))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodGet,
		"/api"+RouteGetLauncherStatus+"?setta_home=",
		nil,
	)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected blank-scope launcher status 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload LauncherStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode blank-scope launcher status payload: %v", err)
	}
	expectedSettaHome, err := launcher.ResolveScopedSettaHome(defaultSettaHome, "")
	if err != nil {
		t.Fatalf("resolve expected default setta home: %v", err)
	}
	if payload.SettaHome == nil || *payload.SettaHome != expectedSettaHome {
		t.Fatalf("expected default setta home %q, got %#v", expectedSettaHome, payload.SettaHome)
	}
}

func TestRegisterLauncherManagementRoutesSetupAndRemoveRoundtripMetadataOnly(t *testing.T) {
	t.Parallel()

	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, defaultSettaHome, newLauncherManagementService(t))

	setupResponse := httptest.NewRecorder()
	setupRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetupLauncher,
		strings.NewReader(`{"settaHome":"`+defaultSettaHome+`","channel":"uv-tool","installSource":"uv_tool","openMode":"chrome-app","workspaceBehavior":"always_prompt","installArtifacts":false}`),
	)
	setupRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(setupResponse, setupRequest)
	if setupResponse.Code != http.StatusOK {
		t.Fatalf("expected setup launcher 200, got %d with body %q", setupResponse.Code, setupResponse.Body.String())
	}

	var setupPayload LauncherStatusResponse
	if err := json.Unmarshal(setupResponse.Body.Bytes(), &setupPayload); err != nil {
		t.Fatalf("decode setup launcher payload: %v", err)
	}
	if !setupPayload.Ok || setupPayload.Installed == nil || !*setupPayload.Installed {
		t.Fatalf("unexpected setup launcher payload %#v", setupPayload)
	}
	if setupPayload.Channel == nil || *setupPayload.Channel != "uv-tool" {
		t.Fatalf("expected channel uv-tool, got %#v", setupPayload.Channel)
	}
	if setupPayload.OpenMode == nil || *setupPayload.OpenMode != launcher.LauncherOpenModeChromeApp {
		t.Fatalf("expected open mode chrome-app, got %#v", setupPayload.OpenMode)
	}
	if setupPayload.WorkspaceBehavior == nil || *setupPayload.WorkspaceBehavior != launcher.LauncherWorkspaceBehaviorAlwaysPrompt {
		t.Fatalf("expected workspace behavior always_prompt, got %#v", setupPayload.WorkspaceBehavior)
	}
	if setupPayload.UpdateCapability == nil || *setupPayload.UpdateCapability != launcher.LauncherUpdateCapabilityInApp {
		t.Fatalf("expected in-app update capability, got %#v", setupPayload.UpdateCapability)
	}
	if len(setupPayload.ManagedArtifacts) != 0 {
		t.Fatalf("expected metadata-only install, got managed artifacts %#v", setupPayload.ManagedArtifacts)
	}

	removeResponse := httptest.NewRecorder()
	removeRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteRemoveLauncher,
		nil,
	)
	handler.ServeHTTP(removeResponse, removeRequest)
	if removeResponse.Code != http.StatusOK {
		t.Fatalf("expected remove launcher 200, got %d with body %q", removeResponse.Code, removeResponse.Body.String())
	}

	var removePayload LauncherStatusResponse
	if err := json.Unmarshal(removeResponse.Body.Bytes(), &removePayload); err != nil {
		t.Fatalf("decode remove launcher payload: %v", err)
	}
	if !removePayload.Ok || removePayload.Installed == nil || *removePayload.Installed {
		t.Fatalf("unexpected remove launcher payload %#v", removePayload)
	}
}

func TestRegisterLauncherManagementRoutesSetupPreservesExistingIdentityWhenFieldsOmitted(t *testing.T) {
	t.Parallel()

	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	manager, currentExecutable := newLauncherManagementServiceWithExecutable(t)
	previousExecutable := writeLauncherManagementTestExecutable(t, t.TempDir(), "previous-setta")

	metadata, err := launcher.BuildLauncherInstallMetadata(launcher.LauncherInstallMetadataInput{
		TargetCommand:          []string{previousExecutable},
		Channel:                "uv-tool",
		InstallSource:          launcher.LauncherInstallSourceUVTool,
		ArtifactOwnershipToken: "preserve-token",
		SettaVersion:           "0.0.1",
		SettaHome:              defaultSettaHome,
		OpenMode:               launcher.LauncherOpenModeBrowser,
		WorkspaceBehavior:      launcher.LauncherWorkspaceBehaviorAlwaysPrompt,
		ArtifactOptions:        map[string]string{"app_name": "Setta Custom"},
		ManagedArtifacts:       map[string]string{},
	})
	if err != nil {
		t.Fatalf("build existing launcher metadata: %v", err)
	}
	if _, err := launcher.WriteLauncherInstallMetadata(defaultSettaHome, metadata); err != nil {
		t.Fatalf("write existing launcher metadata: %v", err)
	}

	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, defaultSettaHome, manager)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetupLauncher,
		strings.NewReader(`{"settaHome":"`+defaultSettaHome+`"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected omitted-field setup 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload LauncherStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode preserved setup payload: %v", err)
	}
	if payload.Channel == nil || *payload.Channel != "uv-tool" {
		t.Fatalf("expected preserved channel uv-tool, got %#v", payload.Channel)
	}
	if payload.OpenMode == nil || *payload.OpenMode != launcher.LauncherOpenModeBrowser {
		t.Fatalf("expected preserved open mode browser, got %#v", payload.OpenMode)
	}
	if payload.WorkspaceBehavior == nil || *payload.WorkspaceBehavior != launcher.LauncherWorkspaceBehaviorAlwaysPrompt {
		t.Fatalf("expected preserved workspace behavior always_prompt, got %#v", payload.WorkspaceBehavior)
	}
	if !reflect.DeepEqual(payload.ArtifactOptions, map[string]string{"app_name": "Setta Custom"}) {
		t.Fatalf("expected preserved artifact options, got %#v", payload.ArtifactOptions)
	}
	if len(payload.ManagedArtifacts) != 0 {
		t.Fatalf("expected omitted installArtifacts to preserve metadata-only mode, got %#v", payload.ManagedArtifacts)
	}
	resolvedCurrentExecutable, err := filepath.EvalSymlinks(currentExecutable)
	if err != nil {
		t.Fatalf("resolve current executable path: %v", err)
	}
	if !reflect.DeepEqual(payload.TargetCommand, []string{resolvedCurrentExecutable}) {
		t.Fatalf("expected setup to rebind target command to current executable %q, got %#v", resolvedCurrentExecutable, payload.TargetCommand)
	}
}

func TestRegisterLauncherManagementRoutesSetupClearsArtifactOptionsWhenExplicitlyEmpty(t *testing.T) {
	t.Parallel()

	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	manager, _ := newLauncherManagementServiceWithExecutable(t)
	previousExecutable := writeLauncherManagementTestExecutable(t, t.TempDir(), "previous-setta")

	metadata, err := launcher.BuildLauncherInstallMetadata(launcher.LauncherInstallMetadataInput{
		TargetCommand:          []string{previousExecutable},
		Channel:                "uv-tool",
		InstallSource:          launcher.LauncherInstallSourceUVTool,
		ArtifactOwnershipToken: "clear-token",
		SettaVersion:           "0.0.1",
		SettaHome:              defaultSettaHome,
		OpenMode:               launcher.LauncherOpenModeBrowser,
		WorkspaceBehavior:      launcher.LauncherWorkspaceBehaviorAlwaysPrompt,
		ArtifactOptions:        map[string]string{"app_name": "Setta Custom"},
		ManagedArtifacts:       map[string]string{},
	})
	if err != nil {
		t.Fatalf("build existing launcher metadata: %v", err)
	}
	if _, err := launcher.WriteLauncherInstallMetadata(defaultSettaHome, metadata); err != nil {
		t.Fatalf("write existing launcher metadata: %v", err)
	}

	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, defaultSettaHome, manager)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetupLauncher,
		strings.NewReader(`{"settaHome":"`+defaultSettaHome+`","artifactOptions":{}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected explicit-empty artifact options setup 200, got %d with body %q", response.Code, response.Body.String())
	}

	status, err := manager.CollectStatus(defaultSettaHome)
	if err != nil {
		t.Fatalf("collect launcher status after clearing artifact options: %v", err)
	}
	if len(status.ArtifactOptions) != 0 {
		t.Fatalf("expected explicit empty artifactOptions to clear stored options, got %#v", status.ArtifactOptions)
	}
}

func TestRegisterLauncherManagementRoutesRejectUnknownSetupFields(t *testing.T) {
	t.Parallel()

	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, filepath.Join(t.TempDir(), ".setta"), newLauncherManagementService(t))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetupLauncher,
		strings.NewReader(`{"managedArtifacts":{"manual":"/tmp/artifact"}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected strict setup decode 422, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode invalid setup response: %v", err)
	}
	if payload.Error.Code != "invalid_request" {
		t.Fatalf("expected invalid_request error, got %#v", payload)
	}
	if !strings.Contains(payload.Error.Message, "managedArtifacts") {
		t.Fatalf("expected unknown field detail to mention managedArtifacts, got %#v", payload)
	}
}

func TestRegisterLauncherManagementRoutesRejectMalformedSetupJSON(t *testing.T) {
	t.Parallel()

	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, filepath.Join(t.TempDir(), ".setta"), newLauncherManagementService(t))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetupLauncher,
		strings.NewReader(`{"channel":`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected malformed setup payload 400, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode malformed setup response: %v", err)
	}
	if payload.Error.Code != "invalid_json" {
		t.Fatalf("expected invalid_json error, got %#v", payload)
	}
}

func TestRegisterLauncherManagementRoutesSetupInstallsManagedArtifacts(t *testing.T) {
	prepareLauncherManagementTestHome(t)

	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, defaultSettaHome, newLauncherManagementService(t))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetupLauncher,
		strings.NewReader(`{"settaHome":"`+defaultSettaHome+`","channel":"uv-tool","installSource":"uv_tool","installArtifacts":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected setup launcher 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload LauncherStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode managed artifact setup response: %v", err)
	}
	if !payload.Ok || payload.Installed == nil || !*payload.Installed {
		t.Fatalf("expected setup launcher to succeed for managed artifacts, got %#v", payload)
	}
	if len(payload.ManagedArtifacts) == 0 {
		t.Fatalf("expected managed artifacts in setup payload, got %#v", payload)
	}
}

func TestRegisterLauncherManagementRoutesRepairRebindsMissingTarget(t *testing.T) {
	t.Parallel()

	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	manager, currentExecutable := newLauncherManagementServiceWithExecutable(t)
	missingTarget := filepath.Join(t.TempDir(), "missing-setta")

	metadata, err := launcher.BuildLauncherInstallMetadata(launcher.LauncherInstallMetadataInput{
		TargetCommand:          []string{missingTarget},
		Channel:                "manual",
		InstallSource:          launcher.LauncherInstallSourceUnsupported,
		ArtifactOwnershipToken: "repair-token",
		SettaVersion:           "0.0.1",
		SettaHome:              defaultSettaHome,
		OpenMode:               launcher.LauncherOpenModeBrowser,
		WorkspaceBehavior:      launcher.LauncherWorkspaceBehaviorDefault,
		ArtifactOptions:        map[string]string{},
		ManagedArtifacts:       map[string]string{},
	})
	if err != nil {
		t.Fatalf("build repair metadata: %v", err)
	}
	if _, err := launcher.WriteLauncherInstallMetadata(defaultSettaHome, metadata); err != nil {
		t.Fatalf("write repair metadata: %v", err)
	}

	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, defaultSettaHome, manager)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteRepairLauncher,
		strings.NewReader(`{"settaHome":"`+defaultSettaHome+`"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected repair launcher 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload LauncherStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode repair launcher payload: %v", err)
	}
	if !payload.Ok || payload.Installed == nil || !*payload.Installed {
		t.Fatalf("unexpected repair launcher payload %#v", payload)
	}
	if payload.TargetValid == nil || !*payload.TargetValid {
		t.Fatalf("expected repaired target to be valid, got %#v", payload.TargetValid)
	}
	if payload.TargetError != nil {
		t.Fatalf("expected repaired target error to clear, got %#v", payload.TargetError)
	}
	resolvedCurrentExecutable, err := filepath.EvalSymlinks(currentExecutable)
	if err != nil {
		t.Fatalf("resolve current executable path: %v", err)
	}
	if !reflect.DeepEqual(payload.TargetCommand, []string{resolvedCurrentExecutable}) {
		t.Fatalf("expected repaired target command %q, got %#v", resolvedCurrentExecutable, payload.TargetCommand)
	}
}

func TestRegisterLauncherManagementRoutesUpdateReportsInstallerManagedCapability(t *testing.T) {
	t.Parallel()

	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	manager, _ := newLauncherManagementServiceWithExecutable(t)
	previousExecutable := writeLauncherManagementTestExecutable(t, t.TempDir(), "previous-setta")

	metadata, err := launcher.BuildLauncherInstallMetadata(launcher.LauncherInstallMetadataInput{
		TargetCommand:          []string{previousExecutable},
		Channel:                "installer-managed",
		InstallSource:          launcher.LauncherInstallSourceInstallerManaged,
		ArtifactOwnershipToken: "installer-token",
		SettaVersion:           "1.2.3",
		SettaHome:              defaultSettaHome,
		OpenMode:               launcher.LauncherOpenModeBrowser,
		WorkspaceBehavior:      launcher.LauncherWorkspaceBehaviorDefault,
		ArtifactOptions:        map[string]string{},
		ManagedArtifacts:       map[string]string{},
	})
	if err != nil {
		t.Fatalf("build installer-managed launcher metadata: %v", err)
	}
	if _, err := launcher.WriteLauncherInstallMetadata(defaultSettaHome, metadata); err != nil {
		t.Fatalf("write installer-managed launcher metadata: %v", err)
	}

	handler := newLauncherManagementRouteTestHandler(t, config.ModeIDE, defaultSettaHome, manager)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteUpdateLauncher,
		strings.NewReader(`{"settaHome":"`+defaultSettaHome+`"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected installer-managed update response 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload LauncherUpdateResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode installer-managed update payload: %v", err)
	}
	if payload.Ok {
		t.Fatalf("expected installer-managed update to fail closed, got %#v", payload)
	}
	if payload.Error == nil || payload.Error.Code != "UpdateUnavailable" {
		t.Fatalf("expected UpdateUnavailable error, got %#v", payload)
	}
}

func TestRegisterLauncherManagementRoutesAreNotMountedOutsideIDE(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name   string
		mode   config.Mode
		method string
		path   string
	}{
		{name: "share_status", mode: config.ModeShare, method: http.MethodGet, path: "/api" + RouteGetLauncherStatus},
		{name: "share_setup", mode: config.ModeShare, method: http.MethodPost, path: "/api" + RouteSetupLauncher},
		{name: "share_repair", mode: config.ModeShare, method: http.MethodPost, path: "/api" + RouteRepairLauncher},
		{name: "share_remove", mode: config.ModeShare, method: http.MethodPost, path: "/api" + RouteRemoveLauncher},
		{name: "share_update", mode: config.ModeShare, method: http.MethodPost, path: "/api" + RouteUpdateLauncher},
		{name: "app_status", mode: config.ModeApp, method: http.MethodGet, path: "/api" + RouteGetLauncherStatus},
		{name: "app_setup", mode: config.ModeApp, method: http.MethodPost, path: "/api" + RouteSetupLauncher},
		{name: "app_repair", mode: config.ModeApp, method: http.MethodPost, path: "/api" + RouteRepairLauncher},
		{name: "app_remove", mode: config.ModeApp, method: http.MethodPost, path: "/api" + RouteRemoveLauncher},
		{name: "app_update", mode: config.ModeApp, method: http.MethodPost, path: "/api" + RouteUpdateLauncher},
		{name: "launcher_status", mode: config.ModeLauncher, method: http.MethodGet, path: "/api" + RouteGetLauncherStatus},
		{name: "launcher_setup", mode: config.ModeLauncher, method: http.MethodPost, path: "/api" + RouteSetupLauncher},
		{name: "launcher_repair", mode: config.ModeLauncher, method: http.MethodPost, path: "/api" + RouteRepairLauncher},
		{name: "launcher_remove", mode: config.ModeLauncher, method: http.MethodPost, path: "/api" + RouteRemoveLauncher},
		{name: "launcher_update", mode: config.ModeLauncher, method: http.MethodPost, path: "/api" + RouteUpdateLauncher},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			handler := newLauncherManagementRouteTestHandler(
				t,
				testCase.mode,
				filepath.Join(t.TempDir(), ".setta"),
				newLauncherManagementService(t),
			)

			response := httptest.NewRecorder()
			request := httptest.NewRequest(testCase.method, testCase.path, nil)
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusNotFound {
				t.Fatalf("expected launcher management route %s %s to be unmounted in mode %q, got %d", testCase.method, testCase.path, testCase.mode, response.Code)
			}
		})
	}
}

func newLauncherManagementRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	defaultSettaHome string,
	manager *launcher.ManagementService,
) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterLauncherManagementRoutes(r, LauncherManagementRouteDependencies{
				ModePolicy:       modes.NewPolicy(mode),
				DefaultSettaHome: defaultSettaHome,
				Manager:          manager,
			}); err != nil {
				t.Fatalf("register launcher management routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new launcher management handler: %v", err)
	}
	return handler
}

func newLauncherManagementService(t *testing.T) *launcher.ManagementService {
	t.Helper()

	service, _ := newLauncherManagementServiceWithExecutable(t)
	return service
}

func newLauncherManagementServiceWithExecutable(t *testing.T) (*launcher.ManagementService, string) {
	t.Helper()

	executablePath := writeLauncherManagementTestExecutable(t, t.TempDir(), "setta")
	service, err := launcher.NewManagementService(launcher.ManagementServiceOptions{
		ExecutablePath: executablePath,
		Version:        "1.2.3",
	})
	if err != nil {
		t.Fatalf("new launcher management service: %v", err)
	}
	return service, executablePath
}

func writeLauncherManagementTestExecutable(t *testing.T, dir string, name string) string {
	t.Helper()

	executablePath := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(executablePath), 0o755); err != nil {
		t.Fatalf("mkdir launcher management executable dir: %v", err)
	}
	if err := os.WriteFile(executablePath, []byte("#!/usr/bin/env bash\n"), 0o755); err != nil {
		t.Fatalf("write launcher management executable: %v", err)
	}
	return executablePath
}

func prepareLauncherManagementTestHome(t *testing.T) string {
	t.Helper()

	homeDir := filepath.Join(t.TempDir(), "home")
	if err := os.MkdirAll(homeDir, 0o755); err != nil {
		t.Fatalf("mkdir test home: %v", err)
	}
	switch runtime.GOOS {
	case "windows":
		t.Setenv("USERPROFILE", homeDir)
		t.Setenv("APPDATA", filepath.Join(homeDir, "AppData", "Roaming"))
		t.Setenv("LOCALAPPDATA", filepath.Join(homeDir, "AppData", "Local"))
	default:
		t.Setenv("HOME", homeDir)
	}
	return homeDir
}
