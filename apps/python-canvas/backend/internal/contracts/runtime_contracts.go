package contracts

import (
	"path/filepath"
	"strings"
	"unicode/utf8"
)

type RunGeneratedProgramRequestV2 struct {
	ProjectID              string `json:"projectId"`
	ExpectedRevision       int    `json:"expectedRevision"`
	RunTimeoutMilliseconds *int   `json:"runTimeoutMilliseconds,omitempty"`
}

type GeneratedProgramTerminationReasonV2 string

const (
	GeneratedProgramTerminationExitedV2      GeneratedProgramTerminationReasonV2 = "exited"
	GeneratedProgramTerminationSignaledV2    GeneratedProgramTerminationReasonV2 = "signaled"
	GeneratedProgramTerminationTimedOutV2    GeneratedProgramTerminationReasonV2 = "timed_out"
	GeneratedProgramTerminationOutputLimitV2 GeneratedProgramTerminationReasonV2 = "output_limit"
)

type GeneratedProgramRunResultV2 struct {
	ProjectID       string                              `json:"projectId"`
	Revision        int                                 `json:"revision"`
	Stdout          string                              `json:"stdout"`
	Stderr          string                              `json:"stderr"`
	StdoutTruncated bool                                `json:"stdoutTruncated"`
	StderrTruncated bool                                `json:"stderrTruncated"`
	ExitCode        *int                                `json:"exitCode,omitempty"`
	Termination     GeneratedProgramTerminationReasonV2 `json:"terminationReason"`
	ElapsedMillis   int                                 `json:"elapsedMilliseconds"`
}

type OpenTerminalRequestV2 struct {
	ProjectID string `json:"projectId"`
	Columns   int    `json:"columns"`
	Rows      int    `json:"rows"`
}

type RunTerminalRequestV2 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
	Columns          int    `json:"columns"`
	Rows             int    `json:"rows"`
}

type CloseTerminalRequestV2 struct {
	ProjectID string `json:"projectId"`
}

type TerminalTicketRequestV2 struct {
	ProjectID string `json:"projectId"`
}

type TerminalSessionV2 struct {
	Created bool `json:"created"`
	Columns int  `json:"columns"`
	Rows    int  `json:"rows"`
}

type TerminalTicketV2 struct {
	Ticket string `json:"ticket"`
}

type RuntimeSessionIdentityV2 struct {
	SchemaVersion string `json:"schemaVersion"`
	AppID         string `json:"appId"`
	ProjectPath   string `json:"projectPath"`
	InstanceNonce string `json:"instanceNonce"`
}

type TerminalStreamReadyV2 struct {
	Type string `json:"type"`
}

type TerminalStreamResizeV2 struct {
	Type    string `json:"type"`
	Columns int    `json:"columns"`
	Rows    int    `json:"rows"`
}

func (request RunGeneratedProgramRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	if request.RunTimeoutMilliseconds == nil {
		return nil
	}
	if *request.RunTimeoutMilliseconds < 1 || *request.RunTimeoutMilliseconds > MaxRunTimeoutMillisecondsV2 {
		return ValidationError{Field: "runTimeoutMilliseconds", Problem: "must be between 1 and 300000"}
	}
	return nil
}

func (result GeneratedProgramRunResultV2) Validate() error {
	if err := validateGeneratedProgramRunIdentity(result); err != nil {
		return err
	}
	if err := validateGeneratedProgramRunOutput(result); err != nil {
		return err
	}
	return validateGeneratedProgramTermination(result)
}

func validateGeneratedProgramRunIdentity(result GeneratedProgramRunResultV2) error {
	if err := requireStableID("projectId", result.ProjectID); err != nil {
		return err
	}
	if result.Revision < 1 {
		return ValidationError{Field: "revision", Problem: "must be at least 1"}
	}
	return nil
}

