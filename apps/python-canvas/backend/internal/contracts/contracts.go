// Package contracts owns the closed V2 transport contract for Python Canvas.
package contracts

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

const (
	ProjectSnapshotVersionV2 = "v2"
	ProjectPathV2            = "/api/v2/project"
	ProjectRenamePathV2      = "/api/v2/project/rename"
	ProjectCallablesPathV2   = "/api/v2/project/callables"
	ProjectTargetPathV2      = "/api/v2/project/target"
)

// ProjectSnapshotV2 is the complete canonical response used by every V2
// mutation and by the sole project/readiness endpoint.
type ProjectSnapshotV2 struct {
	Version        string           `json:"version"`
	Project        ProjectV2        `json:"project"`
	PythonTarget   PythonTargetV2   `json:"pythonTarget"`
	Callables      []CallableV2     `json:"callables"`
	GeneratedCode  GeneratedCodeV2  `json:"generatedCode"`
	Diagnostics    []DiagnosticV2   `json:"diagnostics"`
	ProviderStatus ProviderStatusV2 `json:"providerStatus"`
}

type ProjectV2 struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Revision int    `json:"revision"`
}

type PythonTargetV2 struct {
	Prefix string `json:"prefix"`
	Suffix string `json:"suffix"`
}

type CallableV2 struct {
	ID                 string        `json:"id"`
	Name               string        `json:"name"`
	AuthoredExpression string        `json:"authoredExpression"`
	Parameters         []ParameterV2 `json:"parameters"`
}

type ParameterPassingStyleV2 string

const (
	ParameterPassingStylePositionalOnlyV2      ParameterPassingStyleV2 = "positional_only"
	ParameterPassingStylePositionalOrKeywordV2 ParameterPassingStyleV2 = "positional_or_keyword"
	ParameterPassingStyleKeywordOnlyV2         ParameterPassingStyleV2 = "keyword_only"
	ParameterPassingStyleVariadicPositionalV2  ParameterPassingStyleV2 = "variadic_positional"
	ParameterPassingStyleVariadicKeywordV2     ParameterPassingStyleV2 = "variadic_keyword"
)

// ParameterV2 keeps provider-owned metadata explicit. A nil providerOrdinal
// is the sole marker for an app-authored record; clients never infer it from
// an ID or position.
type ParameterV2 struct {
	ID                 string                  `json:"id"`
	Name               string                  `json:"name"`
	NameEditable       bool                    `json:"nameEditable"`
	PassingStyle       ParameterPassingStyleV2 `json:"passingStyle"`
	TypeAnnotation     *string                 `json:"typeAnnotation"`
	Default            *string                 `json:"default"`
	ProviderOrdinal    *int                    `json:"providerOrdinal"`
	AuthoredExpression string                  `json:"authoredExpression"`
}

// ByteRangeV2 is a half-open UTF-8 byte range into GeneratedCodeV2.Code.
type ByteRangeV2 struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

type GeneratedCodeV2 struct {
	Code                   string                 `json:"code"`
	Body                   string                 `json:"body"`
	GeneratedBodyRange     ByteRangeV2            `json:"generatedBodyRange"`
	SourceRangesByTargetID map[string]ByteRangeV2 `json:"sourceRangesByTargetId"`
}

type DiagnosticSeverityV2 string

const (
	DiagnosticSeverityErrorV2       DiagnosticSeverityV2 = "error"
	DiagnosticSeverityWarningV2     DiagnosticSeverityV2 = "warning"
	DiagnosticSeverityInformationV2 DiagnosticSeverityV2 = "information"
)

type DiagnosticV2 struct {
	ID       string               `json:"id"`
	Severity DiagnosticSeverityV2 `json:"severity"`
	Message  string               `json:"message"`
	Start    int                  `json:"start"`
	End      int                  `json:"end"`
	TargetID *string              `json:"targetId"`
}

type ProviderV2 string

const ProviderBasedpyrightV2 ProviderV2 = "basedpyright"

type ProviderAvailabilityV2 string

const (
	ProviderAvailabilityAvailableV2   ProviderAvailabilityV2 = "available"
	ProviderAvailabilityUnavailableV2 ProviderAvailabilityV2 = "unavailable"
)

type ProviderLifecycleStateV2 string

const (
	ProviderLifecycleStateNotStartedV2 ProviderLifecycleStateV2 = "not_started"
	ProviderLifecycleStatePendingV2    ProviderLifecycleStateV2 = "pending"
	ProviderLifecycleStateReadyV2      ProviderLifecycleStateV2 = "ready"
	ProviderLifecycleStateFailedV2     ProviderLifecycleStateV2 = "failed"
)

