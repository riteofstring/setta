package main

import (
	"strings"
	"testing"
)

func TestMembersFromRootDiscoversMethodsAndParams(t *testing.T) {
	root := jsonSchema{OneOf: []jsonSchema{
		{
			Properties: map[string]jsonSchema{
				"method": {Enum: []string{"thread/goal/set"}, Type: "string"},
				"params": {Ref: "#/definitions/ThreadGoalSetParams"},
			},
		},
		{
			Properties: map[string]jsonSchema{
				"method": {Enum: []string{"model/list"}, Type: "string"},
				"params": {Ref: "#/definitions/ModelListParams"},
			},
		},
	}}

	members, err := membersFromRoot(root, "test")
	if err != nil {
		t.Fatalf("members from root: %v", err)
	}
	if len(members) != 2 {
		t.Fatalf("members = %+v, want two", members)
	}
	if members[0].Method != "model/list" || members[0].ConstName != "ModelList" || members[0].ParamsName != "ModelListParams" {
		t.Fatalf("first member = %+v, want sorted model/list", members[0])
	}
	if members[1].Method != "thread/goal/set" || members[1].ConstName != "ThreadGoalSet" || members[1].ParamsName != "ThreadGoalSetParams" {
		t.Fatalf("second member = %+v, want thread/goal/set", members[1])
	}
}

func TestRustStructSchemaDiscoversThreadSettingsUpdateParams(t *testing.T) {
	source := `
pub struct ThreadSettingsUpdateParams {
    pub thread_id: String,
    #[ts(optional = nullable)]
    pub model: Option<String>,
    #[ts(optional = nullable)]
    pub effort: Option<ReasoningEffort>,
    #[ts(optional = nullable)]
    pub nested_effort: Option<Option<ReasoningEffort>>,
}
`

	generator := testGeneratorWithRootSchemas("ReasoningEffort")
	schema, ok, err := generator.rustStructSchema(source, "ThreadSettingsUpdateParams")
	if err != nil {
		t.Fatalf("rust struct schema: %v", err)
	}
	if !ok {
		t.Fatal("ThreadSettingsUpdateParams was not discovered")
	}
	if !contains(schema.Required, "threadId") {
		t.Fatalf("required = %+v, want threadId", schema.Required)
	}
	if schema.Properties["model"].Type == nil {
		t.Fatalf("model schema = %+v, want nullable string", schema.Properties["model"])
	}
	if schema.Properties["effort"].AnyOf[0].Ref != "#/definitions/ReasoningEffort" {
		t.Fatalf("effort schema = %+v, want ReasoningEffort ref", schema.Properties["effort"])
	}
	if schema.Properties["nestedEffort"].AnyOf[0].Ref != "#/definitions/ReasoningEffort" {
		t.Fatalf("nestedEffort schema = %+v, want ReasoningEffort ref", schema.Properties["nestedEffort"])
	}
}

func TestAddSchemaRejectsConflictingDuplicateName(t *testing.T) {
	generator := &generator{
		schemas:   map[string]jsonSchema{},
		schemaRaw: map[string]string{},
		queue:     []string{},
	}
	if err := generator.addSchema("Example", jsonSchema{Type: "string"}); err != nil {
		t.Fatalf("add first schema: %v", err)
	}

	err := generator.addSchema("Example", jsonSchema{Type: "integer"})
	if err == nil {
		t.Fatal("add conflicting schema succeeded, want error")
	}
	if !strings.Contains(err.Error(), "schema Example has conflicting definitions") {
		t.Fatalf("error = %q, want conflicting definitions", err)
	}
}

func TestAddRootSchemaRejectsConflictingDuplicateName(t *testing.T) {
	generator := &generator{
		rootSchemas:   map[string]jsonSchema{},
		rootSchemaRaw: map[string]string{},
	}
	if err := generator.addRootSchema("Example", jsonSchema{Type: "string"}); err != nil {
		t.Fatalf("add first root schema: %v", err)
	}

	err := generator.addRootSchema("Example", jsonSchema{Type: "integer"})
	if err == nil {
		t.Fatal("add conflicting root schema succeeded, want error")
	}
	if !strings.Contains(err.Error(), "schema Example has conflicting root definitions") {
		t.Fatalf("error = %q, want conflicting root definitions", err)
	}
}

func TestRustStructSchemaRejectsUnsupportedFieldType(t *testing.T) {
	source := `
pub struct ThreadSettingsUpdateParams {
    pub thread_id: String,
    pub unsupported: Option<UnexpectedType>,
}
`

	generator := testGeneratorWithRootSchemas("ReasoningEffort")
	_, ok, err := generator.rustStructSchema(source, "ThreadSettingsUpdateParams")
	if err == nil {
		t.Fatal("rust struct schema succeeded, want unsupported field error")
	}
	if !ok {
		t.Fatal("ThreadSettingsUpdateParams was not reported as discovered")
	}
	if !strings.Contains(err.Error(), "ThreadSettingsUpdateParams.unsupported has unsupported Rust field type Option<UnexpectedType>") {
		t.Fatalf("error = %q, want unsupported field type", err)
	}
}

func testGeneratorWithRootSchemas(names ...string) *generator {
	rootSchemas := map[string]jsonSchema{}
	for _, name := range names {
		rootSchemas[name] = jsonSchema{Type: "string"}
	}
	return &generator{rootSchemas: rootSchemas}
}

func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}
