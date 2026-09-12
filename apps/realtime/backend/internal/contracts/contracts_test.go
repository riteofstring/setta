package contracts

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
)

func TestProjectValidatesCounterAndStreamingBinding(t *testing.T) {
	project := fixtureProject()
	if err := project.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestProjectValidatesOptionalMaterializationPolicies(t *testing.T) {
	project := fixtureProject()
	policies := []MaterializationPolicy{
		{Retention: "session", Startup: "always"},
		{Retention: "session", Startup: "whenStale"},
		{Retention: "lastSuccessful", Startup: "ifMissing"},
		{Retention: "lastSuccessful", Startup: "manual"},
	}
	for _, policy := range policies {
		binding := project.Bindings[0]
		binding.Materialization = &policy
		project.Bindings[0] = binding
		if err := project.Validate(); err != nil {
			t.Fatalf("Validate(%#v) error = %v", policy, err)
		}
	}
}

func TestProjectRejectsInvalidMaterializationPolicies(t *testing.T) {
	for name, policy := range map[string]MaterializationPolicy{
		"retention": {Retention: "forever", Startup: "manual"},
		"startup":   {Retention: "session", Startup: "reload"},
	} {
		project := fixtureProject()
		project.Bindings[0].Materialization = &policy
		if err := project.Validate(); err == nil {
			t.Fatalf("Validate(%s) error = nil", name)
		}
	}
}

func TestProjectRejectsAutomaticStartupForNonInitializableTrigger(t *testing.T) {
	project := fixtureProject()
	project.Bindings[0].Trigger.Event = "submit"
	project.Bindings[0].Materialization = &MaterializationPolicy{Retention: "lastSuccessful", Startup: "always"}
	if err := project.Validate(); err == nil {
		t.Fatal("Validate() error = nil")
	}
	project.Bindings[0].Materialization.Startup = "manual"
	if err := project.Validate(); err != nil {
		t.Fatalf("Validate(manual) error = %v", err)
	}
}

func TestRuntimeEventValidatesCauseAndNameCombination(t *testing.T) {
	event := RuntimeEvent{
		Type: "event", SessionID: "session-1", SectionID: "input-1", Event: "change", Payload: json.RawMessage(`{}`),
	}
	for _, combination := range []struct {
		cause string
		name  string
	}{
		{cause: "interaction", name: "change"},
		{cause: "interaction", name: "submit"},
		{cause: "interaction", name: "press"},
		{cause: "interaction", name: "snapshot"},
		{cause: "startup", name: "change"},
		{cause: "startup", name: "snapshot"},
	} {
		event.Cause = combination.cause
		event.Event = combination.name
		if err := event.Validate(); err != nil {
			t.Fatalf("Validate(%q, %q) error = %v", combination.cause, combination.name, err)
		}
	}
	for _, combination := range []struct {
		cause string
		name  string
	}{
		{cause: "", name: "change"},
		{cause: "reload", name: "change"},
		{cause: "startup", name: "submit"},
		{cause: "startup", name: "press"},
	} {
		event.Cause = combination.cause
		event.Event = combination.name
		if err := event.Validate(); err == nil {
			t.Fatalf("Validate(%q, %q) error = nil", combination.cause, combination.name)
		}
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

func TestProjectAcceptsAtMostOneEntrypointCodeSection(t *testing.T) {
	project := fixtureProject()
	project.Sections["source"] = Section{
		ID: "source", Kind: "code", Name: "Callbacks", Width: SizeValue{Value: 480}, Height: SizeValue{Value: 320},
		Children: []string{}, Data: json.RawMessage(`{"source":"entrypoint"}`),
	}
	project.Layout.TopLevelSections["source"] = TopLevelSectionLayout{X: 0, Y: 400, ZIndex: 3}
	if err := project.Validate(); err != nil {
		t.Fatalf("Validate(single code section) error = %v", err)
	}
	duplicate := project.Sections["source"]
	duplicate.ID = "source-copy"
	project.Sections[duplicate.ID] = duplicate
	project.Layout.TopLevelSections[duplicate.ID] = TopLevelSectionLayout{X: 520, Y: 400, ZIndex: 4}
	if err := project.Validate(); err == nil || !strings.Contains(err.Error(), "multiple entrypoint code sections") {
		t.Fatalf("Validate(duplicate code section) error = %v", err)
	}
	duplicate.Kind = "code"
	duplicate.Data = json.RawMessage(`{"source":"file","path":"app.py"}`)
	if err := duplicate.Validate(); err == nil {
		t.Fatal("Validate(code data) accepted a second source authority")
	}
}

func TestProjectCompilesSameRootFanOutAndFanIn(t *testing.T) {
	project := pipelineFixture()
	compiled, err := CompilePipeline(project)
	if err != nil {
		t.Fatalf("CompilePipeline() error = %v", err)
	}
	root := PipelineEvent{SectionID: "counter", Event: "change"}
	if !slices.Equal(compiled.ReachableByEvent[root], []string{"double", "increment", "combine"}) {
		t.Fatalf("reachable bindings = %#v", compiled.ReachableByEvent[root])
	}
	if !slices.Equal(compiled.DescendantsByBinding["increment"], []string{"combine"}) {
		t.Fatalf("increment descendants = %#v", compiled.DescendantsByBinding["increment"])
	}
	if compiled.HandlerSectionByBinding["combine"] != "combine-handler" || compiled.RootEventByBinding["combine"] != root {
		t.Fatalf("compiled pipeline = %#v", compiled)
	}
}

func TestProjectAcceptsDisconnectedHandlerAndUnaryJoin(t *testing.T) {
	project := fixtureProject()
	project.Bindings[0].Trigger = BindingTrigger{Kind: "disconnected"}
	project.Bindings[0].Arguments["value"] = json.RawMessage(`null`)
	if err := project.Validate(); err != nil {
		t.Fatalf("Validate(disconnected) error = %v", err)
	}
	project.Bindings[0].Trigger = BindingTrigger{Kind: "event", SectionID: "counter", Event: "change"}
	addPipelineBinding(&project, Binding{
		ID: "forward", Trigger: BindingTrigger{Kind: "join", Mode: "all", Inputs: map[string]BindingInput{"value": {BindingID: "increment", Output: "value"}}}, Handler: "forward",
		Arguments: map[string]json.RawMessage{}, Scheduling: scheduling("forward"), Outputs: map[string]BindingOutput{"value": {}},
	})
	if err := project.Validate(); err != nil {
		t.Fatalf("Validate(unary join) error = %v", err)
	}
}

func TestProjectRejectsInvalidPipelineContracts(t *testing.T) {
	cases := map[string]struct {
		change func(*Project)
		want   string
	}{
		"missing handler section": {
			change: func(project *Project) {
				delete(project.Sections, "increment-handler")
				delete(project.Layout.TopLevelSections, "increment-handler")
			},
			want: "no handler section",
		},
		"duplicate handler section": {
			change: func(project *Project) { addHandlerSection(project, "duplicate-handler", "increment") },
			want:   "multiple handler sections",
		},
		"handler references missing binding": {
			change: func(project *Project) {
				section := project.Sections["increment-handler"]
				section.Data = json.RawMessage(`{"bindingId":"missing"}`)
				project.Sections[section.ID] = section
			},
			want: "references missing binding",
		},
		"missing producer": {
			change: func(project *Project) {
				project.Bindings[2].Trigger.Inputs["left"] = BindingInput{BindingID: "missing", Output: "value"}
			},
			want: "references missing binding",
		},
		"missing logical output": {
			change: func(project *Project) {
				project.Bindings[2].Trigger.Inputs["left"] = BindingInput{BindingID: "increment", Output: "missing"}
			},
			want: "references missing output",
		},
		"input collides with argument": {
			change: func(project *Project) { project.Bindings[2].Arguments["left"] = json.RawMessage(`null`) },
			want:   "collides with an argument",
		},
		"self edge": {
			change: func(project *Project) {
				project.Bindings[2].Trigger.Inputs["left"] = BindingInput{BindingID: "combine", Output: "image"}
			},
			want: "references itself",
		},
		"cycle": {
			change: func(project *Project) {
				project.Bindings[1].Trigger = BindingTrigger{Kind: "join", Mode: "all", Inputs: map[string]BindingInput{"value": {BindingID: "combine", Output: "image"}}}
				project.Bindings[1].Arguments = map[string]json.RawMessage{}
			},
			want: "contains a cycle",
		},
		"ambiguous roots": {
			change: func(project *Project) {
				addButtonSection(project, "submit")
				project.Bindings[1].Trigger = BindingTrigger{Kind: "event", SectionID: "submit", Event: "press"}
			},
			want: "ambiguous root event ancestry",
		},
		"orphan join": {
			change: func(project *Project) { project.Bindings[0].Trigger = BindingTrigger{Kind: "disconnected"} },
			want:   "orphan join",
		},
		"empty join": {
			change: func(project *Project) { project.Bindings[2].Trigger.Inputs = map[string]BindingInput{} },
			want:   "join inputs are missing",
		},
	}
	for name, test := range cases {
		t.Run(name, func(t *testing.T) {
			project := pipelineFixture()
			test.change(&project)
			if err := project.Validate(); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("Validate() error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestProjectValidatesPipelineMaterializationRootAncestry(t *testing.T) {
	project := pipelineFixture()
	project.Bindings[2].Materialization = &MaterializationPolicy{Retention: "lastSuccessful", Startup: "always"}
	if err := project.Validate(); err != nil {
		t.Fatalf("Validate(join startup) error = %v", err)
	}
	project.Bindings[0].Trigger.Event = "submit"
	project.Bindings[1].Trigger.Event = "submit"
	if err := project.Validate(); err == nil || !strings.Contains(err.Error(), "root ancestry") {
		t.Fatalf("Validate(submit root) error = %v", err)
	}
	project = fixtureProject()
	project.Bindings[0].Trigger = BindingTrigger{Kind: "disconnected"}
	project.Bindings[0].Materialization = &MaterializationPolicy{Retention: "lastSuccessful", Startup: "always"}
	if err := project.Validate(); err == nil || !strings.Contains(err.Error(), "root ancestry") {
		t.Fatalf("Validate(disconnected startup) error = %v", err)
	}
}

func TestBindingTriggerStrictlyDecodesClosedUnion(t *testing.T) {
	for _, encoded := range []string{
		`{"kind":"event","sectionId":"input","event":"change","mode":"all"}`,
		`{"kind":"join","mode":"all","inputs":{"value":{"bindingId":"source","output":"value"}},"event":"change"}`,
		`{"kind":"disconnected","inputs":{}}`,
		`{"kind":"legacy","sectionId":"input","event":"change"}`,
	} {
		var trigger BindingTrigger
		if err := DecodeStrict([]byte(encoded), &trigger); err == nil {
			t.Fatalf("DecodeStrict(%s) error = nil", encoded)
		}
	}
}

func TestProjectRejectsVersionOne(t *testing.T) {
	project := fixtureProject()
	project.Version = 1
	if err := project.Validate(); err == nil || !strings.Contains(err.Error(), "unsupported project version 1") {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestApplyDeletesPipelineGraphSymmetrically(t *testing.T) {
	for _, operation := range []json.RawMessage{
		json.RawMessage(`{"op":"deleteSection","sectionId":"increment-handler"}`),
		json.RawMessage(`{"op":"deleteBinding","bindingId":"increment"}`),
	} {
		project := unaryPipelineFixture()
		updated, err := Apply(project, ApplyRequest{ProjectID: project.ID, ExpectedRevision: project.Revision, Operations: []json.RawMessage{operation}})
		if err != nil {
			t.Fatalf("Apply(%s) error = %v", operation, err)
		}
		if _, exists := updated.Sections["increment-handler"]; exists || slices.ContainsFunc(updated.Bindings, func(binding Binding) bool { return binding.ID == "increment" }) {
			t.Fatalf("deleted graph retained producer: %#v", updated)
		}
		consumer := updated.Bindings[0]
		if consumer.ID != "forward" || consumer.Trigger.Kind != "disconnected" || string(consumer.Arguments["value"]) != "null" {
			t.Fatalf("consumer after delete = %#v", consumer)
		}
	}
}

func TestApplyDisconnectsDeletedSourcesAndClearsDeletedTargets(t *testing.T) {
	project := fixtureProject()
	updated, err := Apply(project, ApplyRequest{
		ProjectID: project.ID, ExpectedRevision: project.Revision,
		Operations: []json.RawMessage{json.RawMessage(`{"op":"deleteSection","sectionId":"counter"}`), json.RawMessage(`{"op":"deleteSection","sectionId":"result"}`)},
	})
	if err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	binding := updated.Bindings[0]
	if binding.Trigger.Kind != "disconnected" || binding.Outputs["value"].Target != nil || string(binding.Arguments["value"]) != `"$event.value"` {
		t.Fatalf("binding after section deletes = %#v", binding)
	}
}

func TestApplyDisconnectsDeletedPipelineSourceTransitively(t *testing.T) {
	project := unaryPipelineFixture()
	addPipelineBinding(&project, Binding{
		ID: "final", Trigger: BindingTrigger{Kind: "join", Mode: "all", Inputs: map[string]BindingInput{"value": {BindingID: "forward", Output: "value"}}}, Handler: "final",
		Arguments: map[string]json.RawMessage{}, Scheduling: scheduling("final"), Outputs: map[string]BindingOutput{},
	})
	updated, err := Apply(project, ApplyRequest{
		ProjectID: project.ID, ExpectedRevision: project.Revision,
		Operations: []json.RawMessage{json.RawMessage(`{"op":"deleteSection","sectionId":"counter"}`)},
	})
	if err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	for _, binding := range updated.Bindings {
		if binding.Trigger.Kind != "disconnected" {
			t.Fatalf("binding %q trigger = %#v, want disconnected", binding.ID, binding.Trigger)
		}
		if binding.ID != "increment" && string(binding.Arguments["value"]) != "null" {
			t.Fatalf("binding %q arguments = %#v, want preserved null input", binding.ID, binding.Arguments)
		}
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
	if err := DecodeStrict([]byte{'{', '"', 'x', '"', ':', '"', 0xff, '"', '}'}, &map[string]string{}); err == nil {
		t.Fatal("DecodeStrict() error = nil, want invalid UTF-8")
	}
}

func TestRuntimeSourceContractsAreClosedVersionedAndValidateActivation(t *testing.T) {
	document := RuntimeSourceDocument{ProjectID: "project-source", Entrypoint: "app.py", Version: strings.Repeat("a", 64), Source: "handlers = {}\n"}
	request := ApplyRuntimeSourceRequest{ProjectID: document.ProjectID, Entrypoint: document.Entrypoint, ExpectedVersion: document.Version, Source: document.Source}
	activated := ApplyRuntimeSourceResult{Source: document, Activation: RuntimeSourceActivation{State: "activated"}}
	rejected := ApplyRuntimeSourceResult{Source: document, Activation: RuntimeSourceActivation{State: "rejected", Error: &StructuredError{Code: "load_error", Message: "invalid syntax"}}}
	for name, candidate := range map[string]interface{ Validate() error }{
		"document": document, "request": request, "activated": activated, "rejected": rejected,
	} {
		if err := candidate.Validate(); err != nil {
			t.Fatalf("%s Validate() error = %v", name, err)
		}
	}
	invalid := activated
	invalid.Activation.Error = &StructuredError{Code: "load_error", Message: "unexpected"}
	if err := invalid.Validate(); err == nil {
		t.Fatal("activated result accepted an error")
	}
	for _, schema := range []map[string]any{RuntimeSourceDocumentSchema(), ApplyRuntimeSourceRequestSchema(), ApplyRuntimeSourceResultSchema()} {
		if schema["additionalProperties"] != false && schema["oneOf"] == nil {
			t.Fatalf("source schema is open: %#v", schema)
		}
		if id, _ := schema["$id"].(string); !strings.HasPrefix(id, "https://setta.local/schemas/realtime/") {
			t.Fatalf("source schema id = %q", id)
		}
	}
}

func TestHTTPAndWorkerSchemasPublishClosedVersionedContracts(t *testing.T) {
	assertHTTPSchemaContracts(t)
	assertWorkerSchemaContracts(t)
	assertRuntimeSchemaContracts(t)
}

func assertHTTPSchemaContracts(t *testing.T) {
	t.Helper()
	apply := ApplyRequestSchema()
	direct := DirectInvokeRequestSchema()
	if apply["$id"] != "https://setta.local/schemas/realtime/apply-request-v2.schema.json" || direct["$id"] != "https://setta.local/schemas/realtime/direct-invoke-request-v1.schema.json" {
		t.Fatalf("HTTP schema identities = %q, %q", apply["$id"], direct["$id"])
	}
	applyProperties := apply["properties"].(map[string]any)
	operations := applyProperties["operations"].(map[string]any)
	if operations["minItems"] != 1 || operations["maxItems"] != 128 || apply["additionalProperties"] != false || direct["additionalProperties"] != false {
		t.Fatalf("HTTP schema bounds = %#v, %#v", apply, direct)
	}
}

func assertWorkerSchemaContracts(t *testing.T) {
	t.Helper()
	worker, err := json.Marshal(WorkerSchema())
	if err != nil {
		t.Fatalf("json.Marshal(worker) error = %v", err)
	}
	for _, method := range []string{"initialize", "runtime/invoke", "runtime/update", "$/cancelRequest", "shutdown"} {
		if !strings.Contains(string(worker), `"const":"`+method+`"`) {
			t.Fatalf("worker schema omits exact method %q", method)
		}
	}
	if WorkerSchema()["$id"] != "https://setta.local/schemas/realtime/worker-v2.schema.json" || !strings.Contains(string(worker), `"updateCount"`) || !strings.Contains(string(worker), `"updateSequence"`) || !strings.Contains(string(worker), `"runId"`) {
		t.Fatalf("worker stream barrier schema = %s", worker)
	}
	var invokeResult InvokeResult
	if err := DecodeStrict([]byte(`{"outputs":{},"error":null}`), &invokeResult); err == nil || !strings.Contains(err.Error(), "update count is missing") {
		t.Fatalf("DecodeStrict(invoke result without updateCount) error = %v", err)
	}
	if err := DecodeStrict([]byte(`{"outputs":{},"updateCount":0,"error":null}`), &invokeResult); err != nil {
		t.Fatalf("DecodeStrict(invoke result) error = %v", err)
	}
}

func assertRuntimeSchemaContracts(t *testing.T) {
	t.Helper()
	runtimeDefinitions := RuntimeSchema()["$defs"].(map[string]any)
	identity := runtimeDefinitions["identity"].(map[string]any)
	properties := identity["properties"].(map[string]any)
	if _, exists := properties["runId"]; !exists {
		t.Fatal("runtime identity schema omits run identity")
	}
	sequence := properties["sequence"].(map[string]any)
	if sequence["minimum"] != 1 {
		t.Fatalf("runtime sequence schema = %#v", sequence)
	}
	snapshot := runtimeDefinitions["snapshot"].(map[string]any)
	snapshotProperties := snapshot["properties"].(map[string]any)
	if handlers, exists := snapshotProperties["handlers"].(map[string]any); !exists || handlers["uniqueItems"] != true {
		t.Fatalf("runtime handler discovery schema = %#v", snapshotProperties["handlers"])
	}
	update := runtimeDefinitions["update"].(map[string]any)
	updateProperties := update["properties"].(map[string]any)
	if updateProperties["updateSequence"].(map[string]any)["minimum"] != 1 {
		t.Fatalf("runtime update sequence schema = %#v", update)
	}
	if _, exists := snapshotProperties["publishedByBinding"]; !exists {
		t.Fatal("runtime snapshot schema omits published output identities")
	}
	required := snapshot["required"].([]string)
	publishedRequired := false
	for _, name := range required {
		if name == "publishedByBinding" {
			publishedRequired = true
		}
	}
	if !publishedRequired {
		t.Fatalf("runtime snapshot required fields = %#v", required)
	}
}

func TestSchemasPublishClosedMaterializationAndStartupContracts(t *testing.T) {
	projectDefinitions := ProjectSchema()["$defs"].(map[string]any)
	binding := projectDefinitions["binding"].(map[string]any)
	bindingProperties := binding["properties"].(map[string]any)
	materialization := bindingProperties["materialization"].(map[string]any)
	if materialization["additionalProperties"] != false {
		t.Fatalf("materialization schema is open: %#v", materialization)
	}
	materializationRequired := materialization["required"].([]string)
	if !slices.Contains(materializationRequired, "retention") || !slices.Contains(materializationRequired, "startup") {
		t.Fatalf("materialization required fields = %#v", materializationRequired)
	}
	bindingRequired := binding["required"].([]string)
	if slices.Contains(bindingRequired, "materialization") {
		t.Fatalf("binding materialization is required: %#v", bindingRequired)
	}
	startupRule := binding["allOf"].([]any)[0].(map[string]any)
	encodedStartupRule, err := json.Marshal(startupRule)
	if err != nil || !strings.Contains(string(encodedStartupRule), `"const":"join"`) || !strings.Contains(string(encodedStartupRule), `"const":"event"`) || !strings.Contains(string(encodedStartupRule), `"snapshot"`) {
		t.Fatalf("binding startup trigger schema = %#v", startupRule)
	}

	runtimeCommand := RuntimeCommandSchema()
	event := runtimeCommand["oneOf"].([]any)[0].(map[string]any)
	eventRequired := event["required"].([]string)
	eventProperties := event["properties"].(map[string]any)
	cause := eventProperties["cause"].(map[string]any)
	if !slices.Contains(eventRequired, "cause") || !slices.Equal(cause["enum"].([]string), []string{"interaction", "startup"}) || event["additionalProperties"] != false {
		t.Fatalf("runtime event cause schema = %#v", event)
	}
	runtimeStartupRule := event["allOf"].([]any)[0].(map[string]any)
	startupCondition := runtimeStartupRule["if"].(map[string]any)["properties"].(map[string]any)["cause"].(map[string]any)
	startupEvents := runtimeStartupRule["then"].(map[string]any)["properties"].(map[string]any)["event"].(map[string]any)
	if startupCondition["const"] != "startup" || !slices.Equal(startupEvents["enum"].([]string), []string{"change", "snapshot"}) {
		t.Fatalf("runtime startup event schema = %#v", runtimeStartupRule)
	}

	runtimeDefinitions := RuntimeSchema()["$defs"].(map[string]any)
	snapshot := runtimeDefinitions["snapshot"].(map[string]any)
	snapshotRequired := snapshot["required"].([]string)
	snapshotProperties := snapshot["properties"].(map[string]any)
	retained := snapshotProperties["retainedByBinding"].(map[string]any)
	retainedValue := retained["additionalProperties"].(map[string]any)
	if !slices.Contains(snapshotRequired, "handlers") || !slices.Contains(snapshotRequired, "retainedByBinding") || retainedValue["type"] != "boolean" || snapshot["additionalProperties"] != false {
		t.Fatalf("runtime retained output schema = %#v", snapshot)
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
			"increment-handler": {
				ID: "increment-handler", Kind: "handler", Name: "Increment", Width: SizeValue{Value: 320}, Height: SizeValue{Value: 180},
				Children: []string{}, Data: json.RawMessage(`{"bindingId":"increment"}`),
			},
		},
		Layout: Layout{
			TopLevelSections: map[string]TopLevelSectionLayout{
				"counter":           {X: 0, Y: 0, Width: &width, Height: &height, ZIndex: 1},
				"result":            {X: 480, Y: 0, ZIndex: 2},
				"increment-handler": {X: 360, Y: 320, ZIndex: 3},
			},
			Viewport: &Viewport{X: 0, Y: 0, Zoom: 1},
		},
		Bindings: []Binding{{
			ID: "increment", Trigger: BindingTrigger{Kind: "event", SectionID: "counter", Event: "change"}, Handler: "increment",
			Arguments:  map[string]json.RawMessage{"value": json.RawMessage(`"$event.value"`)},
			Scheduling: SchedulingPolicy{Mode: "latest", DebounceMilliseconds: 20, ConcurrencyGroup: "counter", ConcurrencyLimit: 1},
			Outputs:    map[string]BindingOutput{"value": {Target: &BindingOutputTarget{SectionID: "result", Field: "value"}}},
		}},
		Configuration: map[string]json.RawMessage{},
	}
}

func pipelineFixture() Project {
	project := fixtureProject()
	project.Bindings = append(project.Bindings, Binding{
		ID: "double", Trigger: BindingTrigger{Kind: "event", SectionID: "counter", Event: "change"}, Handler: "double",
		Arguments: map[string]json.RawMessage{"value": json.RawMessage(`"$event.value"`)}, Scheduling: scheduling("double"), Outputs: map[string]BindingOutput{"value": {}},
	})
	addHandlerSection(&project, "double-handler", "double")
	project.Bindings = append(project.Bindings, Binding{
		ID: "combine", Trigger: BindingTrigger{Kind: "join", Mode: "all", Inputs: map[string]BindingInput{
			"left": {BindingID: "increment", Output: "value"}, "right": {BindingID: "double", Output: "value"},
		}}, Handler: "combine", Arguments: map[string]json.RawMessage{}, Scheduling: scheduling("combine"), Outputs: map[string]BindingOutput{"image": {}},
	})
	addHandlerSection(&project, "combine-handler", "combine")
	return project
}

func unaryPipelineFixture() Project {
	project := fixtureProject()
	project.Bindings = append(project.Bindings, Binding{
		ID: "forward", Trigger: BindingTrigger{Kind: "join", Mode: "all", Inputs: map[string]BindingInput{"value": {BindingID: "increment", Output: "value"}}}, Handler: "forward",
		Arguments: map[string]json.RawMessage{}, Scheduling: scheduling("forward"), Outputs: map[string]BindingOutput{"value": {}},
	})
	addHandlerSection(&project, "forward-handler", "forward")
	return project
}

func addPipelineBinding(project *Project, binding Binding) {
	project.Bindings = append(project.Bindings, binding)
	addHandlerSection(project, binding.ID+"-handler", binding.ID)
}

func addHandlerSection(project *Project, sectionID string, bindingID string) {
	project.Sections[sectionID] = Section{
		ID: sectionID, Kind: "handler", Name: bindingID, Width: SizeValue{Value: 320}, Height: SizeValue{Value: 180}, Children: []string{},
		Data: json.RawMessage(`{"bindingId":"` + bindingID + `"}`),
	}
	project.Layout.TopLevelSections[sectionID] = TopLevelSectionLayout{X: float64(len(project.Layout.TopLevelSections) * 360), Y: 360, ZIndex: len(project.Layout.TopLevelSections) + 1}
}

func addButtonSection(project *Project, sectionID string) {
	project.Sections[sectionID] = Section{
		ID: sectionID, Kind: "button", Name: sectionID, Width: SizeValue{Value: 240}, Height: SizeValue{Value: 112}, Children: []string{}, Data: json.RawMessage(`{"label":"Run"}`),
	}
	project.Layout.TopLevelSections[sectionID] = TopLevelSectionLayout{X: 0, Y: 720, ZIndex: len(project.Layout.TopLevelSections) + 1}
}

func scheduling(group string) SchedulingPolicy {
	return SchedulingPolicy{Mode: "latest", ConcurrencyGroup: group, ConcurrencyLimit: 1}
}