type ProviderStatusV2 struct {
	Provider ProviderV2               `json:"provider"`
	Status   ProviderAvailabilityV2   `json:"status"`
	State    ProviderLifecycleStateV2 `json:"state"`
}

type RenameProjectRequestV2 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
	Name             string `json:"name"`
}

type CreateCallableRequestV2 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
	Name             string `json:"name"`
}

type RenameCallableRequestV2 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
	Name             string `json:"name"`
}

type DeleteCallableRequestV2 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
}

type CommitCallableRequestV2 struct {
	ProjectID          string `json:"projectId"`
	ExpectedRevision   int    `json:"expectedRevision"`
	AuthoredExpression string `json:"authoredExpression"`
}

type ParameterProposalV2 struct {
	ID                 string `json:"id"`
	Name               string `json:"name"`
	AuthoredExpression string `json:"authoredExpression"`
}

type SetCallableParametersRequestV2 struct {
	ProjectID        string                `json:"projectId"`
	ExpectedRevision int                   `json:"expectedRevision"`
	Parameters       []ParameterProposalV2 `json:"parameters"`
}

type SetPythonTargetRequestV2 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
	Prefix           string `json:"prefix"`
	Suffix           string `json:"suffix"`
}

type CallableCompletionRequestV2 struct {
	ProjectID          string `json:"projectId"`
	AuthoredExpression string `json:"authoredExpression"`
	CursorOffsetUTF16  int    `json:"cursorOffsetUtf16"`
}

// UTF16RangeV2 carries the UI's already-mapped protected range for a complete
// target draft. It is intentionally distinct from the UTF-8 byte ranges in a
// canonical snapshot.
type UTF16RangeV2 struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

type PythonTargetCompletionRequestV2 struct {
	ProjectID          string       `json:"projectId"`
	Code               string       `json:"code"`
	ProtectedBodyRange UTF16RangeV2 `json:"protectedBodyRange"`
	CursorOffsetUTF16  int          `json:"cursorOffsetUtf16"`
}

type CompletionItemV2 struct {
	Label      string `json:"label"`
	InsertText string `json:"insertText"`
}

type CompletionResponseV2 struct {
	Items []CompletionItemV2 `json:"items"`
}

type APIErrorCodeV2 string

const (
	APIErrorCodeRevisionConflictV2      APIErrorCodeV2 = "revision_conflict"
	APIErrorCodeValidationFailedV2      APIErrorCodeV2 = "validation_failed"
	APIErrorCodeNotFoundV2              APIErrorCodeV2 = "not_found"
	APIErrorCodeInvalidRequestV2        APIErrorCodeV2 = "invalid_request"
	APIErrorCodeProviderUnavailableV2   APIErrorCodeV2 = "provider_unavailable"
	APIErrorCodeProviderFailedV2        APIErrorCodeV2 = "provider_failed"
	APIErrorCodeRenderFailedV2          APIErrorCodeV2 = "render_failed"
	APIErrorCodeMaterializationFailedV2 APIErrorCodeV2 = "materialization_failed"
	APIErrorCodePersistenceFailedV2     APIErrorCodeV2 = "persistence_failed"
	APIErrorCodeMethodNotAllowedV2      APIErrorCodeV2 = "method_not_allowed"
	APIErrorCodeInternalV2              APIErrorCodeV2 = "internal"
)

// APIErrorV2 is closed by its code. Revision fields are present only for the
// revision_conflict variant.
type APIErrorV2 struct {
	Code             APIErrorCodeV2 `json:"code"`
	Message          string         `json:"message"`
	ExpectedRevision *int           `json:"expectedRevision,omitempty"`
	CurrentRevision  *int           `json:"currentRevision,omitempty"`
}

type ErrorResponseV2 struct {
	Error APIErrorV2 `json:"error"`
}

// ValidationError points to one malformed transport field without exposing a
// persistence or provider implementation detail.
type ValidationError struct {
	Field   string
	Problem string
}

func (err ValidationError) Error() string {
	return fmt.Sprintf("invalid V2 contract %s: %s", err.Field, err.Problem)
}

