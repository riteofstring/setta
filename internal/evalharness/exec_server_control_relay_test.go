package evalharness

import (
	"bufio"
	"bytes"
	"net/http"
	"strings"
	"testing"
)

func TestExecServerControlEndpointRequiresLoopbackCapabilityURL(t *testing.T) {
	valid := execServerControlEndpoint{
		Address: "127.0.0.1:45000",
		URL: "ws://127.0.0.1:45000" + execServerControlPathPrefix +
			strings.Repeat("a", execServerControlTokenBytes*2),
	}
	if err := validateExecServerControlEndpoint(valid); err != nil {
		t.Fatalf("validate control endpoint: %v", err)
	}
	invalid := []execServerControlEndpoint{
		{Address: "0.0.0.0:45000", URL: valid.URL},
		{Address: valid.Address, URL: "ws://localhost:45000" + valid.URL[strings.Index(valid.URL, execServerControlPathPrefix):]},
		{Address: valid.Address, URL: "ws://" + valid.Address},
		{Address: valid.Address, URL: valid.URL + "?token=visible"},
	}
	for _, endpoint := range invalid {
		if err := validateExecServerControlEndpoint(endpoint); err == nil {
			t.Fatalf("invalid control endpoint was accepted: %#v", endpoint)
		}
	}
}

func TestExecServerWebSocketReadsMaskedFragmentsAndAnswersPing(t *testing.T) {
	var input bytes.Buffer
	input.Write(maskedExecServerFrame(false, 0x1, []byte(`{"jsonrpc":"2.0",`)))
	input.Write(maskedExecServerFrame(true, 0x9, nil))
	input.Write(maskedExecServerFrame(true, 0x0, []byte(`"id":1}`)))
	var output bytes.Buffer
	socket := &execServerWebSocket{
		reader: bufio.NewReader(&input),
		writer: &output,
	}
	payload, err := socket.readMessage()
	if err != nil {
		t.Fatalf("read WebSocket message: %v", err)
	}
	if got, want := string(payload), `{"jsonrpc":"2.0","id":1}`; got != want {
		t.Fatalf("payload = %q, want %q", got, want)
	}
	if got, want := output.Bytes(), []byte{0x8A, 0x00}; !bytes.Equal(got, want) {
		t.Fatalf("pong frame = %x, want %x", got, want)
	}
}

func TestExecServerUpgradeRequestRequiresExactCapabilityAndNoOrigin(t *testing.T) {
	path := execServerControlPathPrefix + strings.Repeat("b", execServerControlTokenBytes*2)
	request, err := http.NewRequest(http.MethodGet, "ws://127.0.0.1:45000"+path, nil)
	if err != nil {
		t.Fatalf("create upgrade request: %v", err)
	}
	request.RequestURI = path
	request.Header.Set("Connection", "keep-alive, Upgrade")
	request.Header.Set("Upgrade", "websocket")
	request.Header.Set("Sec-WebSocket-Version", "13")
	request.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	if _, err := validateExecServerUpgradeRequest(request, "127.0.0.1:45000", path); err != nil {
		t.Fatalf("validate upgrade request: %v", err)
	}
	request.Header.Set("Origin", "http://127.0.0.1")
	if _, err := validateExecServerUpgradeRequest(request, "127.0.0.1:45000", path); err == nil {
		t.Fatal("upgrade request with Origin was accepted")
	}
	request.Header.Set("Origin", "")
	if _, err := validateExecServerUpgradeRequest(request, "127.0.0.1:45000", path); err == nil {
		t.Fatal("upgrade request with an empty Origin was accepted")
	}
}

func TestExecServerUpgradeRequestIsBounded(t *testing.T) {
	request := strings.Repeat("X", execServerHandshakeMaximumBytes+1)
	if _, err := readExecServerUpgradeRequest(bufio.NewReader(strings.NewReader(request))); err == nil {
		t.Fatal("oversized exec-server WebSocket handshake was accepted")
	}
}

func TestExecServerStdioContainerRejectsEveryHostPortSurface(t *testing.T) {
	valid := phase0DockerContainer{}
	valid.Config.OpenStdin = true
	valid.Config.Entrypoint = append([]string{}, execServerStdioEntrypoint...)
	if err := validateExecServerStdioContainer(valid); err != nil {
		t.Fatalf("validate stdio container: %v", err)
	}
	tests := map[string]func(*phase0DockerContainer){
		"image exposure": func(container *phase0DockerContainer) {
			container.Config.ExposedPorts = map[string]struct{}{"4500/tcp": {}}
		},
		"host binding": func(container *phase0DockerContainer) {
			container.HostConfig.PortBindings = map[string][]any{"4500/tcp": {struct{}{}}}
		},
		"network mapping": func(container *phase0DockerContainer) {
			container.NetworkSettings.Ports = map[string][]any{"4500/tcp": {struct{}{}}}
		},
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			container := valid
			mutate(&container)
			if err := validateExecServerStdioContainer(container); err == nil {
				t.Fatal("container with an Agent port surface was accepted")
			}
		})
	}
}

func maskedExecServerFrame(final bool, opcode byte, payload []byte) []byte {
	first := opcode
	if final {
		first |= 0x80
	}
	frame := []byte{first, 0x80 | byte(len(payload)), 1, 2, 3, 4}
	for index, value := range payload {
		frame = append(frame, value^frame[2+index%4])
	}
	return frame
}
