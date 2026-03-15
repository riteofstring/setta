package plugins

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"sync"
)

const (
	workerRPCVersion                  = "2.0"
	workerRPCTransportErrorCode       = "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
	workerRPCCapabilityDeniedCode     = "PLUGIN_CAPABILITY_DENIED"
	workerRPCProjectStateReadFailed   = "PLUGIN_BACKEND_PROJECT_STATE_READ_FAILED"
	workerRPCRegisterFailedCode       = "PLUGIN_BACKEND_REGISTER_FAILED"
	workerRPCListenerEmitFailedCode   = "PLUGIN_BACKEND_LISTENER_EMIT_FAILED"
	workerRPCInvalidErrorPayloadLabel = "backend worker returned an invalid error payload"
)

var (
	ErrWorkerRPCReaderRequired        = errors.New("plugins: worker RPC reader is required")
	ErrWorkerRPCWriterRequired        = errors.New("plugins: worker RPC writer is required")
	ErrWorkerRPCHostRequired          = errors.New("plugins: worker host is required")
	ErrWorkerRPCMethodRequired        = errors.New("plugins: worker RPC method is required")
	ErrWorkerRPCResponseIDMismatch    = errors.New("plugins: worker RPC response id mismatch")
	ErrWorkerRPCResponseMissingResult = errors.New("plugins: worker RPC response missing result field")
	ErrWorkerRPCResponseInvalidError  = errors.New("plugins: worker RPC response error payload is invalid")
	ErrWorkerRPCPayloadInvalid        = errors.New("plugins: worker RPC payload is invalid")
)

type WorkerRPCClientOptions struct {
	Reader        io.Reader
	Writer        io.Writer
	Host          *WorkerHost
	Worker        WorkerContext
	NextRequestID int64
}

type WorkerRPCClient struct {
	reader *bufio.Reader
	writer io.Writer
	host   *WorkerHost
	worker WorkerContext

	mu            sync.Mutex
	nextRequestID int64
}

type WorkerRPCError struct {
	Code    string
	Message string
}

func (e *WorkerRPCError) Error() string {
	if e == nil {
		return ""
	}
	if strings.TrimSpace(e.Code) == "" {
		return e.Message
	}
	if strings.TrimSpace(e.Message) == "" {
		return e.Code
	}
	return e.Code + ": " + e.Message
}

type workerRPCRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int64  `json:"id"`
	Method  string `json:"method"`
	Params  any    `json:"params"`
}

type workerRPCResponse struct {
	JSONRPC string              `json:"jsonrpc"`
	ID      json.RawMessage     `json:"id"`
	Result  json.RawMessage     `json:"result,omitempty"`
	Error   *workerRPCWireError `json:"error,omitempty"`
}

type workerRPCWireEnvelope struct {
	JSONRPC string           `json:"jsonrpc,omitempty"`
	ID      json.RawMessage  `json:"id"`
	Method  *string          `json:"method,omitempty"`
	Params  json.RawMessage  `json:"params,omitempty"`
	Result  *json.RawMessage `json:"result,omitempty"`
	Error   *json.RawMessage `json:"error,omitempty"`
}

type workerRPCWireError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func NewWorkerRPCClient(options WorkerRPCClientOptions) (*WorkerRPCClient, error) {
	if options.Reader == nil {
		return nil, ErrWorkerRPCReaderRequired
	}
	if options.Writer == nil {
		return nil, ErrWorkerRPCWriterRequired
	}
	if options.Host == nil {
		return nil, ErrWorkerRPCHostRequired
	}

	nextRequestID := options.NextRequestID
	if nextRequestID <= 0 {
		nextRequestID = 1000
	}

	return &WorkerRPCClient{
		reader:        bufio.NewReader(options.Reader),
		writer:        options.Writer,
		host:          options.Host,
		worker:        options.Worker,
		nextRequestID: nextRequestID,
	}, nil
}

