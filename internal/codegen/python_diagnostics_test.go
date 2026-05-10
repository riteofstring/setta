package codegen

import (
	"encoding/json"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"setta/internal/projectstate"
)

// Generated Python diagnostics should honor the stored ignoreTypeErrors state
// instead of leaking ignored param errors back into the shared registry.
func TestPythonGeneratedDiagnosticsMapperFiltersIgnoredParamErrors(t *testing.T) {
	t.Parallel()

	mapper := mustPythonGeneratedDiagnosticsMapper(t, pythonGeneratedDiagnosticsProject(t, pythonGeneratedDiagnosticsProjectOptions{
		ParamValue: "bad_value",
	}))

	paramKey := PythonCodeObjectDependencyKey("section-1", "param-1")
	varName := mapper.renderer.VarNameMapping[paramKey]
	start := strings.Index(mapper.renderer.Code, varName)
	if start < 0 {
		t.Fatalf("expected var name %q in generated code:\n%s", varName, mapper.renderer.Code)
	}
	diagnostic := buildGeneratedDiagnostic(
		t,
		mapper.renderer.Code,
		start,
		start+len(varName),
		"Argument type mismatch",
		"reportArgumentType",
	)

	result := mapper.AnalyzeCodeDiagnostics([]PythonGeneratedDiagnostic{diagnostic}, "file:///tmp/setta_gen.py")
	errors, unmapped := result.Diagnostics, result.Unmapped
	if errors.Errors["section-1"].Params["param-1"][0] != "Argument type mismatch" {
		t.Fatalf("expected mapped param error, got %#v", errors.Errors)
	}
	if len(unmapped) != 0 {
		t.Fatalf("expected mapped diagnostics only, got %#v", unmapped)
	}

	ignoredMapper := mustPythonGeneratedDiagnosticsMapper(t, pythonGeneratedDiagnosticsProject(t, pythonGeneratedDiagnosticsProjectOptions{
		ParamValue:       "bad_value",
		IgnoreParamError: true,
	}))
	ignoredVarName := ignoredMapper.renderer.VarNameMapping[paramKey]
	ignoredStart := strings.Index(ignoredMapper.renderer.Code, ignoredVarName)
	if ignoredStart < 0 {
		t.Fatalf("expected ignored var name %q in generated code:\n%s", ignoredVarName, ignoredMapper.renderer.Code)
	}
	ignoredDiagnostic := buildGeneratedDiagnostic(
		t,
		ignoredMapper.renderer.Code,
		ignoredStart,
		ignoredStart+len(ignoredVarName),
		"Argument type mismatch",
		"reportArgumentType",
	)

	filteredResult := ignoredMapper.AnalyzeCodeDiagnostics([]PythonGeneratedDiagnostic{ignoredDiagnostic}, "file:///tmp/setta_gen.py")
	filtered, filteredUnmapped := filteredResult.Diagnostics, filteredResult.Unmapped
	if len(filtered.Errors) != 0 {
		t.Fatalf("expected ignored param errors to be filtered, got %#v", filtered.Errors)
	}
	if len(filteredUnmapped) != 0 {
		t.Fatalf("expected no unmapped diagnostics for ignored param error, got %#v", filteredUnmapped)
	}
}

// Undefined-symbol diagnostics should use the rendered line/range index so
// partial overlaps inside generated expressions still map to the owning param.
func TestPythonGeneratedDiagnosticsMapperUsesRangeIndexForUndefinedSymbol(t *testing.T) {
	t.Parallel()

	mapper := mustPythonGeneratedDiagnosticsMapper(t, pythonGeneratedDiagnosticsProject(t, pythonGeneratedDiagnosticsProjectOptions{
		ParamValue: "unknown_symbol",
	}))

	paramKey := PythonCodeObjectDependencyKey("section-1", "param-1")
	line := mapper.renderer.Lines[paramKey]
	valueStart, ok := line.ValuePosStart()
	if !ok {
		t.Fatalf("expected generated line position for param %#v", line)
	}
	valueEnd := valueStart + line.ValueLen
	diagnostic := buildGeneratedDiagnostic(
		t,
		mapper.renderer.Code,
		valueStart+1,
		minInt(valueStart+4, valueEnd),
		"unknown_symbol is not defined",
		"reportUndefinedVariable",
	)

	result := mapper.AnalyzeCodeDiagnostics([]PythonGeneratedDiagnostic{diagnostic}, "file:///tmp/setta_gen.py")
	errors, unmapped := result.Diagnostics, result.Unmapped
	if errors.Errors["section-1"].Params["param-1"][0] != "unknown_symbol is not defined" {
		t.Fatalf("expected mapped undefined-symbol error, got %#v", errors.Errors)
	}
	if len(unmapped) != 0 {
		t.Fatalf("expected undefined symbol to map cleanly, got %#v", unmapped)
	}
}

