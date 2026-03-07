package codegen

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"setta/internal/projectstate"
)

type PythonGeneratedDiagnostic struct {
	Message  string
	Severity int
	Code     any
	Source   string
	Range    projectstate.LSPDiagnosticRange
}

type PythonGeneratedDiagnosticsMapperOptions struct {
	PasswordSecrets map[string]string
}

type PythonGeneratedDiagnosticsMapper struct {
	projectID             string
	graph                 *PythonDependencyGraph
	renderer              *PythonCodeRenderer
	ignoredTypeErrorsByID map[string]pythonTypeErrorIgnoreState
}

type pythonTypeErrorIgnoreState struct {
	Callable bool
	Params   map[string]bool
}

type pythonGeneratedDiagnosticPosition struct {
	Start int
	End   int
}

type pythonGeneratedDiagnosticRangeIndex struct {
	Starts []int
	Ranges []pythonGeneratedDiagnosticIndexedRange
}

type pythonGeneratedDiagnosticIndexedRange struct {
	Start int
	End   int
	Key   PythonDependencyKey
}

var quotedParameterPattern = regexp.MustCompile(`"([^"]+)"`)

func NewPythonGeneratedDiagnosticsMapper(
	project projectstate.Project,
	options PythonGeneratedDiagnosticsMapperOptions,
) (*PythonGeneratedDiagnosticsMapper, bool, error) {
	target, ok, err := project.PythonCodegenTarget()
	if err != nil || !ok {
		return nil, ok, err
	}
	exported, exportOK, err := project.PythonCodegenExport()
	if err != nil {
		return nil, false, err
	}
	if !exportOK {
		return nil, false, fmt.Errorf("codegen: python export missing for project %s", project.ID)
	}
	graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{
		PasswordSecrets: cloneStringMap(options.PasswordSecrets),
	})
	if err != nil {
		return nil, false, err
	}

	metadataCode := ""
	if target.GenerateMetadata {
		metaRenderer := NewPythonMetadataRenderer(exported, graph)
		metadataCode, err = metaRenderer.GenerateCode()
		if err != nil {
			return nil, false, err
		}
	}

	renderer := NewPythonCodeRenderer(graph, target.GenCodePrefix, target.GenCodeSuffix, PythonCodeRendererOptions{
		ValueMode: PythonValueModePackagedRuntime,
		MetaCode:  metadataCode,
	})
	renderer.GenerateCode()

	return &PythonGeneratedDiagnosticsMapper{
		projectID:             project.ID,
		graph:                 graph,
		renderer:              renderer,
		ignoredTypeErrorsByID: collectIgnoredTypeErrorsBySection(project, exported),
	}, true, nil
}

func (m *PythonGeneratedDiagnosticsMapper) MapCodeDiagnostics(
	diagnostics []PythonGeneratedDiagnostic,
	uri string,
) (projectstate.ProjectConfigDiagnostics, []projectstate.LSPDiagnostic) {
	if m == nil || m.renderer == nil || m.graph == nil {
		return emptyGeneratedDiagnostics(""), buildProjectDiagnostics(diagnostics, uri)
	}

	positions := convertDiagnosticLineColsToPositions(m.renderer.Code, diagnostics)
	rangeIndex := buildDiagnosticRangeIndex(m.renderer)
	errors := map[string]projectstate.SectionTypeErrors{}
	unmapped := make([]projectstate.LSPDiagnostic, 0)

	for index, diagnostic := range diagnostics {
		position := positions[index]
		results := m.processDiagnostic(diagnostic, position, rangeIndex)
		mapped := len(results) > 0
		for _, result := range results {
			if shouldIgnoreGeneratedTypeError(result.SectionID, result.ParamID, m.ignoredTypeErrorsByID) {
				continue
			}
			addGeneratedErrorMessage(errors, result.SectionID, result.ParamID, diagnostic.Message)
		}
		if !mapped {
			unmapped = append(unmapped, buildProjectDiagnostic(diagnostic, uri))
		}
	}

	return projectstate.ProjectConfigDiagnostics{
		ProjectID: m.projectID,
		Errors:    errors,
		IsGenCode: true,
	}, unmapped
}

