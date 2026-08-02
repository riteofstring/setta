package projectstate

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestDocumentCreateProjectInitializesSingleViewModeAndDefault(t *testing.T) {
	t.Parallel()

	document := NewDocument()

	projectID, projectName, err := document.CreateProject("bg-blue-500/60 dark:bg-blue-600/30")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	if projectName == "" {
		t.Fatal("expected non-empty created project name")
	}
	if document.DefaultProjectID != projectID {
		t.Fatalf("expected default project %q, got %q", projectID, document.DefaultProjectID)
	}
	if _, err := validateProjectName(document, projectID, projectName, false); err != nil {
		t.Fatalf("expected created project name to remain valid, got %q with error %v", projectName, err)
	}

	project, err := document.ProjectByID(projectID)
	if err != nil {
		t.Fatalf("ProjectByID returned error: %v", err)
	}
	if !project.AllowJSONSourceKeyEdits {
		t.Fatal("expected AllowJSONSourceKeyEdits to default to true")
	}
	if project.PreviewImgColor != "bg-blue-500/60 dark:bg-blue-600/30" {
		t.Fatalf("unexpected preview image color %q", project.PreviewImgColor)
	}
	assertDefaultGeneratedPythonProjectScaffold(t, project)
	assertDefaultProjectChatWindowingState(t, project)
	if len(project.ViewModes) != 1 {
		t.Fatalf("expected one initial view mode, got %#v", project.ViewModes)
	}
	if project.ActiveViewModeID == "" {
		t.Fatal("expected active view mode id")
	}
	if project.IsEditingViewMode {
		t.Fatal("expected created project to start outside view editing mode")
	}

	normalizedDocument, err := document.Normalized()
	if err != nil {
		t.Fatalf("expected created project document to normalize, got %v", err)
	}
	normalizedProject, err := normalizedDocument.ProjectByID(projectID)
	if err != nil {
		t.Fatalf("normalized ProjectByID returned error: %v", err)
	}
	assertDefaultGeneratedPythonProjectScaffold(t, normalizedProject)
	assertDefaultProjectChatWindowingState(t, normalizedProject)

	viewMode, ok := project.ViewModes[project.ActiveViewModeID]
	if !ok {
		t.Fatalf("expected active view mode %q to exist", project.ActiveViewModeID)
	}
	if viewMode.Name == "" {
		t.Fatal("expected initial view mode name")
	}
	if _, err := validateViewModeName(project, project.ActiveViewModeID, viewMode.Name); err != nil {
		t.Fatalf("expected created view mode name to remain valid, got %q with error %v", viewMode.Name, err)
	}
	if !viewMode.VisibilityBySectionID[project.TopLevelSectionIDs[0]] {
		t.Fatalf("expected initial view mode to show created generated section, got %#v", viewMode.VisibilityBySectionID)
	}
	if _, ok := viewMode.TopLevelSections[project.TopLevelSectionIDs[0]]; !ok {
		t.Fatalf("expected initial view mode to include created generated section layout, got %#v", viewMode.TopLevelSections)
	}
}

func assertDefaultGeneratedPythonProjectScaffold(t *testing.T, project Project) {
	t.Helper()

	assertDefaultPythonCodegenBindings(t, project)
	section := assertDefaultGeneratedPythonSection(t, project)
	variant, ok := project.SectionVariants[section.DefaultVariantID]
	if !ok {
		t.Fatalf("expected generated section variant %q, got %#v", section.DefaultVariantID, project.SectionVariants)
	}
	impl, ok := project.SectionImpls[variant.ImplID]
	if !ok {
		t.Fatalf("expected generated section impl %q, got %#v", variant.ImplID, project.SectionImpls)
	}
	if !impl.IsGenerated() || impl.Generated == nil || impl.Generated.Kind != GeneratedSectionKindPythonCode {
		t.Fatalf("expected generated python code impl, got %#v", impl)
	}
	assertDefaultGeneratedPythonPayload(t, project, impl)
}

func assertDefaultPythonCodegenBindings(t *testing.T, project Project) {
	t.Helper()

	if len(project.CodegenTargets) != 1 {
		t.Fatalf("expected one default codegen target, got %#v", project.CodegenTargets)
	}
	if project.CodegenTargets[0].Language != string(CodeLanguagePython) {
		t.Fatalf("expected default python codegen target, got %#v", project.CodegenTargets[0])
	}
	if project.GeneratedCodeBinding == nil {
		t.Fatal("expected generated code binding")
	}
	if project.GeneratedCodeBinding.Path != GeneratedPythonCodeRelativePath(project.Name) {
		t.Fatalf("unexpected generated code binding path %q", project.GeneratedCodeBinding.Path)
	}
	if project.GeneratedCodeBinding.AccessMode != CodeFileAccessModeWriteOnly {
		t.Fatalf("expected generated code binding write_only, got %q", project.GeneratedCodeBinding.AccessMode)
	}
	if project.GeneratedMetadataBinding != nil {
		t.Fatalf("expected no generated metadata binding by default, got %#v", project.GeneratedMetadataBinding)
	}
}

