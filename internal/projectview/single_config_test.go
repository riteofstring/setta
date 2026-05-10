package projectview

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	"setta/internal/projectstate"
)

func TestDefaultSingleConfigDerivesFrontendFieldsFromSnapshot(t *testing.T) {
	document := testProjectViewDocument(t)

	view, err := DefaultSingleConfig(document)
	if err != nil {
		t.Fatalf("DefaultSingleConfig returned error: %v", err)
	}

	if got := derefString(view.SingletonSections.GlobalVariables); got != "global-section" {
		t.Fatalf("expected GlobalVariables singleton global-section, got %q", got)
	}
	if got := derefString(view.SingletonSections.GenPythonCode); got != "gen-section" {
		t.Fatalf("expected GenPythonCode singleton gen-section, got %q", got)
	}
	if got := derefString(view.ParentSectionMap["draw-section"]); got != "callable-section" {
		t.Fatalf("expected draw-section parent callable-section, got %q", got)
	}
	if got := view.ParentSectionMap["callable-section"]; got != nil {
		t.Fatalf("expected callable-section to have nil parent, got %q", derefString(got))
	}

	expectedImages := []string{"images/a.png", "images/b.png"}
	if !reflect.DeepEqual(view.RequiredDecodedImages, expectedImages) {
		t.Fatalf("expected required decoded images %v, got %v", expectedImages, view.RequiredDecodedImages)
	}

	if view.GenCodeBinding == nil {
		t.Fatal("expected generated code binding")
	}
	if view.GenCodeBinding.CanonicalPath != "src/generated.py" {
		t.Fatalf("expected generated code binding path src/generated.py, got %q", view.GenCodeBinding.CanonicalPath)
	}
	if view.GenCodeBinding.AccessMode != "read_write" {
		t.Fatalf("expected generated code binding access mode read_write, got %q", view.GenCodeBinding.AccessMode)
	}
	if !view.GenCodeBinding.AutoBinding {
		t.Fatal("expected generated code binding autoBinding=true")
	}

	shown := view.ShownParamIDs["callable-variant"]
	if !reflect.DeepEqual(shown.Pinned.TopLevelParamIDs, []string{"param-b"}) {
		t.Fatalf("expected pinned top-level params [param-b], got %v", shown.Pinned.TopLevelParamIDs)
	}
	if !reflect.DeepEqual(shown.Unpinned.TopLevelParamIDs, []string{"param-a", "param-b"}) {
		t.Fatalf("expected unpinned top-level params [param-a param-b], got %v", shown.Unpinned.TopLevelParamIDs)
	}
	if got := shown.Pinned.RequiredParamIDsToPaths["param-b-child"]; !reflect.DeepEqual(got, []string{"param-b", "param-b-child"}) {
		t.Fatalf("expected pinned child path [param-b param-b-child], got %v", got)
	}

	if _, ok := view.ProjectConfig.TopLevelSections["gen-section"]; !ok {
		t.Fatal("expected top-level layout entry for gen-section from topLevelSectionIds")
	}
	if got := view.ProjectConfig.WindowSpaces; len(got) != 0 {
		t.Fatalf("expected default empty window spaces, got %#v", got)
	}
	if got := view.ProjectChatWindowing.NextInstanceNumber; got != 1 {
		t.Fatalf("expected default next instance number 1, got %d", got)
	}
	if len(view.ProjectChatWindowing.InstancesByID) != 0 {
		t.Fatalf("expected default empty project chat windowing instances, got %#v", view.ProjectChatWindowing.InstancesByID)
	}
}

func TestSingleConfigByProjectIDDerivesRunCapabilities(t *testing.T) {
	document := testProjectViewDocument(t)
	project := document.Projects["project-alpha"]
	project.Sections["code-section"] = projectstate.Section{
		ID:               "code-section",
		Name:             "Code Section",
		VariantIDs:       []string{"code-variant"},
		DefaultVariantID: "code-variant",
	}
	project.SectionVariants["code-variant"] = projectstate.SectionVariant{
		ID:     "code-variant",
		Name:   "Code Variant",
		ImplID: "code-impl",
	}
	project.SectionImpls["code-impl"] = projectstate.SectionImpl{
		ID:   "code-impl",
		Kind: projectstate.SectionKindCode,
		Code: &projectstate.CodeSectionImpl{
			Language: projectstate.CodeLanguagePython,
		},
	}
	project.SectionVariantMap["code-section"] = "code-variant"
	project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, "code-section")
	document.Projects["project-alpha"] = project

	view, err := SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}

	if !view.ProjectConfig.HasPythonCodegenTarget {
		t.Fatal("expected python codegen target flag")
	}
	if !view.ProjectConfig.RunCapabilities.CanRunFromMain {
		t.Fatalf("expected main run to be enabled, got %#v", view.ProjectConfig.RunCapabilities)
	}
	if got := derefString(view.ProjectConfig.RunCapabilities.EffectiveEntrySectionID); got != "gen-section" {
		t.Fatalf("expected generated section to be the effective entry target, got %q", got)
	}

	genCapabilities := view.SectionCapabilities["gen-section"]
	if !genCapabilities.CanRun {
		t.Fatalf("expected generated section to be runnable, got %#v", genCapabilities)
	}
	if genCapabilities.RunRequestSectionID != nil {
		t.Fatalf("expected generated section to use default run target, got %#v", genCapabilities.RunRequestSectionID)
	}
	if !genCapabilities.CanSelectAsEntryCodeBlock {
		t.Fatalf("expected generated section to be selectable as entry, got %#v", genCapabilities)
	}
	if genCapabilities.EntryCodeBlockValue != nil {
		t.Fatalf("expected generated section entry value to stay nil, got %#v", genCapabilities.EntryCodeBlockValue)
	}

	codeCapabilities := view.SectionCapabilities["code-section"]
	if !codeCapabilities.CanRun {
		t.Fatalf("expected python code section to be runnable, got %#v", codeCapabilities)
	}
	if got := derefString(codeCapabilities.RunRequestSectionID); got != "code-section" {
		t.Fatalf("expected manual code section run request id code-section, got %q", got)
	}
	if !codeCapabilities.CanSelectAsEntryCodeBlock {
		t.Fatalf("expected manual code section to be selectable as entry, got %#v", codeCapabilities)
	}
	if got := derefString(codeCapabilities.EntryCodeBlockValue); got != "code-section" {
		t.Fatalf("expected manual code section entry value code-section, got %q", got)
	}
}

