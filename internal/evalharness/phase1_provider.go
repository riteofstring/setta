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
	"sort"
	"strings"
	"sync"
	"time"

	"setta/internal/codexaccount"
	"setta/internal/codexapp"
	"setta/internal/evalharness/providerbridge"
	"setta/internal/evalharness/tokenusage"
)

const (
	phase1AuthPreflightTimeout = 30 * time.Second
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
	tokenusage.PathEnvironment:                   {},
}

type phase1ProviderBroker struct {
	codexCommand  string
	execServerURL string
	token         string
	listener      net.Listener
	tokenBudget   *phase1TokenBudget
	abortScenario func()

	contextCancel context.CancelFunc
	acceptDone    chan struct{}
	connections   sync.WaitGroup
	mutex         sync.Mutex
	closed        bool
	connectionSet bool
	providerErr   error
}

func startPhase1ProviderBroker(
	ctx context.Context,
	codexCommand string,
	execServerURL string,
	hardTotalTokens int64,
	abortScenario func(),
) (*phase1ProviderBroker, error) {
	if ctx == nil {
		return nil, errors.New("Phase 1 provider context is required")
	}
	if strings.TrimSpace(codexCommand) == "" {
		codexCommand = "codex"
	}
	if err := validateExecServerControlEndpointURL(execServerURL); err != nil {
		return nil, fmt.Errorf("validate Phase 1 exec-server control URL: %w", err)
	}
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, fmt.Errorf("create Phase 1 provider bridge token: %w", err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("listen for Phase 1 provider bridge: %w", err)
	}
	tokenBudget, err := newPhase1TokenBudget(hardTotalTokens, abortScenario)
	if err != nil {
		return nil, errors.Join(err, listener.Close())
	}
	brokerContext, cancel := context.WithCancel(ctx)
	broker := &phase1ProviderBroker{
		codexCommand:  codexCommand,
		execServerURL: execServerURL,
		token:         hex.EncodeToString(tokenBytes),
		listener:      listener,
		tokenBudget:   tokenBudget,
		abortScenario: abortScenario,
		contextCancel: cancel,
	}
	broker.acceptDone = make(chan struct{})
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
	preflightContext, cancelPreflight := context.WithTimeout(ctx, phase1AuthPreflightTimeout)
	defer cancelPreflight()
	title := "Setta Evaluation Preflight"
	experimental := true
	requestAttestation := false
	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process: codexapp.ProcessConfig{
			Command:     broker.codexCommand,
			Args:        phase1AppServerArgs(),
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
	state, err := service.Read(preflightContext)
	if err != nil {
		return fmt.Errorf("read Phase 1 Codex account: %w", err)
	}
	if state.Status != codexaccount.AccountStatusSignedIn || state.Account == nil {
		if state.Diagnostic != "" {
			return fmt.Errorf("ChatGPT authentication preflight failed: %s", state.Diagnostic)
		}
		return errors.New("ChatGPT authentication is unavailable; the eval runner never starts login")
	}
	switch state.Account.Type {
	case codexaccount.AccountTypeChatGPT, codexaccount.AccountTypeChatGPTAuthTokens:
		return nil
	default:
		return fmt.Errorf("Phase 1 requires ChatGPT authentication, found %s", state.Account.Type)
	}
}

func phase1AppServerArgs() []string {
	return []string{
		"app-server",
		"--listen",
		"stdio://",
		"--strict-config",
		"-c",
		execServerBlockingEnvironment,
		"-c",
		execServerCodeModeDisabled,
		"-c",
		execServerCodeModeOnlyDisabled,
		"-c",
		execServerShellToolEnabled,
		"-c",
		execServerShellZshForkDisabled,
		"-c",
		execServerUnifiedExecEnabled,
		"-c",
		execServerUnifiedZshDisabled,
		"-c",
		`shell_environment_policy.inherit="none"`,
		"-c",
		`shell_environment_policy.set={ HOME = "/tmp", LANG = "C.UTF-8", PATH = "/usr/local/bin:/usr/bin:/bin", SHELL = "/bin/zsh" }`,
	}
}

func (broker *phase1ProviderBroker) acceptConnections(ctx context.Context) {
	defer close(broker.acceptDone)
	for {
		connection, err := broker.listener.Accept()
		if err != nil {
			if ctx.Err() != nil || broker.isClosed() {
				return
			}
			broker.recordProviderFailure(fmt.Errorf("accept Phase 1 provider bridge connection: %w", err))
			return
		}
		broker.connections.Add(1)
		go func() {
			defer broker.connections.Done()
			defer connection.Close()
			if err := broker.serveConnection(ctx, connection); err != nil &&
				ctx.Err() == nil && broker.tokenBudgetFailure() == nil {
				broker.recordProviderFailure(fmt.Errorf("serve Phase 1 provider bridge connection: %w", err))
			}
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
	if !broker.claimConnection() {
		return errors.New("Phase 1 provider bridge accepts exactly one production manager connection")
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
	if broker.tokenBudgetFailure() != nil {
		responseStopErr := proxy.interrupt()
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
		phase1AppServerArgs()...,
	)
	command.Env = phase1ProviderEnvironment(
		os.Environ(),
		"CODEX_EXEC_SERVER_URL="+broker.execServerURL,
	)
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

func (proxy phase1ConnectionProxy) interrupt() error {
	if proxy.command == nil || proxy.command.Process == nil {
		return nil
	}
	if err := proxy.command.Process.Signal(os.Interrupt); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return fmt.Errorf("interrupt Phase 1 provider process: %w", err)
	}
	return nil
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
	broker.beginClose()
	var closeErrors []error
	if err := broker.closeListener(); err != nil {
		closeErrors = append(closeErrors, err)
	}
	listenerErr := broker.waitForListener(ctx)
	if listenerErr != nil {
		closeErrors = append(closeErrors, listenerErr)
	} else if err := broker.waitForConnections(ctx); err != nil {
		// WaitGroup.Add happens only in the listener loop. Waiting for that loop
		// first keeps a timed-out close safe to retry.
		closeErrors = append(closeErrors, err)
	}
	return errors.Join(closeErrors...)
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

func (broker *phase1ProviderBroker) recordProviderFailure(err error) {
	if err == nil {
		return
	}
	broker.mutex.Lock()
	if broker.closed || broker.providerErr != nil {
		broker.mutex.Unlock()
		return
	}
	broker.providerErr = err
	abort := broker.abortScenario
	broker.mutex.Unlock()
	if abort != nil {
		abort()
	}
}

func (broker *phase1ProviderBroker) claimConnection() bool {
	broker.mutex.Lock()
	defer broker.mutex.Unlock()
	if broker.closed || broker.connectionSet {
		return false
	}
	broker.connectionSet = true
	return true
}

func (broker *phase1ProviderBroker) providerFailure() error {
	if broker == nil {
		return nil
	}
	broker.mutex.Lock()
	defer broker.mutex.Unlock()
	return broker.providerErr
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

func (broker *phase1ProviderBroker) isClosed() bool {
	broker.mutex.Lock()
	defer broker.mutex.Unlock()
	return broker.closed
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