func (snapshot ProjectSnapshotV2) Validate() error {
	if err := validateProjectSnapshotBase(snapshot); err != nil {
		return err
	}
	targetIDs, err := validateSnapshotCallables(snapshot.Callables)
	if err != nil {
		return err
	}
	if err := validateGeneratedCode(snapshot.GeneratedCode, snapshot.PythonTarget, targetIDs); err != nil {
		return err
	}
	return validateDiagnostics(snapshot.Diagnostics, snapshot.GeneratedCode.Code, targetIDs)
}

func validateProjectSnapshotBase(snapshot ProjectSnapshotV2) error {
	if snapshot.Version != ProjectSnapshotVersionV2 {
		return ValidationError{Field: "version", Problem: "must equal v2"}
	}
	if err := requireStableID("project.id", snapshot.Project.ID); err != nil {
		return err
	}
	if err := requireDisplayName("project.name", snapshot.Project.Name); err != nil {
		return err
	}
	if snapshot.Project.Revision < 1 {
		return ValidationError{Field: "project.revision", Problem: "must be at least 1"}
	}
	if err := validateTarget(snapshot.PythonTarget); err != nil {
		return err
	}
	if snapshot.Callables == nil {
		return ValidationError{Field: "callables", Problem: "must be an array"}
	}
	if snapshot.Diagnostics == nil {
		return ValidationError{Field: "diagnostics", Problem: "must be an array"}
	}
	if err := snapshot.ProviderStatus.Validate(); err != nil {
		return err
	}
	return nil
}

func validateSnapshotCallables(callables []CallableV2) (map[string]struct{}, error) {
	targetIDs := make(map[string]struct{})
	for callableIndex, callable := range callables {
		field := fmt.Sprintf("callables[%d]", callableIndex)
		if err := validateSnapshotCallable(field, callable, targetIDs); err != nil {
			return nil, err
		}
	}
	return targetIDs, nil
}

func validateSnapshotCallable(field string, callable CallableV2, targetIDs map[string]struct{}) error {
	if err := requireStableID(field+".id", callable.ID); err != nil {
		return err
	}
	if err := claimSnapshotTargetID(field+".id", callable.ID, targetIDs); err != nil {
		return err
	}
	if err := requireDisplayName(field+".name", callable.Name); err != nil {
		return err
	}
	if err := validateText(field+".authoredExpression", callable.AuthoredExpression, true); err != nil {
		return err
	}
	if callable.Parameters == nil {
		return ValidationError{Field: field + ".parameters", Problem: "must be an array"}
	}
	return validateSnapshotParameters(field, callable.Parameters, targetIDs)
}

func validateSnapshotParameters(field string, parameters []ParameterV2, targetIDs map[string]struct{}) error {
	parameterNames := make(map[string]struct{}, len(parameters))
	providerOrdinals := make(map[int]struct{}, len(parameters))
	for parameterIndex, parameter := range parameters {
		parameterField := fmt.Sprintf("%s.parameters[%d]", field, parameterIndex)
		if err := validateParameter(parameterField, parameter); err != nil {
			return err
		}
		if err := claimSnapshotTargetID(parameterField+".id", parameter.ID, targetIDs); err != nil {
			return err
		}
		if err := claimParameterName(parameterField, parameter.Name, parameterNames); err != nil {
			return err
		}
		if err := claimProviderOrdinal(parameterField, parameter.ProviderOrdinal, providerOrdinals); err != nil {
			return err
		}
	}
	return nil
}

func claimSnapshotTargetID(field string, targetID string, targetIDs map[string]struct{}) error {
	if _, exists := targetIDs[targetID]; exists {
		return ValidationError{Field: field, Problem: "must be unique"}
	}
	targetIDs[targetID] = struct{}{}
	return nil
}

func claimParameterName(field string, name string, names map[string]struct{}) error {
	if name == "" {
		return nil
	}
	if _, exists := names[name]; exists {
		return ValidationError{Field: field + ".name", Problem: "must be unique within its callable"}
	}
	names[name] = struct{}{}
	return nil
}

func claimProviderOrdinal(field string, ordinal *int, ordinals map[int]struct{}) error {
	if ordinal == nil {
		return nil
	}
	if _, exists := ordinals[*ordinal]; exists {
		return ValidationError{Field: field + ".providerOrdinal", Problem: "must be unique within its callable"}
	}
	ordinals[*ordinal] = struct{}{}
	return nil
}

