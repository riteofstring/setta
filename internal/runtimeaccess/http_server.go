package runtimeaccess

import (
	"fmt"
	"net/http"
	"time"
)

const (
	gatewayHTTPIdleTimeout       = 60 * time.Second
	gatewayHTTPMaxHeaderBytes    = 64 * 1024
	gatewayHTTPReadHeaderTimeout = 5 * time.Second
	gatewayHTTPReadTimeout       = 30 * time.Second
)

// NewGatewayHTTPServer supplies the bounded HTTP settings owned by the access
// gateway. WriteTimeout intentionally remains zero because a finite whole-
// response deadline would terminate healthy SSE streams. The hosting edge owns
// TLS and must pass only normalized HTTP requests to this server.
func NewGatewayHTTPServer(gateway *Gateway) (*http.Server, error) {
	if gateway == nil {
		return nil, fmt.Errorf("gateway is required")
	}
	return &http.Server{
		Handler: http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			gateway.serveHTTP(response, request)
		}),
		IdleTimeout:       gatewayHTTPIdleTimeout,
		MaxHeaderBytes:    gatewayHTTPMaxHeaderBytes,
		ReadHeaderTimeout: gatewayHTTPReadHeaderTimeout,
		ReadTimeout:       gatewayHTTPReadTimeout,
	}, nil
}
