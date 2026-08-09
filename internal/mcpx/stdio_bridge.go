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

type stdioBridgeRuntime struct {
	logger      *slog.Logger
	backendConn sdkmcp.Connection
	stdioConn   sdkmcp.Connection
}

func RunStdioBridge(ctx context.Context, config StdioBridgeConfig) error {
	runtime, err := newStdioBridgeRuntime(ctx, config)
	if err != nil {
		return err
	}
	defer runtime.close()
	return runtime.run(ctx)
}

func newStdioBridgeRuntime(ctx context.Context, config StdioBridgeConfig) (*stdioBridgeRuntime, error) {
	normalized, err := normalizeStdioBridgeConfig(config)
	if err != nil {
		return nil, err
	}

	backendConn, err := (&sdkmcp.SSEClientTransport{
		Endpoint:   normalized.BackendURL,
		HTTPClient: buildMCPHTTPClient(normalized.HTTPHeaders, normalized.HTTPConnectWait),
	}).Connect(ctx)
	if err != nil {
		return nil, err
	}
	stdioConn, err := (&sdkmcp.IOTransport{
		Reader: normalized.Stdin,
		Writer: normalized.Stdout,
	}).Connect(ctx)
	if err != nil {
		_ = backendConn.Close()
		return nil, err
	}
	return &stdioBridgeRuntime{
		logger:      normalized.Logger,
		backendConn: backendConn,
		stdioConn:   stdioConn,
	}, nil
}

func normalizeStdioBridgeConfig(config StdioBridgeConfig) (StdioBridgeConfig, error) {
	switch {
	case strings.TrimSpace(config.BackendURL) == "":
		return StdioBridgeConfig{}, fmt.Errorf("backend url is required")
	case config.Stdin == nil:
		return StdioBridgeConfig{}, fmt.Errorf("stdin is required")
	case config.Stdout == nil:
		return StdioBridgeConfig{}, fmt.Errorf("stdout is required")
	}
	if config.HTTPConnectWait <= 0 {
		config.HTTPConnectWait = defaultHTTPConnectWait
	}
	if config.Logger == nil {
		config.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	return config, nil
}

func (b *stdioBridgeRuntime) run(ctx context.Context) error {
	bridgeCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	errCh := make(chan error, 2)
	go func() {
		errCh <- forwardBridgeMessages(bridgeCtx, b.logger, "stdio->backend", b.stdioConn, b.backendConn)
	}()
	go func() {
		errCh <- forwardBridgeMessages(bridgeCtx, b.logger, "backend->stdio", b.backendConn, b.stdioConn)
	}()
	return b.waitForBridgeTermination(cancel, errCh)
}

func (b *stdioBridgeRuntime) waitForBridgeTermination(cancel context.CancelFunc, errCh <-chan error) error {
	var firstErr error
	for i := 0; i < 2; i++ {
		err := <-errCh
		cancel()
		b.close()
		if err != nil && !isExpectedBridgeTermination(err) && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func (b *stdioBridgeRuntime) close() {
	if b == nil {
		return
	}
	if b.backendConn != nil {
		_ = b.backendConn.Close()
	}
	if b.stdioConn != nil {
		_ = b.stdioConn.Close()
	}
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
