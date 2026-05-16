package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settingsstate"
)

func TestAppSettingsProjectSaveProjectRoutePreservesReservedSettingsName(t *testing.T) {
	cfg := newSettingsProjectTestConfig(t)
	fixture := startSettingsProjectAppFixture(t, cfg)
	initialPayload := postSettingsProjectAPI[projectview.SingleConfig](t, fixture, httpapi.RouteLoadProjectConfig, `{"projectConfigName":"settings"}`)
	initialActiveViewModeID := requireSettingsProjectActiveViewModeID(t, initialPayload.ProjectConfig.ActiveViewModeID, "initial settings load payload")
	assertSettingsProjectName(t, initialPayload.ProjectConfig.Name, "initial settings load payload")

	postSettingsProjectAPIOnlyStatus(t, fixture, httpapi.RouteSaveProject, `{"projectConfigId":"settings"}`)
	fixture.close(t, "after settings project save")

	restarted := startSettingsProjectAppFixture(t, cfg)
	t.Cleanup(func() {
		restarted.close(t, "restarted app")
	})

	restartedLoadPayload := postSettingsProjectAPI[projectview.SingleConfig](t, restarted, httpapi.RouteLoadProjectConfig, `{"projectConfigName":"settings"}`)
	assertSettingsProjectName(t, restartedLoadPayload.ProjectConfig.Name, "restarted settings load payload")
	assertSettingsProjectActiveViewMode(t, restartedLoadPayload.ProjectConfig.ActiveViewModeID, initialActiveViewModeID, "restarted settings load payload")

	restartedLatestPayload := postSettingsProjectAPI[httpapi.ProjectStateSingleConfigWithCompletedOpIDs](t, restarted, httpapi.RouteGetLatestProjectState, `{"projectConfigId":"settings"}`)
	assertSettingsProjectName(t, restartedLatestPayload.ProjectState.ProjectConfig.Name, "restarted latest settings payload")
	assertSettingsProjectActiveViewMode(t, restartedLatestPayload.ProjectState.ProjectConfig.ActiveViewModeID, initialActiveViewModeID, "restarted latest settings payload")

	persistedProject := loadPersistedSettingsProject(t, restarted.app)
	assertSettingsProjectName(t, persistedProject.Name, "persisted settings project")
	if persistedProject.ActiveViewModeID != initialActiveViewModeID {
		t.Fatalf("expected persisted active view mode %q, got %q", initialActiveViewModeID, persistedProject.ActiveViewModeID)
	}
}

func TestAppSettingsProjectLoadRoutesRepairAndPersistMissingRequiredViewMode(t *testing.T) {
	cfg := newSettingsProjectTestConfig(t)
	fixture := startSettingsProjectAppFixture(t, cfg)
	postSettingsProjectAPIOnlyStatus(t, fixture, httpapi.RouteLoadProjectConfig, `{"projectConfigName":"settings"}`)
	postSettingsProjectAPIOnlyStatus(t, fixture, httpapi.RouteDeleteViewMode, `{"projectConfigId":"settings","viewModeId":"settings-all"}`)
	fixture.close(t, "after delete")

	restarted := startSettingsProjectAppFixture(t, cfg)
	t.Cleanup(func() {
		restarted.close(t, "restarted app")
	})

	restartedLoadPayload := postSettingsProjectAPI[projectview.SingleConfig](t, restarted, httpapi.RouteLoadProjectConfig, `{"projectConfigName":"settings"}`)
	assertSettingsProjectRestoresSettingsAllViewMode(t, restartedLoadPayload.ProjectConfig.ViewModes, "restarted settings payload")

	restartedLatestPayload := postSettingsProjectAPI[httpapi.ProjectStateSingleConfigWithCompletedOpIDs](t, restarted, httpapi.RouteGetLatestProjectState, `{"projectConfigId":"settings"}`)
	assertSettingsProjectRestoresSettingsAllViewMode(t, restartedLatestPayload.ProjectState.ProjectConfig.ViewModes, "restarted latest settings payload")

	persistedProject := loadPersistedSettingsProject(t, restarted.app)
	assertSettingsProjectRestoresSettingsAllViewMode(t, persistedProject.ViewModes, "persisted repaired settings project")
}

