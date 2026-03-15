package projectstate

import (
	"errors"
	"testing"
)

// Python policy decoding should normalize to the same defaults the current Python runtime uses.
func TestDecodePythonSectionCodegenPolicyUsesDefaults(t *testing.T) {
	t.Parallel()

	policy, err := DecodePythonSectionCodegenPolicy(nil)
	if err != nil {
		t.Fatalf("decode default section policy: %v", err)
	}
	if policy.AllowlistAllowAll {
		t.Fatal("expected default section allowlist to stay explicit")
	}
	if _, ok := policy.Allowlist["Callable"]; !ok {
		t.Fatal("expected Callable in default section allowlist")
	}
	if _, ok := policy.Allowlist["Image"]; ok {
		t.Fatal("did not expect Image in default section allowlist")
	}
	if policy.MetaControlAllowlistAllowAll {
		t.Fatal("expected default meta-control allowlist to stay explicit")
	}
	if _, ok := policy.MetaControlAllowlist["TextParam"]; !ok {
		t.Fatal("expected TextParam in default meta-control allowlist")
	}
	if _, ok := policy.MetaControlAllowlist["NestedParam"]; ok {
		t.Fatal("did not expect NestedParam in default meta-control allowlist")
	}
	if got := policy.TypePolicies["Image"].Representation; got != PythonSectionRepresentationFileRead {
		t.Fatalf("expected Image default representation file_read, got %q", got)
	}
	if got := policy.TypePolicies["Callable"].Representation; got != PythonSectionRepresentationExpression {
		t.Fatalf("expected Callable default representation expression, got %q", got)
	}
}

// Section policy resolution should respect the meta-control allowlist and reject unsupported type/representation pairs.
func TestResolvePythonSectionCodegenPolicyAppliesMetaControlAllowlistAndValidation(t *testing.T) {
	t.Parallel()

	policy := DefaultPythonSectionCodegenPolicy()
	metaControlResolved, err := ResolvePythonSectionCodegenPolicy(
		policy,
		"meta-control-1",
		"MetaControl",
		"SliderParam",
	)
	if err != nil {
		t.Fatalf("resolve meta control policy: %v", err)
	}
	if !metaControlResolved.IncludeInCodegen {
		t.Fatal("expected SliderParam meta control to stay included by default")
	}

	metaControlBlocked, err := ResolvePythonSectionCodegenPolicy(
		policy,
		"meta-control-2",
		"MetaControl",
		"NestedParam",
	)
	if err != nil {
		t.Fatalf("resolve blocked meta control policy: %v", err)
	}
	if metaControlBlocked.IncludeInCodegen {
		t.Fatal("expected NestedParam meta control to be excluded by the allowlist")
	}

	policy.TypePolicies["Image"] = PythonSectionTypeCodegenPolicy{
		Mode:           PythonSectionCodegenModeInclude,
		Representation: PythonSectionRepresentationExpression,
	}
	_, err = ResolvePythonSectionCodegenPolicy(policy, "image-1", "Image", "")
	if !errors.Is(err, ErrPythonSectionCodegenRepresentationUnsupported) {
		t.Fatalf("expected unsupported image representation error, got %v", err)
	}
}

// Code object value resolution should apply overrides on top of the default representation policy.
func TestResolvePythonCodeObjValuePolicyUsesOverride(t *testing.T) {
	t.Parallel()

	policy := DefaultPythonCodeObjValuePolicy()
	policy.CodeObjOverrides["param-1"] = PythonCodeObjValueOverride{
		Representation: PythonCodeObjValueRepresentationJSONParsed,
	}

	resolved, err := ResolvePythonCodeObjValuePolicy(policy, "param-1", "SliderParam")
	if err != nil {
		t.Fatalf("resolve code object value policy: %v", err)
	}
	if resolved.Representation != PythonCodeObjValueRepresentationJSONParsed {
		t.Fatalf("expected json_parsed override, got %q", resolved.Representation)
	}

	_, err = ResolvePythonCodeObjValuePolicy(policy, "param-2", "CodeParam")
	if err != nil {
		t.Fatalf("resolve default code param policy: %v", err)
	}

	policy.TypePolicies["CodeParam"] = PythonCodeObjTypeValuePolicy{
		Representation: PythonCodeObjValueRepresentationJSONParsed,
	}
	_, err = ResolvePythonCodeObjValuePolicy(policy, "param-3", "CodeParam")
	if !errors.Is(err, ErrPythonCodeObjValueRepresentationUnsupported) {
		t.Fatalf("expected unsupported code param representation error, got %v", err)
	}
}