func assertDefaultGeneratedPythonSection(t *testing.T, project Project) Section {
	t.Helper()

	if len(project.TopLevelSectionIDs) != 1 {
		t.Fatalf("expected one top-level section, got %#v", project.TopLevelSectionIDs)
	}
	if len(project.TopLevelSections) != 1 {
		t.Fatalf("expected one top-level section layout, got %#v", project.TopLevelSections)
	}

	sectionID := project.TopLevelSectionIDs[0]
	layout, ok := project.TopLevelSections[sectionID]
	if !ok {
		t.Fatalf("expected top-level layout for %q, got %#v", sectionID, project.TopLevelSections)
	}
	if layout.X != 0 || layout.Y != 0 {
		t.Fatalf("expected generated section layout at origin, got %#v", layout)
	}
	if layout.W != nil || layout.H != nil {
		t.Fatalf("expected generated section layout without explicit size overrides, got %#v", layout)
	}

	section, ok := project.Sections[sectionID]
	if !ok {
		t.Fatalf("expected created generated section %q, got %#v", sectionID, project.Sections)
	}
	if section.Name != "Generated Python Code" {
		t.Fatalf("expected generated section name, got %q", section.Name)
	}
	if len(section.VariantIDs) != 1 {
		t.Fatalf("expected exactly one generated section variant, got %#v", section.VariantIDs)
	}
	if project.SectionVariantMap[sectionID] != section.DefaultVariantID {
		t.Fatalf("expected section variant map %q to match default variant %q", project.SectionVariantMap[sectionID], section.DefaultVariantID)
	}
	return section
}

func assertDefaultGeneratedPythonPayload(t *testing.T, project Project, impl SectionImpl) {
	t.Helper()

	payload, err := rawObjectFromProjectPayload(impl.Payload)
	if err != nil {
		t.Fatalf("decode generated section payload: %v", err)
	}
	if got := payloadStringField(payload, "type"); got != "GenPythonCode" {
		t.Fatalf("expected generated section type GenPythonCode, got %q", got)
	}
	rawBinding, ok := payload["codeFileBinding"].(map[string]any)
	if !ok {
		t.Fatalf("expected generated section codeFileBinding object, got %#v", payload["codeFileBinding"])
	}
	if got := payloadRawStringField(rawBinding, "canonical_path"); got != GeneratedPythonCodeRelativePath(project.Name) {
		t.Fatalf("expected generated section binding path %q, got %q", GeneratedPythonCodeRelativePath(project.Name), got)
	}
	if got := payloadRawStringField(rawBinding, "access_mode"); got != string(CodeFileAccessModeWriteOnly) {
		t.Fatalf("expected generated section binding access mode %q, got %q", CodeFileAccessModeWriteOnly, got)
	}
	if got, ok := rawBinding["autoBinding"].(bool); !ok || got {
		t.Fatalf("expected generated section autoBinding=false, got %#v", rawBinding["autoBinding"])
	}
}

func assertDefaultProjectChatWindowingState(t *testing.T, project Project) {
	t.Helper()

	if project.ProjectChatWindowing == nil {
		t.Fatal("expected default project chat windowing state")
	}
	if len(project.ProjectChatWindowing.InstancesByID) != 0 {
		t.Fatalf("expected no project chat windows by default, got %#v", project.ProjectChatWindowing.InstancesByID)
	}
	if !reflect.DeepEqual(project.ProjectChatWindowing.Order, []string{}) {
		t.Fatalf("expected empty project chat window order, got %#v", project.ProjectChatWindowing.Order)
	}
	if project.ProjectChatWindowing.NextInstanceNumber != 1 {
		t.Fatalf("expected next instance number 1, got %d", project.ProjectChatWindowing.NextInstanceNumber)
	}
}

func TestNextAvailableProjectNameRetriesGeneratedNamesUntilOneIsValid(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.Projects["project-1"] = Project{ID: "project-1", Name: "happy_bear"}

	attempts := 0
	projectName, err := nextAvailableProjectNameWithGenerator(document, func() (string, error) {
		attempts++
		switch attempts {
		case 1:
			return "happy_bear", nil
		case 2:
			return "home", nil
		default:
			return "calm_fox", nil
		}
	})
	if err != nil {
		t.Fatalf("nextAvailableProjectNameWithGenerator returned error: %v", err)
	}
	if projectName != "calm_fox" {
		t.Fatalf("expected calm_fox after retries, got %q", projectName)
	}
	if attempts != 3 {
		t.Fatalf("expected 3 attempts, got %d", attempts)
	}
}

func TestDocumentCloneProjectCreatesIndependentCopy(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	sourceProjectID, _, err := document.CreateProject("bg-blue-500/60 dark:bg-blue-600/30")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	clonedProjectID, normalizedName, err := document.CloneProject(sourceProjectID, "  Cloned Project  ")
	if err != nil {
		t.Fatalf("CloneProject returned error: %v", err)
	}
	if normalizedName != "Cloned Project" {
		t.Fatalf("expected normalized cloned name, got %q", normalizedName)
	}
	if clonedProjectID == sourceProjectID {
		t.Fatalf("expected new project id, got %q", clonedProjectID)
	}

	sourceProject, err := document.ProjectByID(sourceProjectID)
	if err != nil {
		t.Fatalf("ProjectByID source returned error: %v", err)
	}
	sourceViewModeName := sourceProject.ViewModes[sourceProject.ActiveViewModeID].Name
	clonedProject, err := document.ProjectByID(clonedProjectID)
	if err != nil {
		t.Fatalf("ProjectByID clone returned error: %v", err)
	}
	if clonedProject.Name != "Cloned Project" {
		t.Fatalf("expected cloned project name, got %q", clonedProject.Name)
	}
	if len(clonedProject.ViewModes) != len(sourceProject.ViewModes) {
		t.Fatalf("expected cloned view modes %#v to match source %#v", clonedProject.ViewModes, sourceProject.ViewModes)
	}

	clonedViewMode := clonedProject.ViewModes[clonedProject.ActiveViewModeID]
	clonedViewMode.Name = "Modified Clone"
	clonedProject.ViewModes[clonedProject.ActiveViewModeID] = clonedViewMode
	document.Projects[clonedProjectID] = clonedProject

	sourceAfterMutation, err := document.ProjectByID(sourceProjectID)
	if err != nil {
		t.Fatalf("ProjectByID source after mutation returned error: %v", err)
	}
	if sourceAfterMutation.ViewModes[sourceAfterMutation.ActiveViewModeID].Name != sourceViewModeName {
		t.Fatalf("expected source project to remain unchanged, got %#v", sourceAfterMutation.ViewModes)
	}
}

