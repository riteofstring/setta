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
	watchCodeModulePaths  map[string]struct{}
	requiredParamsByID    map[string][]pythonRequiredParam
}

type PythonGeneratedCodeDiagnosticsResult struct {
	Diagnostics               projectstate.ProjectConfigDiagnostics
	Unmapped                  []projectstate.LSPDiagnostic
	UndefinedCallableSections map[string]struct{}
	CallableMismatchSections  map[string]struct{}
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

type pythonRequiredParam struct {
	ParamID string
	Name    string
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
		watchCodeModulePaths:  collectWatchCodeModulePaths(project),
		requiredParamsByID:    collectWatchCodeRequiredParamsBySection(project, graph),
	}, true, nil
}

func (m *PythonGeneratedDiagnosticsMapper) MapCodeDiagnostics(
	diagnostics []PythonGeneratedDiagnostic,
	uri string,
) (projectstate.ProjectConfigDiagnostics, []projectstate.LSPDiagnostic) {
	result := m.AnalyzeCodeDiagnostics(diagnostics, uri)
	return result.Diagnostics, result.Unmapped
}

func (m *PythonGeneratedDiagnosticsMapper) AnalyzeCodeDiagnostics(
	diagnostics []PythonGeneratedDiagnostic,
	uri string,
) PythonGeneratedCodeDiagnosticsResult {
	if emptyResult, ok := m.emptyCodeDiagnosticsResult(diagnostics, uri); ok {
		return emptyResult
	}

	positions := convertDiagnosticLineColsToPositions(m.renderer.Code, diagnostics)
	rangeIndex := buildDiagnosticRangeIndex(m.renderer)
	analysis := newGeneratedDiagnosticAnalysis(len(diagnostics))

	for index, diagnostic := range diagnostics {
		m.analyzeSingleDiagnostic(diagnostic, positions[index], rangeIndex, uri, &analysis)
	}
	m.applyRequiredParamFallback(analysis.errors)
	return analysis.result(m.projectID)
}

func (m *PythonGeneratedDiagnosticsMapper) emptyCodeDiagnosticsResult(
	diagnostics []PythonGeneratedDiagnostic,
	uri string,
) (PythonGeneratedCodeDiagnosticsResult, bool) {
	if m != nil && m.renderer != nil && m.graph != nil {
		return PythonGeneratedCodeDiagnosticsResult{}, false
	}
	return PythonGeneratedCodeDiagnosticsResult{
		Diagnostics:               emptyGeneratedDiagnostics(""),
		Unmapped:                  buildProjectDiagnostics(diagnostics, uri),
		UndefinedCallableSections: map[string]struct{}{},
		CallableMismatchSections:  map[string]struct{}{},
	}, true
}

func (m *PythonGeneratedDiagnosticsMapper) analyzeSingleDiagnostic(
	diagnostic PythonGeneratedDiagnostic,
	position pythonGeneratedDiagnosticPosition,
	rangeIndex pythonGeneratedDiagnosticRangeIndex,
	uri string,
	analysis *generatedDiagnosticAnalysis,
) {
	if m.shouldIgnoreDiagnostic(diagnostic, position) {
		return
	}
	if sectionID, ok := m.callableMismatchSectionIDForDiagnostic(diagnostic, position, rangeIndex); ok {
		analysis.callableMismatchSections[sectionID] = struct{}{}
	}
	results := m.processDiagnostic(diagnostic, position, rangeIndex)
	if len(results) == 0 {
		analysis.unmapped = append(analysis.unmapped, buildProjectDiagnostic(diagnostic, uri))
		return
	}
	for _, result := range results {
		m.recordGeneratedDiagnosticResult(analysis, result, diagnostic)
	}
}

func (m *PythonGeneratedDiagnosticsMapper) callableMismatchSectionIDForDiagnostic(
	diagnostic PythonGeneratedDiagnostic,
	position pythonGeneratedDiagnosticPosition,
	rangeIndex pythonGeneratedDiagnosticRangeIndex,
) (string, bool) {
	if !isCallMismatchDiagnostic(diagnostic) {
		return "", false
	}
	return m.callableMismatchSectionID(position, rangeIndex)
}