// Undefined callable diagnostics need to expose both the mapped callable error
// payload and the raw section-id set used by auto-refetch callbacks.
func TestPythonGeneratedDiagnosticsMapperCollectsUndefinedCallableSections(t *testing.T) {
	t.Parallel()

	mapper := mustPythonGeneratedDiagnosticsMapper(t, pythonGeneratedDiagnosticsProject(t, pythonGeneratedDiagnosticsProjectOptions{
		ParamValue: "",
	}))

	start := strings.Index(mapper.renderer.Code, "MissingFunc")
	if start < 0 {
		t.Fatalf("expected callable name in generated code:\n%s", mapper.renderer.Code)
	}
	diagnostic := buildGeneratedDiagnostic(
		t,
		mapper.renderer.Code,
		start,
		start+len("MissingFunc"),
		"MissingFunc is not defined",
		"reportUndefinedVariable",
	)

	result := mapper.AnalyzeCodeDiagnostics([]PythonGeneratedDiagnostic{diagnostic}, "file:///tmp/setta_gen.py")
	if result.Diagnostics.Errors["section-1"].Callable[0] != "MissingFunc is not defined" {
		t.Fatalf("expected mapped callable error, got %#v", result.Diagnostics.Errors)
	}
	if _, ok := result.UndefinedCallableSections["section-1"]; !ok {
		t.Fatalf("expected undefined callable section, got %#v", result.UndefinedCallableSections)
	}
}

// Ignoring callable errors should suppress the user-facing diagnostics while
// still preserving the undefined-callable section set that drives auto-refetch.
func TestPythonGeneratedDiagnosticsMapperIgnoredCallableUndefinedStillTracksSection(t *testing.T) {
	t.Parallel()

	mapper := mustPythonGeneratedDiagnosticsMapper(t, pythonGeneratedDiagnosticsProject(t, pythonGeneratedDiagnosticsProjectOptions{
		ParamValue:          "value",
		IgnoreCallableError: true,
	}))

	start := strings.Index(mapper.renderer.Code, "MissingFunc")
	if start < 0 {
		t.Fatalf("expected callable name in generated code:\n%s", mapper.renderer.Code)
	}
	diagnostic := buildGeneratedDiagnostic(
		t,
		mapper.renderer.Code,
		start,
		start+len("MissingFunc"),
		"MissingFunc is not defined",
		"reportUndefinedVariable",
	)

	result := mapper.AnalyzeCodeDiagnostics([]PythonGeneratedDiagnostic{diagnostic}, "file:///tmp/setta_gen.py")
	if len(result.Diagnostics.Errors) != 0 {
		t.Fatalf("expected ignored callable error to stay out of diagnostics, got %#v", result.Diagnostics.Errors)
	}
	if _, ok := result.UndefinedCallableSections["section-1"]; !ok {
		t.Fatalf("expected undefined callable section to stay tracked, got %#v", result.UndefinedCallableSections)
	}
}

// Named-argument call issues should map from the assignment target and identify
// the specific missing param from the dependency graph.
func TestPythonGeneratedDiagnosticsMapperMapsCallIssueFromAssignmentTarget(t *testing.T) {
	t.Parallel()

	mapper := mustPythonGeneratedDiagnosticsMapper(t, pythonGeneratedDiagnosticsProject(t, pythonGeneratedDiagnosticsProjectOptions{
		ParamValue: "",
	}))

	sectionKey := PythonSectionDependencyKey("section-1")
	varName := mapper.renderer.VarNameMapping[sectionKey]
	start := strings.Index(mapper.renderer.Code, varName)
	if start < 0 {
		t.Fatalf("expected section var name %q in generated code:\n%s", varName, mapper.renderer.Code)
	}
	diagnostic := buildGeneratedDiagnostic(
		t,
		mapper.renderer.Code,
		start,
		start+len(varName),
		`Argument missing for parameter "param"`,
		"reportCallIssue",
	)

	result := mapper.AnalyzeCodeDiagnostics([]PythonGeneratedDiagnostic{diagnostic}, "file:///tmp/setta_gen.py")
	errors, unmapped := result.Diagnostics, result.Unmapped
	if errors.Errors["section-1"].Params["param-1"][0] != `Argument missing for parameter "param"` {
		t.Fatalf("expected missing-parameter mapping, got %#v", errors.Errors)
	}
	if len(unmapped) != 0 {
		t.Fatalf("expected named call issue to map cleanly, got %#v", unmapped)
	}
}