func (c *WorkerRPCClient) Call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	if c == nil {
		return nil, ErrWorkerRPCReaderRequired
	}

	method = strings.TrimSpace(method)
	if method == "" {
		return nil, ErrWorkerRPCMethodRequired
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	requestID := c.nextRequestID
	c.nextRequestID++

	requestParams := params
	if requestParams == nil {
		requestParams = map[string]any{}
	}

	if err := c.writePayload(workerRPCRequest{
		JSONRPC: workerRPCVersion,
		ID:      requestID,
		Method:  method,
		Params:  requestParams,
	}); err != nil {
		return nil, err
	}

	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}

		envelope, err := c.readEnvelope()
		if err != nil {
			return nil, err
		}

		if envelope.Method != nil {
			if err := c.respondToHostRequest(ctx, envelope); err != nil {
				return nil, err
			}
			continue
		}

		if !workerRPCIDMatches(envelope.ID, requestID) {
			return nil, fmt.Errorf(
				"%w: expected %d, received %s",
				ErrWorkerRPCResponseIDMismatch,
				requestID,
				strings.TrimSpace(string(envelope.ID)),
			)
		}
		if envelope.Error != nil && !workerRPCIsJSONNull(*envelope.Error) {
			workerErr, err := decodeWorkerRPCError(*envelope.Error)
			if err != nil {
				return nil, err
			}
			return nil, workerErr
		}
		if envelope.Result == nil {
			return nil, ErrWorkerRPCResponseMissingResult
		}

		return append(json.RawMessage(nil), (*envelope.Result)...), nil
	}
}

func (c *WorkerRPCClient) respondToHostRequest(ctx context.Context, envelope workerRPCWireEnvelope) error {
	if envelope.Method == nil {
		return ErrWorkerRPCPayloadInvalid
	}

	result, err := c.host.Dispatch(ctx, c.worker, *envelope.Method, envelope.Params)
	response := workerRPCResponse{
		JSONRPC: workerRPCVersion,
		ID:      append(json.RawMessage(nil), envelope.ID...),
	}
	if err != nil {
		response.Error = &workerRPCWireError{
			Code:    workerHostDispatchErrorCode(err),
			Message: err.Error(),
		}
	} else {
		response.Result = append(json.RawMessage(nil), result...)
	}
	return c.writePayload(response)
}

func (c *WorkerRPCClient) writePayload(payload any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrWorkerRPCPayloadInvalid, err)
	}
	if _, err := c.writer.Write(append(encoded, '\n')); err != nil {
		return err
	}
	return nil
}

func (c *WorkerRPCClient) readEnvelope() (workerRPCWireEnvelope, error) {
	for {
		line, err := c.reader.ReadBytes('\n')
		if err != nil && !errors.Is(err, io.EOF) {
			return workerRPCWireEnvelope{}, err
		}
		if len(line) == 0 && errors.Is(err, io.EOF) {
			return workerRPCWireEnvelope{}, io.EOF
		}

		trimmed := strings.TrimSpace(string(line))
		if trimmed == "" {
			if errors.Is(err, io.EOF) {
				return workerRPCWireEnvelope{}, io.EOF
			}
			continue
		}

		var envelope workerRPCWireEnvelope
		if unmarshalErr := json.Unmarshal([]byte(trimmed), &envelope); unmarshalErr != nil {
			return workerRPCWireEnvelope{}, fmt.Errorf("%w: %v", ErrWorkerRPCPayloadInvalid, unmarshalErr)
		}
		return envelope, nil
	}
}

func decodeWorkerRPCError(payload json.RawMessage) (*WorkerRPCError, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return nil, fmt.Errorf("%w: %s", ErrWorkerRPCResponseInvalidError, workerRPCInvalidErrorPayloadLabel)
	}

	codePayload, ok := fields["code"]
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrWorkerRPCResponseInvalidError, workerRPCInvalidErrorPayloadLabel)
	}
	messagePayload, ok := fields["message"]
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrWorkerRPCResponseInvalidError, workerRPCInvalidErrorPayloadLabel)
	}

	var code string
	if err := json.Unmarshal(codePayload, &code); err != nil {
		return nil, fmt.Errorf("%w: %s", ErrWorkerRPCResponseInvalidError, workerRPCInvalidErrorPayloadLabel)
	}
	var message string
	if err := json.Unmarshal(messagePayload, &message); err != nil {
		return nil, fmt.Errorf("%w: %s", ErrWorkerRPCResponseInvalidError, workerRPCInvalidErrorPayloadLabel)
	}

	return &WorkerRPCError{
		Code:    strings.TrimSpace(code),
		Message: strings.TrimSpace(message),
	}, nil
}

