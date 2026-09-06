package contracts

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestProjectValidatesCounterAndStreamingBinding(t *testing.T) {
	project := fixtureProject()
	if err := project.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestProjectRejectsUnknownSectionData(t *testing.T) {
	project := fixtureProject()
	section := project.Sections["counter"]
	section.Data = json.RawMessage(`{"inputKind":"number","value":0,"label":"Count","listener":"legacy"}`)
	project.Sections["counter"] = section
	if err := project.Validate(); err == nil || !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("Validate() error = %v, want unknown field", err)
	}
}

func TestProjectRejectsDisconnectedOrCyclicForest(t *testing.T) {
	project := fixtureProject()
	section := project.Sections["counter"]
	section.Children = []string{"result"}
	project.Sections["counter"] = section
	result := project.Sections["result"]
	result.Children = []string{"counter"}
	project.Sections["result"] = result
	delete(project.Layout.TopLevelSections, "counter")
	delete(project.Layout.TopLevelSections, "result")
	if err := project.Validate(); err == nil || !strings.Contains(err.Error(), "cycle") {
		t.Fatalf("Validate() error = %v, want cycle", err)
	}
}

func TestProjectRejectsPythonSpecificContractValue(t *testing.T) {
	project := fixtureProject()
	project.Bindings[0].Arguments["value"] = json.RawMessage(`"$pickle.payload"`)
	if err := project.Validate(); err == nil || !strings.Contains(err.Error(), "reference") {
		t.Fatalf("Validate() error = %v, want invalid reference", err)
	}
}

func TestApplyIsRevisionCheckedAndAtomic(t *testing.T) {
	project := fixtureProject()
	request := ApplyRequest{
		ProjectID:        project.ID,
		ExpectedRevision: project.Revision,
		Operations: []json.RawMessage{
			json.RawMessage(`{"op":"setName","name":"Counter Stream"}`),
			json.RawMessage(`{"op":"setRuntime","runtime":{"kind":"python","entrypoint":"../escape.py"}}`),
		},
	}
	if _, err := Apply(project, request); err == nil {
		t.Fatal("Apply() error = nil, want invalid entrypoint")
	}
	if project.Name != "Counter" || project.Revision != 4 {
		t.Fatalf("input project changed to %#v", project)
	}
}

func TestApplyPersistsViewport(t *testing.T) {
	project := fixtureProject()
	updated, err := Apply(project, ApplyRequest{
		ProjectID: project.ID, ExpectedRevision: project.Revision,
		Operations: []json.RawMessage{json.RawMessage(`{"op":"setViewport","viewport":{"x":120,"y":80,"zoom":1.5}}`)},
	})
	if err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	if updated.Layout.Viewport == nil || updated.Layout.Viewport.X != 120 || updated.Layout.Viewport.Y != 80 || updated.Layout.Viewport.Zoom != 1.5 {
		t.Fatalf("viewport = %#v", updated.Layout.Viewport)
	}
}

func TestDecodeStrictRejectsTrailingAndUnknownFields(t *testing.T) {
	var request ApplyRequest
	if err := DecodeStrict([]byte(`{"projectId":"p","expectedRevision":0,"operations":[],"legacy":true}`), &request); err == nil {
		t.Fatal("DecodeStrict() error = nil, want unknown field")
	}
	if err := DecodeStrict([]byte(`{"projectId":"p","expectedRevision":0,"operations":[]} {}`), &request); err == nil {
		t.Fatal("DecodeStrict() error = nil, want trailing value")
	}
	if err := DecodeStrict([]byte(`{"projectId":"p","projectId":"other","expectedRevision":0,"operations":[]}`), &request); err == nil {
		t.Fatal("DecodeStrict() error = nil, want duplicate field")
	}
}

func TestHTTPAndWorkerSchemasPublishClosedVersionedContracts(t *testing.T) {
	apply := ApplyRequestSchema()
	direct := DirectInvokeRequestSchema()
	if apply["$id"] != "https://setta.local/schemas/realtime/apply-request-v1.schema.json" || direct["$id"] != "https://setta.local/schemas/realtime/direct-invoke-request-v1.schema.json" {
		t.Fatalf("HTTP schema identities = %q, %q", apply["$id"], direct["$id"])
	}
	applyProperties := apply["properties"].(map[string]any)
	operations := applyProperties["operations"].(map[string]any)
	if operations["minItems"] != 1 || operations["maxItems"] != 128 || apply["additionalProperties"] != false || direct["additionalProperties"] != false {
		t.Fatalf("HTTP schema bounds = %#v, %#v", apply, direct)
	}
	worker, err := json.Marshal(WorkerSchema())
	if err != nil {
		t.Fatalf("json.Marshal(worker) error = %v", err)
	}
	for _, method := range []string{"initialize", "runtime/invoke", "runtime/update", "$/cancelRequest", "shutdown"} {
		if !strings.Contains(string(worker), `"const":"`+method+`"`) {
			t.Fatalf("worker schema omits exact method %q", method)
		}
	}
	runtimeDefinitions := RuntimeSchema()["$defs"].(map[string]any)
	identity := runtimeDefinitions["identity"].(map[string]any)
	properties := identity["properties"].(map[string]any)
	sequence := properties["sequence"].(map[string]any)
	if sequence["minimum"] != 1 {
		t.Fatalf("runtime sequence schema = %#v", sequence)
	}
}

func fixtureProject() Project {
	width := 420.0
	height := 260.0
	return Project{
		Version:  ProjectVersion,
		ID:       "project-counter",
		Revision: 4,
		Name:     "Counter",
		Runtime:  RuntimeDeclaration{Kind: "python", Entrypoint: "app.py"},
		Sections: map[string]Section{
			"counter": {
				ID: "counter", Kind: "input", Name: "Counter", Width: SizeValue{Value: 320}, Height: SizeValue{Auto: true},
				Children: []string{}, Data: json.RawMessage(`{"inputKind":"number","value":0,"label":"Count"}`),
			},
			"result": {
				ID: "result", Kind: "output", Name: "Result", Width: SizeValue{Value: 420}, Height: SizeValue{Value: 260},
				Children: []string{}, Data: json.RawMessage(`{"value":null}`),
			},
		},
		Layout: Layout{
			TopLevelSections: map[string]TopLevelSectionLayout{
				"counter": {X: 0, Y: 0, Width: &width, Height: &height, ZIndex: 1},
				"result":  {X: 480, Y: 0, ZIndex: 2},
			},
			Viewport: &Viewport{X: 0, Y: 0, Zoom: 1},
		},
		Bindings: []Binding{{
			ID: "increment", Trigger: BindingTrigger{SectionID: "counter", Event: "change"}, Handler: "increment",
			Arguments:  map[string]json.RawMessage{"value": json.RawMessage(`"$event.value"`)},
			Scheduling: SchedulingPolicy{Mode: "latest", DebounceMilliseconds: 20, ConcurrencyGroup: "counter", ConcurrencyLimit: 1},
			Outputs:    map[string]BindingOutput{"value": {SectionID: "result", Field: "value"}},
		}},
		Configuration: map[string]json.RawMessage{},
	}
}