func (m *PythonGeneratedDiagnosticsMapper) MapMetadataDiagnostics(
	diagnostics []PythonGeneratedDiagnostic,
	uri string,
) []projectstate.LSPDiagnostic {
	return buildProjectDiagnostics(diagnostics, uri)
}

type generatedDiagnosticResult struct {
	SectionID string
	ParamID   string
}

func (m *PythonGeneratedDiagnosticsMapper) processDiagnostic(
	diagnostic PythonGeneratedDiagnostic,
	position pythonGeneratedDiagnosticPosition,
	rangeIndex pythonGeneratedDiagnosticRangeIndex,
) []generatedDiagnosticResult {
	switch {
	case diagnosticCodeString(diagnostic.Code) == "reportArgumentType":
		return m.processReportArgumentType(position)
	case diagnosticCodeString(diagnostic.Code) == "reportCallIssue":
		return m.processReportCallIssue(diagnostic.Message, position, rangeIndex)
	case isUndefinedSymbolDiagnostic(diagnostic):
		return m.processUndefinedSymbol(position, rangeIndex)
	default:
		return nil
	}
}

func (m *PythonGeneratedDiagnosticsMapper) processReportArgumentType(position pythonGeneratedDiagnosticPosition) []generatedDiagnosticResult {
	if position.Start < 0 || position.End < position.Start || position.End > len(m.renderer.Code) {
		return nil
	}
	problemVar := m.renderer.Code[position.Start:position.End]
	depKey, ok := m.renderer.ReverseVarNameMapping[problemVar]
	if !ok {
		return nil
	}
	return []generatedDiagnosticResult{diagnosticResultForKey(depKey)}
}

func (m *PythonGeneratedDiagnosticsMapper) processReportCallIssue(
	message string,
	position pythonGeneratedDiagnosticPosition,
	rangeIndex pythonGeneratedDiagnosticRangeIndex,
) []generatedDiagnosticResult {
	lowerMessage := strings.ToLower(message)
	switch {
	case strings.Contains(lowerMessage, "positional argument"):
		return m.processArgumentIssue(position, rangeIndex, func(node *PythonParamNode) bool {
			return node.PassingStyle == "POSITIONAL_ONLY"
		})
	case strings.Contains(lowerMessage, "parameter"):
		missingParams := extractQuotedParameters(message)
		return m.processArgumentIssue(position, rangeIndex, func(node *PythonParamNode) bool {
			_, ok := missingParams[node.Name]
			return ok
		})
	default:
		return nil
	}
}

func (m *PythonGeneratedDiagnosticsMapper) processArgumentIssue(
	position pythonGeneratedDiagnosticPosition,
	rangeIndex pythonGeneratedDiagnosticRangeIndex,
	filter func(*PythonParamNode) bool,
) []generatedDiagnosticResult {
	depKey, ok := m.renderer.ValuePosStartToKey[position.Start]
	if !ok {
		depKey, ok = findDepKeyForRange(position, m.renderer, rangeIndex)
		if !ok {
			return nil
		}
	}
	node, ok := m.graph.Node(depKey)
	if !ok {
		return nil
	}

	results := make([]generatedDiagnosticResult, 0)
	for _, depDepKey := range orderedDependencyKeys(node.Base().Deps, node.Base().DepOrder) {
		if node.Base().Deps[depDepKey] {
			continue
		}
		paramNode, ok := m.graph.Node(depDepKey)
		if !ok {
			continue
		}
		typed, ok := paramNode.(*PythonParamNode)
		if !ok || !filter(typed) {
			continue
		}
		results = append(results, diagnosticResultForKey(depDepKey))
	}
	return results
}

func (m *PythonGeneratedDiagnosticsMapper) processUndefinedSymbol(
	position pythonGeneratedDiagnosticPosition,
	rangeIndex pythonGeneratedDiagnosticRangeIndex,
) []generatedDiagnosticResult {
	depKey, ok := findDepKeyForRange(position, m.renderer, rangeIndex)
	if !ok {
		return nil
	}
	return []generatedDiagnosticResult{diagnosticResultForKey(depKey)}
}

