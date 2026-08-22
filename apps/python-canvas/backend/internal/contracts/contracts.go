// Package contracts owns the V1 transport contract for Python Canvas.
package contracts

import (
	"fmt"
	"strings"
)

const (
	ProjectSnapshotVersionV1         = "v1"
	ProjectPathV1                    = "/api/v1/project"
	ProjectCallablePathV1            = "/api/v1/project/callable"
	ProjectCallableCompletionsPathV1 = "/api/v1/project/callable/completions"
	ProjectParametersPathV1          = "/api/v1/project/parameters"
	ProjectTargetPathV1              = "/api/v1/project/target"
)

// ProjectSnapshotV1 is the complete, normalized project document returned by
// the V1 project endpoint.
type ProjectSnapshotV1 struct {
	Version        string           `json:"version"`
	Project        ProjectV1        `json:"project"`
	PythonTarget   PythonTargetV1   `json:"pythonTarget"`
	Callables      []CallableV1     `json:"callables"`
	Parameters     []ParameterV1    `json:"parameters"`
	GeneratedCode  GeneratedCodeV1  `json:"generatedCode"`
	Diagnostics    []DiagnosticV1   `json:"diagnostics"`
	ProviderStatus ProviderStatusV1 `json:"providerStatus"`
}

type ProjectV1 struct {
	ID       string `json:"id"`
	Revision int    `json:"revision"`
}

type PythonTargetV1 struct {
	Prefix string `json:"prefix"`
	Suffix string `json:"suffix"`
}

type CallableV1 struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	AuthoredExpression string   `json:"authoredExpression"`
	ParameterIDs       []string `json:"parameterIds"`
}

type ParameterPassingStyleV1 string

const (
	ParameterPassingStylePositionalOnlyV1      ParameterPassingStyleV1 = "positional_only"
	ParameterPassingStylePositionalOrKeywordV1 ParameterPassingStyleV1 = "positional_or_keyword"
	ParameterPassingStyleKeywordOnlyV1         ParameterPassingStyleV1 = "keyword_only"
	ParameterPassingStyleVariadicPositionalV1  ParameterPassingStyleV1 = "variadic_positional"
	ParameterPassingStyleVariadicKeywordV1     ParameterPassingStyleV1 = "variadic_keyword"
)

type ParameterV1 struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Whether this record's name belongs to the app rather than to the resolved
	// signature. The client never infers renameability from anything else.
	NameEditable       bool                    `json:"nameEditable"`
	PassingStyle       ParameterPassingStyleV1 `json:"passingStyle"`
	TypeAnnotation     string                  `json:"typeAnnotation"`
	Default            *string                 `json:"default"`
	AuthoredExpression string                  `json:"authoredExpression"`
}

type GeneratedCodeV1 struct {
	Code         string                   `json:"code"`
	Body         string                   `json:"body"`
	SourceRanges []GeneratedSourceRangeV1 `json:"sourceRanges"`
}

// GeneratedSourceRangeV1 uses byte offsets into GeneratedCodeV1.Code.
type GeneratedSourceRangeV1 struct {
	TargetID string `json:"targetId"`
	Start    int    `json:"start"`
	End      int    `json:"end"`
}

type DiagnosticSeverityV1 string

const (
	DiagnosticSeverityErrorV1       DiagnosticSeverityV1 = "error"
	DiagnosticSeverityWarningV1     DiagnosticSeverityV1 = "warning"
	DiagnosticSeverityInformationV1 DiagnosticSeverityV1 = "information"
)

type DiagnosticV1 struct {
	ID       string               `json:"id"`
	Severity DiagnosticSeverityV1 `json:"severity"`
	Message  string               `json:"message"`
	TargetID string               `json:"targetId"`
}

type ProviderV1 string

const ProviderBasedpyrightV1 ProviderV1 = "basedpyright"

type ProviderAvailabilityV1 string

const (
	ProviderAvailabilityAvailableV1   ProviderAvailabilityV1 = "available"
	ProviderAvailabilityUnavailableV1 ProviderAvailabilityV1 = "unavailable"
)

type ProviderLifecycleStateV1 string

const (
	ProviderLifecycleStateNotStartedV1 ProviderLifecycleStateV1 = "not_started"
	ProviderLifecycleStateReadyV1      ProviderLifecycleStateV1 = "ready"
	ProviderLifecycleStatePendingV1    ProviderLifecycleStateV1 = "pending"
	ProviderLifecycleStateFailedV1     ProviderLifecycleStateV1 = "failed"
)

