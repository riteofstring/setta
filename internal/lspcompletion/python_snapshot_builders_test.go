package lspcompletion

import (
	"testing"

	"setta/internal/projectstate"
)

// Python code-area completion should point at the canonical section binding and
// preserve the caller-provided editor content and cursor location.
func TestBuildPythonCodeAreaSnapshotRequestUsesCanonicalBinding(t *testing.T) {
	t.Parallel()

	project := completionTestProject(t)
	request, ok, err := BuildPythonCodeAreaSnapshotRequest(project, "code-section", "value.\n", 6)
	if err != nil {
		t.Fatalf("build code area completion request: %v", err)
	}
	if !ok {
		t.Fatal("expected python code-area completion request")
	}
	if request.RelativePath != projectstate.ProjectCodeSectionsRelativeRoot(project.Name)+"/editor.py" {
		t.Fatalf("unexpected code area completion path %q", request.RelativePath)
	}
	if request.Content != "value.\n" {
		t.Fatalf("unexpected code area completion content %q", request.Content)
	}
	if request.Line != 0 || request.Character != 6 {
		t.Fatalf("unexpected code area completion position line=%d character=%d", request.Line, request.Character)
	}
}

// Text-field completion should rebuild generated Python code with the edited
// param value and map the cursor into the generated snapshot document.
func TestBuildPythonTextFieldSnapshotRequestRendersEditedParamValue(t *testing.T) {
	t.Parallel()

	project := completionTestProject(t)
	fullText := "unknown_symbol."
	request, ok, err := BuildPythonTextFieldSnapshotRequest(
		project,
		map[string]string{},
		"callable-section",
		"param-1",
		fullText,
		len(fullText),
	)
	if err != nil {
		t.Fatalf("build text-field completion request: %v", err)
	}
	if !ok {
		t.Fatal("expected generated text-field completion request")
	}
	if request.RelativePath != projectstate.GeneratedPythonCodeRelativePath(project.Name) {
		t.Fatalf("unexpected generated completion path %q", request.RelativePath)
	}
	absolutePosition := lineColToPosition(request.Content, request.Line, request.Character)
	start := absolutePosition - len(fullText)
	if start < 0 || request.Content[start:absolutePosition] != fullText {
		t.Fatalf("expected edited param value before cursor, got content around cursor %q", request.Content[maxInt(0, start):absolutePosition])
	}
}

// Output accessor completion should append the current accessor text to the
// generated state path for the source section.
func TestBuildPythonOutputAccessorSnapshotRequestUsesGeneratedStatePath(t *testing.T) {
	t.Parallel()

	project := completionTestProject(t)
	fullText := ".branch"
	request, ok, err := BuildPythonOutputAccessorSnapshotRequest(
		project,
		map[string]string{},
		"callable-section",
		fullText,
		len(fullText),
	)
	if err != nil {
		t.Fatalf("build output accessor completion request: %v", err)
	}
	if !ok {
		t.Fatal("expected generated output accessor completion request")
	}
	if request.RelativePath != projectstate.GeneratedPythonCodeRelativePath(project.Name) {
		t.Fatalf("unexpected output accessor completion path %q", request.RelativePath)
	}
	expectedSuffix := "\nstate.CallSection" + fullText
	if len(request.Content) < len(expectedSuffix) || request.Content[len(request.Content)-len(expectedSuffix):] != expectedSuffix {
		t.Fatalf("expected generated accessor suffix %q, got tail %q", expectedSuffix, request.Content[maxInt(0, len(request.Content)-len(expectedSuffix)):])
	}
}

// Prefix completion should rebuild the generated file with the edited prefix
// and keep the cursor in prefix space.
func TestBuildPythonGenCodePrefixSnapshotRequestUsesEditedPrefix(t *testing.T) {
	t.Parallel()

	project := completionTestProject(t)
	fullText := "import math\nvalue = "
	request, ok, err := BuildPythonGenCodePrefixSnapshotRequest(project, map[string]string{}, fullText, len(fullText))
	if err != nil {
		t.Fatalf("build prefix completion request: %v", err)
	}
	if !ok {
		t.Fatal("expected generated prefix completion request")
	}
	if request.RelativePath != projectstate.GeneratedPythonCodeRelativePath(project.Name) {
		t.Fatalf("unexpected prefix completion path %q", request.RelativePath)
	}
	if len(request.Content) < len(fullText) || request.Content[:len(fullText)] != fullText {
		t.Fatalf("expected generated code to start with edited prefix %q, got %q", fullText, request.Content[:len(fullText)])
	}
	absolutePosition := lineColToPosition(request.Content, request.Line, request.Character)
	if absolutePosition != len(fullText) {
		t.Fatalf("expected prefix cursor at %d, got %d", len(fullText), absolutePosition)
	}
}

