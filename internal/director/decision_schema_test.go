package director

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func TestDecisionOutputSchemaOffersEveryAuthorizedKind(t *testing.T) {
	context := decisionContextFixture()
	branches := decodeDecisionSchemaBranches(t, context)
	seen := map[string]int{}
	for _, branch := range branches {
		seen[branchKind(t, branch)]++
	}
	for _, kind := range DirectorDecisionKinds() {
		if seen[string(kind)] == 0 {
			t.Fatalf("decision kind %q has no schema branch", kind)
		}
	}
	// One folderless root, one root per offered workspace, one child per
	// accepting parent, and one fork per parent with fork points.
	if seen[string(DirectorDecisionCreateWorkstream)] != 4 {
		t.Fatalf("expected 4 create branches, got %d", seen[string(DirectorDecisionCreateWorkstream)])
	}
}

func TestDecisionOutputSchemaWithholdsUnauthorizedKinds(t *testing.T) {
	context := singleTargetContextFixture()
	for _, branch := range decodeDecisionSchemaBranches(t, context) {
		kind := branchKind(t, branch)
		if kind == string(DirectorDecisionRecoverPath) ||
			kind == string(DirectorDecisionSteerRun) ||
			kind == string(DirectorDecisionQueueBehindRun) {
			t.Fatalf("schema offers %q that the context withheld", kind)
		}
	}
}

// TestDecisionOutputSchemaCarriesNoPresentationAuthority is the Setta 4
// requirement that made this protocol necessary: the model must not be able to
// name a pane, a provider, a lease, or a filesystem path.
func TestDecisionOutputSchemaCarriesNoPresentationAuthority(t *testing.T) {
	raw, err := DecisionOutputSchema(decisionContextFixture())
	if err != nil {
		t.Fatalf("build decision schema: %v", err)
	}
	text := strings.ToLower(string(raw))
	for _, forbidden := range []string{
		"pane", "provider", "lease", "rootpath", "conversationid", "turnid",
		"approvalid", "artifactid", "narrator", "renderer",
	} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("the decision schema exposes %q", forbidden)
		}
	}
}

func TestDecisionOutputSchemaBoundsEveryIdentifier(t *testing.T) {
	context := decisionContextFixture()
	authorized := map[string]bool{
		fixtureIdleWorkstream: true, fixtureActiveWorkstream: true, fixtureFailedWorkstream: true,
		fixtureWorkspaceID: true, fixtureForkRunID: true, fixtureFailureEventID: true,
	}
	for _, kind := range DirectorDecisionKinds() {
		authorized[string(kind)] = true
	}
	for _, name := range []string{
		string(WorkstreamCreationRoot), string(WorkstreamCreationChild), string(WorkstreamCreationFork),
		string(WorkstreamResourceScopeFolderless), string(WorkstreamResourceScopeFolder),
	} {
		authorized[name] = true
	}
	for _, value := range collectSchemaEnumValues(t, decodeDecisionSchemaBranches(t, context)) {
		if !authorized[value] {
			t.Fatalf("the decision schema offers unauthorized enum value %q", value)
		}
	}
}

func TestDecisionOutputSchemaAcceptsTheWireTheDecoderParses(t *testing.T) {
	context := decisionContextFixture()
	branches := decodeDecisionSchemaBranches(t, context)
	for _, decision := range authorizedDecisionsForFixture() {
		wire := decisionWire(t, decision)
		if !anyBranchAccepts(branches, wire) {
			t.Fatalf("no schema branch accepts the wire shape for %q", decision.Kind)
		}
	}
}

func TestDecodeDecisionOutputRoundTripsEveryKind(t *testing.T) {
	context := decisionContextFixture()
	for _, expected := range authorizedDecisionsForFixture() {
		decoded, err := DecodeDecisionOutput(decisionEnvelope(t, expected), context)
		if err != nil {
			t.Fatalf("decode %q: %v", expected.Kind, err)
		}
		if !reflect.DeepEqual(decoded, expected) {
			t.Fatalf("decoded %q does not round-trip:\n got %+v\nwant %+v", expected.Kind, decoded, expected)
		}
	}
}