func TestAppSettingsProjectLoadRoutesRepairDeletedActiveViewModeAndReprojectLayout(t *testing.T) {
	cfg := newSettingsProjectTestConfig(t)
	app := startSettingsProjectApp(t, cfg)
	shutdownSettingsProjectApp(t, app, "initial app")
	settingsStore, err := projectstate.NewStore(filepath.Join(cfg.Paths.SettaFilesRoot, projectstate.SettingsFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted settings project store: %v", err)
	}
	settingsDocument, err := settingsStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted settings project document: %v", err)
	}
	settingsProject := settingsDocument.Projects[settingsstate.SettingsProjectID]
	delete(settingsProject.ViewModes, "settings-core")
	settingsProject.ActiveViewModeID = "settings-core"
	settingsProject.IsEditingViewMode = true
	settingsProject.Viewport = &projectstate.Viewport{X: 80, Y: 40, Zoom: 1.3}
	settingsProject.ViewportInitialized = true
	settingsDocument.Projects[settingsstate.SettingsProjectID] = settingsProject
	if err := settingsStore.Save(context.Background(), settingsDocument); err != nil {
		t.Fatalf("save corrupted settings project document: %v", err)
	}

	restartedApp := startSettingsProjectApp(t, cfg)
	t.Cleanup(func() {
		shutdownSettingsProjectApp(t, restartedApp, "restarted app")
	})

	restarted := settingsProjectAppFixture{
		app:        restartedApp,
		server:     httptest.NewServer(restartedApp.Handler()),
		authCookie: newAppTestAuthCookie(t, restartedApp),
	}
	t.Cleanup(func() {
		restarted.server.Close()
	})

	restartedLoadPayload := postSettingsProjectAPI[projectview.SingleConfig](t, restarted, httpapi.RouteLoadProjectConfig, `{"projectConfigName":"settings"}`)
	assertSettingsProjectRouteReprojectsActiveViewMode(t, restartedLoadPayload.ProjectConfig, "repaired settings load payload")

	restartedLatestPayload := postSettingsProjectAPI[httpapi.ProjectStateSingleConfigWithCompletedOpIDs](t, restarted, httpapi.RouteGetLatestProjectState, `{"projectConfigId":"settings"}`)
	assertSettingsProjectRouteReprojectsActiveViewMode(t, restartedLatestPayload.ProjectState.ProjectConfig, "repaired latest settings payload")

	repairedProject := loadPersistedSettingsProject(t, restartedApp)
	assertSettingsProjectPersistedReprojectsActiveViewMode(t, repairedProject)
}

type settingsProjectAppFixture struct {
	app        *App
	server     *httptest.Server
	authCookie *http.Cookie
}

func newSettingsProjectTestConfig(t *testing.T) config.Config {
	t.Helper()

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	return cfg
}

func startSettingsProjectApp(t *testing.T, cfg config.Config) *App {
	t.Helper()

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	return app
}

func startSettingsProjectAppFixture(t *testing.T, cfg config.Config) settingsProjectAppFixture {
	t.Helper()

	app := startSettingsProjectApp(t, cfg)
	return settingsProjectAppFixture{
		app:        app,
		server:     httptest.NewServer(app.Handler()),
		authCookie: newAppTestAuthCookie(t, app),
	}
}

func (fixture settingsProjectAppFixture) close(t *testing.T, reason string) {
	t.Helper()

	fixture.server.Close()
	shutdownSettingsProjectApp(t, fixture.app, reason)
}

func shutdownSettingsProjectApp(t *testing.T, app *App, reason string) {
	t.Helper()

	if err := app.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown %s: %v", reason, err)
	}
}

func postSettingsProjectAPI[T any](t *testing.T, fixture settingsProjectAppFixture, route string, body string) T {
	t.Helper()

	response := postSettingsProjectRequest(t, fixture, route, body)
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected %s 200, got %d with body %q", route, response.StatusCode, string(payload))
	}
	var decoded T
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		t.Fatalf("decode %s response: %v", route, err)
	}
	return decoded
}

func postSettingsProjectAPIOnlyStatus(t *testing.T, fixture settingsProjectAppFixture, route string, body string) {
	t.Helper()

	response := postSettingsProjectRequest(t, fixture, route, body)
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected %s 200, got %d with body %q", route, response.StatusCode, string(payload))
	}
}

func postSettingsProjectRequest(t *testing.T, fixture settingsProjectAppFixture, route string, body string) *http.Response {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, fixture.server.URL+"/api"+route, strings.NewReader(body))
	if err != nil {
		t.Fatalf("new %s request: %v", route, err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(fixture.authCookie)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post %s: %v", route, err)
	}
	return response
}

func loadPersistedSettingsProject(t *testing.T, app *App) projectstate.Project {
	t.Helper()

	persistedStore, err := projectstate.NewStore(app.ProjectStates().Paths().Settings, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted settings project store: %v", err)
	}
	persistedDocument, err := persistedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted settings project document: %v", err)
	}
	persistedProject, err := persistedDocument.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("persisted settings project by id: %v", err)
	}
	return persistedProject
}

func assertSettingsProjectName(t *testing.T, actual string, label string) {
	t.Helper()

	if actual != settingsstate.SettingsProjectName {
		t.Fatalf("expected %s name %q, got %q", label, settingsstate.SettingsProjectName, actual)
	}
}

func requireSettingsProjectActiveViewModeID(t *testing.T, activeViewModeID *string, label string) string {
	t.Helper()

	if activeViewModeID == nil {
		t.Fatalf("expected %s active view mode id", label)
	}
	return *activeViewModeID
}

