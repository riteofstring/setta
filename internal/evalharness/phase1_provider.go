package evalharness

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"setta/internal/codexaccount"
	"setta/internal/codexapp"
	"setta/internal/evalharness/providerbridge"
)

const (
	phase1ProviderSocketName   = "app-server.sock"
	phase1ProviderReadyTimeout = 30 * time.Second
	phase1BridgeHandshakeLimit = 160
	phase1BridgeHandshakeTime  = 10 * time.Second
	phase1ProcessStopTimeout   = 10 * time.Second
)

var phase1ProviderExcludedEnvironment = map[string]struct{}{
	"CODEX_ACCESS_TOKEN":                         {},
	"CODEX_API_KEY":                              {},
	"CODEX_EXEC_SERVER_URL":                      {},
	"CODEX_EXEC_SERVER_NOISE_AUTH_TOKEN":         {},
	"CODEX_EXEC_SERVER_NOISE_CHATGPT_ACCOUNT_ID": {},
	"CODEX_EXEC_SERVER_NOISE_ENVIRONMENT_ID":     {},
	"CODEX_EXEC_SERVER_NOISE_REGISTRY_URL":       {},
	"OPENAI_API_KEY":                             {},
	providerbridge.AddressEnvironment:            {},
	providerbridge.TokenEnvironment:              {},
}

type phase1ProviderBroker struct {
	codexCommand string
	socketDir    string
	socketPath   string
	token        string
	listener     net.Listener
	appServer    *phase1ManagedProcess
	tokenBudget  *phase1TokenBudget

	contextCancel context.CancelFunc
	acceptDone    chan struct{}
	connections   sync.WaitGroup
	mutex         sync.Mutex
	closed        bool
	acceptErr     error
}

func startPhase1ProviderBroker(
	ctx context.Context,
	codexCommand string,
	execServerAddress string,
	hardTotalTokens int64,
	abortScenario func(),
) (*phase1ProviderBroker, error) {
	if ctx == nil {
		return nil, errors.New("Phase 1 provider context is required")
	}
	if strings.TrimSpace(codexCommand) == "" {
		codexCommand = "codex"
	}
	if err := validateNumericLoopbackAddress(execServerAddress); err != nil {
		return nil, fmt.Errorf("validate Phase 1 exec-server address: %w", err)
	}
	socketDir, err := os.MkdirTemp("/tmp", "setta-eval-provider-")
	if err != nil {
		return nil, fmt.Errorf("create Phase 1 provider control directory: %w", err)
	}
	if err := os.Chmod(socketDir, 0o700); err != nil {
		return nil, errors.Join(
			fmt.Errorf("secure Phase 1 provider control directory: %w", err),
			removePhase1ProviderControlDirectory(socketDir),
		)
	}
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, errors.Join(
			fmt.Errorf("create Phase 1 provider bridge token: %w", err),
			removePhase1ProviderControlDirectory(socketDir),
		)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, errors.Join(
			fmt.Errorf("listen for Phase 1 provider bridge: %w", err),
			removePhase1ProviderControlDirectory(socketDir),
		)
	}
	tokenBudget, err := newPhase1TokenBudget(hardTotalTokens, abortScenario)
	if err != nil {
		return nil, errors.Join(
			err,
			listener.Close(),
			removePhase1ProviderControlDirectory(socketDir),
		)
	}
	brokerContext, cancel := context.WithCancel(ctx)
	broker := &phase1ProviderBroker{
		codexCommand:  codexCommand,
		socketDir:     socketDir,
		socketPath:    filepath.Join(socketDir, phase1ProviderSocketName),
		token:         hex.EncodeToString(tokenBytes),
		listener:      listener,
		tokenBudget:   tokenBudget,
		contextCancel: cancel,
		acceptDone:    make(chan struct{}),
	}
	if err := broker.startAppServer(brokerContext, execServerAddress); err != nil {
		cleanupContext, cleanupCancel := context.WithTimeout(
			context.Background(),
			phase1ProcessStopTimeout,
		)
		cleanupErr := broker.close(cleanupContext)
		cleanupCancel()
		return nil, errors.Join(err, cleanupErr)
	}
	go broker.acceptConnections(brokerContext)
	return broker, nil
}