func TestDocumentCloneProjectCopiesProjectScopedPluginData(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	sourceProjectID, _, err := document.CreateProject("bg-blue-500/60 dark:bg-blue-600/30")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	expected := testWatchCodeLifecycleProjectData()
	mustSetTestWatchCodePluginProjectData(t, &document, sourceProjectID, expected)
	expectedOpaquePluginData := seedOpaqueLifecyclePluginData(&document)
	document.PluginData["plugin.example"] = lifecycleProjectScopedPluginPayload(sourceProjectID, "project-other")

	clonedProjectID, _, err := document.CloneProject(sourceProjectID, "Cloned Project")
	if err != nil {
		t.Fatalf("CloneProject returned error: %v", err)
	}
	assertOpaqueLifecyclePluginDataPreserved(t, document, expectedOpaquePluginData)
	assertProjectScopedPluginPayload(t, document, "plugin.example", clonedProjectID, map[string]any{"value": float64(1)})
	assertProjectScopedPluginPayload(t, document, "plugin.example", "project-other", map[string]any{"value": float64(2), "keep": []any{"stable"}})

	clonedData := mustReadTestWatchCodePluginProjectData(t, document, clonedProjectID)
	if !reflect.DeepEqual(clonedData, expected.Normalized()) {
		t.Fatalf("expected cloned plugin data %#v, got %#v", expected.Normalized(), clonedData)
	}

	clonedData.Files = append(clonedData.Files, "pkg/clone_only.py")
	mustSetTestWatchCodePluginProjectData(t, &document, clonedProjectID, clonedData)
	sourceData := mustReadTestWatchCodePluginProjectData(t, document, sourceProjectID)
	if !reflect.DeepEqual(sourceData, expected.Normalized()) {
		t.Fatalf("expected source plugin data to remain unchanged, got %#v", sourceData)
	}
}

