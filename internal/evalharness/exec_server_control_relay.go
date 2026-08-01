package evalharness

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha1" // #nosec G505 -- RFC 6455 requires SHA-1 for the WebSocket accept value.
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const (
	execServerControlPathPrefix     = "/exec-server/"
	execServerControlTransport      = "host-loopback-websocket/docker-attach-stdio"
	execServerControlTokenBytes     = 32
	execServerHandshakeMaximumBytes = 16 * 1024
	execServerHandshakeTimeout      = 10 * time.Second
	execServerMessageMaximumBytes   = 64 * 1024 * 1024
	execServerBlockingEnvironment   = "features.deferred_executor=false"
	webSocketAcceptGUID             = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
)

var errExecServerWebSocketClosed = errors.New("exec-server WebSocket closed")

type execServerControlEndpoint struct {
	Address string
	URL     string
}

type execServerControlRelay struct {
	parentContext context.Context
	cancel        context.CancelFunc
	listener      net.Listener
	endpoint      execServerControlEndpoint
	requestPath   string
	attach        *exec.Cmd
	attachStdin   io.WriteCloser
	attachStdout  io.ReadCloser
	diagnostic    *phase1DiagnosticBuffer
	abort         func()
	done          chan struct{}
	stopOnce      sync.Once
	waitGroup     sync.WaitGroup

	mutex      sync.Mutex
	connection net.Conn
	closing    bool
	failureErr error
}

type execServerWebSocket struct {
	reader *bufio.Reader
	writer io.Writer
	mutex  sync.Mutex
}

type execServerWebSocketFrame struct {
	final   bool
	opcode  byte
	payload []byte
}

func startExecServerControlRelay(
	ctx context.Context,
	client phase0DockerClient,
	containerName string,
	abort func(),
) (*execServerControlRelay, error) {
	if ctx == nil {
		return nil, errors.New("exec-server control relay context is required")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if strings.TrimSpace(containerName) == "" {
		return nil, errors.New("exec-server control relay container is required")
	}
	requestPath, err := newExecServerControlPath()
	if err != nil {
		return nil, err
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("listen for exec-server control relay: %w", err)
	}
	address := listener.Addr().String()
	endpoint := execServerControlEndpoint{
		Address: address,
		URL:     "ws://" + address + requestPath,
	}
	if err := validateExecServerControlEndpoint(endpoint); err != nil {
		_ = listener.Close()
		return nil, err
	}
	relayContext, cancel := context.WithCancel(ctx)
	relay := &execServerControlRelay{
		parentContext: ctx,
		cancel:        cancel,
		listener:      listener,
		endpoint:      endpoint,
		requestPath:   requestPath,
		diagnostic:    newPhase1DiagnosticBuffer(ResultMaximumDiagnosticBytes),
		abort:         abort,
		done:          make(chan struct{}),
	}
	if err := relay.startAttach(client, containerName); err != nil {
		cancel()
		_ = listener.Close()
		return nil, err
	}
	relay.waitGroup.Add(2)
	go relay.serve()
	go relay.waitForAttach()
	go relay.finishWhenStopped()
	go relay.stopWithContext(relayContext)
	return relay, nil
}

func (relay *execServerControlRelay) startAttach(
	client phase0DockerClient,
	containerName string,
) error {
	command := exec.Command(
		client.command,
		"container", "attach",
		"--sig-proxy=false",
		containerName,
	)
	command.Dir = client.repoRoot
	stdin, err := command.StdinPipe()
	if err != nil {
		return fmt.Errorf("open Docker attach stdin: %w", err)
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		return fmt.Errorf("open Docker attach stdout: %w", err)
	}
	command.Stderr = relay.diagnostic
	if err := command.Start(); err != nil {
		_ = stdin.Close()
		_ = stdout.Close()
		return fmt.Errorf("start Docker attach for exec-server control: %w", err)
	}
	relay.attach = command
	relay.attachStdin = stdin
	relay.attachStdout = stdout
	return nil
}

func (relay *execServerControlRelay) endpointValue() execServerControlEndpoint {
	if relay == nil {
		return execServerControlEndpoint{}
	}
	return relay.endpoint
}

func (relay *execServerControlRelay) beginShutdown() {
	if relay == nil {
		return
	}
	relay.mutex.Lock()
	relay.closing = true
	relay.mutex.Unlock()
}

func (relay *execServerControlRelay) beginHealthyShutdown() error {
	if relay == nil {
		return errors.New("exec-server control relay is required")
	}
	relay.mutex.Lock()
	defer relay.mutex.Unlock()
	if relay.failureErr != nil {
		return relay.failureErr
	}
	if relay.closing {
		return errors.New("exec-server control relay entered shutdown unexpectedly")
	}
	if relay.connection == nil {
		return errors.New("exec-server control connection ended before coordinated shutdown")
	}
	relay.closing = true
	return nil
}

func (relay *execServerControlRelay) close(ctx context.Context) error {
	if relay == nil {
		return nil
	}
	relay.beginShutdown()
	relay.stopIO()
	relay.cancel()
	attachErr := relay.stopAttachProcess()
	select {
	case <-relay.done:
		return attachErr
	case <-ctx.Done():
		return errors.Join(attachErr, fmt.Errorf("stop exec-server control relay: %w", ctx.Err()))
	}
}

func (relay *execServerControlRelay) stopAttachProcess() error {
	if relay.attach == nil || relay.attach.Process == nil {
		return nil
	}
	if err := relay.attach.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return fmt.Errorf("stop Docker attach process: %w", err)
	}
	return nil
}

