package settingsstate

import (
	"encoding/json"
	"errors"
	"reflect"
	"sort"
	"testing"

	"setta/internal/projectstate"
)

func TestBuildProjectDocumentMatchesSettingsShellContract(t *testing.T) {
	t.Parallel()

	settingsDocument, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}

	projectDocument, err := BuildProjectDocument(settingsDocument)
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

func TestEnsureProjectRuntimeBootstrappedBackfillsMissingCodeObjWithinExistingSection(t *testing.T) {
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
		t.Fatalf("remove required settings code object: %v", err)
	}

	if err := EnsureProjectRuntimeBootstrapped(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("re-ensure settings project runtime bootstrapped: %v", err)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID(SettingsProjectID)
	if err != nil {
		t.Fatalf("project by id after ensure: %v", err)
	}
	codeObjID := settingsCodeObjID("backend", []string{"backend", "renameRefactorMode"})
	if _, ok := project.CodeObjs[codeObjID]; !ok {
		t.Fatalf("expected EnsureProjectRuntimeBootstrapped to restore %q", codeObjID)
	}
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
	var payload struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(impl.Payload, &payload); err != nil {
		t.Fatalf("decode code object impl payload %q: %v", implID, err)
	}
	return payload.Value
}
