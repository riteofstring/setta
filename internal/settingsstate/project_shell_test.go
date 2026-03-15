package settingsstate

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"reflect"
	"sort"
	"testing"

	"setta/internal/projectstate"
)

var expectedSettingsBootstrapRootCodeObjDisplayNames = map[string]string{
	"gui":                         "GUI",
	"languageServer":              "Language Server",
	"iFrameSectionDefault":        "IFrame Section Default",
	"genPythonCodeSectionDefault": "Generated Python Code Section Default",
}

type settingsParamImplContractSample struct {
	sectionName     string
	paramPath       []string
	expectedType    string
	expectedChoices []string
}

var expectedSettingsParamImplContractSamples = []settingsParamImplContractSample{
	{
		sectionName:  "backend",
		paramPath:    []string{"autosave"},
		expectedType: "SwitchParam",
	},
	{
		sectionName:     "backend",
		paramPath:       []string{"renameRefactorMode"},
		expectedType:    "DropdownParam",
		expectedChoices: []string{`"ALWAYS_ASK"`, `"ALWAYS_RENAME"`, `"NEVER_RENAME"`},
	},
	{
		sectionName:  "gui",
		paramPath:    []string{"gridColor"},
		expectedType: "ColorPickerParam",
	},
	{
		sectionName:  "sectionSizingPolicy",
		paramPath:    []string{"metaControlByType"},
		expectedType: "NestedParam",
	},
}

func TestBuildProjectDocumentMatchesSettingsShellContract(t *testing.T) {
	t.Parallel()

	settingsDocument, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}

	settingsPath := filepath.Join(t.TempDir(), DefaultFileName)
	projectDocument, err := buildProjectDocumentWithSharedSettingsPath(settingsDocument, settingsPath)
	if err != nil {
		t.Fatalf("build settings project document: %v", err)
	}

	project, err := projectDocument.ProjectByID(SettingsProjectID)
	if err != nil {
		t.Fatalf("project by id: %v", err)
	}
	if project.Name != SettingsProjectName {
		t.Fatalf("expected settings project name %q, got %q", SettingsProjectName, project.Name)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected settings shell to show param display names")
	}
	if project.AllowJSONSourceKeyEdits {
		t.Fatal("did not expect settings shell to allow JSON source key edits")
	}
	if len(project.TopLevelSectionIDs) != 46 {
		t.Fatalf("expected 46 top-level sections, got %d", len(project.TopLevelSectionIDs))
	}
	if len(project.Sections) != 46 {
		t.Fatalf("expected 46 sections, got %d", len(project.Sections))
	}
	if len(project.ViewModes) != 5 {
		t.Fatalf("expected 5 settings view modes, got %d", len(project.ViewModes))
	}
	if project.ActiveViewModeID != "settings-core" {
		t.Fatalf("expected active view mode settings-core, got %q", project.ActiveViewModeID)
	}
	if len(project.TopLevelSections) != 46 {
		t.Fatalf("expected shared settings layout to include 46 sections, got %d", len(project.TopLevelSections))
	}
	assertSettingsProjectViewModeLayoutAndViewportContract(t, project)
	assertSettingsProjectBootstrapMetadataContract(t, project, settingsPath)
	assertSettingsProjectParamImplMappingContract(t, project)

	expectedCountsByView := map[string]int{
		"All Settings":                        46,
		"Core":                                5,
		"Param Defaults":                      13,
		"Section Defaults Content and Media":  10,
		"Section Defaults Structure and Code": 12,
	}
	for _, viewMode := range project.ViewModes {
		expectedCount, ok := expectedCountsByView[viewMode.Name]
		if !ok {
			t.Fatalf("unexpected settings view mode %q", viewMode.Name)
		}
		visibleCount := 0
		for _, visible := range viewMode.VisibilityBySectionID {
			if visible {
				visibleCount++
			}
		}
		if visibleCount != expectedCount {
			t.Fatalf("expected %q to expose %d visible sections, got %d", viewMode.Name, expectedCount, visibleCount)
		}
	}

	roundTripDocument, err := ApplySettingsProjectDocument(settingsDocument, projectDocument)
	if err != nil {
		t.Fatalf("apply settings project document: %v", err)
	}
	if !reflect.DeepEqual(roundTripDocument, settingsDocument) {
		t.Fatalf("expected settings round-trip to preserve defaults, got %#v", roundTripDocument)
	}
}