func (relay *execServerControlRelay) failure() error {
	if relay == nil {
		return nil
	}
	relay.mutex.Lock()
	defer relay.mutex.Unlock()
	return relay.failureErr
}

func (relay *execServerControlRelay) serve() {
	defer relay.waitGroup.Done()
	connection, reader, err := relay.acceptAuthenticatedConnection()
	if err != nil {
		if !relay.expectedStop() {
			relay.recordFailure(fmt.Errorf("accept exec-server control connection: %w", err))
		}
		return
	}
	if !relay.retainConnection(connection) {
		_ = connection.Close()
		return
	}
	_ = relay.listener.Close()
	socket := &execServerWebSocket{reader: reader, writer: connection}
	bridgeErr := relay.bridge(socket, connection)
	relay.releaseConnection(connection)
	if bridgeErr != nil && !relay.expectedStop() {
		relay.recordFailure(fmt.Errorf("forward exec-server control: %w", bridgeErr))
	}
	relay.stopIO()
}

func (relay *execServerControlRelay) acceptAuthenticatedConnection() (
	net.Conn,
	*bufio.Reader,
	error,
) {
	for {
		connection, err := relay.listener.Accept()
		if err != nil {
			return nil, nil, err
		}
		reader, err := relay.upgradeConnection(connection)
		if err == nil {
			return connection, reader, nil
		}
		_ = writeExecServerHandshakeRejection(connection)
		_ = connection.Close()
		if relay.expectedStop() {
			return nil, nil, net.ErrClosed
		}
	}
}

func (relay *execServerControlRelay) upgradeConnection(
	connection net.Conn,
) (*bufio.Reader, error) {
	if err := connection.SetDeadline(time.Now().Add(execServerHandshakeTimeout)); err != nil {
		return nil, err
	}
	if !numericLoopbackRemote(connection.RemoteAddr()) {
		return nil, errors.New("control client is not on numeric loopback")
	}
	reader := bufio.NewReaderSize(connection, execServerHandshakeMaximumBytes)
	request, err := readExecServerUpgradeRequest(reader)
	if err != nil {
		return nil, err
	}
	if request.Body != nil {
		defer request.Body.Close()
	}
	key, err := validateExecServerUpgradeRequest(request, relay.endpoint.Address, relay.requestPath)
	if err != nil {
		return nil, err
	}
	if err := writeExecServerUpgradeResponse(connection, key); err != nil {
		return nil, err
	}
	if err := connection.SetDeadline(time.Time{}); err != nil {
		return nil, err
	}
	return reader, nil
}