func diagnosticResultForKey(key PythonDependencyKey) generatedDiagnosticResult {
	return generatedDiagnosticResult{
		SectionID: key.SectionID,
		ParamID:   key.CodeObjectID,
	}
}

func buildDiagnosticRangeIndex(renderer *PythonCodeRenderer) pythonGeneratedDiagnosticRangeIndex {
	ranges := make([]pythonGeneratedDiagnosticIndexedRange, 0, len(renderer.Lines))
	for key, line := range renderer.Lines {
		if !line.HasPosition {
			continue
		}
		ranges = append(ranges, pythonGeneratedDiagnosticIndexedRange{
			Start: line.Position,
			End:   line.Position + line.PrefixLen + line.ValueLen,
			Key:   key,
		})
	}
	sort.Slice(ranges, func(left int, right int) bool {
		return ranges[left].Start < ranges[right].Start
	})
	starts := make([]int, len(ranges))
	for index, entry := range ranges {
		starts[index] = entry.Start
	}
	return pythonGeneratedDiagnosticRangeIndex{
		Starts: starts,
		Ranges: ranges,
	}
}

func findDepKeyForRange(
	position pythonGeneratedDiagnosticPosition,
	renderer *PythonCodeRenderer,
	rangeIndex pythonGeneratedDiagnosticRangeIndex,
) (PythonDependencyKey, bool) {
	if depKey, ok := renderer.ValuePosStartToKey[position.Start]; ok {
		return depKey, true
	}
	if len(rangeIndex.Ranges) == 0 {
		return PythonDependencyKey{}, false
	}

	candidate := sort.Search(len(rangeIndex.Starts), func(index int) bool {
		return rangeIndex.Starts[index] > position.Start
	}) - 1
	for _, candidateIndex := range []int{candidate, candidate + 1} {
		if candidateIndex < 0 || candidateIndex >= len(rangeIndex.Ranges) {
			continue
		}
		entry := rangeIndex.Ranges[candidateIndex]
		if position.Start < entry.End && position.End > entry.Start {
			return entry.Key, true
		}
	}
	return PythonDependencyKey{}, false
}

func convertDiagnosticLineColsToPositions(
	code string,
	diagnostics []PythonGeneratedDiagnostic,
) []pythonGeneratedDiagnosticPosition {
	output := make([]pythonGeneratedDiagnosticPosition, 0, len(diagnostics))
	for _, diagnostic := range diagnostics {
		output = append(output, pythonGeneratedDiagnosticPosition{
			Start: lineColToPosition(code, diagnostic.Range.Start.Line, diagnostic.Range.Start.Character),
			End:   lineColToPosition(code, diagnostic.Range.End.Line, diagnostic.Range.End.Character),
		})
	}
	return output
}

func lineColToPosition(code string, targetLine int, targetCol int) int {
	if targetLine <= 0 && targetCol <= 0 {
		return 0
	}

	line := 0
	col := 0
	for index, char := range code {
		if line == targetLine && col == targetCol {
			return index
		}
		if char == '\n' {
			line++
			col = 0
			if line > targetLine {
				return index + 1
			}
			continue
		}
		col++
	}
	return len(code)
}

func buildProjectDiagnostics(diagnostics []PythonGeneratedDiagnostic, uri string) []projectstate.LSPDiagnostic {
	output := make([]projectstate.LSPDiagnostic, 0, len(diagnostics))
	for _, diagnostic := range diagnostics {
		output = append(output, buildProjectDiagnostic(diagnostic, uri))
	}
	return output
}

func buildProjectDiagnostic(diagnostic PythonGeneratedDiagnostic, uri string) projectstate.LSPDiagnostic {
	return projectstate.LSPDiagnostic{
		Message:  diagnostic.Message,
		Severity: pointerIfPositive(diagnostic.Severity),
		Code:     normalizeDiagnosticCode(diagnostic.Code),
		Source:   pointerIfNonEmpty(diagnostic.Source),
		Range:    diagnostic.Range,
		URI:      pointerIfNonEmpty(uri),
	}
}