// Code object value policy resolution should preserve the documented defaults for common types and reject unsupported combinations.
func TestResolvePythonCodeObjValuePolicyUsesDefaultsAndValidation(t *testing.T) {
	t.Parallel()

	policy := DefaultPythonCodeObjValuePolicy()

	textResolved, err := ResolvePythonCodeObjValuePolicy(policy, "param-text", "TextParam")
	if err != nil {
		t.Fatalf("resolve default text param policy: %v", err)
	}
	if textResolved.Representation != PythonCodeObjValueRepresentationString {
		t.Fatalf("expected default text param representation string, got %q", textResolved.Representation)
	}

	dropzoneResolved, err := ResolvePythonCodeObjValuePolicy(policy, "param-dropzone", "DropzoneParam")
	if err != nil {
		t.Fatalf("resolve default dropzone policy: %v", err)
	}
	if dropzoneResolved.Representation != PythonCodeObjValueRepresentationFilePath {
		t.Fatalf("expected default dropzone representation file_path, got %q", dropzoneResolved.Representation)
	}

	policy.TypePolicies["DropzoneParam"] = PythonCodeObjTypeValuePolicy{
		Representation: PythonCodeObjValueRepresentationFileRead,
	}
	fileReadResolved, err := ResolvePythonCodeObjValuePolicy(policy, "param-dropzone", "DropzoneParam")
	if err != nil {
		t.Fatalf("resolve dropzone file_read policy: %v", err)
	}
	if fileReadResolved.Representation != PythonCodeObjValueRepresentationFileRead {
		t.Fatalf("expected dropzone file_read representation, got %q", fileReadResolved.Representation)
	}

	policy.TypePolicies["TextParam"] = PythonCodeObjTypeValuePolicy{
		Representation: PythonCodeObjValueRepresentationExpression,
	}
	_, err = ResolvePythonCodeObjValuePolicy(policy, "param-text-invalid", "TextParam")
	if !errors.Is(err, ErrPythonCodeObjValueRepresentationUnsupported) {
		t.Fatalf("expected unsupported text param representation error, got %v", err)
	}
}

