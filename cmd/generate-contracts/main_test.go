package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"setta/internal/codexaccount"
	"setta/internal/conversation"
	"setta/internal/conversation/conversationpalette"
	"setta/internal/httpapi"
)

type ContractTestLeaf struct {
	Alias ContractOpenStringID `json:"alias"`
	Value string               `json:"value"`
}

type ContractOpenStringID string

type ContractTestRequest struct {
	Leaf ContractTestLeaf `json:"leaf"`
}

type ContractTestResponse struct {
	Items  []ContractTestLeaf `json:"items"`
	Labels map[string]string  `json:"labels"`
	Counts map[string]int     `json:"counts"`
	Score  *float64           `json:"score"`
}

type ContractTaggedUnionResponse struct {
	Trajectory conversation.TrajectoryEvent `json:"trajectory"`
}

type ContractTestError struct {
	Message string `json:"message"`
}

type ErrorResponse struct {
	Error ContractTestError `json:"error"`
}

func TestContractSpecsCollectsEndpointGraph(t *testing.T) {
	specs, err := contractSpecs(httpapi.ContractSchema{
		Endpoints: []httpapi.ContractEndpoint{{
			Name:                  "ContractTest",
			Method:                "POST",
			Path:                  "/contract-test",
			Request:               reflect.TypeFor[ContractTestRequest](),
			Response:              reflect.TypeFor[ContractTestResponse](),
			RequestBodyLimitBytes: 1024,
		}},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	})
	if err != nil {
		t.Fatalf("collect contract specs: %v", err)
	}

	got := specNames(specs.Interfaces)
	want := []string{
		"ContractTestLeaf",
		"ContractTestRequest",
		"ContractTestResponse",
		"ContractTestError",
		"ErrorResponse",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("spec names = %#v, want %#v", got, want)
	}
	if specs.Endpoints[0].OperationName != "contractTest" {
		t.Fatalf("operation name = %q, want contractTest", specs.Endpoints[0].OperationName)
	}
	if specs.Endpoints[0].RequestBodyLimitBytes != 1024 {
		t.Fatalf("request body limit = %d, want 1024", specs.Endpoints[0].RequestBodyLimitBytes)
	}
	if !reflect.DeepEqual(specs.StringAliases, []stringAliasSpec{{Name: "ContractOpenStringID"}}) {
		t.Fatalf("string aliases = %#v, want ContractOpenStringID", specs.StringAliases)
	}
}

func TestContractSpecsRejectsDuplicateEndpointNames(t *testing.T) {
	_, err := contractSpecs(httpapi.ContractSchema{
		Endpoints: []httpapi.ContractEndpoint{
			contractEndpoint("ContractTest", "/contract-test"),
			contractEndpoint("ContractTest", "/contract-test-again"),
		},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	})

	if err == nil {
		t.Fatal("collect contracts succeeded, want duplicate name error")
	}
	if !strings.Contains(err.Error(), "duplicate endpoint name ContractTest") {
		t.Fatalf("error = %q, want duplicate endpoint name", err)
	}
}

func TestContractSpecsRejectsDuplicateEndpointRoutes(t *testing.T) {
	_, err := contractSpecs(httpapi.ContractSchema{
		Endpoints: []httpapi.ContractEndpoint{
			contractEndpoint("ContractTest", "/contract-test"),
			contractEndpoint("ContractTestAgain", "/contract-test"),
		},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	})

	if err == nil {
		t.Fatal("collect contracts succeeded, want duplicate route error")
	}
	if !strings.Contains(err.Error(), "duplicate endpoint route POST /contract-test") {
		t.Fatalf("error = %q, want duplicate endpoint route", err)
	}
}

func TestContractSpecsRejectsPostEndpointWithoutRequestBodyLimit(t *testing.T) {
	endpoint := contractEndpoint("ContractTest", "/contract-test")
	endpoint.RequestBodyLimitBytes = 0
	_, err := contractSpecs(httpapi.ContractSchema{
		Endpoints:      []httpapi.ContractEndpoint{endpoint},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	})

	if err == nil {
		t.Fatal("collect contracts succeeded, want missing request body limit error")
	}
	if !strings.Contains(err.Error(), "ContractTest POST endpoint must declare a positive request body limit") {
		t.Fatalf("error = %q, want missing request body limit", err)
	}
}