func TestEnsureProjectRuntimeBootstrappedSeedsDedicatedSettingsProject(t *testing.T) {
	t.Parallel()

	settingsDocument, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime, err := OpenOverlayRuntime(settingsDocument)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open settings project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close settings project runtime: %v", err)
		}
	})

	if err := EnsureProjectRuntimeBootstrapped(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("ensure settings project runtime bootstrapped: %v", err)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID(SettingsProjectID)
	if err != nil {
		t.Fatalf("project by id: %v", err)
	}
	if project.Name != SettingsProjectName {
		t.Fatalf("expected settings project name %q, got %q", SettingsProjectName, project.Name)
	}
	if len(project.Sections) != 46 {
		t.Fatalf("expected 46 settings sections, got %d", len(project.Sections))
	}
}

func TestRefreshProjectRuntimeFromSettingsHydratesLiveValuesAndPreservesActiveViewMode(t *testing.T) {
	t.Parallel()

	settingsDocument, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime, err := OpenOverlayRuntime(settingsDocument)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open settings project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close settings project runtime: %v", err)
		}
	})

	if err := EnsureProjectRuntimeBootstrapped(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("ensure settings project runtime bootstrapped: %v", err)
	}

	if _, err := projectRuntime.MutateAndSave(t.Context(), func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects[SettingsProjectID]
		project.ActiveViewModeID = "settings-all"
		document.Projects[SettingsProjectID] = project
		return document, nil
	}); err != nil {
		t.Fatalf("set active view mode: %v", err)
	}

	if _, err := settingsRuntime.MutateAndSave(t.Context(), func(document Document) (Document, error) {
		document["backend"].(map[string]any)["renameRefactorMode"] = "NEVER_RENAME"
		return document, nil
	}); err != nil {
		t.Fatalf("update live settings runtime: %v", err)
	}

	if err := RefreshProjectRuntimeFromSettings(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("refresh settings project runtime: %v", err)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID(SettingsProjectID)
	if err != nil {
		t.Fatalf("project by id after refresh: %v", err)
	}
	if project.ActiveViewModeID != "settings-all" {
		t.Fatalf("expected active view mode settings-all, got %q", project.ActiveViewModeID)
	}
	if got := settingsProjectCodeObjValue(t, project, "settings-codeobj-impl__backend__backend__renameRefactorMode"); got != "NEVER_RENAME" {
		t.Fatalf("expected renameRefactorMode NEVER_RENAME, got %q", got)
	}
}

