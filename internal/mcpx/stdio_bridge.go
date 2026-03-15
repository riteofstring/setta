package mcpx

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

type StdioBridgeConfig struct {
	BackendURL      string
	HTTPHeaders     http.Header
	Stdin           io.ReadCloser
	Stdout          io.WriteCloser
	Logger          *slog.Logger
	HTTPConnectWait time.Duration
}

func RunStdioBridge(ctx context.Context, config StdioBridgeConfig) error {
	if strings.TrimSpace(config.BackendURL) == "" {
		return fmt.Errorf("backend url is required")
	}
	if config.Stdin == nil {
		return fmt.Errorf("stdin is required")
	}
	if config.Stdout == nil {
		return fmt.Errorf("stdout is required")
	}

	connectWait := config.HTTPConnectWait
	if connectWait <= 0 {
		connectWait = defaultHTTPConnectWait
	}

	logger := config.Logger
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}

	backendConn, err := (&sdkmcp.SSEClientTransport{
		Endpoint:   config.BackendURL,
		HTTPClient: buildMCPHTTPClient(config.HTTPHeaders, connectWait),
	}).Connect(ctx)
	if err != nil {
		return err
	}
	defer backendConn.Close()

	stdioConn, err := (&sdkmcp.IOTransport{
		Reader: config.Stdin,
		Writer: config.Stdout,
	}).Connect(ctx)
	if err != nil {
		return err
	}
	defer stdioConn.Close()

	bridgeCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	errCh := make(chan error, 2)
	go func() {
		errCh <- forwardBridgeMessages(bridgeCtx, logger, "stdio->backend", stdioConn, backendConn)
	}()
	go func() {
		errCh <- forwardBridgeMessages(bridgeCtx, logger, "backend->stdio", backendConn, stdioConn)
	}()

	var firstErr error
	for i := 0; i < 2; i++ {
		err := <-errCh
		cancel()
		_ = backendConn.Close()
		_ = stdioConn.Close()
		if err != nil && !isExpectedBridgeTermination(err) && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func forwardBridgeMessages(
	ctx context.Context,
	logger *slog.Logger,
	label string,
	source sdkmcp.Connection,
	destination sdkmcp.Connection,
) error {
	for {
		message, err := source.Read(ctx)
		if err != nil {
			logger.Debug("bridge read stopped", "label", label, "error", err)
			return err
		}
		if err := destination.Write(ctx, message); err != nil {
			logger.Debug("bridge write stopped", "label", label, "error", err)
			return err
		}
	}
}

func isExpectedBridgeTermination(err error) bool {
	return errors.Is(err, context.Canceled) ||
		errors.Is(err, io.EOF) ||
		errors.Is(err, io.ErrClosedPipe) ||
		errors.Is(err, net.ErrClosed)
}