func TestContractSpecsCollectEndpointAndValueSetSemantics(t *testing.T) {
	specs, err := contractSpecs(httpapi.ContractSchema{
		Endpoints: []httpapi.ContractEndpoint{
			contractEndpoint("ContractTest", "/contract-test"),
			{
				Name:     "ContractTestHealth",
				Method:   "GET",
				Path:     "/contract-test/health",
				Response: reflect.TypeFor[ContractTestLeaf](),
			},
			{
				Name:     "ContractTestConversation",
				Method:   "GET",
				Path:     "/contract-test/conversation",
				Response: reflect.TypeFor[conversation.ConversationSnapshot](),
			},
			{
				Name:     "ContractTestCodexAccount",
				Method:   "GET",
				Path:     "/contract-test/codex-account",
				Response: reflect.TypeFor[codexaccount.CodexAccountState](),
			},
		},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	})
	if err != nil {
		t.Fatalf("collect contracts: %v", err)
	}

	if specs.Endpoints[0].OperationName != "contractTest" ||
		specs.Endpoints[1].OperationName != "contractTestHealth" {
		t.Fatalf("endpoints = %+v, want lower-camel operation names", specs.Endpoints)
	}
	helpers := decoderHelperUsage(specs.Interfaces)
	if !helpers.Array || !helpers.Integer || !helpers.IntegerMap || !helpers.Map || !helpers.Nullable || !helpers.Number || !helpers.String {
		t.Fatalf("decoder helpers = %+v, want semantic helper usage for test graph", helpers)
	}
	for _, valueSet := range []struct {
		name  string
		value string
	}{
		{name: "ConversationStatus", value: string(conversation.ConversationStatusIdle)},
		{name: "TrajectoryApprovalKind", value: string(conversation.TrajectoryApprovalKindPermission)},
		{name: "CodexAccountStatus", value: string(codexaccount.AccountStatusSignedIn)},
		{name: "CodexLoginType", value: string(codexaccount.LoginTypeChatGPT)},
		{name: "CodexChatGPTPlanType", value: string(codexaccount.ChatGPTPlanPlus)},
	} {
		if !valueSetContains(specs.ValueSets, valueSet.name, valueSet.value) {
			t.Fatalf("value sets = %+v, want %s containing %q", specs.ValueSets, valueSet.name, valueSet.value)
		}
	}
}

func TestRenderProducesGeneratedClientSmoke(t *testing.T) {
	specs, err := contractSpecs(httpapi.ContractSchema{
		Endpoints:      []httpapi.ContractEndpoint{contractEndpoint("ContractTest", "/contract-test")},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	})
	if err != nil {
		t.Fatalf("collect contracts: %v", err)
	}

	var buffer bytes.Buffer
	if err := render(&buffer, specs); err != nil {
		t.Fatalf("render contracts: %v", err)
	}
	output := buffer.String()
	if !strings.HasPrefix(output, "// Code generated by go run ./cmd/generate-contracts; DO NOT EDIT.") ||
		!strings.Contains(output, "export const backendEndpoints = {") ||
		!strings.Contains(output, "export type ContractOpenStringID = string;") ||
		!strings.Contains(output, "export function decodeContractOpenStringID") ||
		!strings.Contains(output, "requestBodyLimitBytes: 1024,") ||
		!strings.Contains(output, "export function createBackendClient(") {
		t.Fatalf("generated output does not look like a generated backend client:\n%s", output)
	}
	for _, runtimeBlock := range []string{
		"function assertRecord",
		"function decodeArray",
		"async function requestBackend",
	} {
		if strings.Contains(output, runtimeBlock) {
			t.Fatalf("generated output contains stable runtime block %q:\n%s", runtimeBlock, output)
		}
	}
}

func TestConversationPaletteCatalogRendersFromGoOwner(t *testing.T) {
	specs, err := contractSpecs(httpapi.ContractSchema{
		Endpoints: []httpapi.ContractEndpoint{{
			Name:     "ContractConversationSnapshot",
			Method:   "GET",
			Path:     "/contract-conversation-snapshot",
			Response: reflect.TypeFor[conversation.ConversationSnapshot](),
		}},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	})
	if err != nil {
		t.Fatalf("collect contracts: %v", err)
	}

	var buffer bytes.Buffer
	if err := render(&buffer, specs); err != nil {
		t.Fatalf("render contracts: %v", err)
	}
	output := buffer.String()
	if !strings.Contains(output, "export const conversationPaletteCatalog = {") ||
		!strings.Contains(
			output,
			"as const satisfies Readonly<Record<ConversationPaletteID, unknown>>;",
		) {
		t.Fatalf("generated output is missing the typed conversation palette catalog:\n%s", output)
	}
	for _, palette := range conversationpalette.Catalog() {
		encoded, marshalErr := json.Marshal(palette)
		if marshalErr != nil {
			t.Fatalf("marshal palette %q: %v", palette.ID, marshalErr)
		}
		want := fmt.Sprintf("  %q: %s,", palette.ID, encoded)
		if !strings.Contains(output, want) {
			t.Fatalf("generated output is missing Go-owned palette %q:\n%s", palette.ID, output)
		}
	}
}

