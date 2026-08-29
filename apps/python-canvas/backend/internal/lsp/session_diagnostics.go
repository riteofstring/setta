package lsp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const pullDiagnosticsMethod = "textDocument/diagnostic"

var ErrPullDiagnosticsUnavailable = errors.New("lsp: pull diagnostics are unavailable")

type documentDiagnosticReportPayload struct {
	Kind  *string              `json:"kind"`
	Items *[]diagnosticPayload `json:"items,omitempty"`
}

type diagnosticPayload struct {
	Range    *rangePayload             `json:"range"`
	Severity diagnosticSeverityPayload `json:"severity,omitempty"`
	Message  *string                   `json:"message"`
	Code     diagnosticCodePayload     `json:"code,omitempty"`
}

type rangePayload struct {
	Start *positionPayload `json:"start"`
	End   *positionPayload `json:"end"`
}

type positionPayload struct {
	Line      *int `json:"line"`
	Character *int `json:"character"`
}

type diagnosticSeverityPayload struct {
	present bool
	value   int
}

type diagnosticCodePayload struct {
	present bool
	value   string
}

type registrationParamsPayload struct {
	Registrations *[]registrationPayload `json:"registrations"`
}

type registrationPayload struct {
	ID     *string `json:"id"`
	Method *string `json:"method"`
}

type unregistrationParamsPayload struct {
	Unregistrations *[]registrationPayload `json:"unregisterations"`
}

func (session *Session) PullDiagnostics(
	ctx context.Context,
	path string,
	version int,
) (DocumentDiagnostics, error) {
	if version < 1 {
		return DocumentDiagnostics{}, fmt.Errorf("lsp: diagnostic document version must be positive")
	}
	if err := session.Start(ctx); err != nil {
		return DocumentDiagnostics{}, err
	}
	uri, err := pathToURI(path)
	if err != nil {
		return DocumentDiagnostics{}, err
	}
	if err := session.awaitPullDiagnosticsRegistration(ctx); err != nil {
		return DocumentDiagnostics{}, err
	}
	if err := session.requireDocumentVersion(uri, version); err != nil {
		return DocumentDiagnostics{}, err
	}

	var result documentDiagnosticReportPayload
	if err := session.call(ctx, pullDiagnosticsMethod, map[string]any{
		"textDocument": map[string]string{"uri": uri},
	}, &result, false); err != nil {
		return DocumentDiagnostics{}, err
	}
	diagnostics, err := documentDiagnosticsFromPayload(result)
	if err != nil {
		return DocumentDiagnostics{}, err
	}
	if err := session.requireDocumentVersion(uri, version); err != nil {
		return DocumentDiagnostics{}, err
	}
	return DocumentDiagnostics{
		URI:         uri,
		Version:     version,
		Diagnostics: diagnostics,
	}, nil
}

func (session *Session) awaitPullDiagnosticsRegistration(ctx context.Context) error {
	ctx = requestContext(ctx)
	session.mu.Lock()
	if session.pullDiagnosticsRegistered {
		session.mu.Unlock()
		return nil
	}
	if session.terminalErr != nil {
		failure := session.terminalErr
		session.mu.Unlock()
		return failure
	}
	ready := session.pullDiagnosticsReady
	session.mu.Unlock()

	timeout, err := effectiveRequestTimeout(ctx, session.options.RequestTimeout)
	if err != nil {
		return err
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return fmt.Errorf("%w: client registration timed out", ErrPullDiagnosticsUnavailable)
	case <-ready:
	}

	session.mu.Lock()
	defer session.mu.Unlock()
	if session.terminalErr != nil {
		return session.terminalErr
	}
	if !session.pullDiagnosticsRegistered {
		return ErrPullDiagnosticsUnavailable
	}
	return nil
}

func (session *Session) requireDocumentVersion(uri string, version int) error {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.terminalErr != nil {
		return session.terminalErr
	}
	currentVersion, open := session.documentVersions[uri]
	if !open {
		return fmt.Errorf("lsp: diagnostic document is not open")
	}
	if currentVersion != version {
		return fmt.Errorf("lsp: diagnostic document version %d is not current version %d", version, currentVersion)
	}
	return nil
}

func documentDiagnosticsFromPayload(payload documentDiagnosticReportPayload) ([]Diagnostic, error) {
	if payload.Kind == nil || *payload.Kind != "full" {
		return nil, errors.New("lsp: pull diagnostics requires a full document report")
	}
	if payload.Items == nil {
		return nil, errors.New("lsp: pull diagnostics items array is required")
	}
	return diagnosticsFromPayload(*payload.Items)
}

func (session *Session) dispatchServerRequest(envelope rpcEnvelope) {
	var err error
	switch envelope.Method {
	case "client/registerCapability":
		err = session.registerPullDiagnostics(envelope.Params)
	case "client/unregisterCapability":
		err = session.unregisterPullDiagnostics(envelope.Params)
	case "workspace/diagnostic/refresh":

	default:
		err = fmt.Errorf("lsp: unsupported server request %q", envelope.Method)
		if responseErr := session.writeServerError(envelope.ID, -32601, err.Error()); responseErr != nil {
			err = errors.Join(err, responseErr)
		}
		session.failSession(err)
		return
	}
	if err != nil {
		if responseErr := session.writeServerError(envelope.ID, -32602, err.Error()); responseErr != nil {
			err = errors.Join(err, responseErr)
		}
		session.failSession(err)
		return
	}
	if err := session.writeServerResult(envelope.ID, nil); err != nil {
		session.failSession(err)
	}
}

func (session *Session) dispatchServerNotification(rpcEnvelope) {

}