func (status ProviderStatusV2) Validate() error {
	if status.Provider != ProviderBasedpyrightV2 {
		return ValidationError{Field: "providerStatus.provider", Problem: "must be basedpyright"}
	}
	switch status.Status {
	case ProviderAvailabilityAvailableV2, ProviderAvailabilityUnavailableV2:
	default:
		return ValidationError{Field: "providerStatus.status", Problem: "is unsupported"}
	}
	switch status.State {
	case ProviderLifecycleStateNotStartedV2, ProviderLifecycleStatePendingV2, ProviderLifecycleStateReadyV2, ProviderLifecycleStateFailedV2:
	default:
		return ValidationError{Field: "providerStatus.state", Problem: "is unsupported"}
	}
	if (status.State == ProviderLifecycleStateNotStartedV2 || status.State == ProviderLifecycleStateFailedV2) && status.Status != ProviderAvailabilityUnavailableV2 {
		return ValidationError{Field: "providerStatus", Problem: "has an invalid availability/lifecycle combination"}
	}
	if (status.State == ProviderLifecycleStatePendingV2 || status.State == ProviderLifecycleStateReadyV2) && status.Status != ProviderAvailabilityAvailableV2 {
		return ValidationError{Field: "providerStatus", Problem: "has an invalid availability/lifecycle combination"}
	}
	return nil
}

func (request RenameProjectRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	return requireDisplayName("name", request.Name)
}

func (request CreateCallableRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	return requireDisplayName("name", request.Name)
}

func (request RenameCallableRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	return requireDisplayName("name", request.Name)
}

func (request DeleteCallableRequestV2) Validate() error {
	return validateMutationRequest(request.ProjectID, request.ExpectedRevision)
}

func (request CommitCallableRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	return requireNonBlankText("authoredExpression", request.AuthoredExpression)
}

func (request SetCallableParametersRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	if request.Parameters == nil {
		return ValidationError{Field: "parameters", Problem: "must be an array"}
	}
	for index, parameter := range request.Parameters {
		if err := requireStableID(fmt.Sprintf("parameters[%d].id", index), parameter.ID); err != nil {
			return err
		}
		if err := validateText(fmt.Sprintf("parameters[%d].name", index), parameter.Name, true); err != nil {
			return err
		}
		if err := validateText(fmt.Sprintf("parameters[%d].authoredExpression", index), parameter.AuthoredExpression, true); err != nil {
			return err
		}
	}
	return nil
}

func (request SetPythonTargetRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	return validateTarget(PythonTargetV2{Prefix: request.Prefix, Suffix: request.Suffix})
}

func (request CallableCompletionRequestV2) Validate() error {
	if err := requireStableID("projectId", request.ProjectID); err != nil {
		return err
	}
	if err := requireNonBlankText("authoredExpression", request.AuthoredExpression); err != nil {
		return err
	}
	if request.CursorOffsetUTF16 < 0 {
		return ValidationError{Field: "cursorOffsetUtf16", Problem: "must not be negative"}
	}
	return nil
}

func (request PythonTargetCompletionRequestV2) Validate() error {
	if err := requireStableID("projectId", request.ProjectID); err != nil {
		return err
	}
	if err := requireNonBlankText("code", request.Code); err != nil {
		return err
	}
	if request.ProtectedBodyRange.Start < 0 || request.ProtectedBodyRange.End < request.ProtectedBodyRange.Start {
		return ValidationError{Field: "protectedBodyRange", Problem: "is invalid"}
	}
	if request.CursorOffsetUTF16 < 0 {
		return ValidationError{Field: "cursorOffsetUtf16", Problem: "must not be negative"}
	}
	return nil
}

func (response CompletionResponseV2) Validate() error {
	if response.Items == nil {
		return ValidationError{Field: "items", Problem: "must be an array"}
	}
	for index, item := range response.Items {
		if err := requireNonBlankText(fmt.Sprintf("items[%d].label", index), item.Label); err != nil {
			return err
		}
		if err := requireNonBlankText(fmt.Sprintf("items[%d].insertText", index), item.InsertText); err != nil {
			return err
		}
	}
	return nil
}

func validateMutationRequest(projectID string, expectedRevision int) error {
	if err := requireStableID("projectId", projectID); err != nil {
		return err
	}
	if expectedRevision < 1 {
		return ValidationError{Field: "expectedRevision", Problem: "must be at least 1"}
	}
	return nil
}

func validateParameter(field string, parameter ParameterV2) error {
	if err := validateParameterFields(field, parameter); err != nil {
		return err
	}
	if parameter.NameEditable {
		return validateAppAuthoredParameter(field, parameter)
	}
	return validateProviderDerivedParameter(field, parameter)
}

