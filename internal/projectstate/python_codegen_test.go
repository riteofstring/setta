package projectstate

import (
	"errors"
	"testing"
)

func TestDecodePythonCodegenTargetUsesDefaults(t *testing.T) {
	t.Parallel()

	config, err := DecodePythonCodegenTarget(ProjectCodegenTarget{
		Language: string(CodeLanguagePython),
	})
	if err != nil {
		t.Fatalf("decode python target: %v", err)
	}
	if config.GenCodePrefix != "" {
		t.Fatalf("expected empty default prefix, got %q", config.GenCodePrefix)
	}
	if config.GenCodeSuffix != DefaultPythonCodegenSuffix {
		t.Fatalf("expected default suffix %q, got %q", DefaultPythonCodegenSuffix, config.GenCodeSuffix)
	}
	if config.GenerateMetadata {
		t.Fatal("expected metadata generation to default to false")
	}
}

func TestDecodePythonCodegenTargetDecodesExplicitFields(t *testing.T) {
	t.Parallel()

	config, err := DecodePythonCodegenTarget(ProjectCodegenTarget{
		Language: string(CodeLanguagePython),
		Payload: RawJSON(`{
			"language":"python",
			"genCodePrefix":"import math\n",
			"genCodeSuffix":"state = CustomState()",
			"generateMetadata":true,
			"sectionPolicy":{"allowlist":["Callable"]},
			"codeObjValuePolicy":{"typePolicies":{}}
		}`),
	})
	if err != nil {
		t.Fatalf("decode python target with explicit fields: %v", err)
	}
	if config.GenCodePrefix != "import math\n" {
		t.Fatalf("unexpected prefix %q", config.GenCodePrefix)
	}
	if config.GenCodeSuffix != "state = CustomState()" {
		t.Fatalf("unexpected suffix %q", config.GenCodeSuffix)
	}
	if !config.GenerateMetadata {
		t.Fatal("expected metadata generation to be true")
	}
	if string(config.SectionPolicy) != `{"allowlist":["Callable"]}` {
		t.Fatalf("unexpected section policy payload %s", string(config.SectionPolicy))
	}
	if string(config.CodeObjValuePolicy) != `{"typePolicies":{}}` {
		t.Fatalf("unexpected code object value policy payload %s", string(config.CodeObjValuePolicy))
	}
}

func TestDecodePythonCodegenTargetRejectsUnknownField(t *testing.T) {
	t.Parallel()

	_, err := DecodePythonCodegenTarget(ProjectCodegenTarget{
		Language: string(CodeLanguagePython),
		Payload:  RawJSON(`{"language":"python","unexpected":true}`),
	})
	if !errors.Is(err, ErrProjectCodegenPythonTargetFieldUnknown) {
		t.Fatalf("expected unknown-field error, got %v", err)
	}
}

func TestDecodePythonCodegenTargetRejectsInvalidNestedSectionPolicy(t *testing.T) {
	t.Parallel()

	_, err := DecodePythonCodegenTarget(ProjectCodegenTarget{
		Language: string(CodeLanguagePython),
		Payload: RawJSON(`{
			"language":"python",
			"sectionPolicy":{"unknownField":true}
		}`),
	})
	if !errors.Is(err, ErrPythonSectionCodegenPolicyFieldUnknown) {
		t.Fatalf("expected nested section policy error, got %v", err)
	}
}

func TestProjectReconcilePythonGeneratedBindingsUsesCanonicalPaths(t *testing.T) {
	t.Parallel()

	project := Project{
		ID:   "project-alpha",
		Name: `Alpha Project [Main]`,
		CodegenTargets: []ProjectCodegenTarget{
			{
				Language: string(CodeLanguagePython),
				Payload:  RawJSON(`{"language":"python","generateMetadata":true}`),
			},
		},
	}

	if err := project.ReconcilePythonGeneratedBindings(); err != nil {
		t.Fatalf("reconcile python generated bindings: %v", err)
	}
	if project.GeneratedCodeBinding == nil {
		t.Fatal("expected generated code binding")
	}
	if project.GeneratedCodeBinding.Path != "code/sections/alpha_project_main/setta_gen.py" {
		t.Fatalf("unexpected generated code binding path %q", project.GeneratedCodeBinding.Path)
	}
	if project.GeneratedCodeBinding.AccessMode != CodeFileAccessModeWriteOnly {
		t.Fatalf("expected write_only generated code binding, got %q", project.GeneratedCodeBinding.AccessMode)
	}
	if project.GeneratedMetadataBinding == nil {
		t.Fatal("expected generated metadata binding")
	}
	if project.GeneratedMetadataBinding.Path != "code/sections/alpha_project_main/setta_gen_meta.py" {
		t.Fatalf("unexpected generated metadata binding path %q", project.GeneratedMetadataBinding.Path)
	}
	if project.GeneratedMetadataBinding.AccessMode != CodeFileAccessModeWriteOnly {
		t.Fatalf("expected write_only generated metadata binding, got %q", project.GeneratedMetadataBinding.AccessMode)
	}
}

func TestProjectReconcilePythonGeneratedBindingsClearsWhenPythonMissing(t *testing.T) {
	t.Parallel()

	project := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		GeneratedCodeBinding: &CodeFileBinding{
			Path:       "code/sections/alpha/setta_gen.py",
			AccessMode: CodeFileAccessModeWriteOnly,
		},
		GeneratedMetadataBinding: &CodeFileBinding{
			Path:       "code/sections/alpha/setta_gen_meta.py",
			AccessMode: CodeFileAccessModeWriteOnly,
		},
	}

	if err := project.ReconcilePythonGeneratedBindings(); err != nil {
		t.Fatalf("reconcile project without python target: %v", err)
	}
	if project.GeneratedCodeBinding != nil {
		t.Fatalf("expected generated code binding to clear, got %#v", project.GeneratedCodeBinding)
	}
	if project.GeneratedMetadataBinding != nil {
		t.Fatalf("expected generated metadata binding to clear, got %#v", project.GeneratedMetadataBinding)
	}
}
