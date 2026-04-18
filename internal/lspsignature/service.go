package lspsignature

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"

	"setta/internal/codegen"
	"setta/internal/lsp"
	"setta/internal/projectstate"
	"setta/internal/statefs"
)

var parameterNamePattern = regexp.MustCompile(`\*{1,2}?[A-Za-z_]\w*|\b[A-Za-z_]\w*\b`)

type ServiceOptions struct {
	SettaFilesRoot string
	RuntimeRoot    string
	LSPService     snapshotSignatureHelper
}

type Service struct {
	settaFilesRoot string
	runtimeRoot    string
	lspService     snapshotSignatureHelper
}

type snapshotSignatureHelper interface {
	SignatureHelpSnapshot(context.Context, lsp.SnapshotSignatureHelpRequest) (lsp.SignatureHelpResult, error)
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.LSPService == nil {
		return nil, fmt.Errorf("lspsignature: lsp service is required")
	}
	settaFilesRoot, err := statefs.NormalizePath(options.SettaFilesRoot, "")
	if err != nil {
		return nil, fmt.Errorf("lspsignature: resolve setta files root: %w", err)
	}
	return &Service{
		settaFilesRoot: settaFilesRoot,
		runtimeRoot:    options.RuntimeRoot,
		lspService:     options.LSPService,
	}, nil
}

func (s *Service) ResolveCallableSignature(
	ctx context.Context,
	project projectstate.Project,
	sectionID string,
	callableName string,
) (projectstate.CallableSignatureResult, bool, error) {
	if s == nil || s.lspService == nil {
		return projectstate.CallableSignatureResult{}, false, lsp.ErrSessionClosed
	}

	passwordSecrets, err := codegen.ReadPythonPasswordSecrets(s.runtimeRoot)
	if err != nil {
		return projectstate.CallableSignatureResult{}, false, err
	}
	request, ok, err := buildPythonCallableSignatureSnapshotRequest(project, passwordSecrets, sectionID, callableName)
	if err != nil || !ok {
		return projectstate.CallableSignatureResult{}, ok, err
	}

	referencePath, err := statefs.ResolveWithinRoot(
		s.settaFilesRoot,
		filepath.FromSlash(request.RelativePath),
		"lsp signature help path",
	)
	if err != nil {
		return projectstate.CallableSignatureResult{}, false, err
	}
	signatureHelp, err := s.lspService.SignatureHelpSnapshot(ctx, lsp.SnapshotSignatureHelpRequest{
		ReferencePath: referencePath,
		LanguageID:    request.LanguageID,
		Content:       request.Content,
		Line:          request.Line,
		Character:     request.Character,
	})
	if err != nil {
		return projectstate.CallableSignatureResult{}, false, err
	}
	return parseCallableSignatureResult(signatureHelp), true, nil
}

type snapshotRequest struct {
	RelativePath string
	LanguageID   string
	Content      string
	Line         int
	Character    int
}