func TestFrontendDefaultPythonSectionCodegenPolicyUsesCanonicalDefaults(t *testing.T) {
	policy := FrontendDefaultPythonSectionCodegenPolicy()
	defaultPolicy := projectstate.DefaultPythonSectionCodegenPolicy()

	if !reflect.DeepEqual(policy.Allowlist, defaultPythonSectionAllowlistOrder) {
		t.Fatalf("unexpected section allowlist order: %#v", policy.Allowlist)
	}
	if !reflect.DeepEqual(policy.MetaControlAllowlist, defaultPythonMetaControlAllowlistOrder) {
		t.Fatalf("unexpected meta control allowlist order: %#v", policy.MetaControlAllowlist)
	}
	if len(policy.Exclude) != 0 {
		t.Fatalf("expected empty exclude list, got %#v", policy.Exclude)
	}
	if len(policy.TypePolicies) != len(defaultPolicy.TypePolicies) {
		t.Fatalf("expected %d section type policies, got %d", len(defaultPolicy.TypePolicies), len(policy.TypePolicies))
	}
	if got := policy.TypePolicies["Chat"].Representation; got != SectionRepresentationMode(projectstate.PythonSectionRepresentationFileRead) {
		t.Fatalf("expected Chat representation file_read, got %q", got)
	}
	if got := policy.TypePolicies["Callable"].Representation; got != SectionRepresentationMode(projectstate.PythonSectionRepresentationExpression) {
		t.Fatalf("expected Callable representation expression, got %q", got)
	}
	if got := policy.TypePolicies["Chat"].Mode; got != SectionCodegenMode(projectstate.PythonSectionCodegenModeInherit) {
		t.Fatalf("expected Chat mode inherit, got %q", got)
	}
	if len(policy.SectionOverrides) != 0 {
		t.Fatalf("expected no default section overrides, got %#v", policy.SectionOverrides)
	}
}

func TestFrontendDefaultPythonCodeObjValuePolicyUsesCanonicalDefaults(t *testing.T) {
	policy := FrontendDefaultPythonCodeObjValuePolicy()
	defaultPolicy := projectstate.DefaultPythonCodeObjValuePolicy()

	if len(policy.TypePolicies) != len(defaultPolicy.TypePolicies) {
		t.Fatalf("expected %d code object policies, got %d", len(defaultPolicy.TypePolicies), len(policy.TypePolicies))
	}
	if got := policy.TypePolicies["TextParam"].Representation; got != CodeObjValueRepresentationMode(projectstate.PythonCodeObjValueRepresentationString) {
		t.Fatalf("expected TextParam representation string, got %q", got)
	}
	if got := policy.TypePolicies["DropzoneParam"].Representation; got != CodeObjValueRepresentationMode(projectstate.PythonCodeObjValueRepresentationFilePath) {
		t.Fatalf("expected DropzoneParam representation file_path, got %q", got)
	}
	if got := policy.TypePolicies["ButtonParam"].Representation; got != CodeObjValueRepresentationMode(projectstate.PythonCodeObjValueRepresentationExpression) {
		t.Fatalf("expected ButtonParam representation expression, got %q", got)
	}
	if len(policy.CodeObjOverrides) != 0 {
		t.Fatalf("expected no default code object overrides, got %#v", policy.CodeObjOverrides)
	}
}

func TestFrontendDefaultCodegenEntryFactoriesUseCanonicalDefaults(t *testing.T) {
	sectionTypePolicy := FrontendDefaultSectionTypeCodegenPolicy()
	if got := sectionTypePolicy.Mode; got != SectionCodegenMode(projectstate.PythonSectionCodegenModeInherit) {
		t.Fatalf("expected section type mode inherit, got %q", got)
	}
	if got := sectionTypePolicy.Representation; got != SectionRepresentationMode(projectstate.PythonSectionRepresentationExpression) {
		t.Fatalf("expected section type representation expression, got %q", got)
	}

	sectionOverride := FrontendDefaultSectionCodegenOverride()
	if got := sectionOverride.Mode; got != SectionCodegenMode(projectstate.PythonSectionCodegenModeInherit) {
		t.Fatalf("expected section override mode inherit, got %q", got)
	}
	if got := sectionOverride.Representation; got != SectionRepresentationMode(projectstate.PythonSectionRepresentationExpression) {
		t.Fatalf("expected section override representation expression, got %q", got)
	}

	codeObjTypePolicy := FrontendDefaultCodeObjTypeValuePolicy()
	if got := codeObjTypePolicy.Representation; got != CodeObjValueRepresentationMode(projectstate.PythonCodeObjValueRepresentationExpression) {
		t.Fatalf("expected code object type representation expression, got %q", got)
	}

	codeObjOverride := FrontendDefaultCodeObjValueOverride()
	if got := codeObjOverride.Representation; got != CodeObjValueRepresentationMode(projectstate.PythonCodeObjValueRepresentationExpression) {
		t.Fatalf("expected code object override representation expression, got %q", got)
	}

	pluginTarget := FrontendDefaultProjectCodegenPluginTarget()
	if pluginTarget.Language != "" {
		t.Fatalf("expected empty plugin target language, got %q", pluginTarget.Language)
	}
	if pluginTarget.Options == nil || len(pluginTarget.Options) != 0 {
		t.Fatalf("expected initialized empty plugin target options, got %#v", pluginTarget.Options)
	}
}