func assertSettingsProjectActiveViewMode(t *testing.T, activeViewModeID *string, expected string, label string) {
	t.Helper()

	actual := requireSettingsProjectActiveViewModeID(t, activeViewModeID, label)
	if actual != expected {
		t.Fatalf("expected %s active view mode %q, got %q", label, expected, actual)
	}
}

func assertSettingsProjectRestoresSettingsAllViewMode(t *testing.T, viewModes map[string]projectstate.ViewMode, label string) {
	t.Helper()

	if len(viewModes) != 5 {
		t.Fatalf("expected %s to have 5 repaired view modes, got %d", label, len(viewModes))
	}
	if _, ok := viewModes["settings-all"]; !ok {
		t.Fatalf("expected %s to restore settings-all view mode", label)
	}
}

func assertSettingsProjectRouteReprojectsActiveViewMode(t *testing.T, projectConfig projectview.ProjectConfig, label string) {
	t.Helper()

	assertSettingsProjectRestoresSettingsAllViewMode(t, projectConfig.ViewModes, label)
	if projectConfig.IsEditingViewMode {
		t.Fatalf("expected %s to exit view-edit mode", label)
	}
	activeViewModeID := requireSettingsProjectActiveViewModeID(t, projectConfig.ActiveViewModeID, label)
	activeViewMode, ok := projectConfig.ViewModes[activeViewModeID]
	if !ok {
		t.Fatalf("expected %s active view mode %q to exist", label, activeViewModeID)
	}
	if !reflect.DeepEqual(projectConfig.TopLevelSections, activeViewMode.TopLevelSections) {
		t.Fatalf("expected %s to reproject the active view mode layout", label)
	}
	if !reflect.DeepEqual(projectConfig.Viewport, activeViewMode.Viewport) {
		t.Fatalf("expected %s to reproject the active view mode viewport", label)
	}
	if projectConfig.ViewportInitialized != activeViewMode.ViewportInitialized {
		t.Fatalf("expected %s to reproject viewportInitialized", label)
	}
}

func assertSettingsProjectPersistedReprojectsActiveViewMode(t *testing.T, project projectstate.Project) {
	t.Helper()

	if project.IsEditingViewMode {
		t.Fatal("expected repaired persisted settings project to exit view-edit mode")
	}
	activeViewMode, ok := project.ViewModes[project.ActiveViewModeID]
	if !ok {
		t.Fatalf("expected persisted repaired active view mode %q to exist", project.ActiveViewModeID)
	}
	if !reflect.DeepEqual(project.TopLevelSections, activeViewMode.TopLevelSections) {
		t.Fatal("expected repaired persisted settings project to reproject the active view mode layout")
	}
	if !reflect.DeepEqual(project.Viewport, activeViewMode.Viewport) {
		t.Fatal("expected repaired persisted settings project to reproject the active view mode viewport")
	}
	if project.ViewportInitialized != activeViewMode.ViewportInitialized {
		t.Fatal("expected repaired persisted settings project to reproject viewportInitialized")
	}
}

func TestAppStartupRebuildsMissingRequiredSettingsSection(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	if err := app.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown app: %v", err)
	}

	settingsStore, err := projectstate.NewStore(filepath.Join(cfg.Paths.SettaFilesRoot, projectstate.SettingsFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted settings project store: %v", err)
	}
	settingsDocument, err := settingsStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted settings project document: %v", err)
	}
	settingsProject := settingsDocument.Projects[settingsstate.SettingsProjectID]
	removeSettingsProjectSectionByName(&settingsProject, "spreadsheetSectionDefault")
	settingsDocument.Projects[settingsstate.SettingsProjectID] = settingsProject
	if err := settingsStore.Save(context.Background(), settingsDocument); err != nil {
		t.Fatalf("save corrupted settings project document: %v", err)
	}

	restartedApp, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("expected app startup to rebuild missing required settings section, got %v", err)
	}
	t.Cleanup(func() {
		if err := restartedApp.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown restarted app: %v", err)
		}
	})

	repairedStore, err := projectstate.NewStore(restartedApp.ProjectStates().Paths().Settings, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open rebuilt settings project store: %v", err)
	}
	repairedDocument, err := repairedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load rebuilt settings project document: %v", err)
	}
	repairedProject, err := repairedDocument.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("rebuilt settings project by id: %v", err)
	}
	if _, ok := repairedProject.Sections["settings-section__spreadsheetSectionDefault"]; !ok {
		t.Fatal("expected startup rebuild to restore spreadsheetSectionDefault")
	}
}