func TestRefreshProjectRuntimeFromSettingsPreservesExistingDisplayNamesAndBackfillsNewCodeObjs(t *testing.T) {
	t.Parallel()

	settingsDocument, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime, err := OpenOverlayRuntime(settingsDocument)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open settings project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close settings project runtime: %v", err)
		}
	})

	if err := EnsureProjectRuntimeBootstrapped(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("ensure settings project runtime bootstrapped: %v", err)
	}

	if _, err := projectRuntime.MutateAndSave(t.Context(), func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects[SettingsProjectID]

		guiCodeObjID := settingsCodeObjID("gui", []string{"gui"})
		guiCodeObj := project.CodeObjs[guiCodeObjID]
		guiCodeObj.DisplayName = "Custom GUI Label"
		project.CodeObjs[guiCodeObjID] = guiCodeObj

		languageServerCodeObjID := settingsCodeObjID("languageServer", []string{"languageServer"})
		languageServerCodeObj := project.CodeObjs[languageServerCodeObjID]
		languageServerCodeObj.DisplayName = ""
		project.CodeObjs[languageServerCodeObjID] = languageServerCodeObj

		if err := removeSettingsProjectCodeObject(
			&project,
			"backend",
			[]string{"backend", "renameRefactorMode"},
		); err != nil {
			return projectstate.Document{}, err
		}

		document.Projects[SettingsProjectID] = project
		return document, nil
	}); err != nil {
		t.Fatalf("mutate settings project display names: %v", err)
	}

	if err := RefreshProjectRuntimeFromSettings(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("refresh settings project runtime: %v", err)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID(SettingsProjectID)
	if err != nil {
		t.Fatalf("project by id after refresh: %v", err)
	}

	guiCodeObj := project.CodeObjs[settingsCodeObjID("gui", []string{"gui"})]
	if guiCodeObj.DisplayName != "Custom GUI Label" {
		t.Fatalf("expected gui display name Custom GUI Label, got %q", guiCodeObj.DisplayName)
	}

	languageServerCodeObj := project.CodeObjs[settingsCodeObjID("languageServer", []string{"languageServer"})]
	if languageServerCodeObj.DisplayName != "" {
		t.Fatalf("expected languageServer display name to stay blank, got %q", languageServerCodeObj.DisplayName)
	}

	renameRefactorModeCodeObj := project.CodeObjs[settingsCodeObjID("backend", []string{"backend", "renameRefactorMode"})]
	if renameRefactorModeCodeObj.DisplayName != "Rename Refactor Mode" {
		t.Fatalf("expected renameRefactorMode display name Rename Refactor Mode, got %q", renameRefactorModeCodeObj.DisplayName)
	}
}

func TestRefreshProjectRuntimeFromSettingsRepairsMissingRequiredViewMode(t *testing.T) {
	t.Parallel()

	settingsDocument, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime, err := OpenOverlayRuntime(settingsDocument)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open settings project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close settings project runtime: %v", err)
		}
	})

	if err := EnsureProjectRuntimeBootstrapped(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("ensure settings project runtime bootstrapped: %v", err)
	}

	if _, err := projectRuntime.MutateAndSave(t.Context(), func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects[SettingsProjectID]
		delete(project.ViewModes, "settings-all")
		project.ActiveViewModeID = "settings-param-defaults"
		project.IsEditingViewMode = true
		project.Viewport = &projectstate.Viewport{X: 80, Y: 40, Zoom: 1.3}
		project.ViewportInitialized = true
		document.Projects[SettingsProjectID] = project
		return document, nil
	}); err != nil {
		t.Fatalf("delete required view mode: %v", err)
	}

	if err := RefreshProjectRuntimeFromSettings(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("refresh settings project runtime: %v", err)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID(SettingsProjectID)
	if err != nil {
		t.Fatalf("project by id after refresh: %v", err)
	}
	if len(project.ViewModes) != 5 {
		t.Fatalf("expected 5 repaired settings view modes, got %d", len(project.ViewModes))
	}
	if _, ok := project.ViewModes["settings-all"]; !ok {
		t.Fatal("expected missing required settings-all view mode to be restored")
	}
	if project.ActiveViewModeID != "settings-param-defaults" {
		t.Fatalf("expected active view mode settings-param-defaults, got %q", project.ActiveViewModeID)
	}
	if project.IsEditingViewMode {
		t.Fatal("expected view-edit mode to reset to false after repair")
	}
	if project.Viewport != nil {
		t.Fatalf("expected repaired project viewport to be reset from rebuilt active tab, got %#v", project.Viewport)
	}
	if project.ViewportInitialized {
		t.Fatal("expected repaired project viewportInitialized to be false")
	}
	activeViewMode := project.ViewModes[project.ActiveViewModeID]
	if !reflect.DeepEqual(project.TopLevelSections, activeViewMode.TopLevelSections) {
		t.Fatalf("expected active view mode layout to be reprojected onto project layout")
	}
}

