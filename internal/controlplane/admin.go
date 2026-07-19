package controlplane

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const maximumAdminRequestBytes = 16 * 1024

const adminSocketFileName = "admin.sock"

type AdminServerConfig struct {
	SocketPath string
	Store      *Store
}

type AdminServer struct {
	httpServer  *http.Server
	listener    net.Listener
	done        chan error
	closeOnce   sync.Once
	shutdownErr error
}

type AdminEnsureDeviceRequest struct {
	Credential  DeviceCredential `json:"credential"`
	DisplayName string           `json:"display_name"`
	GrantTTL    time.Duration    `json:"grant_ttl"`
	RuntimeName string           `json:"runtime_name"`
	UserID      string           `json:"user_id"`
}

type AdminRevokeDeviceRequest struct {
	DeviceID string `json:"device_id"`
}

type AdminSetUserStatusRequest struct {
	Status UserStatus `json:"status"`
	UserID string     `json:"user_id"`
}

type AdminEvent struct {
	DeviceID string `json:"device_id,omitempty"`
	Event    string `json:"event"`
	Status   string `json:"status,omitempty"`
	UserID   string `json:"user_id,omitempty"`
}

func AdminSocketPath(dataDirectory string) string {
	return filepath.Join(dataDirectory, adminSocketFileName)
}

func StartAdminServer(config AdminServerConfig) (*AdminServer, error) {
	if err := validateAdminServerConfig(config); err != nil {
		return nil, err
	}
	listener, err := net.Listen("unix", config.SocketPath)
	if err != nil {
		return nil, fmt.Errorf("listen for control-plane administration: %w", err)
	}
	if err := os.Chmod(config.SocketPath, 0o600); err != nil {
		_ = listener.Close()
		return nil, fmt.Errorf("protect control-plane administration socket: %w", err)
	}
	httpServer := &http.Server{Handler: adminHandler(config.Store), ReadHeaderTimeout: 5 * time.Second}
	server := &AdminServer{httpServer: httpServer, listener: listener, done: make(chan error, 1)}
	go func() {
		err := httpServer.Serve(listener)
		if errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
		server.done <- err
		close(server.done)
	}()
	return server, nil
}

func (server *AdminServer) Shutdown(ctx context.Context) error {
	if ctx == nil {
		return errors.New("control-plane administration shutdown context is required")
	}
	server.closeOnce.Do(func() {
		if err := server.httpServer.Shutdown(ctx); err != nil {
			server.shutdownErr = fmt.Errorf("shutdown control-plane administration: %w", err)
			_ = server.httpServer.Close()
		}
	})
	return server.shutdownErr
}

func (server *AdminServer) Wait() error {
	return <-server.done
}

func validateAdminServerConfig(config AdminServerConfig) error {
	if config.Store == nil || config.SocketPath == "" || !filepath.IsAbs(config.SocketPath) {
		return errors.New("control-plane administration requires a store and absolute socket path")
	}
	if filepath.Dir(config.SocketPath) != filepath.Dir(config.Store.Path()) {
		return errors.New("control-plane administration socket must share the private store directory")
	}
	if _, err := os.Lstat(config.SocketPath); err == nil {
		return errors.New("control-plane administration socket path already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("inspect control-plane administration socket: %w", err)
	}
	return nil
}

func adminHandler(store *Store) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			response.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/v1/devices/ensure":
			handleAdminEnsureDevice(store, response, request)
		case "/v1/devices/revoke":
			handleAdminRevokeDevice(store, response, request)
		case "/v1/users/status":
			handleAdminSetUserStatus(store, response, request)
		default:
			response.WriteHeader(http.StatusNotFound)
		}
	})
}

func handleAdminEnsureDevice(store *Store, response http.ResponseWriter, request *http.Request) {
	var payload AdminEnsureDeviceRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	created, err := store.EnsureDeviceGrant(request.Context(), EnsureDeviceGrantRequest{
		Credential: payload.Credential, UserID: payload.UserID, RuntimeName: payload.RuntimeName,
		DisplayName: payload.DisplayName, GrantTTL: payload.GrantTTL,
	})
	if err != nil {
		writeAdminError(response)
		return
	}
	writeAdminEvent(response, AdminEvent{DeviceID: created.Device.ID, Event: "device_ensured"})
}

func handleAdminRevokeDevice(store *Store, response http.ResponseWriter, request *http.Request) {
	var payload AdminRevokeDeviceRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	if err := store.RevokeDevice(request.Context(), payload.DeviceID); err != nil {
		writeAdminError(response)
		return
	}
	writeAdminEvent(response, AdminEvent{DeviceID: payload.DeviceID, Event: "device_revoked"})
}

func handleAdminSetUserStatus(store *Store, response http.ResponseWriter, request *http.Request) {
	var payload AdminSetUserStatusRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	if err := store.SetUserStatus(request.Context(), payload.UserID, payload.Status); err != nil {
		writeAdminError(response)
		return
	}
	writeAdminEvent(response, AdminEvent{Event: "user_status_set", Status: string(payload.Status), UserID: payload.UserID})
}

func decodeAdminRequest(response http.ResponseWriter, request *http.Request, target any) bool {
	decoder := json.NewDecoder(io.LimitReader(request.Body, maximumAdminRequestBytes+1))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		writeAdminError(response)
		return false
	}
	return true
}

func writeAdminEvent(response http.ResponseWriter, event AdminEvent) {
	if err := json.NewEncoder(response).Encode(event); err != nil {
		return
	}
}

func writeAdminError(response http.ResponseWriter) {
	http.Error(response, `{"error":"administration_failed"}`, http.StatusBadRequest)
}
