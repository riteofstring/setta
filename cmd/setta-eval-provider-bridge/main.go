package main

import (
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
	"time"

	"setta/internal/evalharness/providerbridge"
)

const bridgeHandshakeTimeout = 10 * time.Second

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout, os.Getenv); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// run presents the stdio process contract expected by Setta's production
// codexapp manager while forwarding it to the host-owned authenticated Codex
// app-server. The bridge token authenticates the controller container to the
// host broker; it is never placed in the AI-controlled exec-server container.
func run(
	args []string,
	stdin io.ReadCloser,
	stdout io.Writer,
	getenv func(string) string,
) error {
	if err := validateInvocation(args); err != nil {
		return err
	}
	address, token, err := bridgeConfiguration(getenv)
	if err != nil {
		return err
	}
	connection, err := net.DialTimeout("tcp", address, bridgeHandshakeTimeout)
	if err != nil {
		return fmt.Errorf("connect to eval provider bridge: %w", err)
	}
	defer connection.Close()
	if err := authenticateBridge(connection, token); err != nil {
		return err
	}
	return proxyStdio(connection, stdin, stdout)
}

func validateInvocation(args []string) error {
	if len(args) != 3 || args[0] != "app-server" ||
		args[1] != "--listen" || args[2] != "stdio://" {
		return fmt.Errorf(
			"eval provider bridge accepts only `codex app-server --listen stdio://`, got %q",
			strings.Join(args, " "),
		)
	}
	return nil
}

func bridgeConfiguration(getenv func(string) string) (string, string, error) {
	address := strings.TrimSpace(getenv(providerbridge.AddressEnvironment))
	if address == "" {
		return "", "", fmt.Errorf("%s is required", providerbridge.AddressEnvironment)
	}
	host, port, err := net.SplitHostPort(address)
	if err != nil || host != "host.docker.internal" || port == "" {
		return "", "", fmt.Errorf(
			"%s must use host.docker.internal and an explicit port",
			providerbridge.AddressEnvironment,
		)
	}
	token := getenv(providerbridge.TokenEnvironment)
	if !providerbridge.ValidToken(token) {
		return "", "", fmt.Errorf("%s must be a 64-character lowercase hexadecimal token", providerbridge.TokenEnvironment)
	}
	return address, token, nil
}

func authenticateBridge(connection net.Conn, token string) error {
	if err := connection.SetDeadline(time.Now().Add(bridgeHandshakeTimeout)); err != nil {
		return fmt.Errorf("set eval provider bridge handshake deadline: %w", err)
	}
	if _, err := io.WriteString(connection, providerbridge.Handshake(token)); err != nil {
		return fmt.Errorf("write eval provider bridge handshake: %w", err)
	}
	response := make([]byte, len(providerbridge.Acknowledgement))
	if _, err := io.ReadFull(connection, response); err != nil {
		return fmt.Errorf("read eval provider bridge handshake: %w", err)
	}
	if string(response) != providerbridge.Acknowledgement {
		return errors.New("eval provider bridge rejected the controller connection")
	}
	if err := connection.SetDeadline(time.Time{}); err != nil {
		return fmt.Errorf("clear eval provider bridge handshake deadline: %w", err)
	}
	return nil
}

func proxyStdio(connection net.Conn, stdin io.ReadCloser, stdout io.Writer) error {
	inputFinished := make(chan struct{})
	uploadFinished := make(chan error, 1)
	go func() {
		_, err := io.Copy(connection, stdin)
		close(inputFinished)
		if tcpConnection, ok := connection.(*net.TCPConn); ok {
			err = errors.Join(err, tcpConnection.CloseWrite())
		}
		uploadFinished <- err
	}()
	_, downloadErr := io.Copy(stdout, connection)
	var uploadErr error
	select {
	case <-inputFinished:
		uploadErr = <-uploadFinished
	default:
		_ = connection.Close()
		_ = stdin.Close()
		uploadErr = <-uploadFinished
		if downloadErr == nil {
			downloadErr = errors.New("host provider closed before controller input")
		}
	}
	if downloadErr != nil {
		return fmt.Errorf("forward eval provider events: %w", downloadErr)
	}
	if uploadErr != nil {
		return fmt.Errorf("forward eval provider requests: %w", uploadErr)
	}
	return nil
}