func (broker *phase1ProviderBroker) controllerAddress() string {
	_, port, err := net.SplitHostPort(broker.listener.Addr().String())
	if err != nil {
		return ""
	}
	return net.JoinHostPort("host.docker.internal", port)
}

func (broker *phase1ProviderBroker) controllerToken() string {
	return broker.token
}

func (broker *phase1ProviderBroker) verifyChatGPTAuth(ctx context.Context) (returnErr error) {
	title := "Setta Evaluation Preflight"
	experimental := true
	requestAttestation := false
	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process: codexapp.ProcessConfig{
			Command: broker.codexCommand,
			Args: []string{
				"app-server",
				"proxy",
				"--sock",
				broker.socketPath,
			},
			ExcludedEnv: phase1ProviderExcludedEnvironmentNames(),
		},
		InitializeParams: codexapp.InitializeParams{
			ClientInfo: codexapp.ClientInfo{
				Name:    "setta-eval-preflight",
				Title:   &title,
				Version: "phase1",
			},
			Capabilities: &codexapp.InitializeCapabilities{
				ExperimentalApi:    &experimental,
				RequestAttestation: &requestAttestation,
			},
		},
	})
	defer func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), phase1ProcessStopTimeout)
		defer cancel()
		if err := manager.Shutdown(shutdownContext); err != nil {
			returnErr = errors.Join(
				returnErr,
				fmt.Errorf("stop Phase 1 Codex account preflight: %w", err),
			)
		}
	}()
	service, err := codexaccount.NewService(manager)
	if err != nil {
		return fmt.Errorf("create Phase 1 Codex account service: %w", err)
	}
	state, err := service.Read(ctx)
	if err != nil {
		return fmt.Errorf("read Phase 1 Codex account: %w", err)
	}
	if state.Status != codexaccount.AccountStatusSignedIn || state.Account == nil {
		return errors.New("ChatGPT authentication is unavailable; the eval runner never starts login")
	}
	switch state.Account.Type {
	case codexaccount.AccountTypeChatGPT, codexaccount.AccountTypeChatGPTAuthTokens:
		return nil
	default:
		return fmt.Errorf("Phase 1 requires ChatGPT authentication, found %s", state.Account.Type)
	}
}

func (broker *phase1ProviderBroker) startAppServer(
	ctx context.Context,
	execServerAddress string,
) error {
	args := []string{
		"app-server",
		"--listen",
		"unix://" + broker.socketPath,
		"--strict-config",
		"-c",
		`shell_environment_policy.inherit="none"`,
		"-c",
		`shell_environment_policy.set={ HOME = "/tmp", LANG = "C.UTF-8", PATH = "/usr/local/bin:/usr/bin:/bin", SHELL = "/bin/zsh" }`,
	}
	environment := phase1ProviderEnvironment(
		os.Environ(),
		"CODEX_EXEC_SERVER_URL=ws://"+execServerAddress,
	)
	process, err := startPhase1ManagedProcess(ctx, broker.codexCommand, args, environment)
	if err != nil {
		return fmt.Errorf("start Phase 1 host Codex app-server: %w", err)
	}
	broker.appServer = process
	readyContext, cancel := context.WithTimeout(ctx, phase1ProviderReadyTimeout)
	defer cancel()
	if err := waitForPhase1Socket(readyContext, broker.socketPath, process.done); err != nil {
		if diagnostic := process.diagnostic.String(); diagnostic != "" {
			return fmt.Errorf(
				"wait for Phase 1 host Codex app-server: %w: %s",
				err,
				diagnostic,
			)
		}
		return fmt.Errorf("wait for Phase 1 host Codex app-server: %w", err)
	}
	return nil
}

func (broker *phase1ProviderBroker) acceptConnections(ctx context.Context) {
	defer close(broker.acceptDone)
	for {
		connection, err := broker.listener.Accept()
		if err != nil {
			if ctx.Err() != nil || broker.isClosed() {
				return
			}
			broker.setAcceptError(err)
			return
		}
		broker.connections.Add(1)
		go func() {
			defer broker.connections.Done()
			defer connection.Close()
			_ = broker.serveConnection(ctx, connection)
		}()
	}
}