// Suffix completion should place the cursor inside the edited suffix after the
// generated wrapper body, not inside the generated body itself.
func TestBuildPythonGenCodeSuffixSnapshotRequestUsesEditedSuffix(t *testing.T) {
	t.Parallel()

	project := completionTestProject(t)
	fullText := "\nprint(state)"
	request, ok, err := BuildPythonGenCodeSuffixSnapshotRequest(project, map[string]string{}, fullText, len(fullText))
	if err != nil {
		t.Fatalf("build suffix completion request: %v", err)
	}
	if !ok {
		t.Fatal("expected generated suffix completion request")
	}
	if request.RelativePath != projectstate.GeneratedPythonCodeRelativePath(project.Name) {
		t.Fatalf("unexpected suffix completion path %q", request.RelativePath)
	}
	absolutePosition := lineColToPosition(request.Content, request.Line, request.Character)
	start := absolutePosition - len(fullText)
	if start < 0 || request.Content[start:absolutePosition] != fullText {
		t.Fatalf("expected edited suffix before cursor, got content around cursor %q", request.Content[maxInt(0, start):absolutePosition])
	}
}

func completionTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{Language: string(projectstate.CodeLanguagePython)},
				},
				TopLevelSectionIDs: []string{"code-section", "callable-section"},
				SectionVariantMap: map[string]string{
					"code-section":     "code-variant-1",
					"callable-section": "callable-variant-1",
				},
				Sections: map[string]projectstate.Section{
					"code-section": {
						ID:               "code-section",
						Name:             "Editor",
						VariantIDs:       []string{"code-variant-1"},
						DefaultVariantID: "code-variant-1",
					},
					"callable-section": {
						ID:               "callable-section",
						Name:             "CallSection",
						VariantIDs:       []string{"callable-variant-1"},
						DefaultVariantID: "callable-variant-1",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"code-variant-1": {
						ID:     "code-variant-1",
						ImplID: "code-impl-1",
					},
					"callable-variant-1": {
						ID:     "callable-variant-1",
						ImplID: "callable-impl-1",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"code-impl-1": {
						ID:   "code-impl-1",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
						},
						Payload: projectstate.RawJSON(`{
							"id":"code-impl-1",
							"type":"Code",
							"code":"print('editor')\n",
							"codeLanguage":"python",
							"children":[]
						}`),
					},
					"callable-impl-1": {
						ID:   "callable-impl-1",
						Kind: projectstate.SectionKind("callable"),
						Payload: projectstate.RawJSON(`{
							"id":"callable-impl-1",
							"type":"Callable",
							"callable":"callable-1",
							"codeObjVariantMap":{
								"callable-1":"callable-variant-1",
								"param-1":"param-variant-1"
							}
						}`),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"callable-1": {
						ID:               "callable-1",
						Name:             "MissingFunc",
						VariantIDs:       []string{"callable-variant-1"},
						DefaultVariantID: "callable-variant-1",
					},
					"param-1": {
						ID:               "param-1",
						Name:             "param",
						VariantIDs:       []string{"param-variant-1"},
						DefaultVariantID: "param-variant-1",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"callable-variant-1": {
						ID:     "callable-variant-1",
						ImplID: "callable-codeobj-impl-1",
					},
					"param-variant-1": {
						ID:     "param-variant-1",
						ImplID: "param-impl-1",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"callable-codeobj-impl-1": {
						ID:      "callable-codeobj-impl-1",
						Type:    "CodeCallable",
						Payload: projectstate.RawJSON(`{"id":"callable-codeobj-impl-1","type":"CodeCallable","children":["param-1"]}`),
					},
					"param-impl-1": {
						ID:      "param-impl-1",
						Type:    "CodeParam",
						Payload: projectstate.RawJSON(`{"id":"param-impl-1","type":"CodeParam","value":"value"}`),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize completion test document: %v", err)
	}
	return document.Projects["project-alpha"]
}

func lineColToPosition(code string, line int, character int) int {
	if line <= 0 && character <= 0 {
		return 0
	}

	currentLine := 0
	currentCharacter := 0
	for index, char := range code {
		if currentLine == line && currentCharacter == character {
			return index
		}
		if char == '\n' {
			currentLine++
			currentCharacter = 0
			continue
		}
		currentCharacter++
	}
	return len(code)
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