func emptyGeneratedDiagnostics(projectID string) projectstate.ProjectConfigDiagnostics {
	return projectstate.ProjectConfigDiagnostics{
		ProjectID: projectID,
		Errors:    map[string]projectstate.SectionTypeErrors{},
		IsGenCode: true,
	}
}

func addGeneratedErrorMessage(
	errors map[string]projectstate.SectionTypeErrors,
	sectionID string,
	paramID string,
	message string,
) {
	sectionErrors := errors[sectionID]
	if sectionErrors.Params == nil {
		sectionErrors.Params = map[string][]string{}
	}
	if strings.TrimSpace(paramID) == "" {
		sectionErrors.Callable = append(sectionErrors.Callable, message)
		errors[sectionID] = sectionErrors
		return
	}
	sectionErrors.Params[paramID] = append(sectionErrors.Params[paramID], message)
	errors[sectionID] = sectionErrors
}

func shouldIgnoreGeneratedTypeError(
	sectionID string,
	paramID string,
	ignoredBySection map[string]pythonTypeErrorIgnoreState,
) bool {
	ignoreState, ok := ignoredBySection[sectionID]
	if !ok {
		return false
	}
	if strings.TrimSpace(paramID) == "" {
		return ignoreState.Callable
	}
	return ignoreState.Params[paramID]
}

func collectIgnoredTypeErrorsBySection(
	project projectstate.Project,
	exported projectstate.PythonCodegenExport,
) map[string]pythonTypeErrorIgnoreState {
	ignored := map[string]pythonTypeErrorIgnoreState{}
	sectionIDs := make([]string, 0, len(project.SectionVariantMap))
	for sectionID := range project.SectionVariantMap {
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)

	for _, sectionID := range sectionIDs {
		section, err := exported.ResolveSection(sectionID)
		if err != nil {
			continue
		}
		ignoreObject := section.ObjectField("ignoreTypeErrors")
		callable, _ := ignoreObject["callable"].(bool)
		params := map[string]bool{}
		rawParams, _ := ignoreObject["params"].(map[string]any)
		for paramID, rawIgnore := range rawParams {
			ignoredParam, ok := rawIgnore.(bool)
			if ok && ignoredParam {
				params[paramID] = true
			}
		}
		if callable || len(params) > 0 {
			ignored[sectionID] = pythonTypeErrorIgnoreState{
				Callable: callable,
				Params:   params,
			}
		}
	}
	return ignored
}

func extractQuotedParameters(message string) map[string]struct{} {
	matches := quotedParameterPattern.FindAllStringSubmatch(message, -1)
	output := make(map[string]struct{}, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		output[match[1]] = struct{}{}
	}
	return output
}

func isUndefinedSymbolDiagnostic(diagnostic PythonGeneratedDiagnostic) bool {
	code := diagnosticCodeString(diagnostic.Code)
	switch code {
	case "reportUndefinedVariable", "reportUnboundVariable", "reportUndefinedFunction", "reportUndefinedClass":
		return true
	}

	lowerMessage := strings.ToLower(diagnostic.Message)
	for _, fragment := range []string{"is not defined", "has no attribute", "cannot access member"} {
		if strings.Contains(lowerMessage, fragment) {
			return true
		}
	}
	return false
}

func diagnosticCodeString(code any) string {
	value, ok := normalizeDiagnosticCode(code).(string)
	if !ok {
		return ""
	}
	return value
}

func pointerIfPositive(value int) *int {
	if value <= 0 {
		return nil
	}
	output := value
	return &output
}

func pointerIfNonEmpty(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	output := value
	return &output
}

func normalizeDiagnosticCode(value any) any {
	switch typed := value.(type) {
	case float64:
		if typed == float64(int(typed)) {
			return int(typed)
		}
		return typed
	default:
		return typed
	}
}