// Callable mismatch diagnostics need to retain the owning section-id set so
// the synchronizer can trigger a single refetch the first time the mismatch
// appears.
func TestPythonGeneratedDiagnosticsMapperCollectsCallableMismatchSections(t *testing.T) {
	t.Parallel()

	mapper := mustPythonGeneratedDiagnosticsMapper(t, pythonGeneratedDiagnosticsProject(t, pythonGeneratedDiagnosticsProjectOptions{
		ParamValue: "",
	}))

	start := strings.Index(mapper.renderer.Code, "MissingFunc")
	if start < 0 {
		t.Fatalf("expected callable name in generated code:\n%s", mapper.renderer.Code)
	}
	diagnostic := buildGeneratedDiagnostic(
		t,
		mapper.renderer.Code,
		start,
		start+len("MissingFunc"),
		`Argument missing for parameter "param"`,
		"reportCallIssue",
	)

	result := mapper.AnalyzeCodeDiagnostics([]PythonGeneratedDiagnostic{diagnostic}, "file:///tmp/setta_gen.py")
	if _, ok := result.CallableMismatchSections["section-1"]; !ok {
		t.Fatalf("expected callable mismatch section, got %#v", result.CallableMismatchSections)
	}
}

// Undefined symbols inside param expressions should not mark the whole section
// as an undefined callable.
func TestPythonGeneratedDiagnosticsMapperParamUndefinedDoesNotMarkCallable(t *testing.T) {
	t.Parallel()

	mapper := mustPythonGeneratedDiagnosticsMapper(t, pythonGeneratedDiagnosticsProject(t, pythonGeneratedDiagnosticsProjectOptions{
		ParamValue: "unknown_symbol",
	}))

	paramKey := PythonCodeObjectDependencyKey("section-1", "param-1")
	line := mapper.renderer.Lines[paramKey]
	valueStart, ok := line.ValuePosStart()
	if !ok {
		t.Fatalf("expected generated line position for param %#v", line)
	}
	valueEnd := valueStart + line.ValueLen
	diagnostic := buildGeneratedDiagnostic(
		t,
		mapper.renderer.Code,
		valueStart,
		minInt(valueStart+4, valueEnd),
		"unknown_symbol is not defined",
		"reportUndefinedVariable",
	)

	result := mapper.AnalyzeCodeDiagnostics([]PythonGeneratedDiagnostic{diagnostic}, "file:///tmp/setta_gen.py")
	if result.Diagnostics.Errors["section-1"].Params["param-1"][0] != "unknown_symbol is not defined" {
		t.Fatalf("expected mapped param error, got %#v", result.Diagnostics.Errors)
	}
	if _, ok := result.UndefinedCallableSections["section-1"]; ok {
		t.Fatalf("did not expect param diagnostic to mark callable undefined, got %#v", result.UndefinedCallableSections)
	}
}

// Positional-only call issues report from the generated line start instead of
// the value start, so the mapper must fall back to the rendered range index.
func TestPythonGeneratedDiagnosticsMapperMapsPositionalCallIssueFromLineStart(t *testing.T) {
	t.Parallel()

	mapper := mustPythonGeneratedDiagnosticsMapper(t, pythonGeneratedDiagnosticsProject(t, pythonGeneratedDiagnosticsProjectOptions{
		ParamValue:   "",
		PassingStyle: "POSITIONAL_ONLY",
		CallableName: "MissingFunc",
		ParamName:    "param",
	}))

	sectionKey := PythonSectionDependencyKey("section-1")
	line := mapper.renderer.Lines[sectionKey]
	if !line.HasPosition {
		t.Fatalf("expected positioned section line %#v", line)
	}
	diagnostic := buildGeneratedDiagnostic(
		t,
		mapper.renderer.Code,
		line.Position,
		line.Position+1,
		`Positional argument missing for parameter "param"`,
		"reportCallIssue",
	)

	result := mapper.AnalyzeCodeDiagnostics([]PythonGeneratedDiagnostic{diagnostic}, "file:///tmp/setta_gen.py")
	errors, unmapped := result.Diagnostics, result.Unmapped
	if errors.Errors["section-1"].Params["param-1"][0] != `Positional argument missing for parameter "param"` {
		t.Fatalf("expected positional missing-parameter mapping, got %#v", errors.Errors)
	}
	if len(unmapped) != 0 {
		t.Fatalf("expected positional call issue to map cleanly, got %#v", unmapped)
	}
}

