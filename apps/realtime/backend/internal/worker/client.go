package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"sync"
	"sync/atomic"

	"github.com/riteofstring/setta/apps/realtime/backend/internal/contracts"
)

const maximumPendingCalls = 1024

type callResponse struct {
	result  json.RawMessage
	failure error
}

type Client struct {
	framer *Framer

	mu          sync.Mutex
	pending     map[string]chan callResponse
	terminalErr error
	nextID      atomic.Uint64
	done        chan struct{}
	updates     chan contracts.RuntimeUpdate
	closeOnce   sync.Once
}

type Invocation struct {
	client    *Client
	requestID uint64
	response  <-chan callResponse
	once      sync.Once
	result    contracts.InvokeResult
	err       error
}

func NewClient(reader io.Reader, writer io.Writer, maximumFrameBytes int) (*Client, error) {
	framer, err := NewFramer(reader, writer, maximumFrameBytes)
	if err != nil {
		return nil, err
	}
	client := &Client{
		framer:  framer,
		pending: make(map[string]chan callResponse),
		done:    make(chan struct{}),
		updates: make(chan contracts.RuntimeUpdate, 64),
	}
	go client.readLoop()
	return client, nil
}

func (client *Client) Initialize(ctx context.Context, params contracts.InitializeParams) (contracts.InitializeResult, error) {
	if err := validateInitializeParams(params); err != nil {
		return contracts.InitializeResult{}, err
	}
	result, err := client.call(ctx, InitializeMethod, params)
	if err != nil {
		return contracts.InitializeResult{}, err
	}
	var initialized contracts.InitializeResult
	if err := contracts.DecodeStrict(result, &initialized); err != nil {
		return contracts.InitializeResult{}, fmt.Errorf("%w: decode initialize result: %v", ErrProtocol, err)
	}
	if err := validateInitializeResult(initialized); err != nil {
		return contracts.InitializeResult{}, err
	}
	return initialized, nil
}

func (client *Client) StartInvoke(params contracts.InvokeParams) (*Invocation, error) {
	if err := validateInvokeParams(params); err != nil {
		return nil, err
	}
	requestID, response, err := client.startCall(InvokeMethod, params)
	if err != nil {
		return nil, err
	}
	return &Invocation{client: client, requestID: requestID, response: response}, nil
}

func (client *Client) Invoke(ctx context.Context, params contracts.InvokeParams) (contracts.InvokeResult, error) {
	invocation, err := client.StartInvoke(params)
	if err != nil {
		return contracts.InvokeResult{}, err
	}
	result, err := invocation.Await(ctx)
	if err != nil && ctx != nil && ctx.Err() != nil {
		_ = invocation.Cancel()
	}
	return result, err
}

func (invocation *Invocation) Await(ctx context.Context) (contracts.InvokeResult, error) {
	if invocation == nil || invocation.client == nil || invocation.response == nil {
		return contracts.InvokeResult{}, errors.New("worker: invocation is unavailable")
	}
	ctx = normalizedContext(ctx)
	invocation.once.Do(func() {
		select {
		case <-ctx.Done():
			invocation.err = ctx.Err()
		case response := <-invocation.response:
			if response.failure != nil {
				invocation.err = response.failure
				return
			}
			if err := contracts.DecodeStrict(response.result, &invocation.result); err != nil {
				invocation.err = fmt.Errorf("%w: decode invoke result: %v", ErrProtocol, err)
				return
			}
			invocation.err = validateInvokeResult(invocation.result)
		}
	})
	return invocation.result, invocation.err
}

func (invocation *Invocation) Cancel() error {
	if invocation == nil || invocation.client == nil || invocation.requestID == 0 {
		return errors.New("worker: invocation is unavailable")
	}
	return invocation.client.notify(CancelMethod, map[string]uint64{"id": invocation.requestID})
}

func (client *Client) Shutdown(ctx context.Context) error {
	result, err := client.call(ctx, ShutdownMethod, map[string]any{})
	if err != nil {
		return err
	}
	if string(result) != "null" {
		return fmt.Errorf("%w: shutdown result is not null", ErrProtocol)
	}
	return nil
}

func (client *Client) Updates() <-chan contracts.RuntimeUpdate {
	if client == nil {
		closed := make(chan contracts.RuntimeUpdate)
		close(closed)
		return closed
	}
	return client.updates
}

func (client *Client) Done() <-chan struct{} {
	if client == nil {
		closed := make(chan struct{})
		close(closed)
		return closed
	}
	return client.done
}

func (client *Client) Err() error {
	if client == nil {
		return ErrClientClosed
	}
	client.mu.Lock()
	defer client.mu.Unlock()
	return client.terminalErr
}

func (client *Client) Close() error {
	if client == nil {
		return nil
	}
	client.fail(ErrClientClosed)
	return nil
}