func (m *PythonGeneratedDiagnosticsMapper) recordGeneratedDiagnosticResult(
	analysis *generatedDiagnosticAnalysis,
	result generatedDiagnosticResult,
	diagnostic PythonGeneratedDiagnostic,
) {
	if isUndefinedSymbolDiagnostic(diagnostic) && strings.TrimSpace(result.ParamID) == "" {
		analysis.undefinedCallableSections[result.SectionID] = struct{}{}
	}
	if shouldIgnoreGeneratedTypeError(result.SectionID, result.ParamID, m.ignoredTypeErrorsByID) {
		return
	}
	addGeneratedErrorMessage(analysis.errors, result.SectionID, result.ParamID, diagnostic.Message)
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

type generatedDiagnosticAnalysis struct {
	errors                    map[string]projectstate.SectionTypeErrors
	unmapped                  []projectstate.LSPDiagnostic
	undefinedCallableSections map[string]struct{}
	callableMismatchSections  map[string]struct{}
}

func newGeneratedDiagnosticAnalysis(sizeHint int) generatedDiagnosticAnalysis {
	return generatedDiagnosticAnalysis{
		errors:                    map[string]projectstate.SectionTypeErrors{},
		unmapped:                  make([]projectstate.LSPDiagnostic, 0, sizeHint),
		undefinedCallableSections: map[string]struct{}{},
		callableMismatchSections:  map[string]struct{}{},
	}
}

func (analysis generatedDiagnosticAnalysis) result(projectID string) PythonGeneratedCodeDiagnosticsResult {
	return PythonGeneratedCodeDiagnosticsResult{
		Diagnostics: projectstate.ProjectConfigDiagnostics{
			ProjectID: projectID,
			Errors:    analysis.errors,
			IsGenCode: true,
		},
		Unmapped:                  analysis.unmapped,
		UndefinedCallableSections: analysis.undefinedCallableSections,
		CallableMismatchSections:  analysis.callableMismatchSections,
	}
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

func (m *PythonGeneratedDiagnosticsMapper) shouldIgnoreDiagnostic(
	diagnostic PythonGeneratedDiagnostic,
	position pythonGeneratedDiagnosticPosition,
) bool {
	code := diagnosticCodeString(diagnostic.Code)
	if code != "reportImplicitRelativeImport" && code != "reportMissingImports" {
		return false
	}
	modulePath, ok := m.implicitRelativeImportModulePath(position)
	if !ok {
		return false
	}
	_, ok = m.watchCodeModulePaths[modulePath]
	return ok
}

func (m *PythonGeneratedDiagnosticsMapper) implicitRelativeImportModulePath(
	position pythonGeneratedDiagnosticPosition,
) (string, bool) {
	if m == nil || m.renderer == nil {
		return "", false
	}
	if position.Start < 0 || position.End < position.Start || position.End > len(m.renderer.Code) {
		return "", false
	}

	snippet := strings.TrimSpace(m.renderer.Code[position.Start:position.End])
	snippet = strings.Trim(snippet, `"'`)
	if isPythonModulePath(snippet) {
		return snippet, true
	}

	line := diagnosticLineText(m.renderer.Code, position)
	return parseImportModulePath(line)
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

func (m *PythonGeneratedDiagnosticsMapper) callableMismatchSectionID(
	position pythonGeneratedDiagnosticPosition,
	rangeIndex pythonGeneratedDiagnosticRangeIndex,
) (string, bool) {
	depKey, ok := findDepKeyForRange(position, m.renderer, rangeIndex)
	if !ok || strings.TrimSpace(depKey.SectionID) == "" {
		return "", false
	}
	return depKey.SectionID, true
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

func isCallMismatchDiagnostic(diagnostic PythonGeneratedDiagnostic) bool {
	if diagnosticCodeString(diagnostic.Code) != "reportCallIssue" {
		return false
	}
	lowerMessage := strings.ToLower(diagnostic.Message)
	return strings.Contains(lowerMessage, "positional argument") || strings.Contains(lowerMessage, "parameter")
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

func collectWatchCodeModulePaths(project projectstate.Project) map[string]struct{} {
	if len(project.WatchCodeRegistry) == 0 {
		return map[string]struct{}{}
	}

	output := make(map[string]struct{}, len(project.WatchCodeRegistry))
	for identity := range project.WatchCodeRegistry {
		modulePath := watchCodeModulePathFromIdentity(identity)
		if modulePath == "" {
			continue
		}
		output[modulePath] = struct{}{}
	}
	return output
}

func collectWatchCodeRequiredParamsBySection(
	project projectstate.Project,
	graph *PythonDependencyGraph,
) map[string][]pythonRequiredParam {
	if graph == nil || len(project.WatchCodeRegistry) == 0 {
		return map[string][]pythonRequiredParam{}
	}

	watchCodeSectionIDs := collectWatchCodeSectionIDs(project)
	if len(watchCodeSectionIDs) == 0 {
		return map[string][]pythonRequiredParam{}
	}

	required := map[string][]pythonRequiredParam{}
	for _, key := range graph.NodeOrder {
		param, ok := collectWatchCodeRequiredParam(graph, key, watchCodeSectionIDs)
		if !ok {
			continue
		}
		required[key.SectionID] = append(required[key.SectionID], param)
	}
	return required
}

func (m *PythonGeneratedDiagnosticsMapper) applyRequiredParamFallback(
	errors map[string]projectstate.SectionTypeErrors,
) {
	if m == nil || m.graph == nil || len(m.requiredParamsByID) == 0 {
		return
	}

	for _, sectionID := range sortedStringKeys(m.requiredParamsByID) {
		missing := m.collectMissingRequiredParams(sectionID, m.requiredParamsByID[sectionID], errors)
		if len(missing) == 0 {
			continue
		}
		addGeneratedRequiredParamErrors(errors, sectionID, missing)
	}
}

func collectWatchCodeSectionIDs(project projectstate.Project) map[string]struct{} {
	watchCodeSectionIDs := map[string]struct{}{}
	for _, entry := range project.WatchCodeRegistry {
		for _, sectionID := range entry.SectionIDs {
			trimmedSectionID := strings.TrimSpace(sectionID)
			if trimmedSectionID == "" {
				continue
			}
			watchCodeSectionIDs[trimmedSectionID] = struct{}{}
		}
	}
	return watchCodeSectionIDs
}

func collectWatchCodeRequiredParam(
	graph *PythonDependencyGraph,
	key PythonDependencyKey,
	watchCodeSectionIDs map[string]struct{},
) (pythonRequiredParam, bool) {
	if strings.TrimSpace(key.CodeObjectID) == "" {
		return pythonRequiredParam{}, false
	}
	if _, ok := watchCodeSectionIDs[key.SectionID]; !ok {
		return pythonRequiredParam{}, false
	}
	node, ok := graph.Node(key)
	if !ok {
		return pythonRequiredParam{}, false
	}
	paramNode, ok := node.(*PythonParamNode)
	if !ok || isOptionalWatchCodeParam(paramNode) {
		return pythonRequiredParam{}, false
	}
	return pythonRequiredParam{
		ParamID: key.CodeObjectID,
		Name:    strings.TrimSpace(paramNode.Name),
	}, true
}

func isOptionalWatchCodeParam(paramNode *PythonParamNode) bool {
	if strings.TrimSpace(paramNode.DefaultValue) != "" {
		return true
	}
	switch strings.TrimSpace(paramNode.PassingStyle) {
	case "ARGS", "KWARGS":
		return true
	default:
		return false
	}
}

func (m *PythonGeneratedDiagnosticsMapper) collectMissingRequiredParams(
	sectionID string,
	requiredParams []pythonRequiredParam,
	errors map[string]projectstate.SectionTypeErrors,
) []pythonRequiredParam {
	missing := make([]pythonRequiredParam, 0, len(requiredParams))
	for _, required := range requiredParams {
		key := PythonCodeObjectDependencyKey(sectionID, required.ParamID)
		node, ok := m.graph.Node(key)
		if !ok {
			continue
		}
		paramNode, ok := node.(*PythonParamNode)
		if !ok || paramNode.HasNameAndValue() {
			continue
		}
		if len(errors[sectionID].Params[required.ParamID]) > 0 {
			continue
		}
		missing = append(missing, required)
	}
	return missing
}

func addGeneratedRequiredParamErrors(
	errors map[string]projectstate.SectionTypeErrors,
	sectionID string,
	missing []pythonRequiredParam,
) {
	message := missingParametersMessage(missing)
	for _, required := range missing {
		addGeneratedErrorMessage(errors, sectionID, required.ParamID, message)
	}
}

func missingParametersMessage(params []pythonRequiredParam) string {
	if len(params) == 0 {
		return ""
	}
	quoted := make([]string, 0, len(params))
	for _, param := range params {
		name := strings.TrimSpace(param.Name)
		if name == "" {
			continue
		}
		quoted = append(quoted, fmt.Sprintf("%q", name))
	}
	if len(quoted) == 0 {
		return ""
	}
	if len(quoted) == 1 {
		return fmt.Sprintf("Argument missing for parameter %s", quoted[0])
	}
	return fmt.Sprintf("Arguments missing for parameters %s", strings.Join(quoted, ", "))
}

func watchCodeModulePathFromIdentity(identity string) string {
	trimmedIdentity := strings.TrimSpace(identity)
	if trimmedIdentity == "" {
		return ""
	}
	canonicalName := strings.TrimSpace(strings.SplitN(trimmedIdentity, ":", 2)[0])
	lastDot := strings.LastIndex(canonicalName, ".")
	if lastDot <= 0 {
		return ""
	}
	return canonicalName[:lastDot]
}

func diagnosticLineText(code string, position pythonGeneratedDiagnosticPosition) string {
	if position.Start < 0 || position.End < position.Start || position.End > len(code) {
		return ""
	}

	lineStart := 0
	if position.Start > 0 {
		lineStart = strings.LastIndex(code[:position.Start], "\n") + 1
	}
	lineEnd := len(code)
	if relativeEnd := strings.Index(code[position.End:], "\n"); relativeEnd >= 0 {
		lineEnd = position.End + relativeEnd
	}
	return code[lineStart:lineEnd]
}

func parseImportModulePath(line string) (string, bool) {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return "", false
	}
	if commentIndex := strings.Index(trimmed, "#"); commentIndex >= 0 {
		trimmed = strings.TrimSpace(trimmed[:commentIndex])
	}
	if !strings.HasPrefix(trimmed, "from ") {
		return "", false
	}
	rest := strings.TrimSpace(strings.TrimPrefix(trimmed, "from "))
	importIndex := strings.Index(rest, " import ")
	if importIndex < 0 {
		return "", false
	}
	modulePath := strings.TrimSpace(rest[:importIndex])
	if !isPythonModulePath(modulePath) {
		return "", false
	}
	return modulePath, true
}

func isPythonModulePath(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || strings.HasPrefix(trimmed, ".") {
		return false
	}
	for _, part := range strings.Split(trimmed, ".") {
		if !isPythonIdentifier(part) {
			return false
		}
	}
	return true
}

func isPythonIdentifier(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}
	for index, r := range trimmed {
		if !isPythonIdentifierRune(r, index == 0) {
			return false
		}
	}
	return true
}

func isPythonIdentifierRune(value rune, first bool) bool {
	if value == '_' {
		return true
	}
	if first {
		return isASCIILetter(value)
	}
	return isASCIILetter(value) || isASCIIDigit(value)
}

func isASCIILetter(value rune) bool {
	return ('A' <= value && value <= 'Z') || ('a' <= value && value <= 'z')
}

func isASCIIDigit(value rune) bool {
	return '0' <= value && value <= '9'
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