// Multiline code-param expressions should stay wrapped in parentheses with the
// generated continuation indent so downstream range mapping stays stable.
func TestPythonGeneratedDiagnosticsMapperWrapsMultilineCodeParamExpressions(t *testing.T) {
	t.Parallel()

	mapper := mustPythonGeneratedDiagnosticsMapper(t, pythonGeneratedDiagnosticsProject(t, pythonGeneratedDiagnosticsProjectOptions{
		ParamValue: "[\n1,\n2,\n]",
	}))

	paramKey := PythonCodeObjectDependencyKey("section-1", "param-1")
	line := mapper.renderer.Lines[paramKey]
	lines := strings.Split(line.VarString[line.PrefixLen:], "\n")
	expected := []string{
		"(",
		PythonGeneratedCodeMultilineContinuationIndent + "[",
		PythonGeneratedCodeMultilineContinuationIndent + "1,",
		PythonGeneratedCodeMultilineContinuationIndent + "2,",
		PythonGeneratedCodeMultilineContinuationIndent + "]",
		PythonGeneratedCodeBodyIndent + ")",
	}
	if !reflect.DeepEqual(lines, expected) {
		t.Fatalf("unexpected wrapped multiline expression %#v", lines)
	}
}

func TestPythonGeneratedDiagnosticsMapperFiltersImplicitRelativeImportForWatchCodeModule(t *testing.T) {
	t.Parallel()

	options := pythonGeneratedDiagnosticsProjectOptions{
		GenCodePrefix:       "from watch_code_test import cool_fn\n",
		ParamValue:          "value",
		WatchCodeIdentity:   "watch_code_test.cool_fn:function",
		WatchCodeCallable:   "cool_fn",
		WatchCodeSourcePath: "/tmp/workspace/watch_code_test.py",
	}
	mapper := mustPythonGeneratedDiagnosticsMapper(
		t,
		pythonGeneratedDiagnosticsProject(t, options),
		pythonGeneratedDiagnosticsWatchCodeRegistry(options),
	)

	start := strings.Index(mapper.renderer.Code, "watch_code_test")
	if start < 0 {
		t.Fatalf("expected watch code import in generated code:\n%s", mapper.renderer.Code)
	}
	diagnostic := buildGeneratedDiagnostic(
		t,
		mapper.renderer.Code,
		start,
		start+len("watch_code_test"),
		`Import from "watch_code_test" is implicitly relative and will not work if this file is imported as a module`,
		"reportImplicitRelativeImport",
	)

	result := mapper.AnalyzeCodeDiagnostics([]PythonGeneratedDiagnostic{diagnostic}, "file:///tmp/setta_gen.py")
	errors, unmapped := result.Diagnostics, result.Unmapped
	if len(errors.Errors) != 0 {
		t.Fatalf("expected no mapped errors for ignored implicit-relative import, got %#v", errors.Errors)
	}
	if len(unmapped) != 0 {
		t.Fatalf("expected watch code implicit-relative import to be filtered, got %#v", unmapped)
	}
}