func TestDocumentCloneProjectKeepsCopiedGraphReferencesProjectScoped(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.DefaultProjectID = "project-alpha"
	document.Projects["project-alpha"] = Project{
		ID:   "project-alpha",
		Name: "Alpha",
		Sections: map[string]Section{
			"source-section": {
				ID:               "source-section",
				Name:             "Source",
				VariantIDs:       []string{"source-variant"},
				DefaultVariantID: "source-variant",
			},
			"target-section": {
				ID:               "target-section",
				Name:             "Target",
				VariantIDs:       []string{"target-variant"},
				DefaultVariantID: "target-variant",
			},
			"chat-section": {
				ID:               "chat-section",
				Name:             "Chat",
				VariantIDs:       []string{"chat-variant"},
				DefaultVariantID: "chat-variant",
			},
		},
		SectionVariantMap: map[string]string{
			"source-section": "source-variant",
			"target-section": "target-variant",
			"chat-section":   "chat-variant",
		},
		SectionVariants: map[string]SectionVariant{
			"source-variant": {ID: "source-variant", ImplID: "source-impl"},
			"target-variant": {ID: "target-variant", ImplID: "target-impl"},
			"chat-variant":   {ID: "chat-variant", ImplID: "chat-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"source-impl": {ID: "source-impl", Kind: SectionKind("dict")},
			"target-impl": {ID: "target-impl", Kind: SectionKind("dict")},
			"chat-impl":   {ID: "chat-impl", Kind: SectionKind("chat")},
		},
		CodeObjs: map[string]CodeObject{
			"target-param": {
				ID:               "target-param",
				Name:             "target_param",
				VariantIDs:       []string{"target-param-variant"},
				DefaultVariantID: "target-param-variant",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"target-param-variant": {ID: "target-param-variant", ImplID: "target-param-impl"},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"target-param-impl": {ID: "target-param-impl", Type: "TextParam"},
		},
		Edges: []Edge{
			{
				ID:              "edge-1",
				SourceSectionID: "source-section",
				SourceVariantID: "source-variant",
				SourcePortID:    "output-port",
				TargetSectionID: "target-section",
				TargetVariantID: "target-variant",
				TargetPortID:    "target-param",
			},
		},
		AgenticEdges: []AgenticEdge{
			{
				ID:              "agentic-edge-1",
				SourceSectionID: "chat-section",
				TargetSectionID: "target-section",
				Kind:            "section_chat",
			},
		},
	}

	clonedProjectID, normalizedName, err := document.CloneProject("project-alpha", "Cloned Alpha")
	if err != nil {
		t.Fatalf("CloneProject returned error: %v", err)
	}
	if normalizedName != "Cloned Alpha" {
		t.Fatalf("expected normalized cloned name, got %q", normalizedName)
	}
	if clonedProjectID == "project-alpha" {
		t.Fatalf("expected new project id, got %q", clonedProjectID)
	}

	clonedProject, err := document.ProjectByID(clonedProjectID)
	if err != nil {
		t.Fatalf("ProjectByID clone returned error: %v", err)
	}
	if len(clonedProject.Edges) != 1 {
		t.Fatalf("expected one copied edge, got %#v", clonedProject.Edges)
	}
	clonedEdge := clonedProject.Edges[0]
	if _, ok := clonedProject.Sections[clonedEdge.SourceSectionID]; !ok {
		t.Fatalf("expected copied edge source %q to remain project-scoped, got %#v", clonedEdge.SourceSectionID, clonedProject.Sections)
	}
	if _, ok := clonedProject.Sections[clonedEdge.TargetSectionID]; !ok {
		t.Fatalf("expected copied edge target %q to remain project-scoped, got %#v", clonedEdge.TargetSectionID, clonedProject.Sections)
	}
	if _, ok := clonedProject.SectionVariants[clonedEdge.SourceVariantID]; !ok {
		t.Fatalf("expected copied edge source variant %q to remain project-scoped, got %#v", clonedEdge.SourceVariantID, clonedProject.SectionVariants)
	}
	if _, ok := clonedProject.SectionVariants[clonedEdge.TargetVariantID]; !ok {
		t.Fatalf("expected copied edge target variant %q to remain project-scoped, got %#v", clonedEdge.TargetVariantID, clonedProject.SectionVariants)
	}
	if _, ok := clonedProject.CodeObjs[clonedEdge.TargetPortID]; !ok {
		t.Fatalf("expected copied edge target port %q to remain project-scoped, got %#v", clonedEdge.TargetPortID, clonedProject.CodeObjs)
	}

	if len(clonedProject.AgenticEdges) != 1 {
		t.Fatalf("expected one copied agentic edge, got %#v", clonedProject.AgenticEdges)
	}
	clonedAgenticEdge := clonedProject.AgenticEdges[0]
	if _, ok := clonedProject.Sections[clonedAgenticEdge.SourceSectionID]; !ok {
		t.Fatalf("expected copied agentic edge source %q to remain project-scoped, got %#v", clonedAgenticEdge.SourceSectionID, clonedProject.Sections)
	}
	if _, ok := clonedProject.Sections[clonedAgenticEdge.TargetSectionID]; !ok {
		t.Fatalf("expected copied agentic edge target %q to remain project-scoped, got %#v", clonedAgenticEdge.TargetSectionID, clonedProject.Sections)
	}
}

// Whole-project clone should give copied password params fresh impl ids so the
// clone cannot resolve the source project's stored secret through the shared
// runtime secret store.
func TestDocumentCloneProjectClearsCopiedPasswordSecrets(t *testing.T) {
	t.Parallel()

	secrets, err := NewFilePasswordSecretStore(t.TempDir())
	if err != nil {
		t.Fatalf("new password secret store: %v", err)
	}
	sourceProject := passwordParamNameAndValueTestProject(t)
	sourceProject.passwordSecrets = secrets
	if err := sourceProject.SetSectionCodeObjectValue("dict-a", "shared-secret", "hunter2"); err != nil {
		t.Fatalf("seed source password secret: %v", err)
	}

	document := NewDocument()
	document.DefaultProjectID = "project-alpha"
	document.Projects["project-alpha"] = sourceProject

	clonedProjectID, _, err := document.CloneProject("project-alpha", "Cloned Alpha")
	if err != nil {
		t.Fatalf("CloneProject returned error: %v", err)
	}

	sourceProject, err = document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("ProjectByID source returned error: %v", err)
	}
	_, _, _, sourceImpl, err := sourceProject.ResolveSectionCodeObject("dict-a", "shared-secret")
	if err != nil {
		t.Fatalf("resolve source password param: %v", err)
	}

	clonedProject, err := document.ProjectByID(clonedProjectID)
	if err != nil {
		t.Fatalf("ProjectByID clone returned error: %v", err)
	}
	clonedPayload, _, _, clonedImpl, err := clonedProject.ResolveSectionCodeObject("dict-a", "shared-secret")
	if err != nil {
		t.Fatalf("resolve cloned password param: %v", err)
	}
	if clonedImpl.ID == sourceImpl.ID {
		t.Fatalf("expected cloned password impl id to differ from source, got %q", clonedImpl.ID)
	}
	if got, ok := clonedPayload["hasSecret"].(bool); !ok || got {
		t.Fatalf("expected cloned password hasSecret false, got %#v", clonedPayload["hasSecret"])
	}
	if got := payloadRawStringField(clonedPayload, "value"); got != "" {
		t.Fatalf("expected cloned password value blank, got %q", got)
	}
	assertCodeObjectSharedHasSecret(t, sourceProject, "shared-secret", true)
	assertCodeObjectSharedHasSecret(t, clonedProject, "shared-secret", false)

	secret, err := secrets.Get(clonedImpl.ID)
	if err != nil {
		t.Fatalf("read cloned password secret: %v", err)
	}
	if secret != "" {
		t.Fatalf("expected cloned password secret cleared, got %q", secret)
	}

	secret, err = secrets.Get(sourceImpl.ID)
	if err != nil {
		t.Fatalf("read source password secret: %v", err)
	}
	if secret != "hunter2" {
		t.Fatalf("expected source password secret hunter2, got %q", secret)
	}
}

func TestDocumentSaveAsNewProjectConfigWithRefsClearsSavedChatIDsAndResetsLiveWindowing(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.DefaultProjectID = "project-alpha"
	document.Projects["project-alpha"] = testSaveAsNewProjectConfigSourceProject()

	clonedProjectID, normalizedName, err := document.SaveAsNewProjectConfig(
		"project-alpha",
		"  Copied With Refs  ",
		true,
	)
	if err != nil {
		t.Fatalf("SaveAsNewProjectConfig returned error: %v", err)
	}
	if normalizedName != "Copied With Refs" {
		t.Fatalf("expected normalized cloned name, got %q", normalizedName)
	}
	if clonedProjectID == "project-alpha" {
		t.Fatalf("expected new project id, got %q", clonedProjectID)
	}

	clonedProject, err := document.ProjectByID(clonedProjectID)
	if err != nil {
		t.Fatalf("ProjectByID clone returned error: %v", err)
	}
	if clonedProject.ProjectChatWindowing == nil {
		t.Fatal("expected cloned live windowing state")
	}
	if !reflect.DeepEqual(*clonedProject.ProjectChatWindowing, DefaultProjectChatWindowingState()) {
		t.Fatalf("expected withRefs clone to seed empty live windowing, got %#v", clonedProject.ProjectChatWindowing)
	}

	clonedWindowSpace := clonedProject.WindowSpaces["space-1"]
	if clonedWindowSpace.WindowsByID["project-window"].ChatID != nil {
		t.Fatalf("expected saved project-chat binding cleared, got %#v", clonedWindowSpace.WindowsByID["project-window"].ChatID)
	}
	if clonedWindowSpace.WindowsByID["section-window"].ChatID != nil {
		t.Fatalf("expected saved section-chat binding cleared, got %#v", clonedWindowSpace.WindowsByID["section-window"].ChatID)
	}
	if clonedWindowSpace.WindowsByID["section-window"].SectionIDOrNull == nil || *clonedWindowSpace.WindowsByID["section-window"].SectionIDOrNull != "chat-section" {
		t.Fatalf("expected saved section binding to stay project-scoped, got %#v", clonedWindowSpace.WindowsByID["section-window"].SectionIDOrNull)
	}
	if _, ok := clonedProject.Sections["chat-section"]; !ok {
		t.Fatalf("expected cloned project to retain project-scoped section ids, got %#v", clonedProject.Sections)
	}
}

func TestDocumentSaveAsNewProjectConfigWithoutRefsCopiesLiveWindowingAndClearsChatIDs(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.DefaultProjectID = "project-alpha"
	document.Projects["project-alpha"] = testSaveAsNewProjectConfigSourceProject()

	clonedProjectID, normalizedName, err := document.SaveAsNewProjectConfig(
		"project-alpha",
		"Copied Without Refs",
		false,
	)
	if err != nil {
		t.Fatalf("SaveAsNewProjectConfig returned error: %v", err)
	}
	if normalizedName != "Copied Without Refs" {
		t.Fatalf("expected normalized cloned name, got %q", normalizedName)
	}

	clonedProject, err := document.ProjectByID(clonedProjectID)
	if err != nil {
		t.Fatalf("ProjectByID clone returned error: %v", err)
	}
	if clonedProject.ProjectChatWindowing == nil {
		t.Fatal("expected cloned live windowing state")
	}
	if !reflect.DeepEqual(clonedProject.ProjectChatWindowing.Order, []string{"project-window", "section-window"}) {
		t.Fatalf("expected live window order to be preserved, got %#v", clonedProject.ProjectChatWindowing.Order)
	}
	if clonedProject.ProjectChatWindowing.NextInstanceNumber != 3 {
		t.Fatalf("expected next instance number 3, got %d", clonedProject.ProjectChatWindowing.NextInstanceNumber)
	}

	projectWindow := clonedProject.ProjectChatWindowing.InstancesByID["project-window"]
	if projectWindow.ChatID != nil {
		t.Fatalf("expected copied project chat id to be cleared, got %#v", projectWindow.ChatID)
	}
	if projectWindow.Bounds.Width != 520 || projectWindow.Bounds.Height != 360 {
		t.Fatalf("expected live project-chat bounds to be preserved, got %#v", projectWindow.Bounds)
	}

	sectionWindow := clonedProject.ProjectChatWindowing.InstancesByID["section-window"]
	if sectionWindow.ChatID != nil {
		t.Fatalf("expected copied section chat id to be cleared, got %#v", sectionWindow.ChatID)
	}
	if sectionWindow.SectionIDOrNull == nil || *sectionWindow.SectionIDOrNull != "chat-section" {
		t.Fatalf("expected copied section binding to stay valid within the cloned project, got %#v", sectionWindow.SectionIDOrNull)
	}
	if _, ok := clonedProject.Sections["chat-section"]; !ok {
		t.Fatalf("expected cloned project to retain project-scoped section ids, got %#v", clonedProject.Sections)
	}

	clonedWindowSpace := clonedProject.WindowSpaces["space-1"]
	if clonedWindowSpace.WindowsByID["project-window"].ChatID != nil {
		t.Fatalf("expected saved project-chat binding cleared, got %#v", clonedWindowSpace.WindowsByID["project-window"].ChatID)
	}
	if clonedWindowSpace.WindowsByID["section-window"].ChatID != nil {
		t.Fatalf("expected saved section-chat binding cleared, got %#v", clonedWindowSpace.WindowsByID["section-window"].ChatID)
	}
	if clonedWindowSpace.WindowsByID["section-window"].SectionIDOrNull == nil || *clonedWindowSpace.WindowsByID["section-window"].SectionIDOrNull != "chat-section" {
		t.Fatalf("expected saved section binding to stay project-scoped, got %#v", clonedWindowSpace.WindowsByID["section-window"].SectionIDOrNull)
	}
}

func TestDocumentSaveAsNewProjectConfigCopiesProjectScopedPluginData(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.DefaultProjectID = "project-alpha"
	document.Projects["project-alpha"] = testSaveAsNewProjectConfigSourceProject()
	expected := testWatchCodeLifecycleProjectData()
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", expected)
	expectedOpaquePluginData := seedOpaqueLifecyclePluginData(&document)
	document.PluginData["plugin.example"] = lifecycleProjectScopedPluginPayload("project-alpha", "project-other")

	clonedProjectID, _, err := document.SaveAsNewProjectConfig("project-alpha", "Copied Alpha", false)
	if err != nil {
		t.Fatalf("SaveAsNewProjectConfig returned error: %v", err)
	}
	assertOpaqueLifecyclePluginDataPreserved(t, document, expectedOpaquePluginData)
	assertProjectScopedPluginPayload(t, document, "plugin.example", clonedProjectID, map[string]any{"value": float64(1)})
	assertProjectScopedPluginPayload(t, document, "plugin.example", "project-other", map[string]any{"value": float64(2), "keep": []any{"stable"}})

	clonedData := mustReadTestWatchCodePluginProjectData(t, document, clonedProjectID)
	if !reflect.DeepEqual(clonedData, expected.Normalized()) {
		t.Fatalf("expected copied plugin data %#v, got %#v", expected.Normalized(), clonedData)
	}

	clonedData.Folders = append(clonedData.Folders, WatchCodeFolder{Path: "pkg/copied", Recursive: true})
	mustSetTestWatchCodePluginProjectData(t, &document, clonedProjectID, clonedData)
	sourceData := mustReadTestWatchCodePluginProjectData(t, document, "project-alpha")
	if !reflect.DeepEqual(sourceData, expected.Normalized()) {
		t.Fatalf("expected source plugin data to remain unchanged, got %#v", sourceData)
	}
}

// Save As should clear copied password secret state even though the cloned
// project intentionally keeps project-scoped section and window ids stable.
func TestDocumentSaveAsNewProjectConfigClearsCopiedPasswordSecrets(t *testing.T) {
	t.Parallel()

	secrets, err := NewFilePasswordSecretStore(t.TempDir())
	if err != nil {
		t.Fatalf("new password secret store: %v", err)
	}
	sourceProject := passwordParamNameAndValueTestProject(t)
	sourceProject.passwordSecrets = secrets
	if err := sourceProject.SetSectionCodeObjectValue("dict-a", "shared-secret", "hunter2"); err != nil {
		t.Fatalf("seed source password secret: %v", err)
	}

	document := NewDocument()
	document.DefaultProjectID = "project-alpha"
	document.Projects["project-alpha"] = sourceProject

	clonedProjectID, _, err := document.SaveAsNewProjectConfig("project-alpha", "Copied Alpha", false)
	if err != nil {
		t.Fatalf("SaveAsNewProjectConfig returned error: %v", err)
	}

	sourceProject, err = document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("ProjectByID source returned error: %v", err)
	}
	_, _, _, sourceImpl, err := sourceProject.ResolveSectionCodeObject("dict-a", "shared-secret")
	if err != nil {
		t.Fatalf("resolve source password param: %v", err)
	}

	clonedProject, err := document.ProjectByID(clonedProjectID)
	if err != nil {
		t.Fatalf("ProjectByID clone returned error: %v", err)
	}
	clonedPayload, _, _, clonedImpl, err := clonedProject.ResolveSectionCodeObject("dict-a", "shared-secret")
	if err != nil {
		t.Fatalf("resolve cloned password param: %v", err)
	}
	if clonedImpl.ID == sourceImpl.ID {
		t.Fatalf("expected copied password impl id to differ from source, got %q", clonedImpl.ID)
	}
	if got, ok := clonedPayload["hasSecret"].(bool); !ok || got {
		t.Fatalf("expected copied password hasSecret false, got %#v", clonedPayload["hasSecret"])
	}
	if got := payloadRawStringField(clonedPayload, "value"); got != "" {
		t.Fatalf("expected copied password value blank, got %q", got)
	}
	assertCodeObjectSharedHasSecret(t, sourceProject, "shared-secret", true)
	assertCodeObjectSharedHasSecret(t, clonedProject, "shared-secret", false)

	secret, err := secrets.Get(clonedImpl.ID)
	if err != nil {
		t.Fatalf("read copied password secret: %v", err)
	}
	if secret != "" {
		t.Fatalf("expected copied password secret cleared, got %q", secret)
	}

	secret, err = secrets.Get(sourceImpl.ID)
	if err != nil {
		t.Fatalf("read source password secret: %v", err)
	}
	if secret != "hunter2" {
		t.Fatalf("expected source password secret hunter2, got %q", secret)
	}
}

