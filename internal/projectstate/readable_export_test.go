package projectstate

import (
	"path/filepath"
	"regexp"
	"slices"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestBuildReadableProjectExportHasNoUUIDLikeValues(t *testing.T) {
	t.Parallel()

	document, workspaceRoot, settaFilesRoot := readableExportTestDocument(t)
	payload, err := document.BuildReadableProjectExport(ReadableExportOptions{
		IncludeVariants: true,
		WorkspaceRoot:   workspaceRoot,
		SettaFilesRoot:  settaFilesRoot,
	})
	if err != nil {
		t.Fatalf("build readable export: %v", err)
	}

	yamlPayload, err := yaml.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal yaml payload: %v", err)
	}

	uuidPattern := regexp.MustCompile(`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)
	if uuidPattern.Match(yamlPayload) {
		t.Fatalf("expected yaml payload without uuid-like values, got %s", string(yamlPayload))
	}
}

func TestBuildReadableProjectExportCodeSectionUsesFileReference(t *testing.T) {
	t.Parallel()

	document, workspaceRoot, settaFilesRoot := readableExportTestDocument(t)
	payload, err := document.BuildReadableProjectExport(ReadableExportOptions{
		IncludeVariants: true,
		WorkspaceRoot:   workspaceRoot,
		SettaFilesRoot:  settaFilesRoot,
	})
	if err != nil {
		t.Fatalf("build readable export: %v", err)
	}

	config := payload.Configs[0]
	var codeSection *ReadableSectionExport
	for index := range config.Sections {
		section := &config.Sections[index]
		if section.Type == "Code" {
			codeSection = section
			break
		}
	}
	if codeSection == nil {
		t.Fatal("expected code section in readable export")
	}
	if codeSection.Files == nil {
		t.Fatal("expected code section files map")
	}
	if got := codeSection.Files["code"]; got != filepath.Join(workspaceRoot, "scripts", "main.py") {
		t.Fatalf("expected code file path %q, got %#v", filepath.Join(workspaceRoot, "scripts", "main.py"), got)
	}
}

func TestBuildReadableProjectExportJSONSourceOmitsParams(t *testing.T) {
	t.Parallel()

	document, workspaceRoot, settaFilesRoot := readableExportTestDocument(t)
	payload, err := document.BuildReadableProjectExport(ReadableExportOptions{
		IncludeVariants: true,
		WorkspaceRoot:   workspaceRoot,
		SettaFilesRoot:  settaFilesRoot,
	})
	if err != nil {
		t.Fatalf("build readable export: %v", err)
	}

	config := payload.Configs[0]
	var jsonSection *ReadableSectionExport
	for index := range config.Sections {
		section := &config.Sections[index]
		if section.Type == "Dict" && len(section.JSONSourceKeys) > 0 {
			jsonSection = section
			break
		}
	}
	if jsonSection == nil {
		t.Fatal("expected json source section in readable export")
	}
	if jsonSection.Params != nil {
		t.Fatalf("expected json source section to omit params, got %#v", *jsonSection.Params)
	}
	if jsonSection.Files == nil {
		t.Fatal("expected json source files map")
	}
	if got := jsonSection.Files["jsonSource"]; got != filepath.Join(workspaceRoot, "data", "config.json") {
		t.Fatalf("expected json source path %q, got %#v", filepath.Join(workspaceRoot, "data", "config.json"), got)
	}
}

func TestBuildReadableProjectExportEdgesUsePathsAndIgnoreAgenticEdges(t *testing.T) {
	t.Parallel()

	document, workspaceRoot, settaFilesRoot := readableExportTestDocument(t)
	payload, err := document.BuildReadableProjectExport(ReadableExportOptions{
		IncludeVariants: true,
		WorkspaceRoot:   workspaceRoot,
		SettaFilesRoot:  settaFilesRoot,
	})
	if err != nil {
		t.Fatalf("build readable export: %v", err)
	}

	config := payload.Configs[0]
	if len(config.Edges) != 1 {
		t.Fatalf("expected one exported edge, got %#v", config.Edges)
	}
	if got := config.Edges[0]; got.From != "Source.out.result" || got.To != "Target.param.alpha" {
		t.Fatalf("unexpected readable edge %#v", got)
	}
	if config.EntrySection != "Script" {
		t.Fatalf("expected entry section Script, got %q", config.EntrySection)
	}
}

func TestBuildReadableProjectExportOrdersDefaultConfigFirst(t *testing.T) {
	t.Parallel()

	document, workspaceRoot, settaFilesRoot := readableExportTestDocument(t)
	defaultProject := document.Projects[document.DefaultProjectID]

	alphaProject := defaultProject
	alphaProject.ID = "00000000-0000-0000-0000-000000000030"
	alphaProject.Name = "Alpha"

	betaProject := defaultProject
	betaProject.ID = "00000000-0000-0000-0000-000000000031"
	betaProject.Name = "Beta"

	document.Projects[alphaProject.ID] = alphaProject
	document.Projects[betaProject.ID] = betaProject

	payload, err := document.BuildReadableProjectExport(ReadableExportOptions{
		IncludeVariants: true,
		WorkspaceRoot:   workspaceRoot,
		SettaFilesRoot:  settaFilesRoot,
	})
	if err != nil {
		t.Fatalf("build readable export: %v", err)
	}

	configNames := make([]string, 0, len(payload.Configs))
	for _, config := range payload.Configs {
		configNames = append(configNames, config.Name)
	}
	if !slices.Equal(configNames, []string{"Export Project", "Alpha", "Beta"}) {
		t.Fatalf("unexpected config order %#v", configNames)
	}
}

func TestCollectReadableDrawAssetsDeduplicatesPaths(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"layers": []any{
			map[string]any{
				"elements": []any{
					map[string]any{"dataPath": " assets/first.png "},
					map[string]any{"dataPath": "assets/first.png"},
					map[string]any{"dataPath": ""},
					"invalid element",
				},
			},
			map[string]any{
				"elements": []any{
					map[string]any{"dataPath": "assets/second.png"},
				},
			},
			map[string]any{"elements": "invalid elements"},
			"invalid layer",
		},
	}

	if got := collectReadableDrawAssets(payload); !slices.Equal(got, []string{"assets/first.png", "assets/second.png"}) {
		t.Fatalf("unexpected draw assets %#v", got)
	}
}

func readableExportTestDocument(t *testing.T) (Document, string, string) {
	t.Helper()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	codePath := filepath.Join(workspaceRoot, "scripts", "main.py")

	projectID := "00000000-0000-0000-0000-000000000001"
	sourceSectionID := "00000000-0000-0000-0000-000000000002"
	sourceImplID := "00000000-0000-0000-0000-000000000003"
	sourceVariantID := "00000000-0000-0000-0000-000000000004"
	callableCoreID := "00000000-0000-0000-0000-000000000005"
	callableImplID := "00000000-0000-0000-0000-000000000006"
	callableVariantID := "00000000-0000-0000-0000-000000000007"
	sourceParamID := "00000000-0000-0000-0000-000000000008"
	sourceParamImplID := "00000000-0000-0000-0000-000000000009"
	sourceParamVariantID := "00000000-0000-0000-0000-000000000010"
	edgePortID := "00000000-0000-0000-0000-000000000011"
	targetSectionID := "00000000-0000-0000-0000-000000000012"
	targetImplID := "00000000-0000-0000-0000-000000000013"
	targetVariantID := "00000000-0000-0000-0000-000000000014"
	targetRootID := "00000000-0000-0000-0000-000000000015"
	targetRootImplID := "00000000-0000-0000-0000-000000000016"
	targetRootVariantID := "00000000-0000-0000-0000-000000000017"
	targetParamID := "00000000-0000-0000-0000-000000000018"
	targetParamImplID := "00000000-0000-0000-0000-000000000019"
	targetParamVariantID := "00000000-0000-0000-0000-000000000020"
	jsonSectionID := "00000000-0000-0000-0000-000000000021"
	jsonImplID := "00000000-0000-0000-0000-000000000022"
	jsonVariantID := "00000000-0000-0000-0000-000000000023"
	codeSectionID := "00000000-0000-0000-0000-000000000024"
	codeImplID := "00000000-0000-0000-0000-000000000025"
	codeVariantID := "00000000-0000-0000-0000-000000000026"
	edgeID := "00000000-0000-0000-0000-000000000027"
	projectChatID := "00000000-0000-0000-0000-000000000028"
	agenticEdgeID := "00000000-0000-0000-0000-000000000029"

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: projectID,
		Projects: map[string]Project{
			projectID: {
				ID:               projectID,
				Name:             "Export Project",
				EntryCodeBlockID: codeSectionID,
				TopLevelSectionIDs: []string{
					sourceSectionID,
					targetSectionID,
					jsonSectionID,
					codeSectionID,
				},
				TopLevelSections: map[string]TopLevelSectionLayout{
					sourceSectionID: {},
					targetSectionID: {},
					jsonSectionID:   {},
					codeSectionID:   {},
				},
				SectionVariantMap: map[string]string{
					sourceSectionID: sourceVariantID,
					targetSectionID: targetVariantID,
					jsonSectionID:   jsonVariantID,
					codeSectionID:   codeVariantID,
				},
				Edges: []Edge{
					{
						ID:              edgeID,
						SourceSectionID: sourceSectionID,
						SourceVariantID: sourceVariantID,
						SourcePortID:    edgePortID,
						TargetSectionID: targetSectionID,
						TargetVariantID: targetVariantID,
						TargetPortID:    targetParamID,
					},
				},
				AgenticEdges: []AgenticEdge{
					{
						ID:              agenticEdgeID,
						SourceSectionID: projectChatID,
						TargetSectionID: targetSectionID,
						Kind:            "chat_section",
					},
				},
				Sections: map[string]Section{
					sourceSectionID: {
						ID:               sourceSectionID,
						Name:             "Source",
						VariantIDs:       []string{sourceVariantID},
						DefaultVariantID: sourceVariantID,
					},
					targetSectionID: {
						ID:               targetSectionID,
						Name:             "Target",
						VariantIDs:       []string{targetVariantID},
						DefaultVariantID: targetVariantID,
					},
					jsonSectionID: {
						ID:               jsonSectionID,
						Name:             "Settings",
						VariantIDs:       []string{jsonVariantID},
						DefaultVariantID: jsonVariantID,
					},
					codeSectionID: {
						ID:               codeSectionID,
						Name:             "Script",
						VariantIDs:       []string{codeVariantID},
						DefaultVariantID: codeVariantID,
					},
				},
				SectionVariants: map[string]SectionVariant{
					sourceVariantID: {ID: sourceVariantID, Name: "Source Variant", ImplID: sourceImplID},
					targetVariantID: {ID: targetVariantID, Name: "Target Variant", ImplID: targetImplID},
					jsonVariantID:   {ID: jsonVariantID, Name: "data/config.json", ImplID: jsonImplID},
					codeVariantID:   {ID: codeVariantID, Name: "Code Variant", ImplID: codeImplID},
				},
				SectionImpls: map[string]SectionImpl{
					sourceImplID: {
						ID:      sourceImplID,
						Kind:    SectionKind("callable"),
						Payload: mustMarshalProjectObject(map[string]any{"id": sourceImplID, "type": "Callable", "callable": callableCoreID, "codeObjVariantMap": map[string]string{callableCoreID: callableVariantID, sourceParamID: sourceParamVariantID}, "edgeOutputPorts": []map[string]any{{"id": edgePortID, "accessor": ".result"}}}),
					},
					targetImplID: {
						ID:      targetImplID,
						Kind:    SectionKind("dict"),
						Payload: mustMarshalProjectObject(map[string]any{"id": targetImplID, "type": "Dict", "topLevelParamId": targetRootID, "codeObjVariantMap": map[string]string{targetRootID: targetRootVariantID, targetParamID: targetParamVariantID}, "edgeInputParams": []string{targetParamID}}),
					},
					jsonImplID: {
						ID:      jsonImplID,
						Kind:    SectionKind("dict"),
						Payload: mustMarshalProjectObject(map[string]any{"id": jsonImplID, "type": "Dict", "isJsonSource": true, "jsonSourceKeys": []string{"config"}}),
					},
					codeImplID: {
						ID:   codeImplID,
						Kind: SectionKindCode,
						Code: &CodeSectionImpl{
							Language: CodeLanguagePython,
							Binding: &CodeFileBinding{
								Path:       codePath,
								AccessMode: CodeFileAccessModeReadWrite,
							},
							Children: []string{},
						},
						Payload: mustMarshalProjectObject(map[string]any{"id": codeImplID, "type": "Code", "code": "print('hello')", "codeLanguage": "python", "children": []any{}, "codeFileBinding": map[string]any{"canonical_path": codePath, "access_mode": "read_write", "autoBinding": false}}),
					},
				},
				CodeObjs: map[string]CodeObject{
					callableCoreID: {
						ID:               callableCoreID,
						Name:             "MyFunc",
						VariantIDs:       []string{callableVariantID},
						DefaultVariantID: callableVariantID,
					},
					sourceParamID: {
						ID:               sourceParamID,
						Name:             "input",
						VariantIDs:       []string{sourceParamVariantID},
						DefaultVariantID: sourceParamVariantID,
					},
					targetRootID: {
						ID:               targetRootID,
						Name:             "root",
						VariantIDs:       []string{targetRootVariantID},
						DefaultVariantID: targetRootVariantID,
					},
					targetParamID: {
						ID:               targetParamID,
						Name:             "alpha",
						VariantIDs:       []string{targetParamVariantID},
						DefaultVariantID: targetParamVariantID,
					},
				},
				CodeObjVariants: map[string]CodeObjectVariant{
					callableVariantID:    {ID: callableVariantID, Name: "Callable Variant", ImplID: callableImplID},
					sourceParamVariantID: {ID: sourceParamVariantID, Name: "Source Param Variant", ImplID: sourceParamImplID},
					targetRootVariantID:  {ID: targetRootVariantID, Name: "Target Root Variant", ImplID: targetRootImplID},
					targetParamVariantID: {ID: targetParamVariantID, Name: "Target Param Variant", ImplID: targetParamImplID},
				},
				CodeObjImpls: map[string]CodeObjectImpl{
					callableImplID: {
						ID:      callableImplID,
						Type:    "CodeCallable",
						Payload: mustMarshalProjectObject(map[string]any{"id": callableImplID, "type": "CodeCallable", "children": []string{sourceParamID}}),
					},
					sourceParamImplID: {
						ID:      sourceParamImplID,
						Type:    "CodeParam",
						Payload: mustMarshalProjectObject(map[string]any{"id": sourceParamImplID, "type": "CodeParam", "value": "1"}),
					},
					targetRootImplID: {
						ID:      targetRootImplID,
						Type:    "NestedParam",
						Payload: mustMarshalProjectObject(map[string]any{"id": targetRootImplID, "type": "NestedParam", "children": []string{targetParamID}}),
					},
					targetParamImplID: {
						ID:      targetParamImplID,
						Type:    "CodeParam",
						Payload: mustMarshalProjectObject(map[string]any{"id": targetParamImplID, "type": "CodeParam", "value": "42"}),
					},
				},
			},
		},
	}

	normalized, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize readable export fixture: %v", err)
	}
	return normalized, workspaceRoot, settaFilesRoot
}
