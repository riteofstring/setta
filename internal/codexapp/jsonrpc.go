package codexapp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"
)

const maxCanceledResponseTombstones = 1024

const (
	DefaultProcessShutdownGracePeriod = 2 * time.Second
	DefaultProcessShutdownKillPeriod  = 2 * time.Second
)

var errProcessExitTimeout = errors.New("codex app-server process did not exit before shutdown timeout")

type ProcessConfig struct {
	Command             string
	Args                []string
	Env                 []string
	ShutdownGracePeriod time.Duration
	ShutdownKillPeriod  time.Duration
}

type Client struct {
	cmd                 *exec.Cmd
	stdin               io.WriteCloser
	notifications       chan Message
	requests            chan Message
	lifecycle           *Lifecycle
	waitDone            chan struct{}
	shutdownGracePeriod time.Duration
	shutdownKillPeriod  time.Duration

	mu      sync.Mutex
	nextID  int
	pending map[int]*pendingCall

	canceledResponseIDs   map[int]struct{}
	canceledResponseOrder []int
}

type Lifecycle struct {
	done chan struct{}
	once sync.Once

	mu  sync.Mutex
	err error
}

type response struct {
	err     error
	message Message
}

type pendingCall struct {
	channel chan response
}

type Message struct {
	ID     any             `json:"id,omitempty"`
	Method string          `json:"method,omitempty"`
	Params json.RawMessage `json:"params,omitempty"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *Error          `json:"error,omitempty"`
	client *Client
}

type Error struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type RPCError struct {
	Method  string
	Code    int
	Message string
}

func (err *RPCError) Error() string {
	if err.Method == "" {
		return err.Message
	}
	return fmt.Sprintf("%s failed: %s", err.Method, err.Message)
}

func StartProcess(config ProcessConfig) (*Client, error) {
	if config.Command == "" {
		config.Command = "codex"
	}
	if len(config.Args) == 0 {
		config.Args = []string{"app-server", "--listen", "stdio://"}
	}
	if config.ShutdownGracePeriod <= 0 {
		config.ShutdownGracePeriod = DefaultProcessShutdownGracePeriod
	}
	if config.ShutdownKillPeriod <= 0 {
		config.ShutdownKillPeriod = DefaultProcessShutdownKillPeriod
	}
	cmd := exec.Command(config.Command, config.Args...)
	configureCommandProcessGroup(cmd)
	if len(config.Env) > 0 {
		cmd.Env = append(os.Environ(), config.Env...)
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("create codex app-server stdin: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("create codex app-server stdout: %w", err)
	}
	stderr := newBoundedBuffer(64 * 1024)
	cmd.Stderr = stderr
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start codex app-server: %w", err)
	}
	client := &Client{
		cmd:                 cmd,
		stdin:               stdin,
		notifications:       make(chan Message, 128),
		requests:            make(chan Message, 32),
		lifecycle:           newLifecycle(),
		waitDone:            make(chan struct{}),
		shutdownGracePeriod: config.ShutdownGracePeriod,
		shutdownKillPeriod:  config.ShutdownKillPeriod,
		pending:             map[int]*pendingCall{},
		canceledResponseIDs: map[int]struct{}{},
	}
	go client.readLoop(stdout, stderr)
	return client, nil
}

func (client *Client) Call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	id, responseChannel, err := client.registerPending()
	if err != nil {
		return nil, fmt.Errorf("%s failed: %w", method, err)
	}
	if err := client.write(map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"method":  method,
		"params":  params,
	}); err != nil {
		client.unregisterPending(id)
		return nil, err
	}
	select {
	case <-ctx.Done():
		client.cancelPending(id)
		return nil, ctx.Err()
	case response := <-responseChannel:
		if response.err != nil {
			return nil, fmt.Errorf("%s failed: %w", method, response.err)
		}
		message := response.message
		if message.Error != nil {
			return nil, &RPCError{Method: method, Code: message.Error.Code, Message: message.Error.Message}
		}
		return message.Result, nil
	case <-client.lifecycle.Done():
		return nil, fmt.Errorf("%s failed: %w", method, client.lifecycleError("codex app-server exited"))
	}
}

func (client *Client) Notify(method string, params any) error {
	return client.write(map[string]any{"jsonrpc": "2.0", "method": method, "params": params})
}

func (client *Client) RespondResult(id any, result any) error {
	return client.write(map[string]any{"jsonrpc": "2.0", "id": id, "result": result})
}

func (client *Client) RespondError(id any, code int, message string) error {
	return client.write(map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"error":   map[string]any{"code": code, "message": message},
	})
}

func (message Message) RespondResult(result any) error {
	if message.client == nil {
		return errors.New("codex app-server request has no response client")
	}
	return message.client.RespondResult(message.ID, result)
}

func (message Message) RespondError(code int, text string) error {
	if message.client == nil {
		return errors.New("codex app-server request has no response client")
	}
	return message.client.RespondError(message.ID, code, text)
}

func (client *Client) Notifications() <-chan Message {
	return client.notifications
}

func (client *Client) Requests() <-chan Message {
	return client.requests
}

func (client *Client) Done() <-chan struct{} {
	return client.lifecycle.Done()
}

func (client *Client) Err() error {
	return client.lifecycle.Err()
}

func (client *Client) TerminalError(message string, err error) error {
	return client.terminalError(message, err)
}

func (client *Client) LifecycleError(message string) error {
	return client.lifecycleError(message)
}

func (client *Client) registerPending() (int, chan response, error) {
	select {
	case <-client.lifecycle.Done():
		return 0, nil, client.lifecycleError("codex app-server exited")
	default:
	}
	client.mu.Lock()
	defer client.mu.Unlock()
	select {
	case <-client.lifecycle.Done():
		return 0, nil, client.lifecycleError("codex app-server exited")
	default:
	}
	client.nextID++
	id := client.nextID
	channel := make(chan response, 1)
	client.pending[id] = &pendingCall{channel: channel}
	return id, channel, nil
}

func (client *Client) unregisterPending(id int) {
	client.mu.Lock()
	defer client.mu.Unlock()
	delete(client.pending, id)
}

func (client *Client) cancelPending(id int) {
	client.mu.Lock()
	defer client.mu.Unlock()
	if _, ok := client.pending[id]; ok {
		delete(client.pending, id)
		client.canceledResponseIDs[id] = struct{}{}
		client.canceledResponseOrder = append(client.canceledResponseOrder, id)
		client.pruneCanceledResponsesLocked()
	}
}

func (client *Client) write(payload any) error {
	select {
	case <-client.lifecycle.Done():
		return client.lifecycleError("codex app-server exited")
	default:
	}
	client.mu.Lock()
	defer client.mu.Unlock()
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode codex app-server message: %w", err)
	}
	if _, err := client.stdin.Write(append(data, '\n')); err != nil {
		return fmt.Errorf("write codex app-server message: %w", err)
	}
	return nil
}

func (client *Client) readLoop(stdout io.Reader, stderr fmt.Stringer) {
	var terminalErr error
	defer func() {
		client.finish(terminalErr)
		close(client.waitDone)
	}()
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 4096), 16*1024*1024)
	for scanner.Scan() {
		var message Message
		if err := json.Unmarshal(scanner.Bytes(), &message); err != nil {
			terminalErr = fmt.Errorf("decode codex app-server message: %w", err)
			return
		}
		message.client = client
		if err := client.routeMessage(message); err != nil {
			terminalErr = err
			return
		}
	}
	if err := scanner.Err(); err != nil {
		terminalErr = err
		return
	}
	waitErr := client.cmd.Wait()
	if waitErr != nil {
		message := stderr.String()
		if message != "" {
			terminalErr = fmt.Errorf("%w: %s", waitErr, message)
			return
		}
		terminalErr = waitErr
		return
	}
}

func (client *Client) routeMessage(message Message) error {
	if message.Method != "" && message.ID != nil {
		select {
		case client.requests <- message:
			return nil
		case <-client.lifecycle.Done():
			return client.lifecycleError("codex app-server exited")
		}
	}
	if message.Method != "" {
		select {
		case client.notifications <- message:
			return nil
		case <-client.lifecycle.Done():
			return client.lifecycleError("codex app-server exited")
		}
	}
	if message.ID == nil {
		return nil
	}
	id, ok := intID(message.ID)
	if !ok {
		return fmt.Errorf("codex response id must be an integer: %v", message.ID)
	}
	return client.resolvePending(id, message)
}

func (client *Client) resolvePending(id int, message Message) error {
	client.mu.Lock()
	pending := client.pending[id]
	if pending != nil {
		delete(client.pending, id)
		client.mu.Unlock()
		pending.channel <- response{message: message}
		return nil
	}
	if _, ok := client.canceledResponseIDs[id]; ok {
		delete(client.canceledResponseIDs, id)
		client.compactCanceledResponsesIfNeededLocked()
		client.mu.Unlock()
		return nil
	}
	client.mu.Unlock()
	return fmt.Errorf("codex response id has no pending request: %d", id)
}

func (client *Client) Close() {
	_ = client.shutdown(context.Background())
}

func (client *Client) shutdown(ctx context.Context) error {
	if ctx == nil {
		return errors.New("shutdown context is required")
	}
	client.finish(errors.New("codex app-server client closed"))
	_ = client.stdin.Close()
	if client.cmd == nil || client.cmd.Process == nil {
		return client.waitForProcessExit(ctx, client.shutdownKillPeriod)
	}
	return client.shutdownProcess(ctx)
}

func (client *Client) shutdownProcess(ctx context.Context) error {
	terminateErr := processSignalShutdownError(terminateCommandProcess(client.cmd))
	graceErr := client.waitForProcessExit(ctx, client.shutdownGracePeriod)
	if graceErr == nil {
		_ = killCommandProcess(client.cmd)
		return nil
	}
	killErr := processSignalShutdownError(killCommandProcess(client.cmd))
	killWaitErr := client.waitForProcessExit(ctx, client.shutdownKillPeriod)
	return firstClientShutdownError(
		terminateErr,
		processWaitShutdownError(graceErr),
		killWaitErr,
		killErr,
	)
}

func processSignalShutdownError(err error) error {
	if errors.Is(err, os.ErrProcessDone) {
		return nil
	}
	return err
}

func processWaitShutdownError(err error) error {
	if errors.Is(err, errProcessExitTimeout) {
		return nil
	}
	return err
}

func firstClientShutdownError(errors ...error) error {
	for _, err := range errors {
		if err != nil {
			return err
		}
	}
	return nil
}

func (client *Client) waitForProcessExit(ctx context.Context, timeout time.Duration) error {
	if timeout <= 0 {
		timeout = DefaultProcessShutdownKillPeriod
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-client.waitDone:
		return nil
	case <-timer.C:
		return errProcessExitTimeout
	case <-ctx.Done():
		return ctx.Err()
	}
}

func newLifecycle() *Lifecycle {
	return &Lifecycle{done: make(chan struct{})}
}

func (lifecycle *Lifecycle) Done() <-chan struct{} {
	return lifecycle.done
}

func (lifecycle *Lifecycle) Err() error {
	lifecycle.mu.Lock()
	defer lifecycle.mu.Unlock()
	return lifecycle.err
}

func (lifecycle *Lifecycle) close(err error) {
	lifecycle.once.Do(func() {
		lifecycle.mu.Lock()
		lifecycle.err = err
		lifecycle.mu.Unlock()
		close(lifecycle.done)
	})
}

func (client *Client) finish(err error) {
	client.lifecycle.close(err)
	client.failPending(err)
}

func (client *Client) failPending(err error) {
	client.mu.Lock()
	pending := client.pending
	client.pending = map[int]*pendingCall{}
	client.canceledResponseIDs = map[int]struct{}{}
	client.canceledResponseOrder = nil
	client.mu.Unlock()

	terminalErr := client.terminalError("codex app-server exited", err)
	for _, call := range pending {
		call.channel <- response{err: terminalErr}
	}
}

func (client *Client) pruneCanceledResponsesLocked() {
	for len(client.canceledResponseIDs) > maxCanceledResponseTombstones && len(client.canceledResponseOrder) > 0 {
		id := client.canceledResponseOrder[0]
		client.canceledResponseOrder = client.canceledResponseOrder[1:]
		delete(client.canceledResponseIDs, id)
	}
	client.compactCanceledResponsesIfNeededLocked()
}

func (client *Client) compactCanceledResponsesIfNeededLocked() {
	if len(client.canceledResponseOrder) <= maxCanceledResponseTombstones*2 {
		return
	}
	if len(client.canceledResponseOrder) <= len(client.canceledResponseIDs)*2+maxCanceledResponseTombstones {
		return
	}
	next := client.canceledResponseOrder[:0]
	for _, id := range client.canceledResponseOrder {
		if _, ok := client.canceledResponseIDs[id]; ok {
			next = append(next, id)
		}
	}
	if len(next) == 0 {
		client.canceledResponseOrder = nil
		return
	}
	client.canceledResponseOrder = append([]int(nil), next...)
}

func (client *Client) lifecycleError(message string) error {
	return client.terminalError(message, client.lifecycle.Err())
}

func (client *Client) terminalError(message string, err error) error {
	if err == nil {
		return errors.New(message)
	}
	return fmt.Errorf("%s: %w", message, err)
}

func intID(id any) (int, bool) {
	switch value := id.(type) {
	case float64:
		if value != float64(int(value)) {
			return 0, false
		}
		return int(value), true
	case int:
		return value, true
	default:
		return 0, false
	}
}

type boundedBuffer struct {
	mu        sync.Mutex
	limit     int
	data      []byte
	truncated bool
}

func newBoundedBuffer(limit int) *boundedBuffer {
	return &boundedBuffer{limit: limit}
}

func (buffer *boundedBuffer) Write(data []byte) (int, error) {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	written := len(data)
	if buffer.limit <= 0 || len(data) == 0 {
		return written, nil
	}
	buffer.data = append(buffer.data, data...)
	if len(buffer.data) > buffer.limit {
		buffer.truncated = true
		buffer.data = append([]byte{}, buffer.data[len(buffer.data)-buffer.limit:]...)
	}
	return written, nil
}

func (buffer *boundedBuffer) String() string {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	if len(buffer.data) == 0 {
		return ""
	}
	if buffer.truncated {
		return "<stderr truncated>\n" + string(buffer.data)
	}
	return string(buffer.data)
}
