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