func TestDecodeDecisionOutputRejectsMalformedProviderOutput(t *testing.T) {
	context := decisionContextFixture()
	cases := []struct {
		name   string
		raw    string
		reason DecisionRejectionReason
	}{
		{
			name:   "unknown property in a branch",
			raw:    `{"decision":{"kind":"select_workstream","workstreamId":"workstream-idle","paneId":"pane-1"}}`,
			reason: DecisionRejectedMalformedOutput,
		},
		{
			name:   "kind outside the catalog",
			raw:    `{"decision":{"kind":"ask_narrator","conversationId":"c","question":"status?"}}`,
			reason: DecisionRejectedUnknownKind,
		},
		{
			name:   "unauthorized identifier despite a valid shape",
			raw:    `{"decision":{"kind":"select_workstream","workstreamId":"workstream-missing"}}`,
			reason: DecisionRejectedUnknownTarget,
		},
		{
			name:   "empty authored input",
			raw:    `{"decision":{"kind":"send_to_workstream","workstreamId":"workstream-idle","authoredInput":""}}`,
			reason: DecisionRejectedInvalidPayload,
		},
		{
			name:   "unknown creation origin",
			raw:    `{"decision":{"kind":"create_workstream","origin":{"kind":"sibling"},"initialInput":"go","proposedTitle":"T"}}`,
			reason: DecisionRejectedInvalidPayload,
		},
		{
			name:   "two decisions in one response",
			raw:    `{"decision":{"kind":"ask_clarification","question":"which?"}} {"decision":{"kind":"ask_clarification","question":"which?"}}`,
			reason: DecisionRejectedMalformedOutput,
		},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := DecodeDecisionOutput(json.RawMessage(testCase.raw), context)
			assertRejection(t, err, testCase.reason)
		})
	}
}

func TestDecodeDecisionOutputRejectsWithheldKinds(t *testing.T) {
	raw := `{"decision":{"kind":"steer_run","workstreamId":"workstream-idle","authoredInput":"go"}}`
	_, err := DecodeDecisionOutput(json.RawMessage(raw), singleTargetContextFixture())
	assertRejection(t, err, DecisionRejectedUnauthorizedKind)
}