type ProviderStatusV1 struct {
	Provider ProviderV1               `json:"provider"`
	Status   ProviderAvailabilityV1   `json:"status"`
	State    ProviderLifecycleStateV1 `json:"state"`
}

// CommitCallableRequestV1 carries the authored callable expression through
// the V1 mutation boundary. The project package owns semantic validation.
type CommitCallableRequestV1 struct {
	ProjectID          string `json:"projectId"`
	SectionID          string `json:"sectionId"`
	AuthoredExpression string `json:"authoredExpression"`
}

func (request CommitCallableRequestV1) Validate() error {
	if err := requireRequestID("projectId", request.ProjectID); err != nil {
		return err
	}
	return requireRequestID("sectionId", request.SectionID)
}

// CallableCompletionRequestV1 describes one read-only query for the current
// uncommitted callable draft. CursorOffsetUTF16 uses JavaScript string offsets.
type CallableCompletionRequestV1 struct {
	ProjectID          string `json:"projectId"`
	SectionID          string `json:"sectionId"`
	AuthoredExpression string `json:"authoredExpression"`
	CursorOffsetUTF16  int    `json:"cursorOffsetUtf16"`
}

func (request CallableCompletionRequestV1) Validate() error {
	if err := requireRequestID("projectId", request.ProjectID); err != nil {
		return err
	}
	if err := requireRequestID("sectionId", request.SectionID); err != nil {
		return err
	}
	if request.CursorOffsetUTF16 < 0 {
		return ValidationError{Field: "cursorOffsetUtf16", Problem: "must not be negative"}
	}
	return nil
}

type CallableCompletionItemV1 struct {
	Label      string `json:"label"`
	InsertText string `json:"insertText"`
}

type CallableCompletionResponseV1 struct {
	Items []CallableCompletionItemV1 `json:"items"`
}

func (response CallableCompletionResponseV1) Validate() error {
	if response.Items == nil {
		return ValidationError{Field: "items", Problem: "must be an array"}
	}
	for index, item := range response.Items {
		if strings.TrimSpace(item.Label) == "" {
			return ValidationError{Field: fmt.Sprintf("items[%d].label", index), Problem: "must not be empty"}
		}
		if strings.TrimSpace(item.InsertText) == "" {
			return ValidationError{Field: fmt.Sprintf("items[%d].insertText", index), Problem: "must not be empty"}
		}
	}
	return nil
}

// ParameterProposalV1 is one record in a proposed parameter list. Backend-owned
// metadata never crosses this boundary: the store keeps it for a retained ID and
// creates it for a new one.
type ParameterProposalV1 struct {
	ID                 string `json:"id"`
	Name               string `json:"name"`
	AuthoredExpression string `json:"authoredExpression"`
}

// SetCallableParametersRequestV1 carries one callable's complete proposed
// parameter list, bound to the revision the client last saw. Reordering,
// renaming, editing, adding, and deleting are all this one request.
type SetCallableParametersRequestV1 struct {
	ProjectID        string                `json:"projectId"`
	CallableID       string                `json:"callableId"`
	ExpectedRevision int                   `json:"expectedRevision"`
	Parameters       []ParameterProposalV1 `json:"parameters"`
}

func (request SetCallableParametersRequestV1) Validate() error {
	if err := requireRequestID("projectId", request.ProjectID); err != nil {
		return err
	}
	if err := requireRequestID("callableId", request.CallableID); err != nil {
		return err
	}
	if request.ExpectedRevision < 1 {
		return ValidationError{Field: "expectedRevision", Problem: "must be at least 1"}
	}
	if request.Parameters == nil {
		return ValidationError{Field: "parameters", Problem: "must be an array"}
	}
	for index, parameter := range request.Parameters {
		if err := requireRequestID(fmt.Sprintf("parameters[%d].id", index), parameter.ID); err != nil {
			return err
		}
	}
	return nil
}

// SetPythonTargetRequestV1 carries the complete authored Python around the generated
// body, bound to the revision the client last saw. The generated body is never part of
// it: the store renders that from its own canonical state.
type SetPythonTargetRequestV1 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
	Prefix           string `json:"prefix"`
	Suffix           string `json:"suffix"`
}

