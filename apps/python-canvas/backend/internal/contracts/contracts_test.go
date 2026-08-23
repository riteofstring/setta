package contracts

import (
	"errors"
	"fmt"
	"testing"
)

func TestProjectSnapshotV2ValidateAcceptsDynamicNestedRecords(t *testing.T) {
	snapshot := snapshotWithCallableForTest()

	if err := snapshot.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestProjectSnapshotV2ValidateAcceptsUnannotatedProviderMetadata(t *testing.T) {
	snapshot := snapshotWithCallableForTest()
	snapshot.Callables[0].Parameters[0].TypeAnnotation = nil

	if err := snapshot.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestProjectSnapshotV2ValidateDiagnosticsFreshness(t *testing.T) {
	settled := FixtureProjectSnapshotV2()
	settled.Diagnostics = []DiagnosticV2{{
		ID:       "diagnostic:settled",
		Severity: DiagnosticSeverityInformationV2,
		Message:  "Settled diagnostics.",
		Start:    0,
		End:      0,
		TargetID: nil,
	}}
	if err := settled.Validate(); err != nil {
		t.Fatalf("Validate() settled snapshot error = %v", err)
	}

	lagging := FixtureProjectSnapshotV2()
	lagging.Project.Revision++
	if err := lagging.Validate(); err != nil {
		t.Fatalf("Validate() lagging empty diagnostics error = %v", err)
	}

	for _, test := range []struct {
		name   string
		change func(*ProjectSnapshotV2)
		field  string
	}{
		{
			name: "negative diagnostics revision",
			change: func(snapshot *ProjectSnapshotV2) {
				snapshot.DiagnosticsRevision = -1
			},
			field: "diagnosticsRevision",
		},
		{
			name: "diagnostics revision ahead of project",
			change: func(snapshot *ProjectSnapshotV2) {
				snapshot.DiagnosticsRevision = snapshot.Project.Revision + 1
			},
			field: "diagnosticsRevision",
		},
		{
			name: "lagging diagnostics are stale",
			change: func(snapshot *ProjectSnapshotV2) {
				snapshot.Project.Revision++
				snapshot.Diagnostics = []DiagnosticV2{{
					ID:       "diagnostic:stale",
					Severity: DiagnosticSeverityInformationV2,
					Message:  "Stale diagnostics.",
					Start:    0,
					End:      0,
					TargetID: nil,
				}}
			},
			field: "diagnostics",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			snapshot := FixtureProjectSnapshotV2()
			test.change(&snapshot)
			var validationError ValidationError
			if !errors.As(snapshot.Validate(), &validationError) {
				t.Fatalf("Validate() accepted an invalid diagnostics snapshot: %#v", snapshot)
			}
			if validationError.Field != test.field {
				t.Fatalf("ValidationError.Field = %q, want %q", validationError.Field, test.field)
			}
		})
	}
}

func TestProjectSnapshotV2ValidateRejectsUnsupportedAndIncoherentNestedMetadata(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*ProjectSnapshotV2)
		field  string
	}{
		{
			name: "unsupported version",
			change: func(snapshot *ProjectSnapshotV2) {
				snapshot.Version = "v1"
			},
			field: "version",
		},
		{
			name: "duplicate provider ordinal",
			change: func(snapshot *ProjectSnapshotV2) {
				ordinal := 0
				snapshot.Callables[0].Parameters = append(snapshot.Callables[0].Parameters, ParameterV2{
					ID:                 "parameter:other",
					Name:               "other",
					NameEditable:       false,
					PassingStyle:       ParameterPassingStylePositionalOrKeywordV2,
					TypeAnnotation:     stringPointerForTest("int"),
					ProviderOrdinal:    &ordinal,
					AuthoredExpression: "other",
					UI:                 codeParameterUIForTest(),
				})
			},
			field: callableParameterField(0, 2, "providerOrdinal"),
		},
		{
			name: "app authored provider metadata",
			change: func(snapshot *ProjectSnapshotV2) {
				snapshot.Callables[0].Parameters[1].Default = stringPointerForTest("1")
			},
			field: callableParameterField(0, 1, ""),
		},
		{
			name: "generated range does not cover body",
			change: func(snapshot *ProjectSnapshotV2) {
				snapshot.GeneratedCode.GeneratedBodyRange.End--
			},
			field: "generatedCode.generatedBodyRange",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			snapshot := snapshotWithCallableForTest()
			test.change(&snapshot)

			var validationError ValidationError
			if !errors.As(snapshot.Validate(), &validationError) {
				t.Fatalf("Validate() accepted an invalid snapshot: %#v", snapshot)
			}
			if validationError.Field != test.field {
				t.Fatalf("ValidationError.Field = %q, want %q", validationError.Field, test.field)
			}
		})
	}
}

