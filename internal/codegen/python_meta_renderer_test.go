package codegen

import (
	"errors"
	"testing"

	"setta/internal/projectstate"
)

// The Go metadata renderer should mirror the Python source-of-truth layout and deterministic section ordering.
func TestPythonMetadataRendererGeneratesDeterministicProjectAndSectionMetadata(t *testing.T) {
	t.Parallel()

	project := projectstate.Project{
		ID:                    "project-alpha",
		Name:                  "Alpha",
		ActiveViewModeID:      "view-mode-1",
		EntryCodeBlockID:      "entry-1",
		ActiveIDs:             []string{"child", "callable"},
		ShowParamDisplayNames: true,
		PreviewImgColor:       "#112233",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{Language: string(projectstate.CodeLanguagePython)},
		},
		TopLevelSectionIDs: []string{"parent", "callable"},
		SectionVariantMap: map[string]string{
			"parent":   "parent-variant",
			"child":    "child-variant",
			"callable": "callable-variant",
		},
		Sections: map[string]projectstate.Section{
			"parent": {
				ID:               "parent",
				Name:             "Tools",
				VariantIDs:       []string{"parent-variant"},
				DefaultVariantID: "parent-variant",
			},
			"child": {
				ID:               "child",
				Name:             "Nested Child",
				ParentSectionID:  "parent",
				VariantIDs:       []string{"child-variant"},
				DefaultVariantID: "child-variant",
			},
			"callable": {
				ID:               "callable",
				Name:             "Runner",
				VariantIDs:       []string{"callable-variant"},
				DefaultVariantID: "callable-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"parent-variant": {
				ID:     "parent-variant",
				Name:   "Parent Variant",
				ImplID: "parent-impl",
			},
			"child-variant": {
				ID:     "child-variant",
				Name:   "",
				ImplID: "child-impl",
			},
			"callable-variant": {
				ID:     "callable-variant",
				Name:   "Runner Variant",
				ImplID: "callable-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"parent-impl": {
				ID: "parent-impl",
				Payload: mustRawJSON(
					t,
					`{"id":"parent-impl","type":"Group","children":["child"]}`,
				),
			},
			"child-impl": {
				ID: "child-impl",
				Payload: mustRawJSON(
					t,
					`{"id":"child-impl","type":"TextBlock","text":"nested"}`,
				),
			},
			"callable-impl": {
				ID: "callable-impl",
				Payload: mustRawJSON(
					t,
					`{
						"id":"callable-impl",
						"type":"Callable",
						"callable":"callable-root",
						"codeObjVariantMap":{"callable-root":"callable-root-variant"}
					}`,
				),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"callable-root": {
				ID:               "callable-root",
				Name:             "run_job",
				VariantIDs:       []string{"callable-root-variant"},
				DefaultVariantID: "callable-root-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"callable-root-variant": {
				ID:     "callable-root-variant",
				ImplID: "callable-root-impl",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"callable-root-impl": {
				ID: "callable-root-impl",
				Payload: mustRawJSON(
					t,
					`{"id":"callable-root-impl","type":"CodeCallable","children":[]}`,
				),
			},
		},
	}

	exported := mustPythonCodegenExport(t, project)
	graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build python dependency graph: %v", err)
	}

	renderer := NewPythonMetadataRenderer(exported, graph)
	generated, err := renderer.GenerateCode()
	if err != nil {
		t.Fatalf("generate metadata code: %v", err)
	}

	expected := joinLines([]string{
		"from dataclasses import dataclass",
		"",
		"@dataclass(frozen=True)",
		"class ProjectMetadata:",
		"    id: str",
		"    name: str",
		"    activeViewModeId: str | None",
		"    entryCodeBlockId: str | None",
		"    activeIds: list[str]",
		"    showParamDisplayNames: bool",
		"    previewImgColor: str",
		"",
		"@dataclass(frozen=True)",
		"class SectionMetadata:",
		"    id: str",
		"    name: str",
		"    type: str",
		"    fullPathName: str",
		"    isTopLevel: bool",
		"    parentSectionId: str | None",
		"    variantId: str | None",
		"    variantName: str | None",
		"",
		"@dataclass(frozen=True)",
		"class SettaGenMetadata:",
		"    project: ProjectMetadata",
		"    sections: dict[str, SectionMetadata]",
		"    sections_by_id: dict[str, SectionMetadata]",
		"",
		"project = ProjectMetadata(",
		"    id='project-alpha',",
		"    name='Alpha',",
		"    activeViewModeId='view-mode-1',",
		"    entryCodeBlockId='entry-1',",
		"    activeIds=['child', 'callable'],",
		"    showParamDisplayNames=True,",
		"    previewImgColor='#112233',",
		")",
		"",
		"sections = {",
		"    'Runner': SectionMetadata(",
		"        id='callable',",
		"        name='Runner',",
		"        type='Callable',",
		"        fullPathName='Runner',",
		"        isTopLevel=True,",
		"        parentSectionId=None,",
		"        variantId='callable-variant',",
		"        variantName='Runner Variant',",
		"    ),",
		"    'Tools': SectionMetadata(",
		"        id='parent',",
		"        name='Tools',",
		"        type='Group',",
		"        fullPathName='Tools',",
		"        isTopLevel=True,",
		"        parentSectionId=None,",
		"        variantId='parent-variant',",
		"        variantName='Parent Variant',",
		"    ),",
		"    'Tools__Nested_Child': SectionMetadata(",
		"        id='child',",
		"        name='Nested Child',",
		"        type='TextBlock',",
		"        fullPathName='Tools__Nested_Child',",
		"        isTopLevel=False,",
		"        parentSectionId='parent',",
		"        variantId='child-variant',",
		"        variantName='',",
		"    ),",
		"}",
		"",
		"sections_by_id = {",
		"    'callable': SectionMetadata(",
		"        id='callable',",
		"        name='Runner',",
		"        type='Callable',",
		"        fullPathName='Runner',",
		"        isTopLevel=True,",
		"        parentSectionId=None,",
		"        variantId='callable-variant',",
		"        variantName='Runner Variant',",
		"    ),",
		"    'child': SectionMetadata(",
		"        id='child',",
		"        name='Nested Child',",
		"        type='TextBlock',",
		"        fullPathName='Tools__Nested_Child',",
		"        isTopLevel=False,",
		"        parentSectionId='parent',",
		"        variantId='child-variant',",
		"        variantName='',",
		"    ),",
		"    'parent': SectionMetadata(",
		"        id='parent',",
		"        name='Tools',",
		"        type='Group',",
		"        fullPathName='Tools',",
		"        isTopLevel=True,",
		"        parentSectionId=None,",
		"        variantId='parent-variant',",
		"        variantName='Parent Variant',",
		"    ),",
		"}",
		"",
		"meta = SettaGenMetadata(project=project, sections=sections, sections_by_id=sections_by_id)",
	})
	if generated != expected {
		t.Fatalf("unexpected metadata code:\n%s", generated)
	}
}

// Renderer construction should fail fast when the Go runtime boundary has no project export or graph to render from.
func TestPythonMetadataRendererRequiresExportAndGraph(t *testing.T) {
	t.Parallel()

	renderer := NewPythonMetadataRenderer(projectstate.PythonCodegenExport{}, nil)
	_, err := renderer.GenerateCode()
	if !errors.Is(err, ErrPythonMetadataRendererExportRequired) {
		t.Fatalf("expected export required error, got %v", err)
	}

	renderer = NewPythonMetadataRenderer(projectstate.PythonCodegenExport{
		ProjectID:   "project-alpha",
		ProjectName: "Alpha",
	}, nil)
	_, err = renderer.GenerateCode()
	if !errors.Is(err, ErrPythonMetadataRendererGraphRequired) {
		t.Fatalf("expected graph required error, got %v", err)
	}
}
