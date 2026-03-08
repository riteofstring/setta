package lspcompletion

import (
	"fmt"
	"strings"

	"setta/internal/codegen"
	"setta/internal/projectstate"
)

type SnapshotRequest struct {
	RelativePath string
	LanguageID   string
	Content      string
	Line         int
	Character    int
}

func BuildCodeAreaSnapshotRequest(
	project projectstate.Project,
	sectionID string,
	fullText string,
	position int,
) (SnapshotRequest, bool, error) {
	completionProject := project.Clone()
	if err := completionProject.ReconcileCodeSectionBindings(); err != nil {
		return SnapshotRequest{}, false, err
	}

	_, _, impl, err := completionProject.ResolveSection(strings.TrimSpace(sectionID))
	if err != nil {
		return SnapshotRequest{}, false, err
	}
	if !impl.IsCode() || impl.Code == nil {
		return SnapshotRequest{}, false, nil
	}
	if impl.Code.Binding == nil || strings.TrimSpace(impl.Code.Binding.Path) == "" {
		return SnapshotRequest{}, false, fmt.Errorf("lspcompletion: code section %q missing binding", strings.TrimSpace(sectionID))
	}

	line, character := positionToLineCol(fullText, position)
	return SnapshotRequest{
		RelativePath: impl.Code.Binding.Path,
		LanguageID:   string(projectstate.CodeLanguage(strings.ToLower(strings.TrimSpace(string(impl.Code.Language))))),
		Content:      fullText,
		Line:         line,
		Character:    character,
	}, true, nil
}

func BuildPythonTextFieldSnapshotRequest(
	project projectstate.Project,
	passwordSecrets map[string]string,
	sectionID string,
	paramInfoID string,
	fullText string,
	position int,
) (SnapshotRequest, bool, error) {
	context, ok, err := buildPythonGeneratedSnapshotContext(project, passwordSecrets)
	if err != nil || !ok {
		return SnapshotRequest{}, ok, err
	}

	depKey := codegen.PythonSectionDependencyKey(sectionID)
	if strings.TrimSpace(paramInfoID) != "" {
		depKey = codegen.PythonCodeObjectDependencyKey(sectionID, paramInfoID)
	}
	if err := codegen.SetPythonDependencyValue(context.graph, depKey, fullText); err != nil {
		return SnapshotRequest{}, false, err
	}
	renderer := context.newRenderer()
	renderer.GenerateCode()
	lineInfo, ok := renderer.Lines[depKey]
	if !ok {
		return SnapshotRequest{}, false, nil
	}
	valueStart, ok := lineInfo.ValuePosStart()
	if !ok {
		return SnapshotRequest{}, false, nil
	}

	line, character := positionToLineCol(renderer.Code, valueStart+position)
	return SnapshotRequest{
		RelativePath: context.generatedCodeRelativePath(),
		LanguageID:   "python",
		Content:      renderer.Code,
		Line:         line,
		Character:    character,
	}, true, nil
}

func BuildPythonOutputAccessorSnapshotRequest(
	project projectstate.Project,
	passwordSecrets map[string]string,
	sectionID string,
	fullText string,
	position int,
) (SnapshotRequest, bool, error) {
	context, ok, err := buildPythonGeneratedSnapshotContext(project, passwordSecrets)
	if err != nil || !ok {
		return SnapshotRequest{}, ok, err
	}
	renderer := context.newRenderer()
	renderer.GenerateCode()

	sectionKey := codegen.PythonSectionDependencyKey(sectionID)
	node, ok := context.graph.Node(sectionKey)
	if !ok {
		return SnapshotRequest{}, false, fmt.Errorf("%w: %q", projectstate.ErrSectionNotFound, strings.TrimSpace(sectionID))
	}
	if strings.TrimSpace(fullText) == "value" {
		fullText = ""
		position = 0
	}
	prefix := "\n" + codegen.PythonGeneratedStateInstanceName + "." + node.Base().FullPathName
	content := renderer.Code + prefix + fullText
	line, character := positionToLineCol(content, len(renderer.Code)+len(prefix)+position)
	return SnapshotRequest{
		RelativePath: context.generatedCodeRelativePath(),
		LanguageID:   "python",
		Content:      content,
		Line:         line,
		Character:    character,
	}, true, nil
}