func readExecServerUpgradeRequest(reader *bufio.Reader) (*http.Request, error) {
	var encoded bytes.Buffer
	for {
		fragment, err := reader.ReadSlice('\n')
		if encoded.Len()+len(fragment) > execServerHandshakeMaximumBytes {
			return nil, errors.New("exec-server WebSocket handshake exceeds its size limit")
		}
		_, _ = encoded.Write(fragment)
		if err != nil {
			if errors.Is(err, bufio.ErrBufferFull) {
				continue
			}
			return nil, err
		}
		if bytes.Equal(fragment, []byte("\n")) || bytes.Equal(fragment, []byte("\r\n")) {
			break
		}
	}
	request, err := http.ReadRequest(bufio.NewReader(bytes.NewReader(encoded.Bytes())))
	if err != nil {
		return nil, err
	}
	return request, nil
}

func (relay *execServerControlRelay) bridge(
	socket *execServerWebSocket,
	connection net.Conn,
) error {
	results := make(chan error, 2)
	go func() {
		results <- forwardExecServerWebSocketToStdio(socket, relay.attachStdin)
	}()
	go func() {
		results <- forwardExecServerStdioToWebSocket(relay.attachStdout, socket)
	}()
	first := <-results
	_ = connection.Close()
	_ = relay.attachStdin.Close()
	second := <-results
	if first != nil && !errors.Is(first, errExecServerWebSocketClosed) {
		return first
	}
	if second != nil && !isClosedControlIO(second) {
		return second
	}
	return first
}

func (relay *execServerControlRelay) waitForAttach() {
	defer relay.waitGroup.Done()
	err := relay.attach.Wait()
	if relay.expectedStop() {
		return
	}
	message := "Docker attach exited before exec-server control shutdown"
	if diagnostic := relay.diagnostic.String(); diagnostic != "" {
		message += ": " + diagnostic
	}
	if err != nil {
		relay.recordFailure(fmt.Errorf("%s: %w", message, err))
		return
	}
	relay.recordFailure(errors.New(message))
}

func (relay *execServerControlRelay) finishWhenStopped() {
	relay.waitGroup.Wait()
	close(relay.done)
}

func (relay *execServerControlRelay) stopWithContext(ctx context.Context) {
	<-ctx.Done()
	relay.beginShutdown()
	relay.stopIO()
}

func (relay *execServerControlRelay) retainConnection(connection net.Conn) bool {
	relay.mutex.Lock()
	defer relay.mutex.Unlock()
	if relay.closing || relay.connection != nil {
		return false
	}
	relay.connection = connection
	return true
}

func (relay *execServerControlRelay) releaseConnection(connection net.Conn) {
	relay.mutex.Lock()
	defer relay.mutex.Unlock()
	if relay.connection == connection {
		relay.connection = nil
	}
}

func (relay *execServerControlRelay) expectedStop() bool {
	relay.mutex.Lock()
	defer relay.mutex.Unlock()
	return relay.closing || relay.parentContext.Err() != nil || relay.failureErr != nil
}

func (relay *execServerControlRelay) recordFailure(err error) {
	if err == nil {
		return
	}
	relay.mutex.Lock()
	if relay.closing || relay.parentContext.Err() != nil || relay.failureErr != nil {
		relay.mutex.Unlock()
		return
	}
	relay.failureErr = err
	abort := relay.abort
	relay.mutex.Unlock()
	relay.cancel()
	relay.stopIO()
	if abort != nil {
		abort()
	}
}

func (relay *execServerControlRelay) stopIO() {
	relay.stopOnce.Do(func() {
		_ = relay.listener.Close()
		relay.mutex.Lock()
		connection := relay.connection
		relay.mutex.Unlock()
		if connection != nil {
			_ = connection.Close()
		}
		_ = relay.attachStdin.Close()
		_ = relay.attachStdout.Close()
	})
}

func newExecServerControlPath() (string, error) {
	token := make([]byte, execServerControlTokenBytes)
	if _, err := rand.Read(token); err != nil {
		return "", fmt.Errorf("create exec-server control capability: %w", err)
	}
	return execServerControlPathPrefix + hex.EncodeToString(token), nil
}