func TestFrontendDefaultProjectCodegenPythonTargetUsesCanonicalDefaults(t *testing.T) {
	target := FrontendDefaultProjectCodegenPythonTarget()
	config, err := projectstate.DecodePythonCodegenTarget(projectstate.ProjectCodegenTarget{
		Language: string(projectstate.CodeLanguagePython),
	})
	if err != nil {
		t.Fatalf("DecodePythonCodegenTarget returned error: %v", err)
	}

	if target.Language != ProjectCodegenLanguagePython {
		t.Fatalf("expected language %q, got %q", ProjectCodegenLanguagePython, target.Language)
	}
	if target.GenCodePrefix != config.GenCodePrefix {
		t.Fatalf("expected prefix %q, got %q", config.GenCodePrefix, target.GenCodePrefix)
	}
	if target.GenCodeSuffix != config.GenCodeSuffix {
		t.Fatalf("expected suffix %q, got %q", config.GenCodeSuffix, target.GenCodeSuffix)
	}
	if target.GenerateMetadata != config.GenerateMetadata {
		t.Fatalf("expected generateMetadata %v, got %v", config.GenerateMetadata, target.GenerateMetadata)
	}
	if !reflect.DeepEqual(target.SectionPolicy, FrontendDefaultPythonSectionCodegenPolicy()) {
		t.Fatalf("expected canonical section policy defaults, got %#v", target.SectionPolicy)
	}
	if !reflect.DeepEqual(target.CodeObjValuePolicy, FrontendDefaultPythonCodeObjValuePolicy()) {
		t.Fatalf("expected canonical code object defaults, got %#v", target.CodeObjValuePolicy)
	}
}

func TestFrontendDefaultProjectConfigUsesCanonicalFactoryDefaults(t *testing.T) {
	config := FrontendDefaultProjectConfig()

	if config.ViewModes == nil || len(config.ViewModes) != 0 {
		t.Fatalf("expected empty view modes map, got %#v", config.ViewModes)
	}
	if config.WindowSpaces == nil || len(config.WindowSpaces) != 0 {
		t.Fatalf("expected empty window spaces map, got %#v", config.WindowSpaces)
	}
	if config.ActiveIDs == nil || len(config.ActiveIDs) != 0 {
		t.Fatalf("expected empty active ids slice, got %#v", config.ActiveIDs)
	}
	if config.CodegenTargets == nil || len(config.CodegenTargets) != 0 {
		t.Fatalf("expected empty codegen targets slice, got %#v", config.CodegenTargets)
	}
	if !reflect.DeepEqual(config.RunCapabilities, ProjectRunCapabilities{}) {
		t.Fatalf("expected zero-value run capabilities, got %#v", config.RunCapabilities)
	}
}

func TestFrontendDefaultSingleConfigUsesCanonicalFactoryDefaults(t *testing.T) {
	defaults := FrontendDefaultSingleConfig()

	if !reflect.DeepEqual(defaults.ProjectConfig, FrontendDefaultProjectConfig()) {
		t.Fatalf("expected canonical project config defaults, got %#v", defaults.ProjectConfig)
	}
	if !reflect.DeepEqual(defaults.PluginData, FrontendDefaultProjectPluginData()) {
		t.Fatalf("expected canonical plugin data defaults, got %#v", defaults.PluginData)
	}
	if len(defaults.PluginData) != 0 {
		t.Fatalf("expected generic plugin data defaults to be empty, got %#v", defaults.PluginData)
	}
	if defaults.Sections == nil || len(defaults.Sections) != 0 {
		t.Fatalf("expected empty sections map, got %#v", defaults.Sections)
	}
	if defaults.RequiredDecodedImages == nil || len(defaults.RequiredDecodedImages) != 0 {
		t.Fatalf("expected empty required decoded images, got %#v", defaults.RequiredDecodedImages)
	}
	if !reflect.DeepEqual(defaults.ProjectChatWindowing, projectstate.DefaultProjectChatWindowingState()) {
		t.Fatalf("expected canonical project chat windowing defaults, got %#v", defaults.ProjectChatWindowing)
	}
}

func TestSingleConfigByProjectIDIncludesGenericProjectPluginData(t *testing.T) {
	document := testProjectViewDocument(t)
	document.PluginData = map[string]projectstate.RawJSON{
		"plugin.example": mustRawJSON(t, map[string]any{
			"schemaVersion": 1,
			"projects": map[string]any{
				"project-alpha": map[string]any{
					"enabled": true,
					"nested":  map[string]any{"value": "alpha"},
				},
				"project-beta": map[string]any{
					"enabled": false,
					"nested":  map[string]any{"value": "beta"},
				},
			},
		}),
		"plugin.global": mustRawJSON(t, map[string]any{
			"routes": []any{"/not-project-scoped"},
		}),
		"plugin.scalar": projectstate.RawJSON(`"global"`),
		"plugin.array":  projectstate.RawJSON(`[1,2]`),
	}

	view, err := SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}

	rawProjectData, ok := view.PluginData["plugin.example"]
	if !ok {
		t.Fatalf("expected generic project plugin data for plugin.example, got %#v", view.PluginData)
	}
	var projectData map[string]any
	if err := json.Unmarshal(rawProjectData, &projectData); err != nil {
		t.Fatalf("decode project plugin data: %v", err)
	}
	if projectData["enabled"] != true {
		t.Fatalf("expected project-alpha plugin data, got %#v", projectData)
	}
	nested, ok := projectData["nested"].(map[string]any)
	if !ok || nested["value"] != "alpha" {
		t.Fatalf("expected nested alpha plugin data, got %#v", projectData["nested"])
	}
	if _, ok := view.PluginData["plugin.global"]; ok {
		t.Fatalf("did not expect non-project-scoped plugin data in project view, got %#v", view.PluginData)
	}
	if _, ok := view.PluginData["plugin.scalar"]; ok {
		t.Fatalf("did not expect scalar plugin data in project view, got %#v", view.PluginData)
	}
	if _, ok := view.PluginData["plugin.array"]; ok {
		t.Fatalf("did not expect array plugin data in project view, got %#v", view.PluginData)
	}
}

func TestSingleConfigByProjectIDRejectsMalformedProjectPluginData(t *testing.T) {
	document := testProjectViewDocument(t)
	document.PluginData = map[string]projectstate.RawJSON{
		"plugin.bad": mustRawJSON(t, map[string]any{
			"projects": []any{"project-alpha"},
		}),
	}

	_, err := SingleConfigByProjectID(document, "project-alpha")
	if err == nil || !strings.Contains(err.Error(), "pluginData.plugin.bad.projects must be a JSON object") {
		t.Fatalf("expected malformed project plugin data error, got %v", err)
	}
}

