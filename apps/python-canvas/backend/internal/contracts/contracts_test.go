package contracts

import (
	"errors"
	"testing"
)

func TestProjectSnapshotV1ValidateAcceptsNormalizedDocument(t *testing.T) {
	defaultExpression := "0"
	snapshot := ProjectSnapshotV1{
		Version: ProjectSnapshotVersionV1,
		Project: ProjectV1{
			ID:       "project:test",
			Revision: 1,
		},
		PythonTarget: PythonTargetV1{
			Prefix: "import math",
			Suffix: "state = SettaState()",
		},
		Callables: []CallableV1{{
			ID:                 "callable:square-root",
			Name:               "Square Root",
			AuthoredExpression: "math.sqrt(value)",
			ParameterIDs:       []string{"parameter:value"},
		}},
		Parameters: []ParameterV1{{
			ID:                 "parameter:value",
			Name:               "value",
			PassingStyle:       ParameterPassingStylePositionalOrKeywordV1,
			TypeAnnotation:     "float",
			Default:            &defaultExpression,
			AuthoredExpression: "value",
		}},
		GeneratedCode: GeneratedCodeV1{
			Code: "import math\nmath.sqrt(value)\nstate = SettaState()",
			Body: "math.sqrt(value)",
			SourceRanges: []GeneratedSourceRangeV1{{
				TargetID: "callable:square-root",
				Start:    12,
				End:      28,
			}},
		},
		Diagnostics: []DiagnosticV1{{
			ID:       "diagnostic:value",
			Severity: DiagnosticSeverityWarningV1,
			Message:  "example diagnostic",
			TargetID: "parameter:value",
		}},
		ProviderStatus: ProviderStatusV1{
			Provider: ProviderBasedpyrightV1,
			Status:   ProviderAvailabilityUnavailableV1,
			State:    ProviderLifecycleStateNotStartedV1,
		},
	}

	if err := snapshot.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestProjectSnapshotV1ValidateRejectsUnsupportedVersion(t *testing.T) {
	snapshot := validSnapshotForTest()
	snapshot.Version = "v2"

	err := snapshot.Validate()
	var versionError UnsupportedVersionError
	if !errors.As(err, &versionError) {
		t.Fatalf("Validate() error = %T %v, want UnsupportedVersionError", err, err)
	}
	if versionError.Version != "v2" {
		t.Fatalf("UnsupportedVersionError.Version = %q, want v2", versionError.Version)
	}
}

func TestProjectSnapshotV1ValidateRequiresExactlyOneCallable(t *testing.T) {
	for _, test := range []struct {
		name      string
		callables []CallableV1
	}{
		{
			name:      "none",
			callables: []CallableV1{},
		},
		{
			name: "multiple",
			callables: []CallableV1{
				{
					ID:                 "callable:square-root",
					Name:               "Square Root",
					AuthoredExpression: "",
					ParameterIDs:       []string{},
				},
				{
					ID:                 "callable:other",
					Name:               "Other",
					AuthoredExpression: "",
					ParameterIDs:       []string{},
				},
			},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			snapshot := validSnapshotForTest()
			snapshot.Callables = test.callables

			err := snapshot.Validate()
			var validationError ValidationError
			if !errors.As(err, &validationError) {
				t.Fatalf("Validate() error = %T %v, want ValidationError", err, err)
			}
			if validationError.Field != "callables" || validationError.Problem != "must contain exactly one callable" {
				t.Fatalf("ValidationError = %#v", validationError)
			}
		})
	}
}

func TestProjectSnapshotV1ValidateRequiresStableDiagnosticTarget(t *testing.T) {
	snapshot := validSnapshotForTest()
	snapshot.Diagnostics = []DiagnosticV1{{
		ID:       "diagnostic:unknown-target",
		Severity: DiagnosticSeverityErrorV1,
		Message:  "unknown target",
		TargetID: "callable:missing",
	}}

	err := snapshot.Validate()
	var validationError ValidationError
	if !errors.As(err, &validationError) {
		t.Fatalf("Validate() error = %T %v, want ValidationError", err, err)
	}
	if validationError.Field != "diagnostics[0].targetId" {
		t.Fatalf("ValidationError.Field = %q", validationError.Field)
	}
}

func TestProviderStatusV1ValidateAcceptsExplicitLSPStates(t *testing.T) {
	for _, status := range []ProviderStatusV1{
		{
			Provider: ProviderBasedpyrightV1,
			Status:   ProviderAvailabilityAvailableV1,
			State:    ProviderLifecycleStateReadyV1,
		},
		{
			Provider: ProviderBasedpyrightV1,
			Status:   ProviderAvailabilityAvailableV1,
			State:    ProviderLifecycleStatePendingV1,
		},
		{
			Provider: ProviderBasedpyrightV1,
			Status:   ProviderAvailabilityUnavailableV1,
			State:    ProviderLifecycleStateFailedV1,
		},
	} {
		if err := status.Validate(); err != nil {
			t.Fatalf("ProviderStatusV1.Validate(%#v) error = %v", status, err)
		}
	}
}

