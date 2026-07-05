package orchestrator

import (
	"encoding/json"
	"testing"

	"setta/internal/chat"
)

func TestBuildWorkflowSchemaIncludesMetadataAndValueSets(t *testing.T) {
	schema, err := BuildWorkflowSchema(DefaultRunnerRegistry())
	if err != nil {
		t.Fatalf("build workflow schema: %v", err)
	}
	if schema.SchemaVersion != SchemaVersion {
		t.Fatalf("schema version = %d, want %d", schema.SchemaVersion, SchemaVersion)
	}
	if schema.GraphType != "WorkflowGraph" {
		t.Fatalf("graph type = %q, want WorkflowGraph", schema.GraphType)
	}
	if !workflowSchemaValueSetContains(schema.ValueSets, "WorkflowNodeKind", string(NodeKindAction)) {
		t.Fatalf("value sets = %+v, want WorkflowNodeKind containing %q", schema.ValueSets, NodeKindAction)
	}
	if !workflowSchemaValueSetContains(schema.ValueSets, "ReasoningEffort", string(chat.ReasoningEffortHigh)) {
		t.Fatalf("value sets = %+v, want ReasoningEffort containing %q", schema.ValueSets, chat.ReasoningEffortHigh)
	}
	if len(schema.PermissionPresets) != len(chat.BuiltinChatPermissionPresets()) {
		t.Fatalf("permission presets = %+v, want built-in presets", schema.PermissionPresets)
	}
}

func TestBuildWorkflowSchemaIncludesGraphShape(t *testing.T) {
	schema, err := BuildWorkflowSchema(DefaultRunnerRegistry())
	if err != nil {
		t.Fatalf("build workflow schema: %v", err)
	}
	root := decodeWorkflowSchemaRoot(t, schema.GraphSchema)
	if root.Schema != workflowGraphJSONSchemaDraft {
		t.Fatalf("json schema draft = %q, want %q", root.Schema, workflowGraphJSONSchemaDraft)
	}
	if root.Ref != "#/definitions/WorkflowGraph" {
		t.Fatalf("root ref = %q, want WorkflowGraph definition", root.Ref)
	}
	graph := root.Definitions["WorkflowGraph"]
	if graph.Type != "object" {
		t.Fatalf("WorkflowGraph schema = %+v, want object definition", graph)
	}
	if _, ok := graph.Properties["nodes"]; !ok {
		t.Fatalf("WorkflowGraph properties = %+v, want nodes property", graph.Properties)
	}
	node := root.Definitions["WorkflowNode"]
	kind := decodeWorkflowSchemaProperty(t, node.Properties["kind"])
	if !stringSliceContains(kind.Enum, string(NodeKindStart)) || !stringSliceContains(kind.Enum, string(NodeKindAction)) {
		t.Fatalf("WorkflowNode.kind enum = %+v, want start and action", kind.Enum)
	}
	action := root.Definitions["WorkflowActionConfig"]
	actionKind := decodeWorkflowSchemaProperty(t, action.Properties["kind"])
	if !stringSliceContains(actionKind.Enum, string(ActionKindAgentCodex)) {
		t.Fatalf("WorkflowActionConfig.kind enum = %+v, want %s", actionKind.Enum, ActionKindAgentCodex)
	}
}

func TestBuildWorkflowSchemaIncludesActionSchemas(t *testing.T) {
	schema, err := BuildWorkflowSchema(DefaultRunnerRegistry())
	if err != nil {
		t.Fatalf("build workflow schema: %v", err)
	}
	if len(schema.Actions) != 1 {
		t.Fatalf("actions = %+v, want one action schema", schema.Actions)
	}
	codex := schema.Actions[0]
	if codex.Kind != ActionKindAgentCodex || codex.ConfigType != "WorkflowCodexActionConfig" {
		t.Fatalf("action schema = %+v, want agent.codex codex config", codex)
	}
	if codex.Capabilities.RunnerKind != ActionKindAgentCodex ||
		codex.Capabilities.Requirements.Network != RunnerRequirementNetworkRequired ||
		codex.Capabilities.Recovery != RunnerRecoveryCapabilityReconcileRefs {
		t.Fatalf("codex capabilities = %+v", codex.Capabilities)
	}
}

type workflowSchemaRootForTest struct {
	Schema      string                                     `json:"$schema"`
	Ref         string                                     `json:"$ref"`
	Definitions map[string]workflowSchemaDefinitionForTest `json:"definitions"`
}

type workflowSchemaDefinitionForTest struct {
	Type       string                     `json:"type"`
	Properties map[string]json.RawMessage `json:"properties"`
	Required   []string                   `json:"required"`
}

type workflowSchemaPropertyForTest struct {
	Type string   `json:"type"`
	Enum []string `json:"enum"`
}

func decodeWorkflowSchemaRoot(t *testing.T, payload json.RawMessage) workflowSchemaRootForTest {
	t.Helper()
	var root workflowSchemaRootForTest
	if err := json.Unmarshal(payload, &root); err != nil {
		t.Fatalf("decode workflow graph schema: %v", err)
	}
	return root
}

func decodeWorkflowSchemaProperty(t *testing.T, payload json.RawMessage) workflowSchemaPropertyForTest {
	t.Helper()
	var property workflowSchemaPropertyForTest
	if err := json.Unmarshal(payload, &property); err != nil {
		t.Fatalf("decode workflow schema property: %v", err)
	}
	return property
}

func workflowSchemaValueSetContains(sets []WorkflowSchemaValueSet, name string, value string) bool {
	for _, set := range sets {
		if set.Name != name {
			continue
		}
		return stringSliceContains(set.Values, value)
	}
	return false
}

func stringSliceContains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}