func TestSingleConfigByProjectIDDisablesMainRunForNonRunnableEntrySection(t *testing.T) {
	document := testProjectViewDocument(t)
	project := document.Projects["project-alpha"]
	project.CodegenTargets = nil
	project.GeneratedCodeBinding = nil
	project.GeneratedMetadataBinding = nil
	project.EntryCodeBlockID = "code-section"
	project.TopLevelSectionIDs = []string{"code-section"}
	project.Sections = map[string]projectstate.Section{
		"code-section": {
			ID:               "code-section",
			Name:             "Code Section",
			VariantIDs:       []string{"code-variant"},
			DefaultVariantID: "code-variant",
		},
	}
	project.SectionVariants = map[string]projectstate.SectionVariant{
		"code-variant": {
			ID:     "code-variant",
			Name:   "Code Variant",
			ImplID: "code-impl",
		},
	}
	project.SectionImpls = map[string]projectstate.SectionImpl{
		"code-impl": {
			ID:   "code-impl",
			Kind: projectstate.SectionKindCode,
			Code: &projectstate.CodeSectionImpl{
				Language: projectstate.CodeLanguage("javascript"),
			},
		},
	}
	project.SectionVariantMap = map[string]string{
		"code-section": "code-variant",
	}
	document.Projects["project-alpha"] = project

	view, err := SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}

	if view.ProjectConfig.HasPythonCodegenTarget {
		t.Fatal("did not expect python codegen target flag")
	}
	if view.ProjectConfig.RunCapabilities.CanRunFromMain {
		t.Fatalf("expected main run to be disabled, got %#v", view.ProjectConfig.RunCapabilities)
	}
	if got := derefString(view.ProjectConfig.RunCapabilities.MainRunDisabledReason); got != runDisabledReasonNotRunnable {
		t.Fatalf("expected non-runnable main run reason %q, got %q", runDisabledReasonNotRunnable, got)
	}
	if got := derefString(view.ProjectConfig.RunCapabilities.EffectiveEntrySectionID); got != "code-section" {
		t.Fatalf("expected effective entry section code-section, got %q", got)
	}

	codeCapabilities := view.SectionCapabilities["code-section"]
	if codeCapabilities.CanRun {
		t.Fatalf("expected javascript code section to be non-runnable, got %#v", codeCapabilities)
	}
	if got := derefString(codeCapabilities.RunDisabledReason); got != runDisabledReasonNotRunnable {
		t.Fatalf("expected non-runnable reason %q, got %q", runDisabledReasonNotRunnable, got)
	}
	if !codeCapabilities.CanSelectAsEntryCodeBlock {
		t.Fatalf("expected non-runnable code section to remain selectable as entry, got %#v", codeCapabilities)
	}
	if got := derefString(codeCapabilities.EntryCodeBlockValue); got != "code-section" {
		t.Fatalf("expected entry value code-section, got %q", got)
	}
}

func TestSingleConfigByProjectIDKeepsCanvasArtifactPathsDeploymentRelative(t *testing.T) {
	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				Sections: map[string]projectstate.Section{
					"chart-section": {
						ID:               "chart-section",
						Name:             "Chart",
						VariantIDs:       []string{"chart-variant"},
						DefaultVariantID: "chart-variant",
					},
					"draw-section": {
						ID:               "draw-section",
						Name:             "Draw",
						VariantIDs:       []string{"draw-variant"},
						DefaultVariantID: "draw-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"chart-variant": {
						ID:     "chart-variant",
						Name:   "Chart Variant",
						ImplID: "chart-impl",
					},
					"draw-variant": {
						ID:     "draw-variant",
						Name:   "Draw Variant",
						ImplID: "draw-impl",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"chart-impl": {
						ID:      "chart-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: mustRawJSON(t, map[string]any{"id": "chart-impl", "type": "Chart", "dataPath": "artifacts/chart.csv"}),
					},
					"draw-impl": {
						ID:   "draw-impl",
						Kind: projectstate.SectionKindDraw,
						Draw: &projectstate.DrawSectionImpl{},
						Payload: mustRawJSON(t, map[string]any{
							"id":   "draw-impl",
							"type": "Draw",
							"layers": []any{
								map[string]any{
									"elements": []any{
										map[string]any{
											"type":        "BrushStroke",
											"dataPath":    "artifacts/draw.json",
											"transformId": "artifacts/draw-transform.json",
										},
									},
								},
							},
						}),
					},
				},
				SectionVariantMap: map[string]string{
					"chart-section": "chart-variant",
					"draw-section":  "draw-variant",
				},
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"chart-section": {},
					"draw-section":  {},
				},
			},
		},
	}

	view, err := SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}

	var chartPayload map[string]any
	if err := json.Unmarshal(view.SectionImpls["chart-impl"], &chartPayload); err != nil {
		t.Fatalf("decode chart payload: %v", err)
	}
	if got := chartPayload["dataPath"]; got != "artifacts/chart.csv" {
		t.Fatalf("expected deployment-relative chart path, got %#v", got)
	}

	var drawPayload map[string]any
	if err := json.Unmarshal(view.SectionImpls["draw-impl"], &drawPayload); err != nil {
		t.Fatalf("decode draw payload: %v", err)
	}
	layers, ok := drawPayload["layers"].([]any)
	if !ok || len(layers) != 1 {
		t.Fatalf("expected one draw layer, got %#v", drawPayload["layers"])
	}
	layer, ok := layers[0].(map[string]any)
	if !ok {
		t.Fatalf("expected draw layer object, got %#v", layers[0])
	}
	elements, ok := layer["elements"].([]any)
	if !ok || len(elements) != 1 {
		t.Fatalf("expected one draw element, got %#v", layer["elements"])
	}
	element, ok := elements[0].(map[string]any)
	if !ok {
		t.Fatalf("expected draw element object, got %#v", elements[0])
	}
	if got := element["dataPath"]; got != "artifacts/draw.json" {
		t.Fatalf("expected deployment-relative draw dataPath, got %#v", got)
	}
	if got := element["transformId"]; got != "artifacts/draw-transform.json" {
		t.Fatalf("expected deployment-relative draw transformId, got %#v", got)
	}
}

func TestSingleConfigByProjectIDNormalizesEmptySlicesForFrontendContracts(t *testing.T) {
	document := testProjectViewDocument(t)

	view, err := SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}

	assertSingleConfigFrontendEmptyCollections(t, view)
	assertSingleConfigFrontendEmptyModifiers(t, view)
	assertSingleConfigFrontendJSONContracts(t, view)
}