func TestCallableCompletionV1ContractsValidateOnlyTheDeclaredRequestAndResponseFields(t *testing.T) {
	request := CallableCompletionRequestV1{
		ProjectID:          "project:test",
		SectionID:          "callable:test",
		AuthoredExpression: "math.sq",
		CursorOffsetUTF16:  7,
	}
	if err := request.Validate(); err != nil {
		t.Fatalf("CallableCompletionRequestV1.Validate() error = %v", err)
	}
	if err := (CallableCompletionRequestV1{ProjectID: "project:test", SectionID: "callable:test", CursorOffsetUTF16: -1}).Validate(); err == nil {
		t.Fatal("CallableCompletionRequestV1.Validate() error = nil for a negative UTF-16 offset")
	}

	response := CallableCompletionResponseV1{Items: []CallableCompletionItemV1{{
		Label:      "sqrt",
		InsertText: "sqrt",
	}}}
	if err := response.Validate(); err != nil {
		t.Fatalf("CallableCompletionResponseV1.Validate() error = %v", err)
	}
	if err := (CallableCompletionResponseV1{Items: []CallableCompletionItemV1{{Label: "sqrt"}}}).Validate(); err == nil {
		t.Fatal("CallableCompletionResponseV1.Validate() error = nil for a blank insertion text")
	}
}

func TestProjectSnapshotV1AcceptsAnUnnamedAuthoredParameterButNotAPaddedName(t *testing.T) {
	// A record whose name has not been written yet is ordinary canonical state: the
	// renderer omits it until it has one.
	snapshot := validSnapshotForTest()
	snapshot.Callables[0].AuthoredExpression = "math.sqrt"
	snapshot.Callables[0].ParameterIDs = []string{"parameter:authored:1"}
	snapshot.Parameters = []ParameterV1{{
		ID:           "parameter:authored:1",
		Name:         "",
		NameEditable: true,
		PassingStyle: ParameterPassingStylePositionalOrKeywordV1,
	}}
	if err := snapshot.Validate(); err != nil {
		t.Fatalf("Validate() error = %v for a blank authored parameter name", err)
	}

	snapshot.Parameters[0].Name = " scale "
	err := snapshot.Validate()
	var validationError ValidationError
	if !errors.As(err, &validationError) ||
		validationError.Field != "parameters[0].name" ||
		validationError.Problem != "must not include surrounding whitespace" {
		t.Fatalf("Validate() error = %#v, want a padded-name failure", err)
	}
}

func TestSetCallableParametersRequestV1ValidatesItsCompleteCandidate(t *testing.T) {
	request := SetCallableParametersRequestV1{
		ProjectID:        "project:test",
		CallableID:       "callable:square-root",
		ExpectedRevision: 2,
		Parameters: []ParameterProposalV1{
			{ID: "parameter:square-root:1", Name: "x", AuthoredExpression: "3"},
			{ID: "parameter:authored:1", Name: "", AuthoredExpression: ""},
		},
	}
	if err := request.Validate(); err != nil {
		t.Fatalf("SetCallableParametersRequestV1.Validate() error = %v", err)
	}

	for _, test := range []struct {
		name    string
		request SetCallableParametersRequestV1
	}{
		{name: "missing callable", request: SetCallableParametersRequestV1{ProjectID: "project:test", ExpectedRevision: 2, Parameters: []ParameterProposalV1{}}},
		{name: "unbound revision", request: SetCallableParametersRequestV1{ProjectID: "project:test", CallableID: "callable:square-root", Parameters: []ParameterProposalV1{}}},
		{name: "absent list", request: SetCallableParametersRequestV1{ProjectID: "project:test", CallableID: "callable:square-root", ExpectedRevision: 2}},
		{
			name: "blank record id",
			request: SetCallableParametersRequestV1{
				ProjectID:        "project:test",
				CallableID:       "callable:square-root",
				ExpectedRevision: 2,
				Parameters:       []ParameterProposalV1{{ID: " ", Name: "x"}},
			},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			if err := test.request.Validate(); err == nil {
				t.Fatalf("SetCallableParametersRequestV1.Validate() error = nil for %s", test.name)
			}
		})
	}
}

func validSnapshotForTest() ProjectSnapshotV1 {
	return ProjectSnapshotV1{
		Version: ProjectSnapshotVersionV1,
		Project: ProjectV1{
			ID:       "project:test",
			Revision: 1,
		},
		PythonTarget: PythonTargetV1{
			Prefix: "import math",
			Suffix: "state = SettaState()",
		},
		Callables: []CallableV1{{
			ID:                 "callable:square-root",
			Name:               "Square Root",
			AuthoredExpression: "",
			ParameterIDs:       []string{},
		}},
		Parameters: []ParameterV1{},
		GeneratedCode: GeneratedCodeV1{
			Code:         "import math\n\nstate = SettaState()",
			Body:         "",
			SourceRanges: []GeneratedSourceRangeV1{},
		},
		Diagnostics: []DiagnosticV1{},
		ProviderStatus: ProviderStatusV1{
			Provider: ProviderBasedpyrightV1,
			Status:   ProviderAvailabilityUnavailableV1,
			State:    ProviderLifecycleStateNotStartedV1,
		},
	}
}