func TestConversationSnapshotLimitsRenderFromGoOwner(t *testing.T) {
	specs, err := contractSpecs(httpapi.ContractSchema{
		Endpoints:      []httpapi.ContractEndpoint{contractEndpoint("ContractTest", "/contract-test")},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	})
	if err != nil {
		t.Fatalf("collect contracts: %v", err)
	}

	var buffer bytes.Buffer
	if err := render(&buffer, specs); err != nil {
		t.Fatalf("render contracts: %v", err)
	}
	output := buffer.String()
	for _, want := range []string{
		"export const conversationSnapshotLimits = {",
		fmt.Sprintf("  artifacts: %d,", conversation.MaxSnapshotArtifacts),
		fmt.Sprintf("  narrationEvents: %d,", conversation.MaxSnapshotNarrationEvents),
		fmt.Sprintf("  queuedTurns: %d,", conversation.MaxSnapshotQueuedTurns),
		fmt.Sprintf("  roleProfileOverrides: %d,", conversation.MaxSnapshotRoleOverrides),
		fmt.Sprintf("  sideConversations: %d,", conversation.MaxSnapshotSideConversations),
		fmt.Sprintf("  sideEvents: %d,", conversation.MaxSnapshotSideEvents),
		fmt.Sprintf("  trajectoryEvents: %d,", conversation.MaxSnapshotTrajectoryEvents),
		fmt.Sprintf("  turns: %d,", conversation.MaxSnapshotTurns),
		"} as const;",
	} {
		if !strings.Contains(output, want) {
			t.Fatalf("generated output is missing Go-owned snapshot limit %q:\n%s", want, output)
		}
	}
}

func TestConversationEventUnionRendersExactDiscriminators(t *testing.T) {
	specs, err := contractSpecs(httpapi.ContractSchema{
		Endpoints: []httpapi.ContractEndpoint{{
			Name:     "ContractConversationEvent",
			Method:   "GET",
			Path:     "/contract-conversation-event",
			Response: reflect.TypeFor[conversation.ConversationEvent](),
		}},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	})
	if err != nil {
		t.Fatalf("collect conversation event contracts: %v", err)
	}
	if len(specs.Unions) != 1 || specs.Unions[0].Name != "ConversationEventPayload" {
		t.Fatalf("unions = %+v, want ConversationEventPayload", specs.Unions)
	}

	var buffer bytes.Buffer
	if err := render(&buffer, specs); err != nil {
		t.Fatalf("render conversation event contracts: %v", err)
	}
	output := buffer.String()
	for _, want := range []string{
		"export type ConversationEventPayload =",
		"export interface ConversationUpdatedEventPayload {\n  type: \"conversation.updated\";",
		"export interface ConversationResyncRequiredEventPayload {\n  type: \"conversation.resync_required\";",
		"decodeContractLiteral(decodeConversationEventType(",
		"export function decodeConversationEventPayload(value: unknown): ConversationEventPayload",
		"case \"conversation.presentation_profile.updated\":",
		"case \"conversation.resync_required\":",
	} {
		if !strings.Contains(output, want) {
			t.Fatalf("generated conversation union missing %q:\n%s", want, output)
		}
	}
}

func TestRenderTaggedUnionStructValidatesBranchInvariant(t *testing.T) {
	specs, err := contractSpecs(httpapi.ContractSchema{
		Endpoints: []httpapi.ContractEndpoint{{
			Name:                  "ContractTrajectory",
			Method:                "POST",
			Path:                  "/contract-trajectory",
			Request:               reflect.TypeFor[ContractTestRequest](),
			Response:              reflect.TypeFor[ContractTaggedUnionResponse](),
			RequestBodyLimitBytes: 1024,
		}},
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	})
	if err != nil {
		t.Fatalf("collect contract specs: %v", err)
	}

	var buffer bytes.Buffer
	if err := render(&buffer, specs); err != nil {
		t.Fatalf("render contracts: %v", err)
	}
	output := buffer.String()
	for _, want := range []string{
		"  assertTaggedUnionBranch,\n",
		"export function decodeTrajectoryEvent(value: unknown): TrajectoryEvent {",
		"const result: TrajectoryEvent = {",
		"assertTaggedUnionBranch(\"TrajectoryEvent\", result.kind, {",
		"\"turn_started\": result.turnStarted,",
		"\"approval_requested\": result.approvalRequested,",
		"return result;",
	} {
		if !strings.Contains(output, want) {
			t.Fatalf("generated output missing %q:\n%s", want, output)
		}
	}
}

func specNames(specs []interfaceSpec) []string {
	names := make([]string, 0, len(specs))
	for _, spec := range specs {
		names = append(names, spec.Name)
	}
	return names
}

func valueSetContains(specs []valueSetSpec, name string, value string) bool {
	for _, spec := range specs {
		if spec.Name != name {
			continue
		}
		for _, candidate := range spec.Values {
			if candidate == value {
				return true
			}
		}
	}
	return false
}

func contractEndpoint(name string, path string) httpapi.ContractEndpoint {
	return httpapi.ContractEndpoint{
		Name:                  name,
		Method:                "POST",
		Path:                  path,
		Request:               reflect.TypeFor[ContractTestRequest](),
		Response:              reflect.TypeFor[ContractTestResponse](),
		RequestBodyLimitBytes: 1024,
	}
}