func TestCloneProjectWithFreshPasswordImplIDsClearsPasswordModifierSecretsOnly(t *testing.T) {
	project := passwordParamNameAndValueTestProject(t)

	secretCodeObj := project.CodeObjs["shared-secret"]
	secretCodeObj.SharedModifier = mustMarshalProjectObject(map[string]any{"hasSecret": true, "label": "secret"})
	project.CodeObjs["shared-secret"] = secretCodeObj

	childCodeObj := project.CodeObjs["shared-child"]
	childCodeObj.SharedModifier = mustMarshalProjectObject(map[string]any{"hasSecret": true, "label": "child"})
	project.CodeObjs["shared-child"] = childCodeObj

	secretVariant := project.CodeObjVariants["shared-secret-variant"]
	secretVariant.Modifier = mustMarshalProjectObject(map[string]any{"hasSecret": true, "label": "secret"})
	project.CodeObjVariants["shared-secret-variant"] = secretVariant

	childVariant := project.CodeObjVariants["shared-child-variant"]
	childVariant.Modifier = mustMarshalProjectObject(map[string]any{"hasSecret": true, "label": "child"})
	project.CodeObjVariants["shared-child-variant"] = childVariant

	clonedProject, err := cloneProjectWithFreshPasswordImplIDs(project)
	if err != nil {
		t.Fatalf("cloneProjectWithFreshPasswordImplIDs returned error: %v", err)
	}

	assertCodeObjectSharedHasSecret(t, clonedProject, "shared-secret", false)
	assertCodeObjectSharedHasSecret(t, clonedProject, "shared-child", true)
	assertCodeObjectVariantHasSecret(t, clonedProject, "shared-secret-variant", false)
	assertCodeObjectVariantHasSecret(t, clonedProject, "shared-child-variant", true)
}