func validateGeneratedProgramRunOutput(result GeneratedProgramRunResultV2) error {
	if err := validateText("stdout", result.Stdout, true); err != nil {
		return err
	}
	if err := validateText("stderr", result.Stderr, true); err != nil {
		return err
	}
	if result.ElapsedMillis < 0 {
		return ValidationError{Field: "elapsedMilliseconds", Problem: "must not be negative"}
	}
	if result.ExitCode != nil && *result.ExitCode < 0 {
		return ValidationError{Field: "exitCode", Problem: "must not be negative"}
	}
	return nil
}

func validateGeneratedProgramTermination(result GeneratedProgramRunResultV2) error {
	switch result.Termination {
	case GeneratedProgramTerminationExitedV2:
		if result.ExitCode == nil {
			return ValidationError{Field: "exitCode", Problem: "is required when terminationReason is exited"}
		}
	case GeneratedProgramTerminationSignaledV2, GeneratedProgramTerminationTimedOutV2, GeneratedProgramTerminationOutputLimitV2:
		if result.ExitCode != nil {
			return ValidationError{Field: "exitCode", Problem: "must be omitted when terminationReason is not exited"}
		}
	default:
		return ValidationError{Field: "terminationReason", Problem: "is unsupported"}
	}
	return nil
}

func (request OpenTerminalRequestV2) Validate() error {
	if err := requireStableID("projectId", request.ProjectID); err != nil {
		return err
	}
	return validateTerminalSize(request.Columns, request.Rows)
}

func (request RunTerminalRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	return validateTerminalSize(request.Columns, request.Rows)
}

func (request CloseTerminalRequestV2) Validate() error {
	return requireStableID("projectId", request.ProjectID)
}

func (request TerminalTicketRequestV2) Validate() error {
	return requireStableID("projectId", request.ProjectID)
}

func (session TerminalSessionV2) Validate() error {
	return validateTerminalSize(session.Columns, session.Rows)
}

func (ticket TerminalTicketV2) Validate() error {
	if len(ticket.Ticket) < 32 {
		return ValidationError{Field: "ticket", Problem: "is invalid"}
	}
	return nil
}

func (identity RuntimeSessionIdentityV2) Validate() error {
	if err := validateRuntimeSessionHeader(identity); err != nil {
		return err
	}
	if err := validateRuntimeSessionProjectPath(identity.ProjectPath); err != nil {
		return err
	}
	return validateRuntimeSessionNonce(identity.InstanceNonce)
}

func validateRuntimeSessionHeader(identity RuntimeSessionIdentityV2) error {
	if identity.SchemaVersion != RuntimeSessionSchemaVersionV1 {
		return ValidationError{Field: "schemaVersion", Problem: "must equal python-canvas-session/v1"}
	}
	if identity.AppID != RuntimeSessionAppIDV1 {
		return ValidationError{Field: "appId", Problem: "must equal python-canvas"}
	}
	return nil
}

func validateRuntimeSessionProjectPath(projectPath string) error {
	if strings.TrimSpace(projectPath) == "" || projectPath != strings.TrimSpace(projectPath) || !utf8.ValidString(projectPath) || strings.ContainsRune(projectPath, '\x00') {
		return ValidationError{Field: "projectPath", Problem: "is invalid"}
	}
	if !filepath.IsAbs(projectPath) || filepath.Clean(projectPath) != projectPath {
		return ValidationError{Field: "projectPath", Problem: "must be a canonical absolute path"}
	}
	return nil
}

func validateRuntimeSessionNonce(nonce string) error {
	if len(nonce) < 16 || strings.TrimSpace(nonce) == "" || nonce != strings.TrimSpace(nonce) || !utf8.ValidString(nonce) || strings.ContainsRune(nonce, '\x00') {
		return ValidationError{Field: "instanceNonce", Problem: "is invalid"}
	}
	return nil
}

func (ready TerminalStreamReadyV2) Validate() error {
	if ready.Type != TerminalStreamReadyTypeV2 {
		return ValidationError{Field: "type", Problem: "must be ready"}
	}
	return nil
}

func (resize TerminalStreamResizeV2) Validate() error {
	if resize.Type != TerminalStreamResizeTypeV2 {
		return ValidationError{Field: "type", Problem: "must be resize"}
	}
	return validateTerminalSize(resize.Columns, resize.Rows)
}