func TestSingleConfigByProjectIDRepairsMissingTopLevelViewModeEntries(t *testing.T) {
	document := testProjectViewDocument(t)
	project := document.Projects["project-alpha"]
	project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, "terminal-section")
	project.Sections["terminal-section"] = projectstate.Section{
		ID:               "terminal-section",
		Name:             "Terminal",
		VariantIDs:       []string{"terminal-variant"},
		DefaultVariantID: "terminal-variant",
	}
	project.SectionVariants["terminal-variant"] = projectstate.SectionVariant{
		ID:     "terminal-variant",
		ImplID: "terminal-impl",
	}
	project.SectionImpls["terminal-impl"] = projectstate.SectionImpl{
		ID:       "terminal-impl",
		Kind:     projectstate.SectionKindTerminal,
		Terminal: &projectstate.TerminalSectionImpl{},
	}
	project.SectionVariantMap["terminal-section"] = "terminal-variant"
	delete(project.TopLevelSections, "terminal-section")
	viewMode := project.ViewModes[project.ActiveViewModeID]
	delete(viewMode.TopLevelSections, "terminal-section")
	delete(viewMode.VisibilityBySectionID, "terminal-section")
	project.ViewModes[project.ActiveViewModeID] = viewMode
	document.Projects["project-alpha"] = project

	view, err := SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}

	if _, ok := view.ProjectConfig.TopLevelSections["terminal-section"]; !ok {
		t.Fatalf("expected projected top-level layout for terminal-section, got %#v", view.ProjectConfig.TopLevelSections)
	}
	repairedViewMode := view.ProjectConfig.ViewModes[project.ActiveViewModeID]
	if !repairedViewMode.VisibilityBySectionID["terminal-section"] {
		t.Fatalf("expected repaired view mode visibility for terminal-section, got %#v", repairedViewMode.VisibilityBySectionID)
	}
	if _, ok := repairedViewMode.TopLevelSections["terminal-section"]; !ok {
		t.Fatalf("expected repaired view mode layout for terminal-section, got %#v", repairedViewMode.TopLevelSections)
	}
}

func TestSingleConfigByProjectIDIncludesWindowingFields(t *testing.T) {
	document := testProjectViewDocument(t)
	project := document.Projects["project-alpha"]
	project.WindowSpaces = map[string]projectstate.WindowSpaceConfig{
		"space-a": {
			ID:    "space-a",
			Name:  "Workspace",
			Order: []string{"window-a"},
			WindowsByID: map[string]projectstate.WindowSpaceWindow{
				"window-a": {
					SurfaceKind:     projectstate.WindowSpaceSurfaceKindSection,
					SectionIDOrNull: stringPointer("draw-section"),
					Mode:            projectstate.ChatWindowModeSection,
					Title:           stringPointer("Draw Section"),
				},
			},
		},
	}
	project.ProjectChatWindowing = &projectstate.ProjectChatWindowingState{
		InstancesByID: map[string]projectstate.ProjectChatWindowInstance{
			"instance-a": {
				Placement:       projectstate.ChatWindowPlacementCanvasSection,
				Mode:            projectstate.ChatWindowModeSection,
				SectionIDOrNull: stringPointer("draw-section"),
				Title:           stringPointer("Draw Section"),
			},
		},
		Order:              []string{"instance-a"},
		NextInstanceNumber: 2,
	}
	document.Projects["project-alpha"] = project

	view, err := SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}

	windowSpace := view.ProjectConfig.WindowSpaces["space-a"]
	if windowSpace.Name != "Workspace" {
		t.Fatalf("expected window space name Workspace, got %q", windowSpace.Name)
	}
	if windowSpace.WindowsByID["window-a"].SectionIDOrNull == nil || *windowSpace.WindowsByID["window-a"].SectionIDOrNull != "draw-section" {
		t.Fatalf("expected window space section draw-section, got %#v", windowSpace.WindowsByID["window-a"].SectionIDOrNull)
	}
	windowSpaceSlug := view.ProjectConfig.WindowSpaceSlugsByID["space-a"]
	if windowSpaceSlug != "workspace" {
		t.Fatalf("expected backend-owned window space slug workspace, got %q", windowSpaceSlug)
	}
	if got := view.ProjectConfig.WindowSpaceIDsBySlug[windowSpaceSlug]; !reflect.DeepEqual(got, []string{"space-a"}) {
		t.Fatalf("expected window space slug index [space-a], got %#v", got)
	}
	sectionPathSlug := view.ProjectConfig.SectionPathSlugsByID["draw-section"]
	if sectionPathSlug == "" {
		t.Fatal("expected backend-owned section path slug for draw-section")
	}
	if got := view.ProjectConfig.SectionIDsByPathSlug[sectionPathSlug]; !reflect.DeepEqual(got, []string{"draw-section"}) {
		t.Fatalf("expected section slug index [draw-section], got %#v", got)
	}
	if view.ProjectChatWindowing.NextInstanceNumber != 2 {
		t.Fatalf("expected next instance number 2, got %d", view.ProjectChatWindowing.NextInstanceNumber)
	}
	if view.ProjectChatWindowing.InstancesByID["instance-a"].SectionIDOrNull == nil || *view.ProjectChatWindowing.InstancesByID["instance-a"].SectionIDOrNull != "draw-section" {
		t.Fatalf("expected chat window section draw-section, got %#v", view.ProjectChatWindowing.InstancesByID["instance-a"].SectionIDOrNull)
	}
}