func TestAppStartupBackfillsMissingCodeObjsWithinExistingSettingsSections(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	if err := app.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown app: %v", err)
	}

	settingsStore, err := projectstate.NewStore(filepath.Join(cfg.Paths.SettaFilesRoot, projectstate.SettingsFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted settings project store: %v", err)
	}
	settingsDocument, err := settingsStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted settings project document: %v", err)
	}
	settingsProject := settingsDocument.Projects[settingsstate.SettingsProjectID]
	samples := []settingsProjectCodeObjBackfillSample{
		{
			sectionImplID:  "settings-section-impl__backend",
			codeObjID:      "settings-codeobj__backend__backend__autosave",
			codeObjVariant: "settings-codeobj-variant__backend__backend__autosave",
			codeObjImplID:  "settings-codeobj-impl__backend__backend__autosave",
			parentImplID:   "settings-codeobj-impl__backend__backend",
			expectedType:   "SwitchParam",
		},
		{
			sectionImplID:  "settings-section-impl__backend",
			codeObjID:      "settings-codeobj__backend__backend__renameRefactorMode",
			codeObjVariant: "settings-codeobj-variant__backend__backend__renameRefactorMode",
			codeObjImplID:  "settings-codeobj-impl__backend__backend__renameRefactorMode",
			parentImplID:   "settings-codeobj-impl__backend__backend",
			expectedType:   "DropdownParam",
			expectedChoices: []string{
				"ALWAYS_ASK",
				"ALWAYS_RENAME",
				"NEVER_RENAME",
			},
		},
		{
			sectionImplID:  "settings-section-impl__gui",
			codeObjID:      "settings-codeobj__gui__gui__gridColor",
			codeObjVariant: "settings-codeobj-variant__gui__gui__gridColor",
			codeObjImplID:  "settings-codeobj-impl__gui__gui__gridColor",
			parentImplID:   "settings-codeobj-impl__gui__gui",
			expectedType:   "ColorPickerParam",
		},
		{
			sectionImplID:  "settings-section-impl__sectionSizingPolicy",
			codeObjID:      "settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__metaControlByType",
			codeObjVariant: "settings-codeobj-variant__sectionSizingPolicy__sectionSizingPolicy__metaControlByType",
			codeObjImplID:  "settings-codeobj-impl__sectionSizingPolicy__sectionSizingPolicy__metaControlByType",
			parentImplID:   "settings-codeobj-impl__sectionSizingPolicy__sectionSizingPolicy",
			expectedType:   "NestedParam",
		},
	}
	for _, sample := range samples {
		if err := removeSettingsProjectCodeObjectByID(
			&settingsProject,
			sample.sectionImplID,
			sample.codeObjID,
			sample.codeObjVariant,
			sample.codeObjImplID,
			sample.parentImplID,
		); err != nil {
			t.Fatalf("remove settings code object %q: %v", sample.codeObjID, err)
		}
	}
	settingsDocument.Projects[settingsstate.SettingsProjectID] = settingsProject
	if err := settingsStore.Save(context.Background(), settingsDocument); err != nil {
		t.Fatalf("save corrupted settings project document: %v", err)
	}

	restartedApp, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("restart app: %v", err)
	}
	t.Cleanup(func() {
		if err := restartedApp.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown restarted app: %v", err)
		}
	})

	repairedStore, err := projectstate.NewStore(restartedApp.ProjectStates().Paths().Settings, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open repaired settings project store: %v", err)
	}
	repairedDocument, err := repairedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load repaired settings project document: %v", err)
	}
	repairedProject, err := repairedDocument.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("repaired settings project by id: %v", err)
	}
	assertSettingsProjectPersistedParamImplMappingContract(t, repairedProject, samples)
}

type settingsProjectCodeObjBackfillSample struct {
	sectionImplID   string
	codeObjID       string
	codeObjVariant  string
	codeObjImplID   string
	parentImplID    string
	expectedType    string
	expectedChoices []string
}

func removeSettingsProjectSectionByName(project *projectstate.Project, sectionName string) {
	sectionID := ""
	for candidateID, section := range project.Sections {
		if section.Name == sectionName {
			sectionID = candidateID
			break
		}
	}
	if sectionID == "" {
		return
	}

	variantID := project.SectionVariantMap[sectionID]
	delete(project.SectionVariantMap, sectionID)
	delete(project.Sections, sectionID)
	delete(project.TopLevelSections, sectionID)
	filteredSectionIDs := make([]string, 0, len(project.TopLevelSectionIDs))
	for _, topLevelSectionID := range project.TopLevelSectionIDs {
		if topLevelSectionID == sectionID {
			continue
		}
		filteredSectionIDs = append(filteredSectionIDs, topLevelSectionID)
	}
	project.TopLevelSectionIDs = filteredSectionIDs

	if variantID != "" {
		sectionVariant := project.SectionVariants[variantID]
		delete(project.SectionVariants, variantID)
		if sectionVariant.ImplID != "" {
			delete(project.SectionImpls, sectionVariant.ImplID)
		}
	}

	for viewModeID, viewMode := range project.ViewModes {
		delete(viewMode.VisibilityBySectionID, sectionID)
		delete(viewMode.TopLevelSections, sectionID)
		project.ViewModes[viewModeID] = viewMode
	}
}