// The documented code-object representation matrix should stay in lockstep with the Go policy validator for every supported type.
func TestResolvePythonCodeObjValuePolicyMatchesDocumentedTypeMatrix(t *testing.T) {
	t.Parallel()

	allRepresentations := []PythonCodeObjValueRepresentationMode{
		PythonCodeObjValueRepresentationExpression,
		PythonCodeObjValueRepresentationJSONParsed,
		PythonCodeObjValueRepresentationString,
		PythonCodeObjValueRepresentationFilePath,
		PythonCodeObjValueRepresentationFileRead,
	}
	supportedRepresentations := func(
		values ...PythonCodeObjValueRepresentationMode,
	) map[PythonCodeObjValueRepresentationMode]bool {
		result := make(map[PythonCodeObjValueRepresentationMode]bool, len(values))
		for _, value := range values {
			result[value] = true
		}
		return result
	}

	testCases := []struct {
		codeObjType           string
		defaultRepresentation PythonCodeObjValueRepresentationMode
		supported             map[PythonCodeObjValueRepresentationMode]bool
	}{
		{
			codeObjType:           "ButtonParam",
			defaultRepresentation: PythonCodeObjValueRepresentationExpression,
			supported:             supportedRepresentations(PythonCodeObjValueRepresentationExpression),
		},
		{
			codeObjType:           "CodeCallable",
			defaultRepresentation: PythonCodeObjValueRepresentationExpression,
			supported:             supportedRepresentations(PythonCodeObjValueRepresentationExpression),
		},
		{
			codeObjType:           "CodeParam",
			defaultRepresentation: PythonCodeObjValueRepresentationExpression,
			supported: supportedRepresentations(
				PythonCodeObjValueRepresentationExpression,
				PythonCodeObjValueRepresentationString,
			),
		},
		{
			codeObjType:           "ColorPickerParam",
			defaultRepresentation: PythonCodeObjValueRepresentationString,
			supported:             supportedRepresentations(PythonCodeObjValueRepresentationString),
		},
		{
			codeObjType:           "DateParam",
			defaultRepresentation: PythonCodeObjValueRepresentationString,
			supported:             supportedRepresentations(PythonCodeObjValueRepresentationString),
		},
		{
			codeObjType:           "DropdownParam",
			defaultRepresentation: PythonCodeObjValueRepresentationExpression,
			supported: supportedRepresentations(
				PythonCodeObjValueRepresentationExpression,
				PythonCodeObjValueRepresentationString,
			),
		},
		{
			codeObjType:           "DropzoneParam",
			defaultRepresentation: PythonCodeObjValueRepresentationFilePath,
			supported: supportedRepresentations(
				PythonCodeObjValueRepresentationFilePath,
				PythonCodeObjValueRepresentationFileRead,
			),
		},
		{
			codeObjType:           "NestedParam",
			defaultRepresentation: PythonCodeObjValueRepresentationExpression,
			supported:             supportedRepresentations(PythonCodeObjValueRepresentationExpression),
		},
		{
			codeObjType:           "PasswordParam",
			defaultRepresentation: PythonCodeObjValueRepresentationString,
			supported:             supportedRepresentations(PythonCodeObjValueRepresentationString),
		},
		{
			codeObjType:           "RotaryParam",
			defaultRepresentation: PythonCodeObjValueRepresentationExpression,
			supported: supportedRepresentations(
				PythonCodeObjValueRepresentationExpression,
				PythonCodeObjValueRepresentationString,
			),
		},
		{
			codeObjType:           "SliderParam",
			defaultRepresentation: PythonCodeObjValueRepresentationExpression,
			supported: supportedRepresentations(
				PythonCodeObjValueRepresentationExpression,
				PythonCodeObjValueRepresentationJSONParsed,
				PythonCodeObjValueRepresentationString,
			),
		},
		{
			codeObjType:           "SwitchParam",
			defaultRepresentation: PythonCodeObjValueRepresentationExpression,
			supported: supportedRepresentations(
				PythonCodeObjValueRepresentationExpression,
				PythonCodeObjValueRepresentationString,
			),
		},
		{
			codeObjType:           "TextAreaParam",
			defaultRepresentation: PythonCodeObjValueRepresentationString,
			supported:             supportedRepresentations(PythonCodeObjValueRepresentationString),
		},
		{
			codeObjType:           "TextParam",
			defaultRepresentation: PythonCodeObjValueRepresentationString,
			supported:             supportedRepresentations(PythonCodeObjValueRepresentationString),
		},
		{
			codeObjType:           "TimeParam",
			defaultRepresentation: PythonCodeObjValueRepresentationString,
			supported:             supportedRepresentations(PythonCodeObjValueRepresentationString),
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.codeObjType, func(t *testing.T) {
			t.Parallel()

			defaultPolicy := DefaultPythonCodeObjValuePolicy()
			defaultResolved, err := ResolvePythonCodeObjValuePolicy(
				defaultPolicy,
				"default-"+testCase.codeObjType,
				testCase.codeObjType,
			)
			if err != nil {
				t.Fatalf("resolve default representation: %v", err)
			}
			if defaultResolved.Representation != testCase.defaultRepresentation {
				t.Fatalf(
					"expected default representation %q, got %q",
					testCase.defaultRepresentation,
					defaultResolved.Representation,
				)
			}

			for _, representation := range allRepresentations {
				policy := DefaultPythonCodeObjValuePolicy()
				policy.TypePolicies[testCase.codeObjType] = PythonCodeObjTypeValuePolicy{
					Representation: representation,
				}
				resolved, err := ResolvePythonCodeObjValuePolicy(
					policy,
					"override-"+testCase.codeObjType+"-"+string(representation),
					testCase.codeObjType,
				)
				if testCase.supported[representation] {
					if err != nil {
						t.Fatalf("expected %q to support %q, got %v", testCase.codeObjType, representation, err)
					}
					if resolved.Representation != representation {
						t.Fatalf(
							"expected resolved representation %q, got %q",
							representation,
							resolved.Representation,
						)
					}
					continue
				}
				if !errors.Is(err, ErrPythonCodeObjValueRepresentationUnsupported) {
					t.Fatalf("expected %q + %q to be rejected, got %v", testCase.codeObjType, representation, err)
				}
			}
		})
	}
}