func TestSingleConfigByProjectIDKeepsWindowingScopedPerProject(t *testing.T) {
	document := testProjectViewDocument(t)

	alpha := document.Projects["project-alpha"]
	alpha.WindowSpaces = map[string]projectstate.WindowSpaceConfig{
		"space-alpha": {
			ID:    "space-alpha",
			Name:  "Alpha Workspace",
			Order: []string{"window-alpha"},
			WindowsByID: map[string]projectstate.WindowSpaceWindow{
				"window-alpha": {
					SurfaceKind: projectstate.WindowSpaceSurfaceKindProjectChat,
					Mode:        projectstate.ChatWindowModeProjectAI,
					ChatID:      stringPointer("chat-alpha"),
				},
			},
		},
	}
	alpha.ProjectChatWindowing = &projectstate.ProjectChatWindowingState{
		InstancesByID: map[string]projectstate.ProjectChatWindowInstance{
			"instance-alpha": {
				Placement: projectstate.ChatWindowPlacementFloating,
				Mode:      projectstate.ChatWindowModeProjectAI,
				ChatID:    stringPointer("chat-live-alpha"),
			},
		},
		Order:              []string{"instance-alpha"},
		NextInstanceNumber: 2,
	}
	document.Projects["project-alpha"] = alpha

	beta := document.Projects["project-beta"]
	beta.WindowSpaces = map[string]projectstate.WindowSpaceConfig{
		"space-beta": {
			ID:    "space-beta",
			Name:  "Beta Workspace",
			Order: []string{"window-beta"},
			WindowsByID: map[string]projectstate.WindowSpaceWindow{
				"window-beta": {
					SurfaceKind: projectstate.WindowSpaceSurfaceKindProjectChat,
					Mode:        projectstate.ChatWindowModeProjectAI,
					ChatID:      stringPointer("chat-beta"),
				},
			},
		},
	}
	beta.ProjectChatWindowing = &projectstate.ProjectChatWindowingState{
		InstancesByID: map[string]projectstate.ProjectChatWindowInstance{
			"instance-beta": {
				Placement: projectstate.ChatWindowPlacementFloating,
				Mode:      projectstate.ChatWindowModeProjectAI,
				ChatID:    stringPointer("chat-live-beta"),
			},
		},
		Order:              []string{"instance-beta"},
		NextInstanceNumber: 2,
	}
	document.Projects["project-beta"] = beta

	alphaView, err := SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID alpha returned error: %v", err)
	}
	if _, ok := alphaView.ProjectConfig.WindowSpaces["space-alpha"]; !ok {
		t.Fatalf("expected alpha view to include alpha window space, got %#v", alphaView.ProjectConfig.WindowSpaces)
	}
	if _, ok := alphaView.ProjectConfig.WindowSpaces["space-beta"]; ok {
		t.Fatalf("expected alpha view to exclude beta window space, got %#v", alphaView.ProjectConfig.WindowSpaces)
	}
	if _, ok := alphaView.ProjectChatWindowing.InstancesByID["instance-alpha"]; !ok {
		t.Fatalf("expected alpha view to include alpha live window, got %#v", alphaView.ProjectChatWindowing.InstancesByID)
	}
	if _, ok := alphaView.ProjectChatWindowing.InstancesByID["instance-beta"]; ok {
		t.Fatalf("expected alpha view to exclude beta live window, got %#v", alphaView.ProjectChatWindowing.InstancesByID)
	}

	betaView, err := SingleConfigByProjectID(document, "project-beta")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID beta returned error: %v", err)
	}
	if _, ok := betaView.ProjectConfig.WindowSpaces["space-beta"]; !ok {
		t.Fatalf("expected beta view to include beta window space, got %#v", betaView.ProjectConfig.WindowSpaces)
	}
	if _, ok := betaView.ProjectConfig.WindowSpaces["space-alpha"]; ok {
		t.Fatalf("expected beta view to exclude alpha window space, got %#v", betaView.ProjectConfig.WindowSpaces)
	}
	if _, ok := betaView.ProjectChatWindowing.InstancesByID["instance-beta"]; !ok {
		t.Fatalf("expected beta view to include beta live window, got %#v", betaView.ProjectChatWindowing.InstancesByID)
	}
	if _, ok := betaView.ProjectChatWindowing.InstancesByID["instance-alpha"]; ok {
		t.Fatalf("expected beta view to exclude alpha live window, got %#v", betaView.ProjectChatWindowing.InstancesByID)
	}
}

func TestSingleConfigByProjectIDIncludesEmptyShownParamIDsForCallableWithoutRoot(t *testing.T) {
	document := testProjectViewDocument(t)
	project := document.Projects["project-alpha"]
	project.SectionVariantMap["empty-callable-section"] = "empty-callable-variant"
	project.Sections["empty-callable-section"] = projectstate.Section{
		ID:               "empty-callable-section",
		Name:             "Empty Callable Section",
		VariantIDs:       []string{"empty-callable-variant"},
		DefaultVariantID: "empty-callable-variant",
	}
	project.SectionVariants["empty-callable-variant"] = projectstate.SectionVariant{
		ID:     "empty-callable-variant",
		Name:   "Empty Callable Variant",
		ImplID: "empty-callable-impl",
	}
	project.SectionImpls["empty-callable-impl"] = projectstate.SectionImpl{
		ID:      "empty-callable-impl",
		Kind:    projectstate.SectionKind("frontend"),
		Payload: mustRawJSON(t, map[string]any{"id": "empty-callable-impl", "type": "Callable", "callable": nil, "codeObjVariantMap": map[string]any{}}),
	}
	document.Projects["project-alpha"] = project

	view, err := SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}

	shown, ok := view.ShownParamIDs["empty-callable-variant"]
	if !ok {
		t.Fatalf("expected empty callable shown params entry, got %#v", view.ShownParamIDs)
	}
	if !reflect.DeepEqual(shown.Pinned.TopLevelParamIDs, []string{}) {
		t.Fatalf("expected empty pinned top-level params, got %#v", shown.Pinned.TopLevelParamIDs)
	}
	if !reflect.DeepEqual(shown.Unpinned.TopLevelParamIDs, []string{}) {
		t.Fatalf("expected empty unpinned top-level params, got %#v", shown.Unpinned.TopLevelParamIDs)
	}
	if len(shown.Pinned.RequiredParamIDsToPaths) != 0 {
		t.Fatalf("expected empty pinned path map, got %#v", shown.Pinned.RequiredParamIDsToPaths)
	}
	if len(shown.Unpinned.RequiredParamIDsToPaths) != 0 {
		t.Fatalf("expected empty unpinned path map, got %#v", shown.Unpinned.RequiredParamIDsToPaths)
	}
}