func removeSettingsProjectCodeObjectByID(
	project *projectstate.Project,
	sectionImplID string,
	codeObjID string,
	codeObjVariantID string,
	codeObjImplID string,
	parentCodeObjImplID string,
) error {
	delete(project.CodeObjs, codeObjID)
	delete(project.CodeObjVariants, codeObjVariantID)
	delete(project.CodeObjImpls, codeObjImplID)

	sectionImpl := project.SectionImpls[sectionImplID]
	var sectionPayload map[string]any
	if err := json.Unmarshal(sectionImpl.Payload, &sectionPayload); err != nil {
		return err
	}
	codeObjVariantMap, ok := sectionPayload["codeObjVariantMap"].(map[string]any)
	if !ok {
		return errors.New("settings section payload missing codeObjVariantMap")
	}
	delete(codeObjVariantMap, codeObjID)
	encodedSectionPayload, err := json.Marshal(sectionPayload)
	if err != nil {
		return err
	}
	sectionImpl.Payload = encodedSectionPayload
	project.SectionImpls[sectionImplID] = sectionImpl

	parentImpl := project.CodeObjImpls[parentCodeObjImplID]
	var parentPayload map[string]any
	if err := json.Unmarshal(parentImpl.Payload, &parentPayload); err != nil {
		return err
	}
	rawChildren, ok := parentPayload["children"].([]any)
	if !ok {
		return errors.New("settings parent code object payload missing children")
	}
	filteredChildren := make([]string, 0, len(rawChildren))
	for _, rawChild := range rawChildren {
		childID, ok := rawChild.(string)
		if !ok {
			return errors.New("settings parent code object child must be a string")
		}
		if childID == codeObjID {
			continue
		}
		filteredChildren = append(filteredChildren, childID)
	}
	parentPayload["children"] = filteredChildren
	encodedParentPayload, err := json.Marshal(parentPayload)
	if err != nil {
		return err
	}
	parentImpl.Payload = encodedParentPayload
	project.CodeObjImpls[parentCodeObjImplID] = parentImpl
	return nil
}

func removeSettingsProjectSectionAutoHeight(
	project *projectstate.Project,
	sectionName string,
) error {
	sectionID := ""
	for candidateID, section := range project.Sections {
		if section.Name == sectionName {
			sectionID = candidateID
			break
		}
	}
	if sectionID == "" {
		return fmt.Errorf("missing settings section %q", sectionName)
	}
	variantID := project.SectionVariantMap[sectionID]
	implID := project.SectionVariants[variantID].ImplID
	sectionImpl := project.SectionImpls[implID]
	var payload map[string]any
	if err := json.Unmarshal(sectionImpl.Payload, &payload); err != nil {
		return err
	}
	size, ok := payload["size"].(map[string]any)
	if !ok {
		return errors.New("settings section payload missing size")
	}
	delete(size, "height")
	encodedPayload, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	sectionImpl.Payload = encodedPayload
	project.SectionImpls[implID] = sectionImpl
	return nil
}

func assertSettingsProjectPersistedParamImplMappingContract(
	t *testing.T,
	project projectstate.Project,
	samples []settingsProjectCodeObjBackfillSample,
) {
	t.Helper()

	for _, sample := range samples {
		if _, ok := project.CodeObjs[sample.codeObjID]; !ok {
			t.Fatalf("expected repaired settings code object %q", sample.codeObjID)
		}
		impl, ok := project.CodeObjImpls[sample.codeObjImplID]
		if !ok {
			t.Fatalf("expected repaired settings code object impl %q", sample.codeObjImplID)
		}
		if impl.Type != sample.expectedType {
			t.Fatalf("expected repaired settings code object impl %q type %q, got %q", sample.codeObjImplID, sample.expectedType, impl.Type)
		}
		payload := settingsProjectPersistedCodeObjImplPayload(t, impl)
		if got := payload["type"]; got != sample.expectedType {
			t.Fatalf("expected repaired settings payload %q type %q, got %#v", sample.codeObjImplID, sample.expectedType, got)
		}
		if len(sample.expectedChoices) == 0 {
			continue
		}
		rawChoices, ok := payload["choices"].([]any)
		if !ok {
			t.Fatalf("expected repaired settings payload %q choices, got %#v", sample.codeObjImplID, payload["choices"])
		}
		choices := make([]string, 0, len(rawChoices))
		for _, rawChoice := range rawChoices {
			choice, ok := rawChoice.(string)
			if !ok {
				t.Fatalf("expected repaired settings payload %q choice string, got %#v", sample.codeObjImplID, rawChoice)
			}
			choices = append(choices, choice)
		}
		if !reflect.DeepEqual(choices, sample.expectedChoices) {
			t.Fatalf("expected repaired settings payload %q choices %#v, got %#v", sample.codeObjImplID, sample.expectedChoices, choices)
		}
	}
}