func TestV2MutationsRequireExpectedRevision(t *testing.T) {
	for _, request := range []struct {
		name  string
		value interface{ Validate() error }
	}{
		{"rename project", RenameProjectRequestV2{ProjectID: "project:test", Name: "Renamed"}},
		{"create callable", CreateCallableRequestV2{ProjectID: "project:test", Name: "Callable"}},
		{"rename callable", RenameCallableRequestV2{ProjectID: "project:test", Name: "Callable"}},
		{"delete callable", DeleteCallableRequestV2{ProjectID: "project:test"}},
		{"commit callable", CommitCallableRequestV2{ProjectID: "project:test", AuthoredExpression: "value"}},
		{"refresh callable parameters", RefreshCallableParametersRequestV2{ProjectID: "project:test"}},
		{"parameters", SetCallableParametersRequestV2{ProjectID: "project:test", Parameters: []ParameterProposalV2{}}},
		{"target", SetPythonTargetRequestV2{ProjectID: "project:test"}},
	} {
		t.Run(request.name, func(t *testing.T) {
			var validationError ValidationError
			if !errors.As(request.value.Validate(), &validationError) {
				t.Fatalf("Validate() accepted an unbound mutation: %#v", request.value)
			}
			if validationError.Field != "expectedRevision" {
				t.Fatalf("ValidationError.Field = %q, want expectedRevision", validationError.Field)
			}
		})
	}
}

func TestTerminalContractUsesPositiveSizesAndClosedControlFrames(t *testing.T) {
	if err := (OpenTerminalRequestV2{ProjectID: "project:terminal", Columns: 80, Rows: 24}).Validate(); err != nil {
		t.Fatalf("validate terminal open request: %v", err)
	}
	if err := (TerminalStreamReadyV2{Type: TerminalStreamReadyTypeV2}).Validate(); err != nil {
		t.Fatalf("validate terminal ready frame: %v", err)
	}
	if err := (TerminalStreamResizeV2{Type: TerminalStreamResizeTypeV2, Columns: 80, Rows: 24}).Validate(); err != nil {
		t.Fatalf("validate terminal resize frame: %v", err)
	}

	for _, value := range []interface{ Validate() error }{
		OpenTerminalRequestV2{ProjectID: "project:terminal", Columns: 0, Rows: 24},
		RunTerminalRequestV2{ProjectID: "project:terminal", ExpectedRevision: 0, Columns: 80, Rows: 24},
		TerminalTicketV2{Ticket: " "},
		TerminalStreamReadyV2{Type: "unexpected"},
		TerminalStreamResizeV2{Type: TerminalStreamReadyTypeV2, Columns: 80, Rows: 24},
	} {
		if err := value.Validate(); err == nil {
			t.Fatalf("terminal contract accepted invalid value %#v", value)
		}
	}
}

func snapshotWithCallableForTest() ProjectSnapshotV2 {
	snapshot := FixtureProjectSnapshotV2()
	ordinal := 0
	defaultExpression := "1"
	snapshot.Callables = []CallableV2{{
		ID:                 "callable:one",
		Name:               "One",
		AuthoredExpression: "value",
		Parameters: []ParameterV2{
			{
				ID:                 "parameter:value",
				Name:               "value",
				NameEditable:       false,
				PassingStyle:       ParameterPassingStylePositionalOrKeywordV2,
				TypeAnnotation:     stringPointerForTest("float"),
				Default:            &defaultExpression,
				ProviderOrdinal:    &ordinal,
				AuthoredExpression: "value",
				UI:                 codeParameterUIForTest(),
			},
			{
				ID:                 "parameter:scale",
				Name:               "scale",
				NameEditable:       true,
				PassingStyle:       ParameterPassingStylePositionalOrKeywordV2,
				TypeAnnotation:     nil,
				Default:            nil,
				ProviderOrdinal:    nil,
				AuthoredExpression: "1",
				UI:                 codeParameterUIForTest(),
			},
		},
	}}
	snapshot.TopLevelSectionIDs = []string{"callable:one"}
	return snapshot
}

func codeParameterUIForTest() ParameterUIV2 {
	return ParameterUIV2{
		Type:          ParameterUITypeCodeV2,
		Configuration: []byte(`{"disabled":false,"language":"python","placeholder":null,"singleLine":true,"wrapLines":true}`),
	}
}

func nestedParameterUIForTest() ParameterUIV2 {
	return ParameterUIV2{
		Type:          ParameterUITypeNestedV2,
		Configuration: []byte(`{}`),
	}
}

func stringPointerForTest(value string) *string {
	return &value
}

func callableParameterField(callableIndex int, parameterIndex int, field string) string {
	result := fmt.Sprintf("callables[%d].parameters[%d]", callableIndex, parameterIndex)
	if field == "" {
		return result
	}
	return result + "." + field
}