func decodeDecisionSchemaBranches(t *testing.T, context DirectorDecisionContext) []map[string]any {
	t.Helper()
	raw, err := DecisionOutputSchema(context)
	if err != nil {
		t.Fatalf("build decision schema: %v", err)
	}
	var schema struct {
		Properties struct {
			Decision struct {
				AnyOf []map[string]any `json:"anyOf"`
			} `json:"decision"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(raw, &schema); err != nil {
		t.Fatalf("decode decision schema: %v", err)
	}
	if len(schema.Properties.Decision.AnyOf) == 0 {
		t.Fatal("the decision schema offers no branch")
	}
	return schema.Properties.Decision.AnyOf
}

func branchKind(t *testing.T, branch map[string]any) string {
	t.Helper()
	properties, _ := branch["properties"].(map[string]any)
	kind, _ := properties["kind"].(map[string]any)
	values, _ := kind["enum"].([]any)
	if len(values) != 1 {
		t.Fatalf("a decision branch must pin exactly one kind, got %v", values)
	}
	return fmt.Sprint(values[0])
}

func collectSchemaEnumValues(t *testing.T, branches []map[string]any) []string {
	t.Helper()
	collected := []string{}
	var walk func(node map[string]any)
	walk = func(node map[string]any) {
		if values, ok := node["enum"].([]any); ok {
			for _, value := range values {
				collected = append(collected, fmt.Sprint(value))
			}
		}
		properties, ok := node["properties"].(map[string]any)
		if !ok {
			return
		}
		for _, property := range properties {
			if nested, ok := property.(map[string]any); ok {
				walk(nested)
			}
		}
	}
	for _, branch := range branches {
		walk(branch)
	}
	return collected
}

// anyBranchAccepts is a narrow schema check: it proves the wire object the
// decoder parses has exactly the branch's required properties and satisfies
// every pinned enum, so the schema and the decoder cannot drift apart.
func anyBranchAccepts(branches []map[string]any, wire map[string]any) bool {
	for _, branch := range branches {
		if branchAccepts(branch, wire) {
			return true
		}
	}
	return false
}

func branchAccepts(branch map[string]any, wire map[string]any) bool {
	properties, ok := branch["properties"].(map[string]any)
	if !ok || len(properties) != len(wire) {
		return false
	}
	for name, schema := range properties {
		value, present := wire[name]
		nested, ok := schema.(map[string]any)
		if !present || !ok || !propertyAccepts(nested, value) {
			return false
		}
	}
	return true
}

func propertyAccepts(schema map[string]any, value any) bool {
	if values, ok := schema["enum"].([]any); ok {
		for _, allowed := range values {
			if fmt.Sprint(allowed) == fmt.Sprint(value) {
				return true
			}
		}
		return false
	}
	if _, ok := schema["properties"]; ok {
		object, ok := value.(map[string]any)
		return ok && branchAccepts(schema, object)
	}
	text, ok := value.(string)
	return ok && text != ""
}

// decisionWire builds the object a provider returns for one decision. It is
// written against the schema rather than derived from the Go struct, because
// the Go struct also carries the branches that were not chosen.
func decisionWire(t *testing.T, decision DirectorDecision) map[string]any {
	t.Helper()
	wire := map[string]any{"kind": string(decision.Kind)}
	switch decision.Kind {
	case DirectorDecisionAnswerDirectly:
		wire["text"] = decision.AnswerDirectly.Text
	case DirectorDecisionAskClarification:
		wire["question"] = decision.AskClarification.Question
	case DirectorDecisionSelectWorkstream:
		wire["workstreamId"] = decision.SelectWorkstream.WorkstreamID
	case DirectorDecisionSendToWorkstream:
		wire["workstreamId"] = decision.SendToWorkstream.WorkstreamID
		wire["authoredInput"] = decision.SendToWorkstream.AuthoredInput
	case DirectorDecisionQueueBehindRun:
		wire["workstreamId"] = decision.QueueBehindRun.WorkstreamID
		wire["authoredInput"] = decision.QueueBehindRun.AuthoredInput
	case DirectorDecisionSteerRun:
		wire["workstreamId"] = decision.SteerRun.WorkstreamID
		wire["authoredInput"] = decision.SteerRun.AuthoredInput
	case DirectorDecisionRecoverPath:
		wire["workstreamId"] = decision.RecoverPath.WorkstreamID
		wire["failureEventId"] = decision.RecoverPath.FailureEventID
	case DirectorDecisionCreateWorkstream:
		wire["origin"] = creationOriginWire(decision.CreateWorkstream.Origin)
		wire["initialInput"] = decision.CreateWorkstream.InitialInput
		wire["proposedTitle"] = decision.CreateWorkstream.ProposedTitle
	default:
		t.Fatalf("no wire shape for decision kind %q", decision.Kind)
	}
	return wire
}

func creationOriginWire(origin WorkstreamCreationOrigin) map[string]any {
	wire := map[string]any{"kind": string(origin.Kind)}
	switch origin.Kind {
	case WorkstreamCreationRoot:
		scope := map[string]any{"kind": string(origin.Root.ResourceScope.Kind)}
		if origin.Root.ResourceScope.Folder != nil {
			scope["folder"] = map[string]any{"workspaceId": origin.Root.ResourceScope.Folder.WorkspaceID}
		}
		wire["root"] = map[string]any{"resourceScope": scope}
	case WorkstreamCreationChild:
		wire["child"] = map[string]any{"parentWorkstreamId": origin.Child.ParentWorkstreamID}
	case WorkstreamCreationFork:
		wire["fork"] = map[string]any{
			"parentWorkstreamId": origin.Fork.ParentWorkstreamID,
			"forkedAtRunId":      origin.Fork.ForkedAtRunID,
		}
	}
	return wire
}

func decisionEnvelope(t *testing.T, decision DirectorDecision) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(map[string]any{"decision": decisionWire(t, decision)})
	if err != nil {
		t.Fatalf("encode decision wire: %v", err)
	}
	return raw
}