func TestPythonGeneratedDiagnosticsMapperFiltersMissingImportForWatchCodeModule(t *testing.T) {
	t.Parallel()

	options := pythonGeneratedDiagnosticsProjectOptions{
		GenCodePrefix:       "from watch_code_test import cool_fn\n",
		ParamValue:          "value",
		WatchCodeIdentity:   "watch_code_test.cool_fn:function",
		WatchCodeCallable:   "cool_fn",
		WatchCodeSourcePath: "/tmp/workspace/watch_code_test.py",
	}
	mapper := mustPythonGeneratedDiagnosticsMapper(
		t,
		pythonGeneratedDiagnosticsProject(t, options),
		pythonGeneratedDiagnosticsWatchCodeRegistry(options),
	)

	start := strings.Index(mapper.renderer.Code, "watch_code_test")
	if start < 0 {
		t.Fatalf("expected watch code import in generated code:\n%s", mapper.renderer.Code)
	}
	diagnostic := buildGeneratedDiagnostic(
		t,
		mapper.renderer.Code,
		start,
		start+len("watch_code_test"),
		`Import "watch_code_test" could not be resolved`,
		"reportMissingImports",
	)

	result := mapper.AnalyzeCodeDiagnostics([]PythonGeneratedDiagnostic{diagnostic}, "file:///tmp/setta_gen.py")
	errors, unmapped := result.Diagnostics, result.Unmapped
	if len(errors.Errors) != 0 {
		t.Fatalf("expected no mapped errors for ignored missing import, got %#v", errors.Errors)
	}
	if len(unmapped) != 0 {
		t.Fatalf("expected watch code missing import to be filtered, got %#v", unmapped)
	}
}

func TestPythonGeneratedDiagnosticsMapperFallsBackToWatchCodeRequiredParamErrorsWhenImportFiltered(t *testing.T) {
	t.Parallel()

	options := pythonGeneratedDiagnosticsProjectOptions{
		CallableName:        "cool_fn",
		ParamNames:          []string{"a", "b", "c"},
		ParamValue:          "",
		GenCodePrefix:       "from watch_code_test import cool_fn\n",
		WatchCodeIdentity:   "watch_code_test.cool_fn:function",
		WatchCodeCallable:   "cool_fn",
		WatchCodeSourcePath: "/tmp/workspace/watch_code_test.py",
	}
	mapper := mustPythonGeneratedDiagnosticsMapper(
		t,
		pythonGeneratedDiagnosticsProject(t, options),
		pythonGeneratedDiagnosticsWatchCodeRegistry(options),
	)

	start := strings.Index(mapper.renderer.Code, "watch_code_test")
	if start < 0 {
		t.Fatalf("expected watch code import in generated code:\n%s", mapper.renderer.Code)
	}
	diagnostic := buildGeneratedDiagnostic(
		t,
		mapper.renderer.Code,
		start,
		start+len("watch_code_test"),
		`Import "watch_code_test" could not be resolved`,
		"reportMissingImports",
	)

	result := mapper.AnalyzeCodeDiagnostics([]PythonGeneratedDiagnostic{diagnostic}, "file:///tmp/setta_gen.py")
	errors, unmapped := result.Diagnostics, result.Unmapped
	if len(unmapped) != 0 {
		t.Fatalf("expected watch code missing import to stay filtered, got %#v", unmapped)
	}
	sectionErrors := errors.Errors["section-1"]
	for _, paramID := range []string{"param-1", "param-2", "param-3"} {
		if len(sectionErrors.Params[paramID]) == 0 {
			t.Fatalf("expected fallback required-param diagnostics for %q, got %#v", paramID, errors.Errors)
		}
		if !strings.Contains(sectionErrors.Params[paramID][0], `"a", "b", "c"`) {
			t.Fatalf("expected grouped missing-arg message for %q, got %#v", paramID, sectionErrors.Params[paramID])
		}
	}
}

func TestPythonGeneratedDiagnosticsMapperKeepsImplicitRelativeImportForNonWatchCodeModule(t *testing.T) {
	t.Parallel()

	mapper := mustPythonGeneratedDiagnosticsMapper(t, pythonGeneratedDiagnosticsProject(t, pythonGeneratedDiagnosticsProjectOptions{
		GenCodePrefix: "from external_module import cool_fn\n",
	}))

	start := strings.Index(mapper.renderer.Code, "external_module")
	if start < 0 {
		t.Fatalf("expected external import in generated code:\n%s", mapper.renderer.Code)
	}
	diagnostic := buildGeneratedDiagnostic(
		t,
		mapper.renderer.Code,
		start,
		start+len("external_module"),
		`Import from "external_module" is implicitly relative and will not work if this file is imported as a module`,
		"reportImplicitRelativeImport",
	)

	result := mapper.AnalyzeCodeDiagnostics([]PythonGeneratedDiagnostic{diagnostic}, "file:///tmp/setta_gen.py")
	errors, unmapped := result.Diagnostics, result.Unmapped
	if len(errors.Errors) != 0 {
		t.Fatalf("expected no mapped section errors for implicit-relative import, got %#v", errors.Errors)
	}
	if len(unmapped) != 1 {
		t.Fatalf("expected non-watch-code implicit-relative import to survive, got %#v", unmapped)
	}
}

