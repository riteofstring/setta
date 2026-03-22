package projectview

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
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

	if view.ProjectConfig.ActiveIDs == nil {
		t.Fatal("expected active ids slice to be non-nil")
	}
	if view.ProjectConfig.WindowSpaces == nil {
		t.Fatal("expected window spaces map to be non-nil")
	}
	if view.ProjectConfig.WatchCodeFiles == nil {
		t.Fatal("expected watch code files slice to be non-nil")
	}
	if view.Sections["global-section"].UnsharedKeys == nil {
		t.Fatal("expected section unshared keys slice to be non-nil")
	}
	if view.SectionVariants["draw-variant"].NonPresetImpls == nil {
		t.Fatal("expected variant non-preset impls slice to be non-nil")
	}
	if view.CodeObjs["callable-root"].UnsharedKeys == nil {
		t.Fatal("expected code object unshared keys slice to be non-nil")
	}
	if string(view.Sections["global-section"].SharedModifier) != "{}" {
		t.Fatalf(
			"expected empty section sharedModifier object, got %s",
			string(view.Sections["global-section"].SharedModifier),
		)
	}
	if string(view.SectionVariants["draw-variant"].Modifier) != "{}" {
		t.Fatalf(
			"expected empty section variant modifier object, got %s",
			string(view.SectionVariants["draw-variant"].Modifier),
		)
	}
	if string(view.CodeObjs["param-a"].SharedModifier) != "{}" {
		t.Fatalf(
			"expected empty code object sharedModifier object, got %s",
			string(view.CodeObjs["param-a"].SharedModifier),
		)
	}
	if string(view.CodeObjVariants["param-b-variant"].Modifier) != "{}" {
		t.Fatalf(
			"expected empty code object variant modifier object, got %s",
			string(view.CodeObjVariants["param-b-variant"].Modifier),
		)
	}

	jsonPayload, err := json.Marshal(view)
	if err != nil {
		t.Fatalf("marshal single config: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(jsonPayload, &decoded); err != nil {
		t.Fatalf("unmarshal single config json: %v", err)
	}

	projectConfig, ok := decoded["projectConfig"].(map[string]any)
	if !ok {
		t.Fatalf("expected projectConfig object, got %#v", decoded["projectConfig"])
	}
	if activeIDs, ok := projectConfig["activeIds"].([]any); !ok || activeIDs == nil {
		t.Fatalf("expected activeIds json array, got %#v", projectConfig["activeIds"])
	}
	if watchCodeFiles, ok := projectConfig["watchCodeFiles"].([]any); !ok || watchCodeFiles == nil {
		t.Fatalf("expected watchCodeFiles json array, got %#v", projectConfig["watchCodeFiles"])
	}
	projectChatWindowing, ok := decoded["projectChatWindowing"].(map[string]any)
	if !ok {
		t.Fatalf("expected projectChatWindowing object, got %#v", decoded["projectChatWindowing"])
	}
	if instancesByID, ok := projectChatWindowing["instancesById"].(map[string]any); !ok || instancesByID == nil {
		t.Fatalf("expected instancesById json object, got %#v", projectChatWindowing["instancesById"])
	}
	if order, ok := projectChatWindowing["order"].([]any); !ok || order == nil {
		t.Fatalf("expected projectChatWindowing order json array, got %#v", projectChatWindowing["order"])
	}
	sections, ok := decoded["sections"].(map[string]any)
	if !ok {
		t.Fatalf("expected sections object, got %#v", decoded["sections"])
	}
	globalSection, ok := sections["global-section"].(map[string]any)
	if !ok {
		t.Fatalf("expected global-section object, got %#v", sections["global-section"])
	}
	if sharedModifier, ok := globalSection["sharedModifier"].(map[string]any); !ok || sharedModifier == nil {
		t.Fatalf("expected global-section sharedModifier json object, got %#v", globalSection["sharedModifier"])
	}
	sectionVariants, ok := decoded["sectionVariants"].(map[string]any)
	if !ok {
		t.Fatalf("expected sectionVariants object, got %#v", decoded["sectionVariants"])
	}
	drawVariant, ok := sectionVariants["draw-variant"].(map[string]any)
	if !ok {
		t.Fatalf("expected draw-variant object, got %#v", sectionVariants["draw-variant"])
	}
	if modifier, ok := drawVariant["modifier"].(map[string]any); !ok || modifier == nil {
		t.Fatalf("expected draw-variant modifier json object, got %#v", drawVariant["modifier"])
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

func testProjectViewDocument(t *testing.T) projectstate.Document {
	t.Helper()

	project := projectstate.Project{
		ID:                 "project-alpha",
		Name:               "Project Alpha",
		TopLevelSectionIDs: []string{"callable-section", "gen-section", "global-section"},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"callable-section": {X: 10, Y: 20},
		},
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{Language: string(projectstate.CodeLanguagePython)},
		},
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant",
			"draw-section":     "draw-variant",
			"gen-section":      "gen-variant",
			"global-section":   "global-variant",
		},
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "Callable Section",
				VariantIDs:       []string{"callable-variant"},
				DefaultVariantID: "callable-variant",
				SharedModifier: mustRawJSON(t, map[string]any{
					"callable": "callable-root",
					"codeObjVariantMap": map[string]string{
						"callable-root": "callable-root-variant",
						"param-a":       "param-a-variant",
						"param-b":       "param-b-variant",
						"param-b-child": "param-b-child-variant",
					},
				}),
			},
			"draw-section": {
				ID:               "draw-section",
				Name:             "Draw Section",
				VariantIDs:       []string{"draw-variant"},
				DefaultVariantID: "draw-variant",
				ParentSectionID:  "callable-section",
				SharedModifier: mustRawJSON(t, map[string]any{
					"layers": []any{
						map[string]any{
							"elements": []any{
								map[string]any{"type": "Image", "dataPath": "images/a.png"},
								map[string]any{"type": "Text", "dataPath": "ignored"},
								map[string]any{"type": "Image", "dataPath": "images/b.png"},
							},
						},
					},
				}),
			},
			"gen-section": {
				ID:               "gen-section",
				Name:             "Generated Python",
				VariantIDs:       []string{"gen-variant"},
				DefaultVariantID: "gen-variant",
				SharedModifier: mustRawJSON(t, map[string]any{
					"codeFileBinding": map[string]any{
						"canonical_path": "src/generated.py",
						"access_mode":    "read_write",
						"autoBinding":    true,
					},
				}),
			},
			"global-section": {
				ID:               "global-section",
				Name:             "Global Variables",
				VariantIDs:       []string{"global-variant"},
				DefaultVariantID: "global-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"callable-variant": {
				ID:       "callable-variant",
				Name:     "Callable Variant",
				ImplID:   "callable-impl",
				Modifier: mustRawJSON(t, map[string]any{"pinnedParams": []string{"param-b"}}),
			},
			"draw-variant": {
				ID:     "draw-variant",
				Name:   "Draw Variant",
				ImplID: "draw-impl",
			},
			"gen-variant": {
				ID:     "gen-variant",
				Name:   "Generated Variant",
				ImplID: "gen-impl",
			},
			"global-variant": {
				ID:     "global-variant",
				Name:   "Global Variant",
				ImplID: "global-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"callable-impl": {
				ID:      "callable-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustRawJSON(t, map[string]any{"id": "callable-impl", "type": "Callable"}),
			},
			"draw-impl": {
				ID:      "draw-impl",
				Kind:    projectstate.SectionKindDraw,
				Draw:    &projectstate.DrawSectionImpl{},
				Payload: mustRawJSON(t, map[string]any{"id": "draw-impl", "type": "Draw"}),
			},
			"gen-impl": {
				ID:        "gen-impl",
				Kind:      projectstate.SectionKindGenerated,
				Generated: &projectstate.GeneratedSectionImpl{Kind: projectstate.GeneratedSectionKindPythonCode},
			},
			"global-impl": {
				ID:      "global-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustRawJSON(t, map[string]any{"id": "global-impl", "type": "GlobalVariables"}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"callable-root": {
				ID:               "callable-root",
				Name:             "callable_root",
				VariantIDs:       []string{"callable-root-variant"},
				DefaultVariantID: "callable-root-variant",
				SharedModifier:   mustRawJSON(t, map[string]any{"children": []string{"param-a", "param-b"}}),
			},
			"param-a": {
				ID:               "param-a",
				Name:             "param_a",
				VariantIDs:       []string{"param-a-variant"},
				DefaultVariantID: "param-a-variant",
			},
			"param-b": {
				ID:               "param-b",
				Name:             "param_b",
				VariantIDs:       []string{"param-b-variant"},
				DefaultVariantID: "param-b-variant",
				SharedModifier:   mustRawJSON(t, map[string]any{"children": []string{"param-b-child"}}),
			},
			"param-b-child": {
				ID:               "param-b-child",
				Name:             "param_b_child",
				VariantIDs:       []string{"param-b-child-variant"},
				DefaultVariantID: "param-b-child-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"callable-root-variant": {
				ID:     "callable-root-variant",
				Name:   "Callable Root Variant",
				ImplID: "callable-root-impl",
			},
			"param-a-variant": {
				ID:     "param-a-variant",
				Name:   "Param A Variant",
				ImplID: "param-a-impl",
			},
			"param-b-variant": {
				ID:     "param-b-variant",
				Name:   "Param B Variant",
				ImplID: "param-b-impl",
			},
			"param-b-child-variant": {
				ID:     "param-b-child-variant",
				Name:   "Param B Child Variant",
				ImplID: "param-b-child-impl",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"callable-root-impl": {
				ID:   "callable-root-impl",
				Type: "CodeCallable",
			},
			"param-a-impl": {
				ID:   "param-a-impl",
				Type: "TextParam",
			},
			"param-b-impl": {
				ID:   "param-b-impl",
				Type: "TextParam",
			},
			"param-b-child-impl": {
				ID:   "param-b-child-impl",
				Type: "TextParam",
			},
		},
	}

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": project,
			"project-beta": {
				ID:   "project-beta",
				Name: "Project Beta",
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("Normalize document: %v", err)
	}
	return document
}

func decodeProjectCodegenTargetPayload(t *testing.T, raw json.RawMessage) map[string]any {
	t.Helper()

	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("decode project codegen target payload: %v", err)
	}
	return payload
}

func mustRawJSON(t *testing.T, payload any) json.RawMessage {
	t.Helper()
	content, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	return content
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