func validateParameterFields(field string, parameter ParameterV2) error {
	if err := requireStableID(field+".id", parameter.ID); err != nil {
		return err
	}
	if err := validateText(field+".name", parameter.Name, true); err != nil {
		return err
	}
	if err := validateText(field+".authoredExpression", parameter.AuthoredExpression, true); err != nil {
		return err
	}
	if !isPassingStyle(parameter.PassingStyle) {
		return ValidationError{Field: field + ".passingStyle", Problem: "is unsupported"}
	}
	return nil
}

func validateAppAuthoredParameter(field string, parameter ParameterV2) error {
	if !isCoherentAppAuthoredParameter(parameter) {
		return ValidationError{Field: field, Problem: "has incoherent app-authored metadata"}
	}
	return nil
}

func isCoherentAppAuthoredParameter(parameter ParameterV2) bool {
	return parameter.PassingStyle == ParameterPassingStylePositionalOrKeywordV2 && parameter.TypeAnnotation == nil && parameter.Default == nil && parameter.ProviderOrdinal == nil
}

func validateProviderDerivedParameter(field string, parameter ParameterV2) error {
	if !isCoherentProviderDerivedParameter(parameter) {
		return ValidationError{Field: field, Problem: "has incoherent provider-derived metadata"}
	}
	return nil
}

func isCoherentProviderDerivedParameter(parameter ParameterV2) bool {
	return strings.TrimSpace(parameter.Name) != "" && parameter.ProviderOrdinal != nil && *parameter.ProviderOrdinal >= 0
}

func validateGeneratedCode(generated GeneratedCodeV2, target PythonTargetV2, targetIDs map[string]struct{}) error {
	if err := validateGeneratedCodeStructure(generated); err != nil {
		return err
	}
	if err := validateGeneratedCodeComposition(generated, target); err != nil {
		return err
	}
	return validateGeneratedSourceRanges(generated, targetIDs)
}

func validateGeneratedCodeStructure(generated GeneratedCodeV2) error {
	if generated.SourceRangesByTargetID == nil {
		return ValidationError{Field: "generatedCode.sourceRangesByTargetId", Problem: "must be an object"}
	}
	if err := validateText("generatedCode.code", generated.Code, false); err != nil {
		return err
	}
	if err := validateText("generatedCode.body", generated.Body, false); err != nil {
		return err
	}
	if err := validateByteRange("generatedCode.generatedBodyRange", generated.GeneratedBodyRange, generated.Code); err != nil {
		return err
	}
	return nil
}

func validateGeneratedCodeComposition(generated GeneratedCodeV2, target PythonTargetV2) error {
	if generated.Code[generated.GeneratedBodyRange.Start:generated.GeneratedBodyRange.End] != generated.Body {
		return ValidationError{Field: "generatedCode.generatedBodyRange", Problem: "must contain generatedCode.body"}
	}
	expectedCode := target.Prefix + "\n\n" + generated.Body + "\n\n" + target.Suffix
	if generated.Code != expectedCode {
		return ValidationError{Field: "generatedCode.code", Problem: "must compose the target and generated body"}
	}
	if generated.GeneratedBodyRange.Start != len(target.Prefix)+2 || generated.GeneratedBodyRange.End != len(target.Prefix)+2+len(generated.Body) {
		return ValidationError{Field: "generatedCode.generatedBodyRange", Problem: "does not match the canonical generated body"}
	}
	return nil
}

func validateGeneratedSourceRanges(generated GeneratedCodeV2, targetIDs map[string]struct{}) error {
	for targetID, byteRange := range generated.SourceRangesByTargetID {
		if _, exists := targetIDs[targetID]; !exists {
			return ValidationError{Field: "generatedCode.sourceRangesByTargetId", Problem: "references an unknown target"}
		}
		if err := validateByteRange("generatedCode.sourceRangesByTargetId."+targetID, byteRange, generated.Code); err != nil {
			return err
		}
	}
	return nil
}