type pythonGeneratedDiagnosticsProjectOptions struct {
	CallableName        string
	ParamName           string
	ParamNames          []string
	ParamValue          string
	PassingStyle        string
	IgnoreParamError    bool
	IgnoreCallableError bool
	GenCodePrefix       string
	WatchCodeIdentity   string
	WatchCodeCallable   string
	WatchCodeSourcePath string
}

func mustPythonGeneratedDiagnosticsMapper(
	t *testing.T,
	project projectstate.Project,
	watchCodeRegistry ...map[string]projectstate.WatchCodeRegistryEntry,
) *PythonGeneratedDiagnosticsMapper {
	t.Helper()

	var registry map[string]projectstate.WatchCodeRegistryEntry
	if len(watchCodeRegistry) > 0 {
		registry = watchCodeRegistry[0]
	}
	mapper, ok, err := NewPythonGeneratedDiagnosticsMapper(project, PythonGeneratedDiagnosticsMapperOptions{
		PasswordSecrets:   map[string]string{},
		WatchCodeRegistry: registry,
	})
	if err != nil {
		t.Fatalf("new generated diagnostics mapper: %v", err)
	}
	if !ok {
		t.Fatal("expected generated diagnostics mapper to exist")
	}
	return mapper
}

func pythonGeneratedDiagnosticsWatchCodeRegistry(
	options pythonGeneratedDiagnosticsProjectOptions,
) map[string]projectstate.WatchCodeRegistryEntry {
	if options.WatchCodeIdentity == "" {
		return nil
	}
	callableName := options.WatchCodeCallable
	if callableName == "" {
		callableName = options.CallableName
	}
	return map[string]projectstate.WatchCodeRegistryEntry{
		options.WatchCodeIdentity: {
			CallableName: strings.TrimSpace(callableName),
			Kind:         projectstate.WatchCodeCallableKindFunction,
			SourcePath:   options.WatchCodeSourcePath,
			SectionIDs:   []string{"section-1"},
		},
	}
}