func TestDocumentDeleteProjectsReconcilesDefaultProject(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.DefaultProjectID = "project-beta"
	document.Projects["project-beta"] = Project{ID: "project-beta", Name: "Beta"}
	document.Projects["project-alpha"] = Project{ID: "project-alpha", Name: "Alpha"}

	deletedIDs, err := document.DeleteProjects([]string{"project-beta", "project-beta"})
	if err != nil {
		t.Fatalf("DeleteProjects returned error: %v", err)
	}
	if len(deletedIDs) != 1 || deletedIDs[0] != "project-beta" {
		t.Fatalf("unexpected deleted ids %#v", deletedIDs)
	}
	if document.DefaultProjectID != "project-alpha" {
		t.Fatalf("expected default project-alpha, got %q", document.DefaultProjectID)
	}
	if _, ok := document.Projects["project-beta"]; ok {
		t.Fatalf("expected project-beta to be removed, got %#v", document.Projects)
	}

	deletedIDs, err = document.DeleteProjects([]string{"project-alpha"})
	if err != nil {
		t.Fatalf("DeleteProjects all returned error: %v", err)
	}
	if len(deletedIDs) != 1 || deletedIDs[0] != "project-alpha" {
		t.Fatalf("unexpected deleted ids after second delete %#v", deletedIDs)
	}
	if document.DefaultProjectID != "" {
		t.Fatalf("expected default project id to clear, got %q", document.DefaultProjectID)
	}
}