func validateDiagnostics(diagnostics []DiagnosticV2, code string, targetIDs map[string]struct{}) error {
	seen := make(map[string]struct{}, len(diagnostics))
	for index, diagnostic := range diagnostics {
		field := fmt.Sprintf("diagnostics[%d]", index)
		if err := requireStableID(field+".id", diagnostic.ID); err != nil {
			return err
		}
		if _, exists := seen[diagnostic.ID]; exists {
			return ValidationError{Field: field + ".id", Problem: "must be unique"}
		}
		if !isDiagnosticSeverity(diagnostic.Severity) {
			return ValidationError{Field: field + ".severity", Problem: "is unsupported"}
		}
		if err := requireNonBlankText(field+".message", diagnostic.Message); err != nil {
			return err
		}
		if err := validateByteRange(field, ByteRangeV2{Start: diagnostic.Start, End: diagnostic.End}, code); err != nil {
			return err
		}
		if diagnostic.TargetID != nil {
			if _, exists := targetIDs[*diagnostic.TargetID]; !exists {
				return ValidationError{Field: field + ".targetId", Problem: "references an unknown target"}
			}
		}
		seen[diagnostic.ID] = struct{}{}
	}
	return nil
}

func validateTarget(target PythonTargetV2) error {
	if err := validateText("pythonTarget.prefix", target.Prefix, true); err != nil {
		return err
	}
	return validateText("pythonTarget.suffix", target.Suffix, true)
}

func validateByteRange(field string, byteRange ByteRangeV2, code string) error {
	if byteRange.Start < 0 || byteRange.End < byteRange.Start || byteRange.End > len(code) {
		return ValidationError{Field: field, Problem: "is outside generated code"}
	}
	if !isUTF8Boundary(code, byteRange.Start) || !isUTF8Boundary(code, byteRange.End) {
		return ValidationError{Field: field, Problem: "must use UTF-8 byte boundaries"}
	}
	return nil
}

func requireStableID(field string, value string) error {
	if strings.TrimSpace(value) == "" || value != strings.TrimSpace(value) || !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') {
		return ValidationError{Field: field, Problem: "must be a nonblank stable ID"}
	}
	return nil
}

func requireDisplayName(field string, value string) error {
	if err := requireNonBlankText(field, value); err != nil {
		return err
	}
	if value != strings.TrimSpace(value) {
		return ValidationError{Field: field, Problem: "must not include surrounding whitespace"}
	}
	return nil
}

func requireNonBlankText(field string, value string) error {
	if strings.TrimSpace(value) == "" {
		return ValidationError{Field: field, Problem: "must not be empty"}
	}
	return validateText(field, value, false)
}

func validateText(field string, value string, allowEmpty bool) error {
	if (!allowEmpty && value == "") || !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') {
		return ValidationError{Field: field, Problem: "is invalid"}
	}
	return nil
}

func isUTF8Boundary(value string, offset int) bool {
	return offset == 0 || offset == len(value) || (offset > 0 && offset < len(value) && utf8.RuneStart(value[offset]))
}

func isPassingStyle(style ParameterPassingStyleV2) bool {
	switch style {
	case ParameterPassingStylePositionalOnlyV2, ParameterPassingStylePositionalOrKeywordV2, ParameterPassingStyleKeywordOnlyV2, ParameterPassingStyleVariadicPositionalV2, ParameterPassingStyleVariadicKeywordV2:
		return true
	default:
		return false
	}
}

func isDiagnosticSeverity(severity DiagnosticSeverityV2) bool {
	switch severity {
	case DiagnosticSeverityErrorV2, DiagnosticSeverityWarningV2, DiagnosticSeverityInformationV2:
		return true
	default:
		return false
	}
}

// FixtureProjectSnapshotV2 is intentionally a blank general project. It is a
// generated-contract fixture, not startup data or a product fallback.
func FixtureProjectSnapshotV2() ProjectSnapshotV2 {
	body := "class SettaState:\n    def __init__(state):\n        pass"
	prefix := ""
	suffix := "state = SettaState()"
	return ProjectSnapshotV2{
		Version:      ProjectSnapshotVersionV2,
		Project:      ProjectV2{ID: "project:fixture", Name: "Fixture project", Revision: 1},
		PythonTarget: PythonTargetV2{Prefix: prefix, Suffix: suffix},
		Callables:    []CallableV2{},
		GeneratedCode: GeneratedCodeV2{
			Code:                   prefix + "\n\n" + body + "\n\n" + suffix,
			Body:                   body,
			GeneratedBodyRange:     ByteRangeV2{Start: 2, End: 2 + len(body)},
			SourceRangesByTargetID: map[string]ByteRangeV2{},
		},
		Diagnostics: []DiagnosticV2{},
		ProviderStatus: ProviderStatusV2{
			Provider: ProviderBasedpyrightV2,
			Status:   ProviderAvailabilityUnavailableV2,
			State:    ProviderLifecycleStateNotStartedV2,
		},
	}
}