func pythonGeneratedDiagnosticsProject(
	t *testing.T,
	options pythonGeneratedDiagnosticsProjectOptions,
) projectstate.Project {
	t.Helper()

	callableName := options.CallableName
	if callableName == "" {
		callableName = "MissingFunc"
	}
	paramName := options.ParamName
	if paramName == "" {
		paramName = "param"
	}
	paramNames := append([]string(nil), options.ParamNames...)
	if len(paramNames) == 0 {
		paramNames = []string{paramName}
	}
	passingStyle := options.PassingStyle
	if passingStyle == "" {
		passingStyle = "DEFAULT"
	}

	ignoreTypeErrors := `{"callable":false,"params":{}}`
	if options.IgnoreParamError {
		ignoreTypeErrors = `{"callable":false,"params":{"param-1":true}}`
	}
	if options.IgnoreCallableError {
		ignoreTypeErrors = `{"callable":true,"params":{}}`
	}

	target := projectstate.ProjectCodegenTarget{Language: string(projectstate.CodeLanguagePython)}
	if options.GenCodePrefix != "" {
		encodedTarget, err := projectstate.EncodePythonCodegenTarget(projectstate.PythonCodegenTarget{
			GenCodePrefix: options.GenCodePrefix,
		})
		if err != nil {
			t.Fatalf("encode python codegen target: %v", err)
		}
		target.Payload = encodedTarget
	}

	codeObjVariantMapEntries := []string{`"callable-1":"callable-variant-1"`}
	codeObjs := map[string]projectstate.CodeObject{
		"callable-1": {
			ID:               "callable-1",
			Name:             callableName,
			VariantIDs:       []string{"callable-variant-1"},
			DefaultVariantID: "callable-variant-1",
		},
	}
	codeObjVariants := map[string]projectstate.CodeObjectVariant{
		"callable-variant-1": {
			ID:     "callable-variant-1",
			ImplID: "callable-impl-1",
		},
	}
	codeObjImpls := map[string]projectstate.CodeObjectImpl{
		"callable-impl-1": {
			ID: "callable-impl-1",
			Payload: mustRawJSON(
				t,
				`{"id":"callable-impl-1","type":"CodeCallable","children":[`+paramChildrenJSON(paramNames)+`]}`,
			),
		},
	}
	for index, name := range paramNames {
		paramID := "param-" + strconv.Itoa(index+1)
		paramVariantID := "param-variant-" + strconv.Itoa(index+1)
		paramImplID := "param-impl-" + strconv.Itoa(index+1)
		codeObjVariantMapEntries = append(codeObjVariantMapEntries, mustJSONString(t, paramID)+":"+mustJSONString(t, paramVariantID))
		codeObjs[paramID] = projectstate.CodeObject{
			ID:               paramID,
			Name:             name,
			VariantIDs:       []string{paramVariantID},
			DefaultVariantID: paramVariantID,
		}
		codeObjVariants[paramVariantID] = projectstate.CodeObjectVariant{
			ID:     paramVariantID,
			ImplID: paramImplID,
		}
		codeObjImpls[paramImplID] = projectstate.CodeObjectImpl{
			ID: paramImplID,
			Payload: mustRawJSON(
				t,
				`{"id":`+mustJSONString(t, paramImplID)+`,"type":"CodeParam","value":`+mustJSONString(t, options.ParamValue)+`,"passingStyle":`+mustJSONString(t, passingStyle)+`}`,
			),
		}
	}

	return projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			target,
		},
		TopLevelSectionIDs: []string{"section-1"},
		SectionVariantMap: map[string]string{
			"section-1": "section-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"section-1": {
				ID:               "section-1",
				Name:             "Section",
				VariantIDs:       []string{"section-variant-1"},
				DefaultVariantID: "section-variant-1",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"section-variant-1": {
				ID:     "section-variant-1",
				ImplID: "section-impl-1",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"section-impl-1": {
				ID: "section-impl-1",
				Payload: mustRawJSON(
					t,
					`{
						"id":"section-impl-1",
						"type":"Callable",
						"callable":"callable-1",
						"ignoreTypeErrors":`+ignoreTypeErrors+`,
						"codeObjVariantMap":{`+strings.Join(codeObjVariantMapEntries, ",")+`}
					}`,
				),
			},
		},
		CodeObjs:        codeObjs,
		CodeObjVariants: codeObjVariants,
		CodeObjImpls:    codeObjImpls,
	}
}

func paramChildrenJSON(paramNames []string) string {
	if len(paramNames) == 0 {
		return ""
	}
	children := make([]string, 0, len(paramNames))
	for index := range paramNames {
		children = append(children, mustJSONStringNoTest("param-"+strconv.Itoa(index+1)))
	}
	return strings.Join(children, ",")
}

func mustJSONStringNoTest(value string) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return string(encoded)
}

func buildGeneratedDiagnostic(
	t *testing.T,
	code string,
	start int,
	end int,
	message string,
	codeValue string,
) PythonGeneratedDiagnostic {
	t.Helper()

	startLine, startCharacter := positionToLineCol(code, start)
	endLine, endCharacter := positionToLineCol(code, end)
	return PythonGeneratedDiagnostic{
		Message:  message,
		Code:     codeValue,
		Severity: 1,
		Source:   "pyright",
		Range: projectstate.LSPDiagnosticRange{
			Start: projectstate.LSPDiagnosticPosition{
				Line:      startLine,
				Character: startCharacter,
			},
			End: projectstate.LSPDiagnosticPosition{
				Line:      endLine,
				Character: endCharacter,
			},
		},
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

func minInt(left int, right int) int {
	if left < right {
		return left
	}
	return right
}

func TestIsPythonIdentifier(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		value string
		want  bool
	}{
		{name: "trimmed valid identifier", value: "  valid_name9  ", want: true},
		{name: "starts with digit", value: "9lives", want: false},
		{name: "rejects punctuation", value: "has-dash", want: false},
		{name: "rejects non ascii letter", value: "naiveé", want: false},
		{name: "underscore only", value: "_", want: true},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			if got := isPythonIdentifier(test.value); got != test.want {
				t.Fatalf("isPythonIdentifier(%q) = %v, want %v", test.value, got, test.want)
			}
		})
	}
}