func TestDocumentDeleteProjectsRemovesProjectScopedPluginData(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.DefaultProjectID = "project-alpha"
	document.Projects["project-alpha"] = Project{ID: "project-alpha", Name: "Alpha"}
	document.Projects["project-beta"] = Project{ID: "project-beta", Name: "Beta"}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", testWatchCodeLifecycleProjectData())
	betaWatchCodeData := testWatchCodeLifecycleProjectData()
	betaWatchCodeData.Files = []string{"pkg/beta.py"}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-beta", betaWatchCodeData)
	expectedOpaquePluginData := seedOpaqueLifecyclePluginData(&document)
	document.PluginData["plugin.example"] = RawJSON(`{"schemaVersion":1,"projects":{"project-alpha":{"value":1},"project-beta":{"value":2,"keep":["stable"]}},"global":{"keep":true}}`)
	expectedGenericBeta := mustProjectScopedPluginPayloadRaw(t, document, "plugin.example", "project-beta")

	deletedIDs, err := document.DeleteProjects([]string{"project-alpha"})
	if err != nil {
		t.Fatalf("DeleteProjects returned error: %v", err)
	}
	if len(deletedIDs) != 1 || deletedIDs[0] != "project-alpha" {
		t.Fatalf("unexpected deleted ids %#v", deletedIDs)
	}
	assertOpaqueLifecyclePluginDataPreserved(t, document, expectedOpaquePluginData)
	if _, exists, err := document.WatchCodePluginProjectData(testWatchCodeProviderPluginID, "project-alpha"); err != nil || exists {
		t.Fatalf("expected deleted watch-code project data to be absent, exists=%v err=%v", exists, err)
	}
	remainingWatchCodeData := mustReadTestWatchCodePluginProjectData(t, document, "project-beta")
	if !reflect.DeepEqual(remainingWatchCodeData, betaWatchCodeData.Normalized()) {
		t.Fatalf("expected remaining watch-code data %#v, got %#v", betaWatchCodeData.Normalized(), remainingWatchCodeData)
	}
	if got := mustProjectScopedPluginPayloadRaw(t, document, "plugin.example", "project-beta"); string(got) != string(expectedGenericBeta) {
		t.Fatalf("expected remaining generic project payload %s, got %s", expectedGenericBeta, got)
	}
	if got := mustProjectScopedPluginPayloadRaw(t, document, "plugin.example", "project-alpha"); len(got) != 0 {
		t.Fatalf("expected deleted generic project payload to be absent, got %s", got)
	}
}

func assertCodeObjectSharedHasSecret(t *testing.T, project Project, codeObjID string, expected bool) {
	t.Helper()

	codeObj, ok := project.CodeObjs[codeObjID]
	if !ok {
		t.Fatalf("expected code object %q, got %#v", codeObjID, project.CodeObjs)
	}
	modifier, err := rawObjectFromProjectPayload(codeObj.SharedModifier)
	if err != nil {
		t.Fatalf("decode shared modifier for %q: %v", codeObjID, err)
	}
	got, ok := modifier["hasSecret"].(bool)
	if !ok || got != expected {
		t.Fatalf("expected shared modifier hasSecret %t for %q, got %#v", expected, codeObjID, modifier["hasSecret"])
	}
}

func testWatchCodeLifecycleProjectData() WatchCodePluginProjectData {
	return WatchCodePluginProjectData{
		Folders: []WatchCodeFolder{
			{Path: "pkg", Recursive: true},
		},
		Files: []string{"scripts/check.py"},
		Registry: map[string]WatchCodeRegistryEntry{
			"callable": {
				CallableName:  "run",
				Kind:          WatchCodeCallableKindFunction,
				SignatureHash: "sig",
				BodyHash:      "body",
				SourcePath:    "pkg/run.py",
				SectionIDs:    []string{"section-alpha"},
				SectionsCount: 1,
			},
		},
		BaselineByPath: map[string][]string{
			"pkg/run.py": {"run"},
		},
	}.Normalized()
}

func seedOpaqueLifecyclePluginData(document *Document) map[string]RawJSON {
	if document.PluginData == nil {
		document.PluginData = map[string]RawJSON{}
	}
	expected := map[string]RawJSON{
		"plugin.scalar": RawJSON(`"global"`),
		"plugin.array":  RawJSON(`[1,2]`),
	}
	for pluginID, payload := range expected {
		document.PluginData[pluginID] = payload
	}
	return expected
}

func lifecycleProjectScopedPluginPayload(sourceProjectID string, siblingProjectID string) RawJSON {
	return mustMarshalProjectObject(map[string]any{
		"schemaVersion": 1,
		"projects": map[string]any{
			sourceProjectID: map[string]any{"value": 1},
			siblingProjectID: map[string]any{
				"value": 2,
				"keep":  []any{"stable"},
			},
		},
		"global": map[string]any{"keep": true},
	})
}

func assertOpaqueLifecyclePluginDataPreserved(t *testing.T, document Document, expected map[string]RawJSON) {
	t.Helper()
	for pluginID, expectedPayload := range expected {
		if got := document.PluginData[pluginID]; string(got) != string(expectedPayload) {
			t.Fatalf("expected opaque plugin payload %q to remain %s, got %s", pluginID, expectedPayload, got)
		}
	}
}