func settingsProjectPersistedCodeObjImplPayload(
	t *testing.T,
	impl projectstate.CodeObjectImpl,
) map[string]any {
	t.Helper()

	var payload map[string]any
	if err := json.Unmarshal(impl.Payload, &payload); err != nil {
		t.Fatalf("decode persisted settings code object impl %q: %v", impl.ID, err)
	}
	return payload
}

func settingsProjectViewCodeObjValue(t *testing.T, payload projectview.SingleConfig, implID string) string {
	t.Helper()

	rawPayload, ok := payload.CodeObjImpls[implID]
	if !ok {
		t.Fatalf("expected code object impl %q", implID)
	}
	var decoded struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(rawPayload, &decoded); err != nil {
		t.Fatalf("decode code object impl %q: %v", implID, err)
	}
	return decoded.Value
}

func settingsProjectViewCodeObjChoices(t *testing.T, payload projectview.SingleConfig, implID string) []string {
	t.Helper()

	rawPayload, ok := payload.CodeObjImpls[implID]
	if !ok {
		t.Fatalf("expected code object impl %q", implID)
	}
	var decoded struct {
		Choices []string `json:"choices"`
	}
	if err := json.Unmarshal(rawPayload, &decoded); err != nil {
		t.Fatalf("decode code object impl %q choices: %v", implID, err)
	}
	return decoded.Choices
}

func assertSettingsProjectViewModeRouteContract(
	t *testing.T,
	payload projectview.SingleConfig,
) {
	t.Helper()

	expectedViewModeNames := []string{
		"Core",
		"Section Defaults Structure and Code",
		"Section Defaults Content and Media",
		"Param Defaults",
		"All Settings",
	}
	orderedViewModes := make([]projectstate.ViewMode, 0, len(payload.ProjectConfig.ViewModes))
	for _, viewMode := range payload.ProjectConfig.ViewModes {
		orderedViewModes = append(orderedViewModes, viewMode)
	}
	sort.Slice(orderedViewModes, func(i int, j int) bool {
		if orderedViewModes[i].SortIndex != orderedViewModes[j].SortIndex {
			return orderedViewModes[i].SortIndex < orderedViewModes[j].SortIndex
		}
		if orderedViewModes[i].Name != orderedViewModes[j].Name {
			return orderedViewModes[i].Name < orderedViewModes[j].Name
		}
		return orderedViewModes[i].ID < orderedViewModes[j].ID
	})
	if len(orderedViewModes) != len(expectedViewModeNames) {
		t.Fatalf("expected %d settings view modes, got %d", len(expectedViewModeNames), len(orderedViewModes))
	}
	for idx, expectedName := range expectedViewModeNames {
		if orderedViewModes[idx].Name != expectedName {
			t.Fatalf("expected settings view mode %d to be %q, got %q", idx, expectedName, orderedViewModes[idx].Name)
		}
		if orderedViewModes[idx].Viewport != nil {
			t.Fatalf("expected settings view mode %q viewport to default to nil, got %#v", expectedName, orderedViewModes[idx].Viewport)
		}
		if orderedViewModes[idx].ViewportInitialized {
			t.Fatalf("expected settings view mode %q viewportInitialized to default to false", expectedName)
		}
	}

	sectionIDByName := make(map[string]string, len(payload.Sections))
	for sectionID, section := range payload.Sections {
		sectionIDByName[section.Name] = sectionID
	}

	assertSettingsPayloadViewModeLayouts(
		t,
		settingsPayloadViewModeByName(t, payload.ProjectConfig.ViewModes, "Core"),
		sectionIDByName,
		[]string{
			"shortcuts",
			"gui",
			"backend",
			"sectionSizingPolicy",
			"languageServer",
		},
		0,
	)
	assertSettingsPayloadViewModeLayouts(
		t,
		settingsPayloadViewModeByName(t, payload.ProjectConfig.ViewModes, "Param Defaults"),
		sectionIDByName,
		[]string{
			"buttonParamCodeObjDefault",
			"codeCallableCodeObjDefault",
			"codeParamCodeObjDefault",
		},
		0,
	)
	assertSettingsPayloadViewModeLayouts(
		t,
		settingsPayloadViewModeByName(t, payload.ProjectConfig.ViewModes, "Section Defaults Structure and Code"),
		sectionIDByName,
		[]string{
			"stateMachineStartSectionDefault",
			"stateMachineGateSectionDefault",
			"stateMachineEndSectionDefault",
		},
		9,
	)
	assertSettingsPayloadViewModeLayouts(
		t,
		settingsPayloadViewModeByName(t, payload.ProjectConfig.ViewModes, "All Settings"),
		sectionIDByName,
		[]string{
			"shortcuts",
			"gui",
			"backend",
			"chatWindowing",
		},
		0,
	)
}