func validateExecServerControlEndpoint(endpoint execServerControlEndpoint) error {
	if err := validateNumericLoopbackAddress(endpoint.Address); err != nil {
		return fmt.Errorf("validate exec-server relay address: %w", err)
	}
	if !strings.HasPrefix(endpoint.Address, "127.0.0.1:") {
		return errors.New("exec-server relay must bind IPv4 host loopback")
	}
	parsed, err := url.Parse(endpoint.URL)
	if err != nil {
		return fmt.Errorf("parse exec-server relay URL: %w", err)
	}
	if !unadornedExecServerControlURL(parsed, endpoint.Address) {
		return errors.New("exec-server relay URL must be an unadorned host-loopback WebSocket URL")
	}
	token := strings.TrimPrefix(parsed.Path, execServerControlPathPrefix)
	if parsed.Path == token || !validLowerHex(token, execServerControlTokenBytes*2) {
		return errors.New("exec-server relay URL is missing its capability path")
	}
	return nil
}

func unadornedExecServerControlURL(parsed *url.URL, address string) bool {
	return parsed.Scheme == "ws" && parsed.Host == address && parsed.User == nil &&
		parsed.Opaque == "" && parsed.RawQuery == "" && parsed.Fragment == "" &&
		parsed.RawPath == ""
}

func validateExecServerControlEndpointURL(value string) error {
	parsed, err := url.Parse(value)
	if err != nil {
		return err
	}
	return validateExecServerControlEndpoint(execServerControlEndpoint{
		Address: parsed.Host,
		URL:     value,
	})
}

func validateExecServerUpgradeRequest(
	request *http.Request,
	wantHost string,
	wantPath string,
) (string, error) {
	if !validExecServerUpgradeTarget(request, wantHost, wantPath) {
		return "", errors.New("WebSocket request does not target the control capability")
	}
	if !validExecServerUpgradeHeaders(request.Header) {
		return "", errors.New("invalid exec-server WebSocket upgrade headers")
	}
	keys := request.Header.Values("Sec-WebSocket-Key")
	if len(keys) != 1 {
		return "", errors.New("invalid exec-server WebSocket key")
	}
	key := strings.TrimSpace(keys[0])
	decoded, err := base64.StdEncoding.DecodeString(key)
	if err != nil || len(decoded) != 16 {
		return "", errors.New("invalid exec-server WebSocket key")
	}
	return key, nil
}

func validExecServerUpgradeTarget(request *http.Request, wantHost string, wantPath string) bool {
	return request.Method == http.MethodGet && request.ProtoMajor == 1 && request.ProtoMinor == 1 &&
		request.Host == wantHost && request.RequestURI == wantPath && request.URL.Path == wantPath &&
		request.URL.RawPath == "" && request.URL.RawQuery == "" && request.ContentLength <= 0 &&
		len(request.TransferEncoding) == 0
}

func validExecServerUpgradeHeaders(header http.Header) bool {
	_, originPresent := header[http.CanonicalHeaderKey("Origin")]
	return !originPresent && headerHasToken(header, "Connection", "upgrade") &&
		headerEqualsSingleValue(header, "Upgrade", "websocket", true) &&
		headerEqualsSingleValue(header, "Sec-WebSocket-Version", "13", false)
}

func headerHasToken(header http.Header, name string, want string) bool {
	for _, value := range header.Values(name) {
		for _, token := range strings.Split(value, ",") {
			if strings.EqualFold(strings.TrimSpace(token), want) {
				return true
			}
		}
	}
	return false
}

func headerEqualsSingleValue(header http.Header, name string, want string, fold bool) bool {
	values := header.Values(name)
	if len(values) != 1 {
		return false
	}
	value := strings.TrimSpace(values[0])
	if fold {
		return strings.EqualFold(value, want)
	}
	return value == want
}

func writeExecServerUpgradeResponse(writer io.Writer, key string) error {
	hasher := sha1.New() // #nosec G401 -- RFC 6455 requires SHA-1 for the accept value.
	_, _ = io.WriteString(hasher, key+webSocketAcceptGUID)
	accept := base64.StdEncoding.EncodeToString(hasher.Sum(nil))
	_, err := fmt.Fprintf(
		writer,
		"HTTP/1.1 101 Switching Protocols\r\n"+
			"Connection: Upgrade\r\n"+
			"Upgrade: websocket\r\n"+
			"Sec-WebSocket-Accept: %s\r\n\r\n",
		accept,
	)
	return err
}