func assertProjectScopedPluginPayload(
	t *testing.T,
	document Document,
	pluginID string,
	projectID string,
	expected map[string]any,
) {
	t.Helper()
	got := mustProjectScopedPluginPayloadRaw(t, document, pluginID, projectID)
	var decoded map[string]any
	if err := json.Unmarshal(got, &decoded); err != nil {
		t.Fatalf("decode plugin payload %q for project %q: %v", pluginID, projectID, err)
	}
	if !reflect.DeepEqual(decoded, expected) {
		t.Fatalf("expected plugin payload %q for project %q %#v, got %#v", pluginID, projectID, expected, decoded)
	}
}

func mustProjectScopedPluginPayloadRaw(t *testing.T, document Document, pluginID string, projectID string) RawJSON {
	t.Helper()
	fields, ok, err := decodeProjectScopedPluginPayload(pluginID, document.PluginData[pluginID])
	if err != nil {
		t.Fatalf("decode plugin payload %q: %v", pluginID, err)
	}
	if !ok {
		return nil
	}
	projects, ok, err := decodeProjectScopedPluginPayloadProjects(pluginID, fields)
	if err != nil {
		t.Fatalf("decode plugin projects %q: %v", pluginID, err)
	}
	if !ok {
		return nil
	}
	return cloneRawJSON(projects[projectID])
}

func assertCodeObjectVariantHasSecret(t *testing.T, project Project, variantID string, expected bool) {
	t.Helper()

	variant, ok := project.CodeObjVariants[variantID]
	if !ok {
		t.Fatalf("expected code object variant %q, got %#v", variantID, project.CodeObjVariants)
	}
	modifier, err := rawObjectFromProjectPayload(variant.Modifier)
	if err != nil {
		t.Fatalf("decode variant modifier for %q: %v", variantID, err)
	}
	got, ok := modifier["hasSecret"].(bool)
	if !ok || got != expected {
		t.Fatalf("expected variant modifier hasSecret %t for %q, got %#v", expected, variantID, modifier["hasSecret"])
	}
}

func TestDocumentSetDefaultProjectIDTrimsWhitespaceAndUpdatesDefault(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.DefaultProjectID = "project-alpha"
	document.Projects["project-alpha"] = Project{ID: "project-alpha", Name: "Alpha"}
	document.Projects["project-beta"] = Project{ID: "project-beta", Name: "Beta"}

	if err := document.SetDefaultProjectID("  project-beta  "); err != nil {
		t.Fatalf("SetDefaultProjectID returned error: %v", err)
	}
	if document.DefaultProjectID != "project-beta" {
		t.Fatalf("expected default project-beta, got %q", document.DefaultProjectID)
	}
}

func testSaveAsNewProjectConfigSourceProject() Project {
	return Project{
		ID:   "project-alpha",
		Name: "Alpha",
		Sections: map[string]Section{
			"chat-section": {
				ID:   "chat-section",
				Name: "Chat Section",
			},
		},
		WindowSpaces: map[string]WindowSpaceConfig{
			"space-1": {
				ID:        "space-1",
				Name:      "Copied Layout",
				SortIndex: 0,
				Order:     []string{"project-window", "section-window"},
				WindowsByID: map[string]WindowSpaceWindow{
					"project-window": {
						SurfaceKind:      WindowSpaceSurfaceKindProjectChat,
						Mode:             ChatWindowModeProjectAI,
						Title:            stringPointer("Project Chat"),
						ChatID:           stringPointer("source-project-chat"),
						ZIndex:           3,
						NormalizedBounds: NormalizedFloatingWindowBounds{X: 0.1, Y: 0.2, Width: 0.5, Height: 0.4},
					},
					"section-window": {
						SurfaceKind:      WindowSpaceSurfaceKindSection,
						Mode:             ChatWindowModeProjectAI,
						SectionIDOrNull:  stringPointer("chat-section"),
						Title:            stringPointer("Section Chat"),
						ChatID:           stringPointer("source-section-chat"),
						ZIndex:           4,
						NormalizedBounds: NormalizedFloatingWindowBounds{X: 0.2, Y: 0.3, Width: 0.4, Height: 0.5},
					},
				},
			},
		},
		ProjectChatWindowing: &ProjectChatWindowingState{
			InstancesByID: map[string]ProjectChatWindowInstance{
				"project-window": {
					InstanceID: "project-window",
					Placement:  ChatWindowPlacementFloating,
					Mode:       ChatWindowModeProjectAI,
					Title:      stringPointer("Project Chat"),
					ChatID:     stringPointer("live-project-chat"),
					ZIndex:     5,
					Bounds: ChatWindowBounds{
						X:      48,
						Y:      64,
						Width:  520,
						Height: 360,
					},
				},
				"section-window": {
					InstanceID:      "section-window",
					Placement:       ChatWindowPlacementFloating,
					Mode:            ChatWindowModeSection,
					SectionIDOrNull: stringPointer("chat-section"),
					Title:           stringPointer("Section Chat"),
					ChatID:          stringPointer("live-section-chat"),
					ZIndex:          6,
					Bounds: ChatWindowBounds{
						X:      640,
						Y:      96,
						Width:  420,
						Height: 320,
					},
				},
			},
			Order:              []string{"project-window", "section-window"},
			NextInstanceNumber: 3,
		},
	}
}

func TestDocumentSetDefaultProjectIDRequiresKnownProject(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.Projects["project-alpha"] = Project{ID: "project-alpha", Name: "Alpha"}

	err := document.SetDefaultProjectID("missing")
	if err == nil {
		t.Fatal("expected missing project error")
	}
	if err != ErrProjectNotFound && err.Error() == "" {
		t.Fatalf("expected project not found error, got %v", err)
	}
}
