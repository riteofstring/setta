package projectstate

import (
	"context"
	"reflect"
	"testing"
)

type stubCallableSignatureResolver struct {
	result    CallableSignatureResult
	ok        bool
	err       error
	callCount int
}

func (s *stubCallableSignatureResolver) ResolveCallableSignature(
	_ context.Context,
	_ Project,
	_ string,
	_ string,
) (CallableSignatureResult, bool, error) {
	s.callCount++
	return s.result, s.ok, s.err
}

// Clearing a callable should only null the section binding and should not
// disturb the existing code-object graph.
func TestProjectSetCallableClearsCurrentCallable(t *testing.T) {
	t.Parallel()

	project := callableTestProject(t)
	response, err := project.SetCallable(context.Background(), "callable-section", "", true, nil)
	if err != nil {
		t.Fatalf("set callable: %v", err)
	}
	if response.CallableID != nil {
		t.Fatalf("expected callable id to be cleared, got %q", *response.CallableID)
	}
	if len(response.ChildCodeObjs) != 0 {
		t.Fatalf("expected child params to be cleared, got %#v", response.ChildCodeObjs)
	}
	if response.LSPStatus != SignatureHelpStatusSkipped {
		t.Fatalf("expected skipped status, got %q", response.LSPStatus)
	}

	payload, err := project.currentCallableSectionPayload("callable-section")
	if err != nil {
		t.Fatalf("current callable section payload: %v", err)
	}
	if value, present := payload["callable"]; !present || value != nil {
		t.Fatalf("expected callable field to be null, got %#v", payload["callable"])
	}
}

// Re-selecting a previously known callable without refetch should just point
// the section back at that code object and avoid an LSP request.
func TestProjectSetCallableReusesPreviousSelectionWithoutRefetch(t *testing.T) {
	t.Parallel()

	project := callableTestProject(t)
	resolver := &stubCallableSignatureResolver{
		ok: true,
		result: CallableSignatureResult{
			Status: SignatureHelpStatusMatched,
		},
	}

	response, err := project.SetCallable(context.Background(), "callable-section", "sorted", false, resolver)
	if err != nil {
		t.Fatalf("set callable: %v", err)
	}
	if response.CallableID == nil || *response.CallableID != "callable-2" {
		t.Fatalf("expected callable-2 response, got %#v", response.CallableID)
	}
	if resolver.callCount != 0 {
		t.Fatalf("expected no resolver call, got %d", resolver.callCount)
	}
	if response.LSPStatus != SignatureHelpStatusSkipped {
		t.Fatalf("expected skipped status, got %q", response.LSPStatus)
	}
}

// A matched signature should create or update the callable binding, preserve
// existing child values by name, and replace the callable child order.
func TestProjectSetCallableAppliesMatchedSignatureAndPreservesExistingValues(t *testing.T) {
	t.Parallel()

	project := callableTestProject(t)
	resolver := &stubCallableSignatureResolver{
		ok: true,
		result: CallableSignatureResult{
			Documentation: "Sort values.",
			Status:        SignatureHelpStatusMatched,
			Params: []CallableParamProposal{
				{
					Name:           "iterable",
					Description:    "Values to sort.",
					PassingStyle:   "POSITIONAL_ONLY",
					TypeAnnotation: "list[int]",
				},
				{
					Name:         "reverse",
					DefaultValue: "False",
					Description:  "Descending order flag.",
					PassingStyle: "KEYWORD_ONLY",
				},
			},
		},
	}

	response, err := project.SetCallable(context.Background(), "callable-section", "sorted", true, resolver)
	if err != nil {
		t.Fatalf("set callable: %v", err)
	}
	if resolver.callCount != 1 {
		t.Fatalf("expected one resolver call, got %d", resolver.callCount)
	}
	if response.CallableID == nil || *response.CallableID != "callable-2" {
		t.Fatalf("expected callable-2 response, got %#v", response.CallableID)
	}
	if response.LSPStatus != SignatureHelpStatusMatched {
		t.Fatalf("expected matched status, got %q", response.LSPStatus)
	}
	if len(response.ChildCodeObjs) != 2 {
		t.Fatalf("expected two child params, got %#v", response.ChildCodeObjs)
	}
	if response.ChildCodeObjs[0].CodeObjID != "param-existing" {
		t.Fatalf("expected existing param first, got %#v", response.ChildCodeObjs)
	}

	callablePayload, _, _, _, err := project.resolveCurrentCodeObjectContext("callable-section", "callable-2")
	if err != nil {
		t.Fatalf("resolve callable payload: %v", err)
	}
	children := payloadStringArrayField(callablePayload, "children")
	if len(children) != 2 || children[0] != "param-existing" {
		t.Fatalf("unexpected callable children %#v", children)
	}

	existingPayload, _, _, _, err := project.resolveCurrentCodeObjectContext("callable-section", "param-existing")
	if err != nil {
		t.Fatalf("resolve existing param payload: %v", err)
	}
	if got := payloadRawStringField(existingPayload, "value"); got != "user_value" {
		t.Fatalf("expected preserved param value user_value, got %q", got)
	}
	if got := payloadStringField(existingPayload, "typeAnnotation"); got != "list[int]" {
		t.Fatalf("expected updated type annotation, got %q", got)
	}

	newParamID := response.ChildCodeObjs[1].CodeObjID
	newPayload, _, _, _, err := project.resolveCurrentCodeObjectContext("callable-section", newParamID)
	if err != nil {
		t.Fatalf("resolve new param payload: %v", err)
	}
	if got := payloadStringField(newPayload, "defaultVal"); got != "False" {
		t.Fatalf("expected default value False, got %q", got)
	}
	newParamCore := project.CodeObjs[newParamID]
	newParamVariantID := newParamCore.DefaultVariantID
	if newParamVariantID == "" {
		t.Fatalf("expected new param %q to have a default variant", newParamID)
	}
	newParamVariant := project.CodeObjVariants[newParamVariantID]
	if !reflect.DeepEqual(newParamVariant.NonPresetImplIDs, []string{newParamVariant.ImplID}) {
		t.Fatalf(
			"expected new param variant to expose its current impl as non-preset, got %#v",
			newParamVariant.NonPresetImplIDs,
		)
	}
}

