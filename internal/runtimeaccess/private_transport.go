// Package runtimeaccess contains provider-neutral building blocks for routing
// authenticated Setta requests to private managed runtimes.
package runtimeaccess

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"time"

	"setta/internal/runtimeprovider"
)

const (
	privateResponseHeaderTimeout = 30 * time.Second
	privateIdleConnectionTimeout = 30 * time.Second
)

// NewPrivateHTTPTransport builds an HTTP/1.1 transport whose connections are
// always opened through the provider's authenticated private-access channel.
// The caller owns the returned transport and should call CloseIdleConnections
// when retiring the route.
func NewPrivateHTTPTransport(
	dialer runtimeprovider.PrivateAccessDialer,
	runtimeName string,
	targetAddress string,
) (*http.Transport, error) {
	if dialer == nil {
		return nil, fmt.Errorf("private runtime dialer is required")
	}
	if err := runtimeprovider.ValidateManagedName(runtimeName); err != nil {
		return nil, err
	}
	if err := validateLoopbackTarget(targetAddress); err != nil {
		return nil, err
	}

	return &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialer.DialPrivateRuntime(ctx, runtimeName, "tcp", targetAddress)
		},
		ForceAttemptHTTP2:     false,
		DisableCompression:    true,
		MaxIdleConns:          4,
		MaxIdleConnsPerHost:   2,
		IdleConnTimeout:       privateIdleConnectionTimeout,
		ResponseHeaderTimeout: privateResponseHeaderTimeout,
	}, nil
}

func validateLoopbackTarget(address string) error {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return fmt.Errorf("private runtime target is invalid: %w", err)
	}
	parsedPort, err := strconv.ParseUint(port, 10, 16)
	if err != nil || parsedPort == 0 {
		return fmt.Errorf("private runtime target port must be between 1 and 65535")
	}
	if host == "localhost" {
		return nil
	}
	parsedHost := net.ParseIP(host)
	if parsedHost == nil || !parsedHost.IsLoopback() {
		return fmt.Errorf("private runtime target host must be loopback")
	}
	return nil
}