func (client *Client) call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	_, response, err := client.startCall(method, params)
	if err != nil {
		return nil, err
	}
	ctx = normalizedContext(ctx)
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case received := <-response:
		return received.result, received.failure
	}
}

func (client *Client) startCall(method string, params any) (uint64, <-chan callResponse, error) {
	if client == nil {
		return 0, nil, ErrClientClosed
	}
	encodedParams, err := json.Marshal(params)
	if err != nil {
		return 0, nil, fmt.Errorf("worker: encode %s params: %w", method, err)
	}
	requestID := client.nextID.Add(1)
	key := "n:" + strconv.FormatUint(requestID, 10)
	response := make(chan callResponse, 1)
	client.mu.Lock()
	if client.terminalErr != nil {
		failure := client.terminalErr
		client.mu.Unlock()
		return 0, nil, failure
	}
	if len(client.pending) >= maximumPendingCalls {
		client.mu.Unlock()
		return 0, nil, errors.New("worker: pending call limit reached")
	}
	client.pending[key] = response
	client.mu.Unlock()
	payload, err := json.Marshal(wireMessage{
		JSONRPC: "2.0",
		ID:      json.RawMessage(strconv.FormatUint(requestID, 10)),
		Method:  method,
		Params:  encodedParams,
	})
	if err != nil {
		client.removePending(key)
		return 0, nil, fmt.Errorf("worker: encode %s request: %w", method, err)
	}
	if err := client.framer.Write(payload); err != nil {
		client.removePending(key)
		client.fail(err)
		return 0, nil, err
	}
	return requestID, response, nil
}

func (client *Client) notify(method string, params any) error {
	if client == nil {
		return ErrClientClosed
	}
	encodedParams, err := json.Marshal(params)
	if err != nil {
		return fmt.Errorf("worker: encode %s params: %w", method, err)
	}
	payload, err := json.Marshal(wireMessage{JSONRPC: "2.0", Method: method, Params: encodedParams})
	if err != nil {
		return fmt.Errorf("worker: encode %s notification: %w", method, err)
	}
	if err := client.framer.Write(payload); err != nil {
		client.fail(err)
		return err
	}
	return nil
}

func (client *Client) readLoop() {
	for {
		payload, err := client.framer.Read()
		if err != nil {
			client.fail(fmt.Errorf("worker: read protocol stream: %w", err))
			return
		}
		message, err := decodeWireMessage(payload)
		if err != nil {
			client.fail(err)
			return
		}
		if message.Method != "" {
			if err := client.acceptNotification(message); err != nil {
				client.fail(err)
				return
			}
			continue
		}
		if err := client.acceptResponse(message); err != nil {
			client.fail(err)
			return
		}
	}
}

func (client *Client) acceptResponse(message wireMessage) error {
	if err := validateResponse(message); err != nil {
		return err
	}
	key, err := responseKey(message.ID)
	if err != nil {
		return err
	}
	client.mu.Lock()
	response := client.pending[key]
	delete(client.pending, key)
	client.mu.Unlock()
	if response == nil {
		return nil
	}
	if message.Error != nil {
		response <- callResponse{failure: message.Error}
		return nil
	}
	response <- callResponse{result: append(json.RawMessage(nil), message.Result...)}
	return nil
}

func (client *Client) acceptNotification(message wireMessage) error {
	if len(message.ID) != 0 || len(message.Result) != 0 || message.Error != nil || message.Method != UpdateMethod || len(message.Params) == 0 {
		return fmt.Errorf("%w: unexpected worker notification", ErrProtocol)
	}
	var update contracts.RuntimeUpdate
	if err := contracts.DecodeStrict(message.Params, &update); err != nil {
		return fmt.Errorf("%w: decode runtime update: %v", ErrProtocol, err)
	}
	if err := validateRuntimeUpdate(update); err != nil {
		return err
	}
	client.mu.Lock()
	defer client.mu.Unlock()
	if client.terminalErr != nil {
		return client.terminalErr
	}
	select {
	case client.updates <- update:
		return nil
	default:
		return ErrUpdateBackpressure
	}
}

func (client *Client) removePending(key string) {
	client.mu.Lock()
	delete(client.pending, key)
	client.mu.Unlock()
}

func (client *Client) fail(cause error) {
	if cause == nil {
		cause = ErrClientClosed
	}
	client.closeOnce.Do(func() {
		client.mu.Lock()
		client.terminalErr = cause
		pending := client.pending
		client.pending = make(map[string]chan callResponse)
		close(client.done)
		close(client.updates)
		client.mu.Unlock()
		for _, response := range pending {
			response <- callResponse{failure: cause}
		}
	})
}

func normalizedContext(ctx context.Context) context.Context {
	if ctx == nil {
		return context.Background()
	}
	return ctx
}