func settingsPayloadViewModeByName(
	t *testing.T,
	viewModes map[string]projectstate.ViewMode,
	viewModeName string,
) projectstate.ViewMode {
	t.Helper()
	for _, viewMode := range viewModes {
		if viewMode.Name == viewModeName {
			return viewMode
		}
	}
	t.Fatalf("expected settings payload view mode %q", viewModeName)
	return projectstate.ViewMode{}
}

func assertSettingsProjectRouteBootstrapMetadataContract(
	t *testing.T,
	payload projectview.SingleConfig,
	expectedSharedSettingsPath string,
) {
	t.Helper()

	for sectionID, section := range payload.Sections {
		variantID, ok := payload.ProjectConfig.SectionVariantMap[sectionID]
		if !ok {
			t.Fatalf("expected section variant map entry for %q", section.Name)
		}
		variant, ok := payload.SectionVariants[variantID]
		if !ok {
			t.Fatalf("expected section variant %q for %q", variantID, section.Name)
		}
		if variant.Name != expectedSharedSettingsPath {
			t.Fatalf("expected route section variant %q name %q, got %q", section.Name, expectedSharedSettingsPath, variant.Name)
		}
		sectionImplPayload := settingsPayloadSectionImplByID(t, payload, variant.Impl)
		if sectionImplPayload["configLanguage"] != "json" {
			t.Fatalf("expected settings route payload section %q configLanguage json, got %#v", section.Name, sectionImplPayload["configLanguage"])
		}
		isJSONSource, ok := sectionImplPayload["isJsonSource"].(bool)
		if !ok || !isJSONSource {
			t.Fatalf("expected settings route payload section %q to stay JSON-source backed, got %#v", section.Name, sectionImplPayload["isJsonSource"])
		}
		jsonSourceKeys, ok := sectionImplPayload["jsonSourceKeys"].([]any)
		if !ok || len(jsonSourceKeys) != 1 || jsonSourceKeys[0] != section.Name {
			t.Fatalf("expected settings route payload section %q jsonSourceKeys [%q], got %#v", section.Name, section.Name, sectionImplPayload["jsonSourceKeys"])
		}
		size, ok := sectionImplPayload["size"].(map[string]any)
		if !ok {
			t.Fatalf("expected settings route payload section %q to include size", section.Name)
		}
		width, ok := size["width"].(float64)
		if !ok {
			t.Fatalf("expected settings route payload section %q width to be numeric, got %#v", section.Name, size["width"])
		}
		if width != 550 {
			t.Fatalf("expected settings route payload section %q width 550, got %v", section.Name, width)
		}
		if got := size["height"]; got != "auto" {
			t.Fatalf("expected settings route payload section %q height auto, got %#v", section.Name, got)
		}
	}

	expectedDisplayNames := map[string]string{
		"gui":                         "GUI",
		"languageServer":              "Language Server",
		"iFrameSectionDefault":        "IFrame Section Default",
		"genPythonCodeSectionDefault": "Generated Python Code Section Default",
	}
	for sectionName, expectedDisplayName := range expectedDisplayNames {
		section := settingsPayloadSectionByName(t, payload.Sections, sectionName)
		if section.DisplayName != "" {
			t.Fatalf("expected route section %q display name to stay blank, got %q", sectionName, section.DisplayName)
		}
		codeObj := settingsPayloadCodeObjByName(t, payload.CodeObjs, sectionName)
		if codeObj.DisplayName != expectedDisplayName {
			t.Fatalf("expected route root code obj %q display name %q, got %q", sectionName, expectedDisplayName, codeObj.DisplayName)
		}
	}
}

func settingsPayloadSectionByName(
	t *testing.T,
	sections map[string]projectview.Core,
	sectionName string,
) projectview.Core {
	t.Helper()
	for _, section := range sections {
		if section.Name == sectionName {
			return section
		}
	}
	t.Fatalf("expected settings route section %q", sectionName)
	return projectview.Core{}
}

func settingsPayloadCodeObjByName(
	t *testing.T,
	codeObjs map[string]projectview.Core,
	codeObjName string,
) projectview.Core {
	t.Helper()
	for _, codeObj := range codeObjs {
		if codeObj.Name == codeObjName {
			return codeObj
		}
	}
	t.Fatalf("expected settings route code obj %q", codeObjName)
	return projectview.Core{}
}

func settingsProjectPersistedCodeObjByName(
	t *testing.T,
	codeObjs map[string]projectstate.CodeObject,
	codeObjName string,
) projectstate.CodeObject {
	t.Helper()
	for _, codeObj := range codeObjs {
		if codeObj.Name == codeObjName {
			return codeObj
		}
	}
	t.Fatalf("expected persisted settings code object %q", codeObjName)
	return projectstate.CodeObject{}
}