func TestRefreshProjectRuntimeFromSettingsRepairsMissingVisibleSectionLayout(
	t *testing.T,
) {
	t.Parallel()

	settingsDocument, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime, err := OpenOverlayRuntime(settingsDocument)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open settings project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close settings project runtime: %v", err)
		}
	})

	if err := EnsureProjectRuntimeBootstrapped(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("ensure settings project runtime bootstrapped: %v", err)
	}

	missingSectionID := settingsSectionID("buttonParamCodeObjDefault")
	if _, err := projectRuntime.MutateAndSave(t.Context(), func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects[SettingsProjectID]
		paramDefaultsViewMode := project.ViewModes["settings-param-defaults"]
		delete(paramDefaultsViewMode.TopLevelSections, missingSectionID)
		project.ViewModes["settings-param-defaults"] = paramDefaultsViewMode
		document.Projects[SettingsProjectID] = project
		return document, nil
	}); err != nil {
		t.Fatalf("remove visible settings section layout: %v", err)
	}

	if err := RefreshProjectRuntimeFromSettings(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("refresh settings project runtime: %v", err)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID(SettingsProjectID)
	if err != nil {
		t.Fatalf("project by id after refresh: %v", err)
	}
	paramDefaultsViewMode := project.ViewModes["settings-param-defaults"]
	if _, ok := paramDefaultsViewMode.TopLevelSections[missingSectionID]; !ok {
		t.Fatalf("expected Param Defaults view mode to restore layout for %q", missingSectionID)
	}
	if !paramDefaultsViewMode.VisibilityBySectionID[missingSectionID] {
		t.Fatalf("expected Param Defaults view mode to keep %q visible", missingSectionID)
	}
}

func TestEnsureProjectRuntimeBootstrappedFailsClosedOnMissingRequiredSection(t *testing.T) {
	t.Parallel()

	settingsDocument, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime, err := OpenOverlayRuntime(settingsDocument)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open settings project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close settings project runtime: %v", err)
		}
	})

	if err := EnsureProjectRuntimeBootstrapped(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("ensure settings project runtime bootstrapped: %v", err)
	}

	if _, err := projectRuntime.MutateAndSave(t.Context(), func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects[SettingsProjectID]
		removeSettingsProjectSection(&project, "spreadsheetSectionDefault")
		document.Projects[SettingsProjectID] = project
		return document, nil
	}); err != nil {
		t.Fatalf("remove required settings section: %v", err)
	}

	err = EnsureProjectRuntimeBootstrapped(t.Context(), settingsRuntime, projectRuntime)
	var missingSectionErr MissingSettingsSectionError
	if !errors.As(err, &missingSectionErr) {
		t.Fatalf("expected MissingSettingsSectionError, got %v", err)
	}
	if missingSectionErr.SectionName != "spreadsheetSectionDefault" {
		t.Fatalf("expected missing section spreadsheetSectionDefault, got %q", missingSectionErr.SectionName)
	}
}

func TestRefreshProjectRuntimeFromSettingsFailsClosedOnMissingRequiredSection(t *testing.T) {
	t.Parallel()

	settingsDocument, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime, err := OpenOverlayRuntime(settingsDocument)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open settings project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close settings project runtime: %v", err)
		}
	})

	if err := EnsureProjectRuntimeBootstrapped(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("ensure settings project runtime bootstrapped: %v", err)
	}

	if _, err := projectRuntime.MutateAndSave(t.Context(), func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects[SettingsProjectID]
		removeSettingsProjectSection(&project, "spreadsheetSectionDefault")
		document.Projects[SettingsProjectID] = project
		return document, nil
	}); err != nil {
		t.Fatalf("remove required settings section: %v", err)
	}

	err = RefreshProjectRuntimeFromSettings(t.Context(), settingsRuntime, projectRuntime)
	var missingSectionErr MissingSettingsSectionError
	if !errors.As(err, &missingSectionErr) {
		t.Fatalf("expected MissingSettingsSectionError, got %v", err)
	}
	if missingSectionErr.SectionName != "spreadsheetSectionDefault" {
		t.Fatalf("expected missing section spreadsheetSectionDefault, got %q", missingSectionErr.SectionName)
	}
}