func workerHostDispatchErrorCode(err error) string {
	switch {
	case errors.Is(err, ErrWorkerHostMethodRequired),
		errors.Is(err, ErrWorkerHostUnsupportedMethod),
		errors.Is(err, ErrWorkerHostParamsInvalid):
		return workerRPCTransportErrorCode
	case errors.Is(err, ErrWorkerHostCapabilityDenied):
		return workerRPCCapabilityDeniedCode
	case errors.Is(err, ErrWorkerHostLanguageServerRegistrarRequired),
		errors.Is(err, ErrWorkerHostExternalAgentRegistrarRequired),
		errors.Is(err, ErrWorkerHostCodegenTargetRegistrarNeeded),
		errors.Is(err, ErrWorkerHostPluginIDRequired),
		errors.Is(err, ErrWorkerHostPluginRootRequired),
		errors.Is(err, ErrWorkerHostLanguageServerRequired),
		errors.Is(err, ErrWorkerHostLanguageServerLanguageRequired),
		errors.Is(err, ErrWorkerHostLanguageServerLanguageInvalid),
		errors.Is(err, ErrWorkerHostLanguageServerCommandRequired),
		errors.Is(err, ErrWorkerHostLanguageServerCommandInvalid),
		errors.Is(err, ErrWorkerHostLanguageServerArgsInvalid),
		errors.Is(err, ErrWorkerHostLanguageServerSettingsKeyInvalid),
		errors.Is(err, ErrWorkerHostExternalAgentAdapterRequired),
		errors.Is(err, ErrWorkerHostExternalAgentAdapterIDRequired),
		errors.Is(err, ErrWorkerHostExternalAgentAdapterNameRequired),
		errors.Is(err, ErrWorkerHostExternalAgentAdapterRunModesRequired),
		errors.Is(err, ErrWorkerHostExternalAgentAdapterRunModeInvalid),
		errors.Is(err, ErrWorkerHostExternalAgentAdapterCommandRequired),
		errors.Is(err, ErrWorkerHostExternalAgentAdapterCommandInvalid),
		errors.Is(err, ErrWorkerHostExternalAgentAdapterArgsInvalid),
		errors.Is(err, ErrWorkerHostExternalAgentEnvWhitelistInvalid),
		errors.Is(err, ErrWorkerHostExternalAgentDefaultModelInvalid),
		errors.Is(err, ErrWorkerHostCodegenTargetRequired),
		errors.Is(err, ErrWorkerHostCodegenTargetIDRequired),
		errors.Is(err, ErrWorkerHostCodegenTargetIDInvalid),
		errors.Is(err, ErrWorkerHostCodegenTargetNameRequired),
		errors.Is(err, ErrWorkerHostCodegenTargetLanguageNeeded),
		errors.Is(err, ErrWorkerHostCodegenTargetLanguageInvalid),
		errors.Is(err, ErrWorkerHostCodegenHandlerIDRequired),
		errors.Is(err, ErrLanguageServerRegistrationConflict),
		errors.Is(err, ErrExternalAgentAdapterRegistrationConflict),
		errors.Is(err, ErrCodegenTargetRegistrationConflict):
		return workerRPCRegisterFailedCode
	case errors.Is(err, ErrWorkerHostProjectStateReaderRequired),
		errors.Is(err, ErrWorkerHostProjectStateReadFailed),
		errors.Is(err, ErrWorkerHostProjectStateProjectIDRequired),
		errors.Is(err, ErrWorkerHostProjectStateViewInvalid):
		return workerRPCProjectStateReadFailed
	default:
		return workerRPCListenerEmitFailedCode
	}
}

func workerRPCIDMatches(id json.RawMessage, expected int64) bool {
	if len(id) == 0 {
		return false
	}
	trimmed := strings.TrimSpace(string(id))
	return trimmed == strconv.FormatInt(expected, 10)
}

func workerRPCIsJSONNull(payload json.RawMessage) bool {
	return strings.TrimSpace(string(payload)) == "null"
}