func TestSingleConfigByProjectIDIncludesEmptyShownParamIDsForDictWithoutChildren(t *testing.T) {
	document := testProjectViewDocument(t)
	project := document.Projects["project-alpha"]
	project.SectionVariantMap["empty-dict-section"] = "empty-dict-variant"
	project.Sections["empty-dict-section"] = projectstate.Section{
		ID:               "empty-dict-section",
		Name:             "Empty Dict Section",
		VariantIDs:       []string{"empty-dict-variant"},
		DefaultVariantID: "empty-dict-variant",
	}
	project.SectionVariants["empty-dict-variant"] = projectstate.SectionVariant{
		ID:     "empty-dict-variant",
		Name:   "Empty Dict Variant",
		ImplID: "empty-dict-impl",
	}
	project.SectionImpls["empty-dict-impl"] = projectstate.SectionImpl{
		ID:      "empty-dict-impl",
		Kind:    projectstate.SectionKind("frontend"),
		Payload: mustRawJSON(t, map[string]any{"id": "empty-dict-impl", "type": "Dict", "topLevelParamId": "empty-root", "codeObjVariantMap": map[string]any{"empty-root": "empty-root-variant"}}),
	}
	project.CodeObjs["empty-root"] = projectstate.CodeObject{
		ID:               "empty-root",
		Name:             "empty_root",
		VariantIDs:       []string{"empty-root-variant"},
		DefaultVariantID: "empty-root-variant",
	}
	project.CodeObjVariants["empty-root-variant"] = projectstate.CodeObjectVariant{
		ID:     "empty-root-variant",
		Name:   "Empty Root Variant",
		ImplID: "empty-root-impl",
	}
	project.CodeObjImpls["empty-root-impl"] = projectstate.CodeObjectImpl{
		ID:   "empty-root-impl",
		Type: "NestedParam",
	}
	document.Projects["project-alpha"] = project

	view, err := SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}

	shown, ok := view.ShownParamIDs["empty-dict-variant"]
	if !ok {
		t.Fatalf("expected empty dict shown params entry, got %#v", view.ShownParamIDs)
	}
	if !reflect.DeepEqual(shown.Pinned.TopLevelParamIDs, []string{}) {
		t.Fatalf("expected empty pinned top-level params, got %#v", shown.Pinned.TopLevelParamIDs)
	}
	if !reflect.DeepEqual(shown.Unpinned.TopLevelParamIDs, []string{}) {
		t.Fatalf("expected empty unpinned top-level params, got %#v", shown.Unpinned.TopLevelParamIDs)
	}
	if len(shown.Pinned.RequiredParamIDsToPaths) != 0 {
		t.Fatalf("expected empty pinned path map, got %#v", shown.Pinned.RequiredParamIDsToPaths)
	}
	if len(shown.Unpinned.RequiredParamIDsToPaths) != 0 {
		t.Fatalf("expected empty unpinned path map, got %#v", shown.Unpinned.RequiredParamIDsToPaths)
	}

	var rootImplPayload map[string]any
	if err := json.Unmarshal(view.CodeObjImpls["empty-root-impl"], &rootImplPayload); err != nil {
		t.Fatalf("decode empty dict root payload: %v", err)
	}
	children, ok := rootImplPayload["children"].([]any)
	if !ok || children == nil {
		t.Fatalf("expected normalized root children array, got %#v", rootImplPayload["children"])
	}
	if len(children) != 0 {
		t.Fatalf("expected normalized root children to be empty, got %#v", children)
	}
}

func TestSingleConfigByProjectIDKeepsFreshDictRootChildrenAfterDeletingLastKwarg(t *testing.T) {
	document, sectionID := projectViewDocumentWithDeletedLastDictKwarg(t)
	view, err := SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}

	dictVariantID := view.ProjectConfig.SectionVariantMap[sectionID]
	shown, ok := view.ShownParamIDs[dictVariantID]
	if !ok {
		t.Fatalf("expected shown params entry for %s, got %#v", dictVariantID, view.ShownParamIDs)
	}
	assertShownParamsEmpty(t, shown)
	assertDictRootChildrenEmpty(t, view, dictVariantID)
}

func TestSingleConfigByProjectIDMaterializesLegacySectionImplDefaults(t *testing.T) {
	document := testProjectViewDocument(t)
	project := document.Projects["project-alpha"]
	addLegacyGroupSection(t, &project)
	document.Projects["project-alpha"] = project

	view, err := SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}

	assertLegacySectionImplDefaults(t, view)
}

func TestSingleConfigByProjectIDPrefersProjectGeneratedCodeBinding(t *testing.T) {
	document := testProjectViewDocument(t)
	project := document.Projects["project-alpha"]
	project.GeneratedCodeBinding = &projectstate.CodeFileBinding{
		Path:       "src/project-generated.py",
		AccessMode: projectstate.CodeFileAccessModeReadOnly,
	}
	document.Projects["project-alpha"] = project

	view, err := SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}

	if view.GenCodeBinding == nil {
		t.Fatal("expected generated code binding")
	}
	if view.GenCodeBinding.CanonicalPath != "src/project-generated.py" {
		t.Fatalf("expected project binding path src/project-generated.py, got %q", view.GenCodeBinding.CanonicalPath)
	}
	if view.GenCodeBinding.AccessMode != "read_only" {
		t.Fatalf("expected project binding access mode read_only, got %q", view.GenCodeBinding.AccessMode)
	}
	if view.GenCodeBinding.AutoBinding {
		t.Fatal("expected project binding autoBinding=false")
	}
}

func TestSingleConfigByProjectIDOmitsGenCodeBindingWithoutPythonTarget(t *testing.T) {
	document := testProjectViewDocument(t)
	project := document.Projects["project-alpha"]
	project.CodegenTargets = nil
	project.GeneratedCodeBinding = nil
	project.GeneratedMetadataBinding = nil
	project.EntryCodeBlockID = "callable-section"
	project.TopLevelSectionIDs = []string{"callable-section", "global-section"}
	delete(project.SectionVariantMap, "gen-section")
	delete(project.Sections, "gen-section")
	delete(project.SectionVariants, "gen-variant")
	delete(project.SectionImpls, "gen-impl")
	document.Projects["project-alpha"] = project

	view, err := SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}

	if view.GenCodeBinding != nil {
		t.Fatalf("expected generated code binding to be omitted, got %#v", view.GenCodeBinding)
	}
	if view.SingletonSections.GenPythonCode != nil {
		t.Fatalf("expected generated python singleton to be omitted, got %q", *view.SingletonSections.GenPythonCode)
	}
}