func TestEnsureProjectRuntimeBootstrappedBackfillsMissingCodeObjsWithinExistingSections(t *testing.T) {
	t.Parallel()

	settingsDocument, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime, err := OpenOverlayRuntime(settingsDocument)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open settings project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close settings project runtime: %v", err)
		}
	})

	if err := EnsureProjectRuntimeBootstrapped(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("ensure settings project runtime bootstrapped: %v", err)
	}

	if _, err := projectRuntime.MutateAndSave(t.Context(), func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects[SettingsProjectID]
		for _, sample := range expectedSettingsParamImplContractSamples {
			if err := removeSettingsProjectCodeObject(
				&project,
				sample.sectionName,
				append([]string{sample.sectionName}, sample.paramPath...),
			); err != nil {
				return projectstate.Document{}, err
			}
		}
		document.Projects[SettingsProjectID] = project
		return document, nil
	}); err != nil {
		t.Fatalf("remove required settings code objects: %v", err)
	}

	if err := EnsureProjectRuntimeBootstrapped(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("re-ensure settings project runtime bootstrapped: %v", err)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID(SettingsProjectID)
	if err != nil {
		t.Fatalf("project by id after ensure: %v", err)
	}
	assertSettingsProjectParamImplMappingContract(t, project)
}

