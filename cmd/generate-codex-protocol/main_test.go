package main

import (
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
}
`

	schema, ok := rustStructSchema(source, "ThreadSettingsUpdateParams")
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
}

func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}