func (broker *phase1ProviderBroker) serveConnection(
	ctx context.Context,
	connection net.Conn,
) error {
	reader, err := broker.authenticateConnection(connection)
	if err != nil {
		return err
	}
	processContext, cancel := context.WithCancel(ctx)
	defer cancel()
	proxy, err := broker.startConnectionProxy(processContext)
	if err != nil {
		return err
	}
	requestDone := make(chan error, 1)
	go func() {
		_, copyErr := io.Copy(proxy.stdin, reader)
		requestErr := errors.Join(copyErr, proxy.stdin.Close())
		if requestErr != nil {
			cancel()
		}
		requestDone <- requestErr
	}()
	responseErr := forwardPhase1ProviderResponses(connection, proxy.stdout, broker.tokenBudget)
	if broker.tokenBudgetFailure() != nil && broker.appServer != nil {
		_, responseStopErr := broker.appServer.interrupt()
		responseErr = errors.Join(responseErr, responseStopErr)
	}
	var requestErr error
	select {
	case requestErr = <-requestDone:
	default:
		cancel()
		_ = connection.Close()
		requestErr = <-requestDone
	}
	waitErr := proxy.command.Wait()
	return phase1ProviderProxyResult(ctx.Err(), requestErr, responseErr, waitErr, proxy.diagnostic)
}

type phase1ConnectionProxy struct {
	command    *exec.Cmd
	stdin      io.WriteCloser
	stdout     io.ReadCloser
	diagnostic *phase1DiagnosticBuffer
}

func (broker *phase1ProviderBroker) startConnectionProxy(
	ctx context.Context,
) (phase1ConnectionProxy, error) {
	command := exec.CommandContext(
		ctx,
		broker.codexCommand,
		"app-server",
		"proxy",
		"--sock",
		broker.socketPath,
	)
	command.Env = phase1ProviderEnvironment(os.Environ())
	stdin, err := command.StdinPipe()
	if err != nil {
		return phase1ConnectionProxy{}, fmt.Errorf("open Phase 1 provider proxy stdin: %w", err)
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		return phase1ConnectionProxy{}, errors.Join(
			fmt.Errorf("open Phase 1 provider proxy stdout: %w", err),
			stdin.Close(),
		)
	}
	diagnostic := newPhase1DiagnosticBuffer(ResultMaximumDiagnosticBytes)
	command.Stderr = diagnostic
	if err := command.Start(); err != nil {
		return phase1ConnectionProxy{}, errors.Join(
			fmt.Errorf("start Phase 1 provider proxy: %w", err),
			stdin.Close(),
			stdout.Close(),
		)
	}
	return phase1ConnectionProxy{
		command:    command,
		stdin:      stdin,
		stdout:     stdout,
		diagnostic: diagnostic,
	}, nil
}

func phase1ProviderProxyResult(
	contextErr error,
	requestErr error,
	responseErr error,
	waitErr error,
	diagnostic fmt.Stringer,
) error {
	if contextErr != nil {
		return contextErr
	}
	if requestErr != nil {
		return fmt.Errorf("forward Phase 1 provider requests: %w", requestErr)
	}
	if responseErr != nil {
		return fmt.Errorf("forward Phase 1 provider events: %w", responseErr)
	}
	if waitErr != nil {
		return fmt.Errorf(
			"Phase 1 provider proxy exited: %w: %s",
			waitErr,
			diagnostic.String(),
		)
	}
	return nil
}

func (broker *phase1ProviderBroker) tokenBudgetFailure() *phase1TokenBudgetFailure {
	if broker == nil {
		return nil
	}
	return broker.tokenBudget.failureState()
}

func (broker *phase1ProviderBroker) observedTokenUsage() bool {
	return broker != nil && broker.tokenBudget.observedUsage()
}

func (broker *phase1ProviderBroker) authenticateConnection(
	connection net.Conn,
) (*bufio.Reader, error) {
	if err := connection.SetDeadline(time.Now().Add(phase1BridgeHandshakeTime)); err != nil {
		return nil, fmt.Errorf("set Phase 1 provider bridge deadline: %w", err)
	}
	reader := bufio.NewReaderSize(connection, phase1BridgeHandshakeLimit)
	line, err := reader.ReadSlice('\n')
	if err != nil {
		return nil, fmt.Errorf("read Phase 1 provider bridge handshake: %w", err)
	}
	want := providerbridge.Handshake(broker.token)
	if string(line) != want {
		return nil, errors.New("Phase 1 provider bridge authentication failed")
	}
	if _, err := io.WriteString(connection, providerbridge.Acknowledgement); err != nil {
		return nil, fmt.Errorf("acknowledge Phase 1 provider bridge: %w", err)
	}
	if err := connection.SetDeadline(time.Time{}); err != nil {
		return nil, fmt.Errorf("clear Phase 1 provider bridge deadline: %w", err)
	}
	return reader, nil
}