func (request SetPythonTargetRequestV1) Validate() error {
	if err := requireRequestID("projectId", request.ProjectID); err != nil {
		return err
	}
	if request.ExpectedRevision < 1 {
		return ValidationError{Field: "expectedRevision", Problem: "must be at least 1"}
	}
	return nil
}

type APIErrorCodeV1 string

const (
	APIErrorCodeInvalidRequestV1             APIErrorCodeV1 = "invalid_request"
	APIErrorCodeMethodNotAllowedV1           APIErrorCodeV1 = "method_not_allowed"
	APIErrorCodeNotFoundV1                   APIErrorCodeV1 = "not_found"
	APIErrorCodeInvalidCallableV1            APIErrorCodeV1 = "invalid_callable"
	APIErrorCodeInvalidParameterExpressionV1 APIErrorCodeV1 = "invalid_parameter_expression"
	APIErrorCodeInvalidParameterNameV1       APIErrorCodeV1 = "invalid_parameter_name"
	APIErrorCodeInvalidPythonTargetV1        APIErrorCodeV1 = "invalid_python_target"
	APIErrorCodeRevisionConflictV1           APIErrorCodeV1 = "revision_conflict"
	APIErrorCodeUnsupportedSignatureV1       APIErrorCodeV1 = "unsupported_signature"
	APIErrorCodeProviderUnavailableV1        APIErrorCodeV1 = "provider_unavailable"
	APIErrorCodeInternalV1                   APIErrorCodeV1 = "internal"
)

type APIErrorV1 struct {
	Code    APIErrorCodeV1 `json:"code"`
	Message string         `json:"message"`
}

type ErrorResponseV1 struct {
	Error APIErrorV1 `json:"error"`
}

// UnsupportedVersionError is returned whenever a document is not the V1
// document this package owns.
type UnsupportedVersionError struct {
	Version string
}

func (err UnsupportedVersionError) Error() string {
	return fmt.Sprintf("unsupported project snapshot version %q", err.Version)
}

// ValidationError identifies an invalid field in a V1 document.
type ValidationError struct {
	Field   string
	Problem string
}

func (err ValidationError) Error() string {
	return fmt.Sprintf("invalid project snapshot V1 %s: %s", err.Field, err.Problem)
}

// Validate accepts only the current V1 document shape. It intentionally does
// not interpret, migrate, or alias earlier or later shapes.
func (snapshot ProjectSnapshotV1) Validate() error {
	if err := snapshot.validateDocumentShape(); err != nil {
		return err
	}
	return snapshot.validateDocumentContents()
}

func (snapshot ProjectSnapshotV1) validateDocumentShape() error {
	if snapshot.Version != ProjectSnapshotVersionV1 {
		return UnsupportedVersionError{Version: snapshot.Version}
	}
	if err := requireStableID("project.id", snapshot.Project.ID); err != nil {
		return err
	}
	if snapshot.Project.Revision < 1 {
		return ValidationError{Field: "project.revision", Problem: "must be at least 1"}
	}
	if err := validatePythonTarget(snapshot.PythonTarget); err != nil {
		return err
	}
	if snapshot.Callables == nil {
		return ValidationError{Field: "callables", Problem: "must be an array"}
	}
	if len(snapshot.Callables) != 1 {
		return ValidationError{Field: "callables", Problem: "must contain exactly one callable"}
	}
	if snapshot.Parameters == nil {
		return ValidationError{Field: "parameters", Problem: "must be an array"}
	}
	if snapshot.GeneratedCode.SourceRanges == nil {
		return ValidationError{Field: "generatedCode.sourceRanges", Problem: "must be an array"}
	}
	if snapshot.Diagnostics == nil {
		return ValidationError{Field: "diagnostics", Problem: "must be an array"}
	}
	if err := validateProviderStatus(snapshot.ProviderStatus); err != nil {
		return err
	}
	return nil
}

// Either region may be empty, because a person may delete their imports or their
// trailing statements outright. Neither may carry a byte Python source cannot hold.
func validatePythonTarget(target PythonTargetV1) error {
	if strings.ContainsRune(target.Prefix, '\x00') {
		return ValidationError{Field: "pythonTarget.prefix", Problem: "must not contain NUL"}
	}
	if strings.ContainsRune(target.Suffix, '\x00') {
		return ValidationError{Field: "pythonTarget.suffix", Problem: "must not contain NUL"}
	}
	return nil
}