// The export surface should merge effective section/code-object state and expose resolved policies without re-parsing raw JSON in callers.
func TestProjectPythonCodegenExportResolvesEffectiveSectionAndCodeObject(t *testing.T) {
	t.Parallel()

	project := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []ProjectCodegenTarget{
			{
				Language: string(CodeLanguagePython),
				Payload: mustRawJSON(
					t,
					`{
						"language":"python",
						"codeObjValuePolicy":{
							"codeObjOverrides":{
								"param-1":{"representation":"json_parsed"}
							}
						}
					}`,
				),
			},
		},
		TopLevelSectionIDs: []string{"section-1"},
		SectionVariantMap: map[string]string{
			"section-1": "section-variant-1",
		},
		Sections: map[string]Section{
			"section-1": {
				ID:               "section-1",
				Name:             "Callable Section",
				DisplayName:      "Callable Display",
				VariantIDs:       []string{"section-variant-1"},
				DefaultVariantID: "section-variant-1",
				SharedModifier: mustRawJSON(
					t,
					`{"settings":{"shared":"yes","variantOnly":"shared"}}`,
				),
			},
		},
		SectionVariants: map[string]SectionVariant{
			"section-variant-1": {
				ID:     "section-variant-1",
				Name:   "Section Variant",
				ImplID: "section-impl-1",
				Modifier: mustRawJSON(
					t,
					`{"settings":{"variantOnly":"variant"},"title":"variant-title"}`,
				),
			},
		},
		SectionImpls: map[string]SectionImpl{
			"section-impl-1": {
				ID: "section-impl-1",
				Payload: mustRawJSON(
					t,
					`{
						"id":"section-impl-1",
						"type":"Callable",
						"callable":"callable-1",
						"codeObjVariantMap":{
							"callable-1":"callable-variant-1",
							"param-1":"param-variant-1"
						},
						"settings":{"base":"yes","variantOnly":"base"}
					}`,
				),
			},
		},
		CodeObjs: map[string]CodeObject{
			"callable-1": {
				ID:               "callable-1",
				Name:             "callable_root",
				VariantIDs:       []string{"callable-variant-1"},
				DefaultVariantID: "callable-variant-1",
			},
			"param-1": {
				ID:               "param-1",
				Name:             "slider_param",
				DisplayName:      "Slider Param",
				VariantIDs:       []string{"param-variant-1"},
				DefaultVariantID: "param-variant-1",
				SharedModifier:   mustRawJSON(t, `{"label":"shared"}`),
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"callable-variant-1": {
				ID:     "callable-variant-1",
				Name:   "Callable Variant",
				ImplID: "callable-impl-1",
			},
			"param-variant-1": {
				ID:     "param-variant-1",
				Name:   "Param Variant",
				ImplID: "param-impl-1",
				Modifier: mustRawJSON(
					t,
					`{"label":"variant","extra":"set"}`,
				),
			},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"callable-impl-1": {
				ID: "callable-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"callable-impl-1","type":"CodeCallable","children":["param-1"]}`,
				),
			},
			"param-impl-1": {
				ID: "param-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"param-impl-1","type":"SliderParam","value":"42"}`,
				),
			},
		},
	}

	exported, ok, err := project.PythonCodegenExport()
	if err != nil {
		t.Fatalf("build python codegen export: %v", err)
	}
	if !ok {
		t.Fatal("expected python codegen export to be available")
	}
	if exported.ProjectID != "project-alpha" {
		t.Fatalf("unexpected export project id %q", exported.ProjectID)
	}

	section, err := exported.ResolveSection("section-1")
	if err != nil {
		t.Fatalf("resolve exported section: %v", err)
	}
	if section.Type != "Callable" {
		t.Fatalf("unexpected section type %q", section.Type)
	}
	if !section.IsTopLevel {
		t.Fatal("expected section to be top-level")
	}
	if !section.Policy.IncludeInCodegen {
		t.Fatal("expected callable section to stay included in codegen")
	}
	settings := section.ObjectField("settings")
	if settings["base"] != "yes" {
		t.Fatalf("expected merged base setting, got %#v", settings["base"])
	}
	if settings["shared"] != "yes" {
		t.Fatalf("expected merged shared setting, got %#v", settings["shared"])
	}
	if settings["variantOnly"] != "variant" {
		t.Fatalf("expected variant modifier to win, got %#v", settings["variantOnly"])
	}
	if got := section.CallableID(); got != "callable-1" {
		t.Fatalf("expected callable-1, got %q", got)
	}

	param, err := section.ResolveCodeObject("param-1")
	if err != nil {
		t.Fatalf("resolve exported code object: %v", err)
	}
	if param.Type != "SliderParam" {
		t.Fatalf("unexpected code object type %q", param.Type)
	}
	if param.ValuePolicy.Representation != PythonCodeObjValueRepresentationJSONParsed {
		t.Fatalf("expected json_parsed value policy, got %q", param.ValuePolicy.Representation)
	}
	if got := param.StringField("value"); got != "42" {
		t.Fatalf("expected value 42, got %q", got)
	}
	if got := param.StringField("label"); got != "variant" {
		t.Fatalf("expected variant modifier label, got %q", got)
	}
	if got := param.StringField("extra"); got != "set" {
		t.Fatalf("expected extra modifier field, got %q", got)
	}
}