func (broker *phase1ProviderBroker) close(ctx context.Context) error {
	if broker == nil {
		return nil
	}
	if !broker.beginClose() {
		return nil
	}
	return errors.Join(
		broker.closeListener(),
		broker.waitForListener(ctx),
		broker.acceptError(),
		broker.waitForConnections(ctx),
		broker.stopAppServer(ctx),
		removePhase1ProviderControlDirectory(broker.socketDir),
	)
}

func (broker *phase1ProviderBroker) beginClose() bool {
	broker.mutex.Lock()
	if broker.closed {
		broker.mutex.Unlock()
		return false
	}
	broker.closed = true
	broker.mutex.Unlock()
	if broker.contextCancel != nil {
		broker.contextCancel()
	}
	return true
}

func (broker *phase1ProviderBroker) setAcceptError(err error) {
	broker.mutex.Lock()
	defer broker.mutex.Unlock()
	broker.acceptErr = fmt.Errorf("accept Phase 1 provider bridge connection: %w", err)
}

func (broker *phase1ProviderBroker) acceptError() error {
	broker.mutex.Lock()
	defer broker.mutex.Unlock()
	return broker.acceptErr
}

func (broker *phase1ProviderBroker) closeListener() error {
	if broker.listener == nil {
		return nil
	}
	err := broker.listener.Close()
	if err != nil && !errors.Is(err, net.ErrClosed) {
		return fmt.Errorf("close Phase 1 provider bridge listener: %w", err)
	}
	return nil
}

func (broker *phase1ProviderBroker) waitForListener(ctx context.Context) error {
	if broker.acceptDone == nil {
		return nil
	}
	select {
	case <-broker.acceptDone:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("wait for Phase 1 provider bridge listener: %w", ctx.Err())
	}
}

func (broker *phase1ProviderBroker) waitForConnections(ctx context.Context) error {
	connectionsDone := make(chan struct{})
	go func() {
		broker.connections.Wait()
		close(connectionsDone)
	}()
	select {
	case <-connectionsDone:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("wait for Phase 1 provider bridge connections: %w", ctx.Err())
	}
}

func (broker *phase1ProviderBroker) stopAppServer(ctx context.Context) error {
	if broker.appServer == nil {
		return nil
	}
	if err := broker.appServer.stop(ctx); err != nil {
		return fmt.Errorf("stop Phase 1 host Codex app-server: %w", err)
	}
	return nil
}

func removePhase1ProviderControlDirectory(path string) error {
	if path == "" {
		return nil
	}
	if err := os.RemoveAll(path); err != nil {
		return fmt.Errorf("remove Phase 1 provider control directory: %w", err)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		return errors.New("Phase 1 provider control directory remains after cleanup")
	}
	return nil
}

func (broker *phase1ProviderBroker) isClosed() bool {
	broker.mutex.Lock()
	defer broker.mutex.Unlock()
	return broker.closed
}

type phase1ManagedProcess struct {
	command      *exec.Cmd
	diagnostic   *phase1DiagnosticBuffer
	done         chan error
	stopOnce     sync.Once
	stopMutex    sync.Mutex
	interrupted  bool
	interruptErr error
}

func startPhase1ManagedProcess(
	ctx context.Context,
	name string,
	args []string,
	environment []string,
) (*phase1ManagedProcess, error) {
	command := exec.CommandContext(ctx, name, args...)
	command.Env = environment
	diagnostic := newPhase1DiagnosticBuffer(ResultMaximumDiagnosticBytes)
	command.Stdout = io.Discard
	command.Stderr = diagnostic
	if err := command.Start(); err != nil {
		return nil, err
	}
	process := &phase1ManagedProcess{
		command:    command,
		diagnostic: diagnostic,
		done:       make(chan error, 1),
	}
	go func() {
		process.done <- command.Wait()
		close(process.done)
	}()
	return process, nil
}