func assertSettingsProjectRouteCodeObjDisplayNames(
	t *testing.T,
	payload projectview.SingleConfig,
	expected map[string]string,
) {
	t.Helper()
	for codeObjName, expectedDisplayName := range expected {
		codeObj := settingsPayloadCodeObjByName(t, payload.CodeObjs, codeObjName)
		if codeObj.DisplayName != expectedDisplayName {
			t.Fatalf("expected route code object %q display name %q, got %q", codeObjName, expectedDisplayName, codeObj.DisplayName)
		}
	}
}

func assertSettingsProjectPersistedCodeObjDisplayNames(
	t *testing.T,
	project projectstate.Project,
	expected map[string]string,
) {
	t.Helper()
	for codeObjName, expectedDisplayName := range expected {
		codeObj := settingsProjectPersistedCodeObjByName(t, project.CodeObjs, codeObjName)
		if codeObj.DisplayName != expectedDisplayName {
			t.Fatalf("expected persisted code object %q display name %q, got %q", codeObjName, expectedDisplayName, codeObj.DisplayName)
		}
	}
}

func assertSettingsProjectRouteSectionAutoHeight(
	t *testing.T,
	payload projectview.SingleConfig,
	sectionName string,
) {
	t.Helper()
	section := settingsPayloadSectionByName(t, payload.Sections, sectionName)
	variantID := payload.ProjectConfig.SectionVariantMap[section.ID]
	variant, ok := payload.SectionVariants[variantID]
	if !ok {
		t.Fatalf("expected route section variant %q for %q", variantID, sectionName)
	}
	sectionImplPayload := settingsPayloadSectionImplByID(t, payload, variant.Impl)
	size, ok := sectionImplPayload["size"].(map[string]any)
	if !ok {
		t.Fatalf("expected route section %q size payload", sectionName)
	}
	if got := size["height"]; got != "auto" {
		t.Fatalf("expected route section %q height auto, got %#v", sectionName, got)
	}
}

func assertSettingsProjectPersistedSectionAutoHeight(
	t *testing.T,
	project projectstate.Project,
	sectionName string,
) {
	t.Helper()
	sectionID := ""
	for candidateID, section := range project.Sections {
		if section.Name == sectionName {
			sectionID = candidateID
			break
		}
	}
	if sectionID == "" {
		t.Fatalf("expected persisted settings section %q", sectionName)
	}
	variantID := project.SectionVariantMap[sectionID]
	implID := project.SectionVariants[variantID].ImplID
	sectionImpl := project.SectionImpls[implID]
	var payload map[string]any
	if err := json.Unmarshal(sectionImpl.Payload, &payload); err != nil {
		t.Fatalf("decode persisted settings section %q impl: %v", sectionName, err)
	}
	size, ok := payload["size"].(map[string]any)
	if !ok {
		t.Fatalf("expected persisted settings section %q size payload", sectionName)
	}
	if got := size["height"]; got != "auto" {
		t.Fatalf("expected persisted settings section %q height auto, got %#v", sectionName, got)
	}
}

func settingsProjectPersistedViewModeLayoutContainsSection(
	project projectstate.Project,
	viewModeID string,
	sectionID string,
) bool {
	viewMode, ok := project.ViewModes[viewModeID]
	if !ok {
		return false
	}
	_, ok = viewMode.TopLevelSections[sectionID]
	return ok
}

func settingsPayloadSectionImplByID(
	t *testing.T,
	payload projectview.SingleConfig,
	implID string,
) map[string]any {
	t.Helper()
	encoded, ok := payload.SectionImpls[implID]
	if !ok {
		t.Fatalf("expected settings route section impl %q", implID)
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal settings route section impl %q: %v", implID, err)
	}
	return decoded
}

func assertSettingsPayloadViewModeLayouts(
	t *testing.T,
	viewMode projectstate.ViewMode,
	sectionIDByName map[string]string,
	sectionNames []string,
	startIndex int,
) {
	t.Helper()
	for idx, sectionName := range sectionNames {
		sectionID, ok := sectionIDByName[sectionName]
		if !ok {
			t.Fatalf("expected settings section %q", sectionName)
		}
		layout, ok := viewMode.TopLevelSections[sectionID]
		if !ok {
			t.Fatalf("expected payload view mode %q to include layout for %q", viewMode.Name, sectionName)
		}
		expectedIndex := startIndex + idx
		expectedX := float64(expectedIndex%3) * 600
		expectedY := float64(expectedIndex/3) * 600
		if layout.X != expectedX || layout.Y != expectedY {
			t.Fatalf(
				"expected payload view mode %q section %q at (%v, %v), got (%v, %v)",
				viewMode.Name,
				sectionName,
				expectedX,
				expectedY,
				layout.X,
				layout.Y,
			)
		}
		if !viewMode.VisibilityBySectionID[sectionID] {
			t.Fatalf("expected payload view mode %q to mark %q visible", viewMode.Name, sectionName)
		}
	}
}