// MetaControl section policy resolution should derive the control code object type from effective state instead of relying on a payload field.
func TestProjectPythonCodegenExportResolvesMetaControlPolicyFromControlParam(t *testing.T) {
	t.Parallel()

	project := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []ProjectCodegenTarget{
			{
				Language: string(CodeLanguagePython),
				Payload: mustRawJSON(
					t,
					`{
						"language":"python",
						"sectionPolicy":{
							"metaControlAllowlist":["TextParam"]
						}
					}`,
				),
			},
		},
		TopLevelSectionIDs: []string{"meta-1"},
		SectionVariantMap: map[string]string{
			"meta-1": "meta-variant-1",
		},
		Sections: map[string]Section{
			"meta-1": {
				ID:               "meta-1",
				Name:             "Meta Control",
				VariantIDs:       []string{"meta-variant-1"},
				DefaultVariantID: "meta-variant-1",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"meta-variant-1": {
				ID:     "meta-variant-1",
				ImplID: "meta-impl-1",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"meta-impl-1": {
				ID: "meta-impl-1",
				Payload: mustRawJSON(
					t,
					`{
						"id":"meta-impl-1",
						"type":"MetaControl",
						"metaControlParamId":"control-param-1",
						"codeObjVariantMap":{"control-param-1":"control-param-variant-1"}
					}`,
				),
			},
		},
		CodeObjs: map[string]CodeObject{
			"control-param-1": {
				ID:               "control-param-1",
				Name:             "control_param",
				VariantIDs:       []string{"control-param-variant-1"},
				DefaultVariantID: "control-param-variant-1",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"control-param-variant-1": {
				ID:     "control-param-variant-1",
				ImplID: "control-param-impl-1",
			},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"control-param-impl-1": {
				ID: "control-param-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"control-param-impl-1","type":"TextParam","value":"notes"}`,
				),
			},
		},
	}

	exported, ok, err := project.PythonCodegenExport()
	if err != nil {
		t.Fatalf("build python codegen export: %v", err)
	}
	if !ok {
		t.Fatal("expected python export")
	}

	section, err := exported.ResolveSection("meta-1")
	if err != nil {
		t.Fatalf("resolve meta control section: %v", err)
	}
	if !section.Policy.IncludeInCodegen {
		t.Fatal("expected meta control section to remain included after deriving control param type")
	}
}