func (snapshot ProjectSnapshotV1) validateDocumentContents() error {
	targetIDs := map[string]struct{}{snapshot.Project.ID: {}}
	parameterIDs := make(map[string]struct{}, len(snapshot.Parameters))
	if err := validateParameters(snapshot.Parameters, targetIDs, parameterIDs); err != nil {
		return err
	}
	if err := validateCallables(snapshot.Callables, targetIDs, parameterIDs); err != nil {
		return err
	}
	if err := validateSourceRanges(snapshot.GeneratedCode.SourceRanges, len(snapshot.GeneratedCode.Code), targetIDs); err != nil {
		return err
	}
	return validateDiagnostics(snapshot.Diagnostics, targetIDs)
}

func validateParameters(parameters []ParameterV1, targetIDs map[string]struct{}, parameterIDs map[string]struct{}) error {
	for index, parameter := range parameters {
		field := fmt.Sprintf("parameters[%d]", index)
		if err := requireStableID(field+".id", parameter.ID); err != nil {
			return err
		}
		if _, exists := targetIDs[parameter.ID]; exists {
			return ValidationError{Field: field + ".id", Problem: "must be unique"}
		}
		// A blank name is a record still being authored, which the renderer omits.
		// Surrounding whitespace is not a name a client can have meant.
		if parameter.Name != strings.TrimSpace(parameter.Name) {
			return ValidationError{Field: field + ".name", Problem: "must not include surrounding whitespace"}
		}
		if !isPassingStyleV1(parameter.PassingStyle) {
			return ValidationError{Field: field + ".passingStyle", Problem: "is not supported by V1"}
		}
		targetIDs[parameter.ID] = struct{}{}
		parameterIDs[parameter.ID] = struct{}{}
	}
	return nil
}

func validateCallables(callables []CallableV1, targetIDs map[string]struct{}, parameterIDs map[string]struct{}) error {
	for index, callable := range callables {
		field := fmt.Sprintf("callables[%d]", index)
		if err := requireStableID(field+".id", callable.ID); err != nil {
			return err
		}
		if _, exists := targetIDs[callable.ID]; exists {
			return ValidationError{Field: field + ".id", Problem: "must be unique"}
		}
		if strings.TrimSpace(callable.Name) == "" {
			return ValidationError{Field: field + ".name", Problem: "must not be empty"}
		}
		if callable.ParameterIDs == nil {
			return ValidationError{Field: field + ".parameterIds", Problem: "must be an array"}
		}
		if err := validateCallableParameterIDs(field, callable.ParameterIDs, parameterIDs); err != nil {
			return err
		}
		targetIDs[callable.ID] = struct{}{}
	}
	return nil
}

func validateCallableParameterIDs(field string, ids []string, parameterIDs map[string]struct{}) error {
	seenParameterIDs := make(map[string]struct{}, len(ids))
	for parameterIndex, parameterID := range ids {
		parameterField := fmt.Sprintf("%s.parameterIds[%d]", field, parameterIndex)
		if err := requireStableID(parameterField, parameterID); err != nil {
			return err
		}
		if _, exists := parameterIDs[parameterID]; !exists {
			return ValidationError{Field: parameterField, Problem: "must reference a parameter"}
		}
		if _, exists := seenParameterIDs[parameterID]; exists {
			return ValidationError{Field: parameterField, Problem: "must not be repeated"}
		}
		seenParameterIDs[parameterID] = struct{}{}
	}
	return nil
}

func validateSourceRanges(ranges []GeneratedSourceRangeV1, codeLength int, targetIDs map[string]struct{}) error {
	for index, sourceRange := range ranges {
		field := fmt.Sprintf("generatedCode.sourceRanges[%d]", index)
		if err := validateSourceRange(field, sourceRange, codeLength, targetIDs); err != nil {
			return err
		}
	}
	return nil
}

func validateDiagnostics(diagnostics []DiagnosticV1, targetIDs map[string]struct{}) error {
	diagnosticIDs := make(map[string]struct{}, len(diagnostics))
	for index, diagnostic := range diagnostics {
		field := fmt.Sprintf("diagnostics[%d]", index)
		if err := requireStableID(field+".id", diagnostic.ID); err != nil {
			return err
		}
		if _, exists := diagnosticIDs[diagnostic.ID]; exists {
			return ValidationError{Field: field + ".id", Problem: "must be unique"}
		}
		if !isDiagnosticSeverityV1(diagnostic.Severity) {
			return ValidationError{Field: field + ".severity", Problem: "is not supported by V1"}
		}
		if strings.TrimSpace(diagnostic.Message) == "" {
			return ValidationError{Field: field + ".message", Problem: "must not be empty"}
		}
		if _, exists := targetIDs[diagnostic.TargetID]; !exists {
			return ValidationError{Field: field + ".targetId", Problem: "must reference a stable target ID"}
		}
		diagnosticIDs[diagnostic.ID] = struct{}{}
	}
	return nil
}