func writeExecServerHandshakeRejection(writer io.Writer) error {
	_, err := io.WriteString(
		writer,
		"HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
	)
	return err
}

func numericLoopbackRemote(address net.Addr) bool {
	host, _, err := net.SplitHostPort(address.String())
	if err != nil {
		return false
	}
	parsed := net.ParseIP(host)
	return parsed != nil && parsed.IsLoopback()
}

func forwardExecServerWebSocketToStdio(
	socket *execServerWebSocket,
	writer io.Writer,
) error {
	for {
		payload, err := socket.readMessage()
		if err != nil {
			return err
		}
		compact, err := compactExecServerJSON(payload)
		if err != nil {
			return err
		}
		compact = append(compact, '\n')
		if err := writeAll(writer, compact); err != nil {
			return err
		}
	}
}

func forwardExecServerStdioToWebSocket(
	reader io.Reader,
	socket *execServerWebSocket,
) error {
	buffered := bufio.NewReaderSize(reader, 64*1024)
	for {
		line, err := readBoundedExecServerLine(buffered)
		if err != nil {
			return err
		}
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}
		compact, err := compactExecServerJSON(line)
		if err != nil {
			return err
		}
		if err := socket.writeFrame(0x1, compact); err != nil {
			return err
		}
	}
}

func compactExecServerJSON(payload []byte) ([]byte, error) {
	if len(payload) == 0 || len(payload) > execServerMessageMaximumBytes {
		return nil, errors.New("exec-server control message has an invalid size")
	}
	var compact bytes.Buffer
	compact.Grow(len(payload))
	if err := json.Compact(&compact, payload); err != nil {
		return nil, fmt.Errorf("exec-server control message is not JSON: %w", err)
	}
	if compact.Len() == 0 || compact.Bytes()[0] != '{' {
		return nil, errors.New("exec-server control message must be a JSON object")
	}
	return compact.Bytes(), nil
}

func readBoundedExecServerLine(reader *bufio.Reader) ([]byte, error) {
	line := make([]byte, 0, 4096)
	for {
		fragment, err := reader.ReadSlice('\n')
		if len(line)+len(fragment) > execServerMessageMaximumBytes+2 {
			return nil, errors.New("exec-server stdio message exceeds its size limit")
		}
		line = append(line, fragment...)
		if err == nil {
			break
		}
		if errors.Is(err, bufio.ErrBufferFull) {
			continue
		}
		if errors.Is(err, io.EOF) && len(line) > 0 {
			break
		}
		return nil, err
	}
	line = bytes.TrimSuffix(line, []byte{'\n'})
	line = bytes.TrimSuffix(line, []byte{'\r'})
	if len(line) > execServerMessageMaximumBytes {
		return nil, errors.New("exec-server stdio message exceeds its size limit")
	}
	return line, nil
}

func (socket *execServerWebSocket) readMessage() ([]byte, error) {
	var fragmentedOpcode byte
	var message []byte
	for {
		frame, err := socket.readFrame()
		if err != nil {
			return nil, err
		}
		switch frame.opcode {
		case 0x8:
			_ = socket.writeFrame(0x8, frame.payload)
			return nil, errExecServerWebSocketClosed
		case 0x9:
			if err := socket.writeFrame(0xA, frame.payload); err != nil {
				return nil, err
			}
			continue
		case 0xA:
			continue
		}
		fragmentedOpcode, message, err = appendExecServerFrame(
			fragmentedOpcode,
			message,
			frame,
		)
		if err != nil {
			return nil, err
		}
		if frame.final {
			if fragmentedOpcode == 0x1 && !utf8.Valid(message) {
				return nil, errors.New("exec-server WebSocket text is not UTF-8")
			}
			return message, nil
		}
	}
}