func (process *phase1ManagedProcess) stop(ctx context.Context) error {
	if process == nil || process.command == nil {
		return nil
	}
	interrupted, stopErr := process.interrupt()
	select {
	case err := <-process.done:
		return phase1ManagedProcessStopError(err, stopErr, interrupted)
	case <-ctx.Done():
		return errors.Join(stopErr, process.killAndWait(), ctx.Err())
	}
}

func (process *phase1ManagedProcess) interrupt() (bool, error) {
	if process.command.Process == nil {
		return false, nil
	}
	process.stopOnce.Do(func() {
		err := process.command.Process.Signal(os.Interrupt)
		if err == nil {
			process.stopMutex.Lock()
			process.interrupted = true
			process.stopMutex.Unlock()
		} else if !errors.Is(err, os.ErrProcessDone) {
			process.stopMutex.Lock()
			process.interruptErr = err
			process.stopMutex.Unlock()
		}
	})
	process.stopMutex.Lock()
	defer process.stopMutex.Unlock()
	return process.interrupted, process.interruptErr
}

func phase1ManagedProcessStopError(waitErr error, stopErr error, interrupted bool) error {
	if waitErr != nil && stopErr == nil && !interrupted {
		return waitErr
	}
	return stopErr
}

func (process *phase1ManagedProcess) killAndWait() error {
	var killErr error
	if process.command.Process != nil {
		if err := process.command.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
			killErr = err
		}
	}
	select {
	case <-process.done:
	case <-time.After(phase1ProcessStopTimeout):
	}
	return killErr
}

func waitForPhase1Socket(
	ctx context.Context,
	path string,
	processDone <-chan error,
) error {
	ticker := time.NewTicker(25 * time.Millisecond)
	defer ticker.Stop()
	for {
		info, err := os.Lstat(path)
		if err == nil && info.Mode()&os.ModeSocket != 0 {
			return nil
		}
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		select {
		case processErr := <-processDone:
			return fmt.Errorf("Codex app-server exited before readiness: %v", processErr)
		case <-ticker.C:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func phase1ProviderEnvironment(inherited []string, additions ...string) []string {
	result := make([]string, 0, len(inherited)+len(additions))
	for _, entry := range inherited {
		name, _, _ := strings.Cut(entry, "=")
		if _, excluded := phase1ProviderExcludedEnvironment[name]; !excluded {
			result = append(result, entry)
		}
	}
	return append(result, additions...)
}

func phase1ProviderExcludedEnvironmentNames() []string {
	names := make([]string, 0, len(phase1ProviderExcludedEnvironment))
	for name := range phase1ProviderExcludedEnvironment {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func validateNumericLoopbackAddress(value string) error {
	host, port, err := net.SplitHostPort(value)
	if err != nil {
		return err
	}
	address := net.ParseIP(host)
	if address == nil || !address.IsLoopback() || port == "" {
		return fmt.Errorf("address must use a numeric loopback host and explicit port: %s", value)
	}
	return nil
}

type phase1DiagnosticBuffer struct {
	mutex     sync.Mutex
	content   []byte
	maximum   int
	truncated bool
}

func newPhase1DiagnosticBuffer(maximum int) *phase1DiagnosticBuffer {
	return &phase1DiagnosticBuffer{maximum: maximum}
}

func (buffer *phase1DiagnosticBuffer) Write(value []byte) (int, error) {
	buffer.mutex.Lock()
	defer buffer.mutex.Unlock()
	written := len(value)
	remaining := buffer.maximum - len(buffer.content)
	if remaining <= 0 {
		buffer.truncated = true
		return written, nil
	}
	if len(value) > remaining {
		buffer.content = append(buffer.content, value[:remaining]...)
		buffer.truncated = true
		return written, nil
	}
	buffer.content = append(buffer.content, value...)
	return written, nil
}

func (buffer *phase1DiagnosticBuffer) String() string {
	buffer.mutex.Lock()
	defer buffer.mutex.Unlock()
	value := strings.TrimSpace(strings.ToValidUTF8(string(buffer.content), "�"))
	if buffer.truncated {
		value += "..."
	}
	return value
}