func buildPythonCallableSignatureSnapshotRequest(
	project projectstate.Project,
	passwordSecrets map[string]string,
	sectionID string,
	callableName string,
) (snapshotRequest, bool, error) {
	context, ok, err := buildPythonGeneratedSnapshotContext(project, passwordSecrets)
	if err != nil || !ok {
		return snapshotRequest{}, ok, err
	}

	sectionKey := codegen.PythonSectionDependencyKey(strings.TrimSpace(sectionID))
	if err := codegen.SetPythonDependencyValue(context.graph, sectionKey, strings.TrimSpace(callableName)); err != nil {
		return snapshotRequest{}, false, err
	}
	renderer := context.newRenderer()
	renderer.GenerateCode()
	lineInfo, ok := renderer.Lines[sectionKey]
	if !ok {
		return snapshotRequest{}, false, nil
	}
	valueStart, ok := lineInfo.ValuePosStart()
	if !ok {
		return snapshotRequest{}, false, nil
	}
	callPosition := valueStart + len(strings.TrimSpace(callableName)) + 1
	line, character := positionToLineCol(renderer.Code, callPosition)
	return snapshotRequest{
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
		return pythonGeneratedSnapshotContext{}, false, fmt.Errorf("lspsignature: python codegen export missing for project %s", completionProject.ID)
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

func parseCallableSignatureResult(result lsp.SignatureHelpResult) projectstate.CallableSignatureResult {
	if len(result.Signatures) == 0 {
		return projectstate.CallableSignatureResult{
			Status: projectstate.SignatureHelpStatusNoMatch,
		}
	}

	signature := result.Signatures[0]
	proposals := make([]projectstate.CallableParamProposal, 0, len(signature.Parameters))
	positionalOnlyIndicatorIndex := -1
	keywordOnlyIndicatorIndex := -1
	for index, parameter := range signature.Parameters {
		name, _, _ := parseParamLabel(signature.Label, parameter.Label)
		switch name {
		case "/":
			positionalOnlyIndicatorIndex = index
		case "*":
			keywordOnlyIndicatorIndex = index
		}
	}

	for index, parameter := range signature.Parameters {
		name, typeAnnotation, defaultValue := parseParamLabel(signature.Label, parameter.Label)
		if name == "" {
			continue
		}
		proposals = append(proposals, projectstate.CallableParamProposal{
			Name:           name,
			DefaultValue:   defaultValue,
			Description:    documentationToString(parameter.Documentation),
			TypeAnnotation: typeAnnotation,
			PassingStyle:   passingStyleForParameter(index, positionalOnlyIndicatorIndex, keywordOnlyIndicatorIndex, name),
		})
	}

	return projectstate.CallableSignatureResult{
		Documentation: documentationToString(signature.Documentation),
		Params:        proposals,
		Status:        projectstate.SignatureHelpStatusMatched,
	}
}

func documentationToString(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case map[string]any:
		stringValue, _ := typed["value"].(string)
		return stringValue
	default:
		return ""
	}
}

func parseParamLabel(signatureLabel string, rawLabel json.RawMessage) (string, string, string) {
	label := parameterLabelText(signatureLabel, rawLabel)
	if label == "" {
		return "", "", ""
	}
	if label == "/" || label == "*" {
		return label, "", ""
	}

	defaultValue := ""
	if beforeDefault, afterDefault, found := strings.Cut(label, "="); found {
		label = beforeDefault
		defaultValue = strings.TrimSpace(afterDefault)
	}
	typeAnnotation := ""
	if beforeType, afterType, found := strings.Cut(label, ":"); found {
		label = beforeType
		typeAnnotation = strings.TrimSpace(afterType)
	}
	name := extractVariableName(label)
	return name, typeAnnotation, defaultValue
}

func parameterLabelText(signatureLabel string, rawLabel json.RawMessage) string {
	if len(rawLabel) == 0 {
		return ""
	}
	var labelText string
	if err := json.Unmarshal(rawLabel, &labelText); err == nil {
		return strings.TrimSpace(labelText)
	}
	var offsets []int
	if err := json.Unmarshal(rawLabel, &offsets); err == nil && len(offsets) == 2 {
		start, end := offsets[0], offsets[1]
		runes := []rune(signatureLabel)
		if start < 0 || end < start || end > len(runes) {
			return ""
		}
		return strings.TrimSpace(string(runes[start:end]))
	}
	return ""
}

func extractVariableName(codeString string) string {
	matches := parameterNamePattern.FindAllString(codeString, -1)
	if len(matches) == 0 {
		return ""
	}
	return matches[0]
}

func passingStyleForParameter(
	index int,
	positionalOnlyIndicatorIndex int,
	keywordOnlyIndicatorIndex int,
	name string,
) string {
	switch {
	case strings.HasPrefix(name, "**"):
		return "KWARGS"
	case strings.HasPrefix(name, "*"):
		return "ARGS"
	case positionalOnlyIndicatorIndex >= 0 && index < positionalOnlyIndicatorIndex:
		return "POSITIONAL_ONLY"
	case keywordOnlyIndicatorIndex >= 0 && index > keywordOnlyIndicatorIndex:
		return "KEYWORD_ONLY"
	default:
		return "DEFAULT"
	}
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