func assertSettingsProjectViewModeLayoutAndViewportContract(
	t *testing.T,
	project projectstate.Project,
) {
	t.Helper()

	expectedViewModeNames := []string{
		"Core",
		"Section Defaults Structure and Code",
		"Section Defaults Content and Media",
		"Param Defaults",
		"All Settings",
	}
	orderedViewModes := make([]projectstate.ViewMode, 0, len(project.ViewModes))
	for _, viewMode := range project.ViewModes {
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
		t.Fatalf("expected %d ordered settings view modes, got %d", len(expectedViewModeNames), len(orderedViewModes))
	}
	for idx, expectedName := range expectedViewModeNames {
		if orderedViewModes[idx].Name != expectedName {
			t.Fatalf("expected settings view mode %d to be %q, got %q", idx, expectedName, orderedViewModes[idx].Name)
		}
		if orderedViewModes[idx].Viewport != nil {
			t.Fatalf("expected view mode %q viewport to default to nil, got %#v", expectedName, orderedViewModes[idx].Viewport)
		}
		if orderedViewModes[idx].ViewportInitialized {
			t.Fatalf("expected view mode %q viewportInitialized to default to false", expectedName)
		}
	}

	sectionIDByName := make(map[string]string, len(project.Sections))
	for sectionID, section := range project.Sections {
		sectionIDByName[section.Name] = sectionID
	}

	assertSettingsViewModeSectionLayouts(
		t,
		settingsProjectViewModeByName(t, project, "Core"),
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
	assertSettingsViewModeSectionLayouts(
		t,
		settingsProjectViewModeByName(t, project, "Section Defaults Structure and Code"),
		sectionIDByName,
		[]string{
			"stateMachineStartSectionDefault",
			"stateMachineGateSectionDefault",
			"stateMachineEndSectionDefault",
		},
		9,
	)
	assertSettingsViewModeSectionLayouts(
		t,
		settingsProjectViewModeByName(t, project, "Param Defaults"),
		sectionIDByName,
		[]string{
			"buttonParamCodeObjDefault",
			"codeCallableCodeObjDefault",
			"codeParamCodeObjDefault",
		},
		0,
	)
	assertSettingsViewModeSectionLayouts(
		t,
		settingsProjectViewModeByName(t, project, "All Settings"),
		sectionIDByName,
		settingsSectionOrder,
		0,
	)

	hiddenSectionID := sectionIDByName["buttonParamCodeObjDefault"]
	coreViewMode := settingsProjectViewModeByName(t, project, "Core")
	if coreViewMode.VisibilityBySectionID[hiddenSectionID] {
		t.Fatal("expected buttonParamCodeObjDefault to remain hidden in the Core settings tab")
	}
}

func assertSettingsProjectBootstrapMetadataContract(
	t *testing.T,
	project projectstate.Project,
	expectedSharedSettingsPath string,
) {
	t.Helper()

	for _, sectionName := range settingsSectionOrder {
		sectionVariant, ok := project.SectionVariants[settingsSectionVariantID(sectionName)]
		if !ok {
			t.Fatalf("expected settings section variant for %q", sectionName)
		}
		if sectionVariant.Name != expectedSharedSettingsPath {
			t.Fatalf("expected settings section variant %q name %q, got %q", sectionName, expectedSharedSettingsPath, sectionVariant.Name)
		}
		sectionImpl, ok := project.SectionImpls[settingsSectionImplID(sectionName)]
		if !ok {
			t.Fatalf("expected settings section impl for %q", sectionName)
		}
		var payload map[string]any
		if err := json.Unmarshal(sectionImpl.Payload, &payload); err != nil {
			t.Fatalf("unmarshal settings section impl %q: %v", sectionName, err)
		}
		if payload["configLanguage"] != "json" {
			t.Fatalf("expected settings section %q configLanguage json, got %#v", sectionName, payload["configLanguage"])
		}
		isJSONSource, ok := payload["isJsonSource"].(bool)
		if !ok || !isJSONSource {
			t.Fatalf("expected settings section %q to stay JSON-source backed, got %#v", sectionName, payload["isJsonSource"])
		}
		jsonSourceKeys, ok := payload["jsonSourceKeys"].([]any)
		if !ok || len(jsonSourceKeys) != 1 || jsonSourceKeys[0] != sectionName {
			t.Fatalf("expected settings section %q jsonSourceKeys [%q], got %#v", sectionName, sectionName, payload["jsonSourceKeys"])
		}
		size, ok := payload["size"].(map[string]any)
		if !ok {
			t.Fatalf("expected settings section %q to include a size payload", sectionName)
		}
		width, ok := size["width"].(float64)
		if !ok {
			t.Fatalf("expected settings section %q width to be numeric, got %#v", sectionName, size["width"])
		}
		if width != settingsSectionWidth {
			t.Fatalf("expected settings section %q width %v, got %v", sectionName, settingsSectionWidth, width)
		}
	}

	for sectionName, expectedDisplayName := range expectedSettingsBootstrapRootCodeObjDisplayNames {
		section, ok := project.Sections[settingsSectionID(sectionName)]
		if !ok {
			t.Fatalf("expected settings section %q", sectionName)
		}
		if section.DisplayName != "" {
			t.Fatalf("expected section %q display name to stay blank, got %q", sectionName, section.DisplayName)
		}
		rootCodeObj, ok := project.CodeObjs[settingsCodeObjID(sectionName, []string{sectionName})]
		if !ok {
			t.Fatalf("expected root settings code object for %q", sectionName)
		}
		if rootCodeObj.DisplayName != expectedDisplayName {
			t.Fatalf(
				"expected root code object %q display name %q, got %q",
				sectionName,
				expectedDisplayName,
				rootCodeObj.DisplayName,
			)
		}
	}
}

func assertSettingsProjectParamImplMappingContract(
	t *testing.T,
	project projectstate.Project,
) {
	t.Helper()

	for _, sample := range expectedSettingsParamImplContractSamples {
		fullPath := append([]string{sample.sectionName}, sample.paramPath...)
		implID := settingsCodeObjImplID(sample.sectionName, fullPath)
		impl, ok := project.CodeObjImpls[implID]
		if !ok {
			t.Fatalf("expected settings code object impl %q", implID)
		}
		if impl.Type != sample.expectedType {
			t.Fatalf("expected settings code object impl %q type %q, got %q", implID, sample.expectedType, impl.Type)
		}
		payload := settingsProjectCodeObjImplPayload(t, impl)
		if got := payload["type"]; got != sample.expectedType {
			t.Fatalf("expected settings code object payload %q type %q, got %#v", implID, sample.expectedType, got)
		}
		if len(sample.expectedChoices) == 0 {
			continue
		}
		rawChoices, ok := payload["choices"].([]any)
		if !ok {
			t.Fatalf("expected settings code object payload %q choices, got %#v", implID, payload["choices"])
		}
		choices := make([]string, 0, len(rawChoices))
		for _, rawChoice := range rawChoices {
			choice, ok := rawChoice.(string)
			if !ok {
				t.Fatalf("expected settings code object payload %q choice string, got %#v", implID, rawChoice)
			}
			choices = append(choices, choice)
		}
		if !reflect.DeepEqual(choices, sample.expectedChoices) {
			t.Fatalf("expected settings code object payload %q choices %#v, got %#v", implID, sample.expectedChoices, choices)
		}
	}
}

func settingsProjectViewModeByName(
	t *testing.T,
	project projectstate.Project,
	viewModeName string,
) projectstate.ViewMode {
	t.Helper()
	for _, viewMode := range project.ViewModes {
		if viewMode.Name == viewModeName {
			return viewMode
		}
	}
	t.Fatalf("expected settings view mode %q", viewModeName)
	return projectstate.ViewMode{}
}

func assertSettingsViewModeSectionLayouts(
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
			t.Fatalf("expected view mode %q to include top-level layout for %q", viewMode.Name, sectionName)
		}
		if !viewMode.VisibilityBySectionID[sectionID] {
			t.Fatalf("expected view mode %q to mark %q visible", viewMode.Name, sectionName)
		}
		expectedIndex := startIndex + idx
		expectedX := float64(expectedIndex%settingsViewGridColumns) * settingsViewGridSpacing
		expectedY := float64(expectedIndex/settingsViewGridColumns) * settingsViewGridSpacing
		if layout.X != expectedX || layout.Y != expectedY {
			t.Fatalf(
				"expected view mode %q section %q at (%v, %v), got (%v, %v)",
				viewMode.Name,
				sectionName,
				expectedX,
				expectedY,
				layout.X,
				layout.Y,
			)
		}
	}
}