func (session *Session) registerPullDiagnostics(raw json.RawMessage) error {
	var params registrationParamsPayload
	if err := json.Unmarshal(raw, &params); err != nil {
		return fmt.Errorf("lsp: decode capability registration: %w", err)
	}
	registration, err := requirePullDiagnosticsRegistration(params.Registrations)
	if err != nil {
		return err
	}
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.pullDiagnosticsRegistered {
		return errors.New("lsp: pull diagnostics were registered more than once")
	}
	session.pullDiagnosticsRegistered = true
	session.pullDiagnosticsRegistrationID = *registration.ID
	session.pullDiagnosticsReadyOnce.Do(func() {
		close(session.pullDiagnosticsReady)
	})
	return nil
}

func (session *Session) unregisterPullDiagnostics(raw json.RawMessage) error {
	var params unregistrationParamsPayload
	if err := json.Unmarshal(raw, &params); err != nil {
		return fmt.Errorf("lsp: decode capability unregistration: %w", err)
	}
	registration, err := requirePullDiagnosticsRegistration(params.Unregistrations)
	if err != nil {
		return err
	}
	session.mu.Lock()
	defer session.mu.Unlock()
	if !session.pullDiagnosticsRegistered || session.pullDiagnosticsRegistrationID != *registration.ID {
		return errors.New("lsp: pull diagnostics unregistration does not match the active registration")
	}
	session.pullDiagnosticsRegistered = false
	session.pullDiagnosticsRegistrationID = ""
	return nil
}

func requirePullDiagnosticsRegistration(registrations *[]registrationPayload) (registrationPayload, error) {
	if registrations == nil || len(*registrations) != 1 {
		return registrationPayload{}, errors.New("lsp: exactly one pull diagnostics registration is required")
	}
	registration := (*registrations)[0]
	if registration.ID == nil || strings.TrimSpace(*registration.ID) == "" {
		return registrationPayload{}, errors.New("lsp: pull diagnostics registration id is required")
	}
	if registration.Method == nil || *registration.Method != pullDiagnosticsMethod {
		return registrationPayload{}, errors.New("lsp: unsupported capability registration")
	}
	return registration, nil
}

func (session *Session) writeServerResult(id json.RawMessage, result any) error {
	return session.writeEnvelope(map[string]any{
		"jsonrpc": "2.0",
		"id":      json.RawMessage(append([]byte(nil), id...)),
		"result":  result,
	}, true)
}

func (session *Session) writeServerError(id json.RawMessage, code int, message string) error {
	return session.writeEnvelope(map[string]any{
		"jsonrpc": "2.0",
		"id":      json.RawMessage(append([]byte(nil), id...)),
		"error":   rpcError{Code: code, Message: message},
	}, true)
}

func diagnosticsFromPayload(payloads []diagnosticPayload) ([]Diagnostic, error) {
	diagnostics := make([]Diagnostic, len(payloads))
	for index, payload := range payloads {
		diagnostic, err := diagnosticFromPayload(payload)
		if err != nil {
			return nil, fmt.Errorf("pull diagnostic %d is malformed: %w", index, err)
		}
		diagnostics[index] = diagnostic
	}
	return diagnostics, nil
}

func diagnosticFromPayload(payload diagnosticPayload) (Diagnostic, error) {
	rangeValue, err := rangeFromPayload(payload.Range)
	if err != nil {
		return Diagnostic{}, err
	}
	if payload.Message == nil || strings.TrimSpace(*payload.Message) == "" {
		return Diagnostic{}, errors.New("message is required")
	}
	severity, err := severityFromPayload(payload.Severity)
	if err != nil {
		return Diagnostic{}, err
	}
	return Diagnostic{
		Range:    rangeValue,
		Severity: severity,
		Message:  *payload.Message,
		Code:     payload.Code.value,
	}, nil
}

func rangeFromPayload(payload *rangePayload) (Range, error) {
	if payload == nil {
		return Range{}, errors.New("range is required")
	}
	start, err := positionFromPayload(payload.Start)
	if err != nil {
		return Range{}, fmt.Errorf("start: %w", err)
	}
	end, err := positionFromPayload(payload.End)
	if err != nil {
		return Range{}, fmt.Errorf("end: %w", err)
	}
	if positionPrecedes(end, start) {
		return Range{}, errors.New("end position precedes start position")
	}
	return Range{Start: start, End: end}, nil
}

func positionFromPayload(payload *positionPayload) (Position, error) {
	if payload == nil {
		return Position{}, errors.New("position is required")
	}
	if payload.Line == nil || payload.Character == nil {
		return Position{}, errors.New("line and character are required")
	}
	if *payload.Line < 0 || *payload.Character < 0 {
		return Position{}, errors.New("line and character must be nonnegative")
	}
	return Position{Line: *payload.Line, Character: *payload.Character}, nil
}

func positionPrecedes(left Position, right Position) bool {
	return left.Line < right.Line || left.Line == right.Line && left.Character < right.Character
}

func severityFromPayload(payload diagnosticSeverityPayload) (int, error) {
	if !payload.present {
		return 0, nil
	}
	if payload.value < 1 || payload.value > 4 {
		return 0, errors.New("severity must be between 1 and 4")
	}
	return payload.value, nil
}

func (payload *diagnosticSeverityPayload) UnmarshalJSON(raw []byte) error {
	payload.present = true
	severity, err := strconv.Atoi(strings.TrimSpace(string(raw)))
	if err != nil {
		return errors.New("severity must be an integer")
	}
	payload.value = severity
	return nil
}

func (payload *diagnosticCodePayload) UnmarshalJSON(raw []byte) error {
	payload.present = true
	var code string
	if err := json.Unmarshal(raw, &code); err != nil {
		return errors.New("code must be a string")
	}
	if strings.TrimSpace(code) == "" {
		return errors.New("code must not be empty")
	}
	payload.value = code
	return nil
}