func appendExecServerFrame(
	fragmentedOpcode byte,
	message []byte,
	frame execServerWebSocketFrame,
) (byte, []byte, error) {
	if frame.opcode == 0x0 {
		if fragmentedOpcode == 0 {
			return 0, nil, errors.New("unexpected exec-server WebSocket continuation")
		}
	} else {
		if frame.opcode != 0x1 && frame.opcode != 0x2 {
			return 0, nil, errors.New("unsupported exec-server WebSocket opcode")
		}
		if fragmentedOpcode != 0 {
			return 0, nil, errors.New("interleaved exec-server WebSocket message")
		}
		fragmentedOpcode = frame.opcode
	}
	if len(message)+len(frame.payload) > execServerMessageMaximumBytes {
		return 0, nil, errors.New("exec-server WebSocket message exceeds its size limit")
	}
	message = append(message, frame.payload...)
	return fragmentedOpcode, message, nil
}

func (socket *execServerWebSocket) readFrame() (execServerWebSocketFrame, error) {
	header := make([]byte, 2)
	if _, err := io.ReadFull(socket.reader, header); err != nil {
		return execServerWebSocketFrame{}, err
	}
	if header[0]&0x70 != 0 || header[1]&0x80 == 0 {
		return execServerWebSocketFrame{}, errors.New("invalid exec-server WebSocket frame flags")
	}
	frame := execServerWebSocketFrame{
		final:  header[0]&0x80 != 0,
		opcode: header[0] & 0x0F,
	}
	length, err := readExecServerFrameLength(socket.reader, header[1]&0x7F)
	if err != nil {
		return execServerWebSocketFrame{}, err
	}
	if frame.opcode >= 0x8 && (!frame.final || length > 125) {
		return execServerWebSocketFrame{}, errors.New("invalid exec-server WebSocket control frame")
	}
	mask := make([]byte, 4)
	if _, err := io.ReadFull(socket.reader, mask); err != nil {
		return execServerWebSocketFrame{}, err
	}
	frame.payload = make([]byte, int(length))
	if _, err := io.ReadFull(socket.reader, frame.payload); err != nil {
		return execServerWebSocketFrame{}, err
	}
	for index := range frame.payload {
		frame.payload[index] ^= mask[index%len(mask)]
	}
	return frame, nil
}

func readExecServerFrameLength(reader io.Reader, marker byte) (uint64, error) {
	var length uint64
	switch marker {
	case 126:
		var encoded [2]byte
		if _, err := io.ReadFull(reader, encoded[:]); err != nil {
			return 0, err
		}
		length = uint64(binary.BigEndian.Uint16(encoded[:]))
	case 127:
		var encoded [8]byte
		if _, err := io.ReadFull(reader, encoded[:]); err != nil {
			return 0, err
		}
		length = binary.BigEndian.Uint64(encoded[:])
		if length&(uint64(1)<<63) != 0 {
			return 0, errors.New("invalid exec-server WebSocket frame length")
		}
	default:
		length = uint64(marker)
	}
	if length > execServerMessageMaximumBytes {
		return 0, errors.New("exec-server WebSocket frame exceeds its size limit")
	}
	return length, nil
}

func (socket *execServerWebSocket) writeFrame(opcode byte, payload []byte) error {
	if len(payload) > execServerMessageMaximumBytes {
		return errors.New("exec-server WebSocket output exceeds its size limit")
	}
	socket.mutex.Lock()
	defer socket.mutex.Unlock()
	header := []byte{0x80 | opcode}
	switch length := len(payload); {
	case length <= 125:
		header = append(header, byte(length))
	case length <= 65535:
		header = append(header, 126, byte(length>>8), byte(length))
	default:
		header = append(header, 127, 0, 0, 0, 0,
			byte(length>>24), byte(length>>16), byte(length>>8), byte(length))
	}
	if err := writeAll(socket.writer, header); err != nil {
		return err
	}
	return writeAll(socket.writer, payload)
}

func writeAll(writer io.Writer, value []byte) error {
	for len(value) > 0 {
		written, err := writer.Write(value)
		if err != nil {
			return err
		}
		if written <= 0 {
			return io.ErrShortWrite
		}
		value = value[written:]
	}
	return nil
}

func isClosedControlIO(err error) bool {
	return errors.Is(err, io.EOF) || errors.Is(err, net.ErrClosed) || errors.Is(err, os.ErrClosed)
}