func TestSingleConfigByProjectIDIncludesCreatedProjectDefaultScaffold(t *testing.T) {
	runtime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	snapshot, projectID, _, err := runtime.CreateProject(context.Background(), "bg-orange-500/60 dark:bg-orange-600/30")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}

	view, err := SingleConfigByProjectID(snapshot.Document, projectID)
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}

	if len(view.ProjectConfig.CodegenTargets) != 1 {
		t.Fatalf("expected one default codegen target, got %#v", view.ProjectConfig.CodegenTargets)
	}
	defaultPythonTarget := decodeProjectCodegenTargetPayload(t, view.ProjectConfig.CodegenTargets[0])
	if defaultPythonTarget["genCodePrefix"] != "" {
		t.Fatalf("expected default python codegen target prefix to be empty, got %#v", defaultPythonTarget["genCodePrefix"])
	}
	if defaultPythonTarget["genCodeSuffix"] != projectstate.DefaultPythonCodegenSuffix {
		t.Fatalf("expected default python codegen target suffix %q, got %#v", projectstate.DefaultPythonCodegenSuffix, defaultPythonTarget["genCodeSuffix"])
	}
	if defaultPythonTarget["generateMetadata"] != false {
		t.Fatalf("expected default python codegen target to disable metadata, got %#v", defaultPythonTarget["generateMetadata"])
	}
	if _, ok := defaultPythonTarget["sectionPolicy"].(map[string]any); !ok {
		t.Fatalf("expected default python codegen target to include sectionPolicy, got %#v", defaultPythonTarget["sectionPolicy"])
	}
	if _, ok := defaultPythonTarget["codeObjValuePolicy"].(map[string]any); !ok {
		t.Fatalf("expected default python codegen target to include codeObjValuePolicy, got %#v", defaultPythonTarget["codeObjValuePolicy"])
	}
	if view.GenCodeBinding == nil {
		t.Fatal("expected generated code binding")
	}
	if view.GenCodeBinding.CanonicalPath != projectstate.GeneratedPythonCodeRelativePath(view.ProjectConfig.Name) {
		t.Fatalf("unexpected generated code binding path %q", view.GenCodeBinding.CanonicalPath)
	}
	if len(view.ProjectConfig.TopLevelSections) != 1 {
		t.Fatalf("expected one top-level section layout, got %#v", view.ProjectConfig.TopLevelSections)
	}
	if len(view.Sections) != 1 {
		t.Fatalf("expected one created section, got %#v", view.Sections)
	}
	if derefString(view.SingletonSections.GenPythonCode) == "" {
		t.Fatalf("expected generated python singleton section, got %#v", view.SingletonSections)
	}
}

func TestSingleConfigByProjectIDExpandsPythonCodegenPolicyDefaultsForFrontend(t *testing.T) {
	document := testProjectViewDocument(t)
	project := document.Projects["project-alpha"]
	project.CodegenTargets = []projectstate.ProjectCodegenTarget{
		{
			Language: string(projectstate.CodeLanguagePython),
			Payload: mustRawJSON(t, map[string]any{
				"language": "python",
				"codeObjValuePolicy": map[string]any{
					"typePolicies": map[string]any{
						"TextParam": map[string]any{
							"representation": "expression",
						},
					},
				},
			}),
		},
	}
	document.Projects["project-alpha"] = project

	view, err := SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}

	payload := decodeProjectCodegenTargetPayload(t, view.ProjectConfig.CodegenTargets[0])
	if payload["language"] != string(projectstate.CodeLanguagePython) {
		t.Fatalf("expected python codegen target language, got %#v", payload["language"])
	}
	if payload["genCodePrefix"] != "" {
		t.Fatalf("expected empty python prefix, got %#v", payload["genCodePrefix"])
	}
	if payload["genCodeSuffix"] != projectstate.DefaultPythonCodegenSuffix {
		t.Fatalf("expected default suffix %q, got %#v", projectstate.DefaultPythonCodegenSuffix, payload["genCodeSuffix"])
	}

	sectionPolicy, ok := payload["sectionPolicy"].(map[string]any)
	if !ok {
		t.Fatalf("expected sectionPolicy object, got %#v", payload["sectionPolicy"])
	}
	if allowlist, ok := sectionPolicy["allowlist"].([]any); !ok || len(allowlist) == 0 {
		t.Fatalf("expected populated section allowlist defaults, got %#v", sectionPolicy["allowlist"])
	}

	codeObjValuePolicy, ok := payload["codeObjValuePolicy"].(map[string]any)
	if !ok {
		t.Fatalf("expected codeObjValuePolicy object, got %#v", payload["codeObjValuePolicy"])
	}
	typePolicies, ok := codeObjValuePolicy["typePolicies"].(map[string]any)
	if !ok {
		t.Fatalf("expected codeObjValuePolicy.typePolicies object, got %#v", codeObjValuePolicy["typePolicies"])
	}
	textPolicy, ok := typePolicies["TextParam"].(map[string]any)
	if !ok {
		t.Fatalf("expected TextParam policy, got %#v", typePolicies["TextParam"])
	}
	if textPolicy["representation"] != "expression" {
		t.Fatalf("expected explicit TextParam override to survive, got %#v", textPolicy["representation"])
	}
	if _, ok := typePolicies["DropzoneParam"]; ok {
		t.Fatalf("expected explicit codeObjValuePolicy.typePolicies payload to keep only supplied entries, got %#v", typePolicies)
	}
	codeObjOverrides, ok := codeObjValuePolicy["codeObjOverrides"].(map[string]any)
	if !ok {
		t.Fatalf("expected defaulted codeObjOverrides map, got %#v", codeObjValuePolicy["codeObjOverrides"])
	}
	if len(codeObjOverrides) != 0 {
		t.Fatalf("expected empty defaulted codeObjOverrides map, got %#v", codeObjOverrides)
	}
}

func TestSingleConfigProjectSelectionErrors(t *testing.T) {
	document := testProjectViewDocument(t)

	document.DefaultProjectID = ""
	if _, err := DefaultSingleConfig(document); !errors.Is(err, ErrProjectConfigIDRequired) {
		t.Fatalf("expected ErrProjectConfigIDRequired for missing default project id, got %v", err)
	}

	document = testProjectViewDocument(t)
	if _, err := SingleConfigByProjectID(document, ""); !errors.Is(err, ErrProjectConfigIDRequired) {
		t.Fatalf("expected ErrProjectConfigIDRequired for blank project id, got %v", err)
	}
	if _, err := SingleConfigByProjectID(document, "missing-project"); !errors.Is(err, projectstate.ErrProjectNotFound) {
		t.Fatalf("expected ErrProjectNotFound for missing project, got %v", err)
	}
}