// When the signature path is unavailable, the mutation should stay skipped so
// we do not guess param structure without a source-of-truth document.
func TestProjectSetCallableSkipsWhenSignatureContextUnavailable(t *testing.T) {
	t.Parallel()

	project := callableTestProject(t)
	resolver := &stubCallableSignatureResolver{ok: false}

	response, err := project.SetCallable(context.Background(), "callable-section", "brand_new", true, resolver)
	if err != nil {
		t.Fatalf("set callable: %v", err)
	}
	if response.CallableID == nil || *response.CallableID != "callable-1" {
		t.Fatalf("expected original callable to remain selected, got %#v", response.CallableID)
	}
	if response.LSPStatus != SignatureHelpStatusSkipped {
		t.Fatalf("expected skipped status, got %q", response.LSPStatus)
	}
}

func callableTestProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant-1",
		},
		Sections: map[string]Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "CallSection",
				VariantIDs:       []string{"callable-variant-1"},
				DefaultVariantID: "callable-variant-1",
				UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
			},
		},
		SectionVariants: map[string]SectionVariant{
			"callable-variant-1": {
				ID:     "callable-variant-1",
				ImplID: "callable-impl-1",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"callable-impl-1": {
				ID:   "callable-impl-1",
				Kind: SectionKind("callable"),
				Payload: RawJSON(`{
					"id":"callable-impl-1",
					"type":"Callable",
					"callable":"callable-1",
					"codeObjVariantMap":{
						"callable-1":"callable-variant-a",
						"callable-2":"callable-variant-b",
						"param-existing":"param-variant-existing"
					}
				}`),
			},
		},
		CodeObjs: map[string]CodeObject{
			"callable-1": {
				ID:               "callable-1",
				Name:             "existing_callable",
				VariantIDs:       []string{"callable-variant-a"},
				DefaultVariantID: "callable-variant-a",
			},
			"callable-2": {
				ID:               "callable-2",
				Name:             "sorted",
				VariantIDs:       []string{"callable-variant-b"},
				DefaultVariantID: "callable-variant-b",
			},
			"param-existing": {
				ID:               "param-existing",
				Name:             "iterable",
				VariantIDs:       []string{"param-variant-existing"},
				DefaultVariantID: "param-variant-existing",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"callable-variant-a": {
				ID:     "callable-variant-a",
				ImplID: "callable-impl-a",
			},
			"callable-variant-b": {
				ID:     "callable-variant-b",
				ImplID: "callable-impl-b",
			},
			"param-variant-existing": {
				ID:     "param-variant-existing",
				ImplID: "param-impl-existing",
			},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"callable-impl-a": {
				ID:      "callable-impl-a",
				Type:    "CodeCallable",
				Payload: RawJSON(`{"id":"callable-impl-a","type":"CodeCallable","children":[]}`),
			},
			"callable-impl-b": {
				ID:      "callable-impl-b",
				Type:    "CodeCallable",
				Payload: RawJSON(`{"id":"callable-impl-b","type":"CodeCallable","children":["param-existing"]}`),
			},
			"param-impl-existing": {
				ID:      "param-impl-existing",
				Type:    "CodeParam",
				Payload: RawJSON(`{"id":"param-impl-existing","type":"CodeParam","value":"user_value","passingStyle":"DEFAULT"}`),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize callable test project: %v", err)
	}
	return project
}
