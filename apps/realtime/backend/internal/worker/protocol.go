package worker

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/riteofstring/setta/apps/realtime/backend/internal/contracts"
	"github.com/riteofstring/setta/packages/local-backend/strictjson"
)

const (
	InitializeMethod    = "initialize"
	InvokeMethod        = "runtime/invoke"
	UpdateMethod        = "runtime/update"
	CancelMethod        = "$/cancelRequest"
	ShutdownMethod      = "shutdown"
	InputFDEnvironment  = "SETTA_WORKER_INPUT_FD"
	OutputFDEnvironment = "SETTA_WORKER_OUTPUT_FD"
	maximumValues       = 128
	maximumTextBytes    = 1 << 20
)

var (
	ErrProtocol             = errors.New("worker: protocol violation")
	ErrClientClosed         = errors.New("worker: client is closed")
	ErrUpdateBackpressure   = errors.New("worker: update delivery exceeded its bound")
	protocolNamePattern     = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,127}$`)
	protocolIdentityPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)
	runtimeKindPattern      = regexp.MustCompile(`^[a-z][a-z0-9-]{0,63}$`)
)

type RPCError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

func (failure *RPCError) Error() string {
	if failure == nil {
		return "worker: RPC failure"
	}
	return fmt.Sprintf("worker: RPC failure %d: %s", failure.Code, failure.Message)
}

type wireMessage struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *RPCError       `json:"error,omitempty"`
}

func decodeWireMessage(data []byte) (wireMessage, error) {
	var message wireMessage
	if err := strictjson.Decode(data, &message); err != nil {
		return wireMessage{}, fmt.Errorf("%w: decode JSON-RPC message: %v", ErrProtocol, err)
	}
	if message.JSONRPC != "2.0" {
		return wireMessage{}, fmt.Errorf("%w: JSON-RPC version is invalid", ErrProtocol)
	}
	return message, nil
}

func validateUniqueJSON(data []byte) error {
	return strictjson.Validate(data)
}

func responseKey(id json.RawMessage) (string, error) {
	if len(id) == 0 || bytes.Equal(id, []byte("null")) {
		return "", fmt.Errorf("%w: response id is missing", ErrProtocol)
	}
	var number uint64
	if err := json.Unmarshal(id, &number); err == nil {
		return fmt.Sprintf("n:%d", number), nil
	}
	var text string
	if err := json.Unmarshal(id, &text); err == nil && text != "" && utf8.ValidString(text) {
		return "s:" + text, nil
	}
	return "", fmt.Errorf("%w: response id is invalid", ErrProtocol)
}

func validateResponse(message wireMessage) error {
	if message.Method != "" || len(message.Params) != 0 {
		return fmt.Errorf("%w: response contains request fields", ErrProtocol)
	}
	if len(message.Result) == 0 && message.Error == nil {
		return fmt.Errorf("%w: response has no result or error", ErrProtocol)
	}
	if len(message.Result) != 0 && message.Error != nil {
		return fmt.Errorf("%w: response has both result and error", ErrProtocol)
	}
	return validateRPCError(message.Error)
}

func validateRPCError(failure *RPCError) error {
	if failure == nil {
		return nil
	}
	if strings.TrimSpace(failure.Message) == "" || !utf8.ValidString(failure.Message) {
		return fmt.Errorf("%w: response error is invalid", ErrProtocol)
	}
	if len(failure.Data) != 0 && validateUniqueJSON(failure.Data) != nil {
		return fmt.Errorf("%w: response error data is invalid", ErrProtocol)
	}
	return nil
}

func validateInitializeParams(params contracts.InitializeParams) error {
	if params.ProtocolVersion != contracts.WorkerProtocolVersion {
		return errors.New("worker: initialize protocol version is unsupported")
	}
	if !validInitializeProjectRoot(params.ProjectRoot) {
		return errors.New("worker: initialize project root is invalid")
	}
	if !validInitializeEntrypoint(params.Entrypoint) {
		return errors.New("worker: initialize paths are required")
	}
	return nil
}

func validInitializeProjectRoot(value string) bool {
	return strings.TrimSpace(value) != "" && value == strings.TrimSpace(value) && filepath.IsAbs(value)
}

func validInitializeEntrypoint(value string) bool {
	return strings.TrimSpace(value) != "" && value == strings.TrimSpace(value) && !filepath.IsAbs(value) && filepath.Clean(value) == value && value != "." && value != ".." && !strings.HasPrefix(value, ".."+string(filepath.Separator))
}

func validateInitializeResult(result contracts.InitializeResult) error {
	if result.ProtocolVersion != contracts.WorkerProtocolVersion || !runtimeKindPattern.MatchString(result.RuntimeKind) {
		return fmt.Errorf("%w: initialize result is invalid", ErrProtocol)
	}
	if result.Handlers == nil || len(result.Handlers) > maximumValues {
		return fmt.Errorf("%w: initialize handlers are missing", ErrProtocol)
	}
	seen := make(map[string]struct{}, len(result.Handlers))
	for _, handler := range result.Handlers {
		if !protocolNamePattern.MatchString(handler) {
			return fmt.Errorf("%w: initialize handler is invalid", ErrProtocol)
		}
		if _, exists := seen[handler]; exists {
			return fmt.Errorf("%w: initialize handler is duplicated", ErrProtocol)
		}
		seen[handler] = struct{}{}
	}
	if !sort.StringsAreSorted(result.Handlers) {
		return fmt.Errorf("%w: initialize handlers are not sorted", ErrProtocol)
	}
	return validateStructuredError(result.LoadError)
}

func validateInvokeParams(params contracts.InvokeParams) error {
	if err := validateIdentity(params.Identity); err != nil {
		return err
	}
	if !protocolNamePattern.MatchString(params.Handler) {
		return errors.New("worker: invoke handler is invalid")
	}
	if params.Arguments == nil || params.Content == nil || len(params.Arguments) > maximumValues || len(params.Content) > maximumValues {
		return errors.New("worker: invoke collections are missing")
	}
	if err := validateInvokeArguments(params.Arguments); err != nil {
		return err
	}
	return validateInvokeContent(params.Identity.InvocationID, params.Content)
}

func validateInvokeArguments(arguments map[string]json.RawMessage) error {
	for name, value := range arguments {
		if !protocolNamePattern.MatchString(name) || len(value) == 0 || validateUniqueJSON(value) != nil {
			return fmt.Errorf("worker: invoke argument %q is invalid", name)
		}
	}
	return nil
}

func validateInvokeContent(invocationID string, content []contracts.ContentReference) error {
	for _, reference := range content {
		if err := reference.Validate(); err != nil {
			return err
		}
		if reference.InvocationID != invocationID {
			return errors.New("worker: content reference belongs to another invocation")
		}
	}
	return nil
}

func validateInvokeResult(result contracts.InvokeResult) error {
	if result.Outputs == nil || len(result.Outputs) > maximumValues {
		return fmt.Errorf("%w: invoke outputs are missing", ErrProtocol)
	}
	for name, value := range result.Outputs {
		if !protocolNamePattern.MatchString(name) || len(value) == 0 || validateUniqueJSON(value) != nil {
			return fmt.Errorf("%w: invoke output is invalid", ErrProtocol)
		}
	}
	return validateStructuredError(result.Error)
}

func validateRuntimeUpdate(update contracts.RuntimeUpdate) error {
	if err := validateIdentity(update.Identity); err != nil {
		return fmt.Errorf("%w: %v", ErrProtocol, err)
	}
	if update.UpdateSequence == 0 {
		return fmt.Errorf("%w: update sequence is invalid", ErrProtocol)
	}
	if !validUpdateProgress(update.Progress) {
		return fmt.Errorf("%w: update progress is invalid", ErrProtocol)
	}
	if !validUpdateMessage(update.Message) {
		return fmt.Errorf("%w: update message is invalid", ErrProtocol)
	}
	if update.Outputs == nil || update.Artifacts == nil || len(update.Outputs) > maximumValues || len(update.Artifacts) > maximumValues {
		return fmt.Errorf("%w: update collections are missing", ErrProtocol)
	}
	if !validUpdateOutputs(update.Outputs) {
		return fmt.Errorf("%w: update output is invalid", ErrProtocol)
	}
	if !validUpdateArtifacts(update.Artifacts) {
		return fmt.Errorf("%w: update artifact is invalid", ErrProtocol)
	}
	return nil
}

func validUpdateProgress(progress *float64) bool {
	return progress == nil || !math.IsNaN(*progress) && !math.IsInf(*progress, 0) && *progress >= 0 && *progress <= 1
}

func validUpdateMessage(message string) bool {
	return utf8.ValidString(message) && !strings.ContainsRune(message, '\x00') && len(message) <= maximumTextBytes
}

func validUpdateOutputs(outputs map[string]json.RawMessage) bool {
	for name, value := range outputs {
		if !protocolNamePattern.MatchString(name) || len(value) == 0 || validateUniqueJSON(value) != nil {
			return false
		}
	}
	return true
}

func validUpdateArtifacts(artifacts []contracts.WorkerArtifact) bool {
	for _, artifact := range artifacts {
		if strings.TrimSpace(artifact.Name) == "" || strings.TrimSpace(artifact.MediaType) == "" || strings.TrimSpace(artifact.Path) == "" {
			return false
		}
	}
	return true
}

func validateIdentity(identity contracts.InvocationIdentity) error {
	if !protocolIdentityPattern.MatchString(identity.SessionID) || !protocolIdentityPattern.MatchString(identity.RunID) || !protocolIdentityPattern.MatchString(identity.BindingID) || !protocolIdentityPattern.MatchString(identity.InvocationID) || identity.Sequence == 0 {
		return errors.New("worker: invocation identity is invalid")
	}
	return nil
}

func validateStructuredError(failure *contracts.StructuredError) error {
	if failure == nil {
		return nil
	}
	if !protocolNamePattern.MatchString(failure.Code) || strings.TrimSpace(failure.Message) == "" || !utf8.ValidString(failure.Message) || strings.ContainsRune(failure.Message, '\x00') {
		return fmt.Errorf("%w: structured error is invalid", ErrProtocol)
	}
	return nil
}