func requireStableID(field, value string) error {
	if strings.TrimSpace(value) == "" {
		return ValidationError{Field: field, Problem: "must not be empty"}
	}
	if value != strings.TrimSpace(value) {
		return ValidationError{Field: field, Problem: "must not include surrounding whitespace"}
	}
	return nil
}

func requireRequestID(field, value string) error {
	if strings.TrimSpace(value) == "" {
		return ValidationError{Field: field, Problem: "must not be empty"}
	}
	if value != strings.TrimSpace(value) {
		return ValidationError{Field: field, Problem: "must not include surrounding whitespace"}
	}
	return nil
}

// Validate ensures a provider status remains inside the V1 transport
// vocabulary before it becomes part of a canonical snapshot.
func (status ProviderStatusV1) Validate() error {
	return validateProviderStatus(status)
}

func validateProviderStatus(status ProviderStatusV1) error {
	if status.Provider != ProviderBasedpyrightV1 {
		return ValidationError{Field: "providerStatus.provider", Problem: "is not supported by V1"}
	}
	if !isProviderAvailabilityV1(status.Status) {
		return ValidationError{Field: "providerStatus.status", Problem: "is not supported by V1"}
	}
	if !isProviderLifecycleStateV1(status.State) {
		return ValidationError{Field: "providerStatus.state", Problem: "is not supported by V1"}
	}
	switch status.State {
	case ProviderLifecycleStateNotStartedV1, ProviderLifecycleStateFailedV1:
		if status.Status != ProviderAvailabilityUnavailableV1 {
			return ValidationError{Field: "providerStatus", Problem: "has an invalid availability/lifecycle combination"}
		}
	case ProviderLifecycleStateReadyV1, ProviderLifecycleStatePendingV1:
		if status.Status != ProviderAvailabilityAvailableV1 {
			return ValidationError{Field: "providerStatus", Problem: "has an invalid availability/lifecycle combination"}
		}
	}
	return nil
}

func isProviderAvailabilityV1(availability ProviderAvailabilityV1) bool {
	switch availability {
	case ProviderAvailabilityAvailableV1, ProviderAvailabilityUnavailableV1:
		return true
	default:
		return false
	}
}

func isProviderLifecycleStateV1(state ProviderLifecycleStateV1) bool {
	switch state {
	case ProviderLifecycleStateNotStartedV1,
		ProviderLifecycleStateReadyV1,
		ProviderLifecycleStatePendingV1,
		ProviderLifecycleStateFailedV1:
		return true
	default:
		return false
	}
}

func isPassingStyleV1(style ParameterPassingStyleV1) bool {
	switch style {
	case ParameterPassingStylePositionalOnlyV1,
		ParameterPassingStylePositionalOrKeywordV1,
		ParameterPassingStyleKeywordOnlyV1,
		ParameterPassingStyleVariadicPositionalV1,
		ParameterPassingStyleVariadicKeywordV1:
		return true
	default:
		return false
	}
}

func isDiagnosticSeverityV1(severity DiagnosticSeverityV1) bool {
	switch severity {
	case DiagnosticSeverityErrorV1, DiagnosticSeverityWarningV1, DiagnosticSeverityInformationV1:
		return true
	default:
		return false
	}
}

func validateSourceRange(field string, sourceRange GeneratedSourceRangeV1, codeLength int, targetIDs map[string]struct{}) error {
	if _, exists := targetIDs[sourceRange.TargetID]; !exists {
		return ValidationError{Field: field + ".targetId", Problem: "must reference a stable target ID"}
	}
	if sourceRange.Start < 0 {
		return ValidationError{Field: field + ".start", Problem: "must not be negative"}
	}
	if sourceRange.End < sourceRange.Start {
		return ValidationError{Field: field + ".end", Problem: "must not precede start"}
	}
	if sourceRange.End > codeLength {
		return ValidationError{Field: field + ".end", Problem: "must not exceed generated code length"}
	}
	return nil
}