func BuildPythonGenCodePrefixSnapshotRequest(
	project projectstate.Project,
	passwordSecrets map[string]string,
	fullText string,
	position int,
) (SnapshotRequest, bool, error) {
	context, ok, err := buildPythonGeneratedSnapshotContext(project, passwordSecrets)
	if err != nil || !ok {
		return SnapshotRequest{}, ok, err
	}
	context.target.GenCodePrefix = fullText
	renderer := context.newRenderer()
	renderer.GenerateCode()
	line, character := positionToLineCol(renderer.Code, position)
	return SnapshotRequest{
		RelativePath: context.generatedCodeRelativePath(),
		LanguageID:   "python",
		Content:      renderer.Code,
		Line:         line,
		Character:    character,
	}, true, nil
}

func BuildPythonGenCodeSuffixSnapshotRequest(
	project projectstate.Project,
	passwordSecrets map[string]string,
	fullText string,
	position int,
) (SnapshotRequest, bool, error) {
	context, ok, err := buildPythonGeneratedSnapshotContext(project, passwordSecrets)
	if err != nil || !ok {
		return SnapshotRequest{}, ok, err
	}
	context.target.GenCodeSuffix = fullText
	renderer := context.newRenderer()
	insertionOffset := renderer.GenerateCode()
	line, character := positionToLineCol(renderer.Code, insertionOffset+position)
	return SnapshotRequest{
		RelativePath: context.generatedCodeRelativePath(),
		LanguageID:   "python",
		Content:      renderer.Code,
		Line:         line,
		Character:    character,
	}, true, nil
}

type pythonGeneratedSnapshotContext struct {
	project      projectstate.Project
	target       projectstate.PythonCodegenTarget
	graph        *codegen.PythonDependencyGraph
	metadataCode string
}

func buildPythonGeneratedSnapshotContext(
	project projectstate.Project,
	passwordSecrets map[string]string,
) (pythonGeneratedSnapshotContext, bool, error) {
	completionProject := project.Clone()
	if err := completionProject.ReconcilePythonGeneratedBindings(); err != nil {
		return pythonGeneratedSnapshotContext{}, false, err
	}
	target, ok, err := completionProject.PythonCodegenTarget()
	if err != nil || !ok {
		return pythonGeneratedSnapshotContext{}, ok, err
	}
	exported, exportOK, err := completionProject.PythonCodegenExport()
	if err != nil {
		return pythonGeneratedSnapshotContext{}, false, err
	}
	if !exportOK {
		return pythonGeneratedSnapshotContext{}, false, fmt.Errorf("lspcompletion: python codegen export missing for project %s", completionProject.ID)
	}
	graph, err := codegen.BuildPythonDependencyGraph(exported, codegen.PythonDependencyGraphOptions{
		PasswordSecrets: cloneStringMap(passwordSecrets),
	})
	if err != nil {
		return pythonGeneratedSnapshotContext{}, false, err
	}

	metadataCode := ""
	if target.GenerateMetadata {
		metaRenderer := codegen.NewPythonMetadataRenderer(exported, graph)
		metadataCode, err = metaRenderer.GenerateCode()
		if err != nil {
			return pythonGeneratedSnapshotContext{}, false, err
		}
	}

	return pythonGeneratedSnapshotContext{
		project:      completionProject,
		target:       target,
		graph:        graph,
		metadataCode: metadataCode,
	}, true, nil
}

func (c pythonGeneratedSnapshotContext) newRenderer() *codegen.PythonCodeRenderer {
	return codegen.NewPythonCodeRenderer(
		c.graph,
		c.target.GenCodePrefix,
		c.target.GenCodeSuffix,
		codegen.PythonCodeRendererOptions{
			ValueMode: codegen.PythonValueModePackagedRuntime,
			MetaCode:  c.metadataCode,
		},
	)
}

func (c pythonGeneratedSnapshotContext) generatedCodeRelativePath() string {
	if c.project.GeneratedCodeBinding != nil && strings.TrimSpace(c.project.GeneratedCodeBinding.Path) != "" {
		return c.project.GeneratedCodeBinding.Path
	}
	return projectstate.GeneratedPythonCodeRelativePath(c.project.Name)
}

func positionToLineCol(code string, position int) (int, int) {
	if position <= 0 {
		return 0, 0
	}

	line := 0
	character := 0
	for index, char := range code {
		if index >= position {
			return line, character
		}
		if char == '\n' {
			line++
			character = 0
			continue
		}
		character++
	}
	return line, character
}

func cloneStringMap(input map[string]string) map[string]string {
	if len(input) == 0 {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}