func removeSettingsProjectSection(project *projectstate.Project, sectionName string) {
	sectionID := settingsSectionID(sectionName)
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

func removeSettingsProjectCodeObject(
	project *projectstate.Project,
	sectionName string,
	path []string,
) error {
	codeObjID := settingsCodeObjID(sectionName, path)
	codeObjVariantID := settingsCodeObjVariantID(sectionName, path)
	codeObjImplID := settingsCodeObjImplID(sectionName, path)
	delete(project.CodeObjs, codeObjID)
	delete(project.CodeObjVariants, codeObjVariantID)
	delete(project.CodeObjImpls, codeObjImplID)

	sectionImplID := settingsSectionImplID(sectionName)
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

	parentImplID := settingsCodeObjImplID(sectionName, []string{sectionName})
	parentImpl := project.CodeObjImpls[parentImplID]
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
	project.CodeObjImpls[parentImplID] = parentImpl
	return nil
}

func settingsProjectCodeObjValue(t *testing.T, project projectstate.Project, implID string) string {
	t.Helper()

	impl, ok := project.CodeObjImpls[implID]
	if !ok {
		t.Fatalf("expected code object impl %q", implID)
	}
	payload := settingsProjectCodeObjImplPayload(t, impl)
	value, ok := payload["value"].(string)
	if !ok {
		t.Fatalf("expected code object impl %q string value, got %#v", implID, payload["value"])
	}
	return value
}

func settingsProjectCodeObjImplPayload(
	t *testing.T,
	impl projectstate.CodeObjectImpl,
) map[string]any {
	t.Helper()

	var payload map[string]any
	if err := json.Unmarshal(impl.Payload, &payload); err != nil {
		t.Fatalf("decode code object impl payload %q: %v", impl.ID, err)
	}
	return payload
}
