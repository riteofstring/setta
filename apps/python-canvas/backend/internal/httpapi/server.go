// Package httpapi exposes the loopback-only V1 HTTP boundary.
package httpapi

import (
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/setta/python-canvas/backend/internal/contracts"
)

// NewHandler creates the only V1 API route after validating the complete
// snapshot it will expose.
func NewHandler(snapshot contracts.ProjectSnapshotV1) (http.Handler, error) {
	if err := snapshot.Validate(); err != nil {
		return nil, fmt.Errorf("validate project endpoint snapshot: %w", err)
	}

	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if !isExactProjectPath(request) {
			writeError(response, http.StatusNotFound, contracts.APIErrorCodeNotFoundV1, "route not found")
			return
		}
		if request.Method != http.MethodGet {
			response.Header().Set("Allow", http.MethodGet)
			writeError(response, http.StatusMethodNotAllowed, contracts.APIErrorCodeMethodNotAllowedV1, "method must be GET")
			return
		}
		if request.URL.RawQuery != "" || request.URL.ForceQuery {
			writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV1, "query parameters are not accepted")
			return
		}

		hasBody, err := requestHasBody(request)
		if err != nil {
			writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV1, "request body could not be read")
			return
		}
		if hasBody {
			writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV1, "GET requests must not include a body")
			return
		}

		writeJSON(response, http.StatusOK, snapshot)
	}), nil
}

// ListenLoopback binds only the IPv4 loopback interface.
func ListenLoopback(port uint16) (net.Listener, error) {
	return listenLoopback(port, net.Listen)
}

type listenFunc func(network, address string) (net.Listener, error)

func listenLoopback(port uint16, listen listenFunc) (net.Listener, error) {
	listener, err := listen("tcp4", net.JoinHostPort("127.0.0.1", strconv.Itoa(int(port))))
	if err != nil {
		return nil, fmt.Errorf("listen on loopback: %w", err)
	}
	return listener, nil
}

// ServeLoopback runs the V1 server on a loopback listener. Callers provide a
// port only, so this API cannot expose the service on another interface.
func ServeLoopback(port uint16, snapshot contracts.ProjectSnapshotV1) error {
	listener, err := ListenLoopback(port)
	if err != nil {
		return err
	}
	defer listener.Close()
	return serve(listener, snapshot)
}

func serve(listener net.Listener, snapshot contracts.ProjectSnapshotV1) error {
	handler, err := NewHandler(snapshot)
	if err != nil {
		return err
	}
	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	err = server.Serve(listener)
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func isExactProjectPath(request *http.Request) bool {
	return request.URL.Path == contracts.ProjectPathV1 &&
		request.URL.RawPath == "" &&
		request.URL.EscapedPath() == contracts.ProjectPathV1
}

func requestHasBody(request *http.Request) (bool, error) {
	if request.Body == nil || request.Body == http.NoBody {
		return false, nil
	}
	if request.ContentLength > 0 {
		return true, nil
	}

	content, err := io.ReadAll(io.LimitReader(request.Body, 1))
	if err != nil {
		return false, err
	}
	return len(content) != 0, nil
}
