package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/setta/local-backend/httpjson"
	"github.com/setta/local-backend/localweb"
	"github.com/setta/local-backend/sse"
	"github.com/setta/realtime/backend/internal/content"
	"github.com/setta/realtime/backend/internal/contracts"
	"github.com/setta/realtime/backend/internal/project"
	"github.com/setta/realtime/backend/internal/source"
)

const maximumJSONBytes = 4 << 20

type Coordinator interface {
	ProjectSnapshot() (contracts.Project, error)
	Apply(contracts.ApplyRequest) (contracts.Project, error)
	RuntimeSource() (contracts.RuntimeSourceDocument, error)
	ApplyRuntimeSource(context.Context, contracts.ApplyRuntimeSourceRequest) (contracts.ApplyRuntimeSourceResult, error)
	Reload(context.Context) (contracts.InitializeResult, error)
	Invoke(context.Context, string, contracts.DirectInvokeRequest) (contracts.InvokeResult, error)
	Snapshot() (contracts.RuntimeSnapshot, error)
	Subscribe(context.Context) (<-chan contracts.RuntimeEnvelope, error)
	HandleEvent(contracts.RuntimeEvent) (int, error)
	Cancel(contracts.RuntimeCancelRequest) error
}

type ProjectStore interface {
	Subscribe(context.Context) (<-chan contracts.Project, error)
}

type ContentStore interface {
	Put(string, string, io.Reader) (contracts.ContentReference, error)
	OpenID(string) (contracts.ContentReference, io.ReadCloser, error)
}

type Handler struct {
	coordinator  Coordinator
	projects     ProjectStore
	content      ContentStore
	projectRoot  string
	sessionNonce string
	serverURL    string
	mux          *http.ServeMux
}

func New(coordinator Coordinator, projects ProjectStore, contentStore ContentStore, projectRoot string, sessionNonce string, serverURL string) (*Handler, error) {
	if coordinator == nil || projects == nil || contentStore == nil {
		return nil, errors.New("server: coordinator and stores are required")
	}
	canonicalRoot, err := filepath.Abs(projectRoot)
	if err != nil || strings.TrimSpace(projectRoot) == "" || strings.TrimSpace(sessionNonce) == "" || strings.TrimSpace(serverURL) == "" {
		return nil, errors.New("server: identity configuration is invalid")
	}
	handler := &Handler{coordinator: coordinator, projects: projects, content: contentStore, projectRoot: canonicalRoot, sessionNonce: sessionNonce, serverURL: serverURL, mux: http.NewServeMux()}
	handler.mux.HandleFunc("/api/v1/project", handler.project)
	handler.mux.HandleFunc("/api/v1/project/apply", handler.apply)
	handler.mux.HandleFunc("/api/v1/project/events", handler.projectEvents)
	handler.mux.HandleFunc("/api/v1/runtime", handler.runtime)
	handler.mux.HandleFunc("/api/v1/runtime/source", handler.runtimeSource)
	handler.mux.HandleFunc("/api/v1/runtime/snapshot", handler.runtimeSnapshot)
	handler.mux.HandleFunc("/api/v1/runtime/reload", handler.reload)
	handler.mux.HandleFunc("/api/v1/runtime/invoke/", handler.invoke)
	handler.mux.HandleFunc("/api/v1/content", handler.upload)
	handler.mux.HandleFunc("/api/v1/content/", handler.download)
	handler.mux.HandleFunc("/api/v2/runtime/session", handler.identity)
	return handler, nil
}

func (handler *Handler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	response.Header().Set("Cache-Control", "no-store")
	response.Header().Set("X-Content-Type-Options", "nosniff")
	handler.mux.ServeHTTP(response, request)
}

func (handler *Handler) project(response http.ResponseWriter, request *http.Request) {
	if !exactRequest(response, request, http.MethodGet, false) {
		return
	}
	snapshot, err := handler.coordinator.ProjectSnapshot()
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, snapshot)
}

func (handler *Handler) apply(response http.ResponseWriter, request *http.Request) {
	if !handler.commandRequest(response, request, true) {
		return
	}
	var command contracts.ApplyRequest
	if err := decodeRequest(response, request, &command); err != nil {
		writeFailure(response, err)
		return
	}
	snapshot, err := handler.coordinator.Apply(command)
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, snapshot)
}

func (handler *Handler) projectEvents(response http.ResponseWriter, request *http.Request) {
	if !exactRequest(response, request, http.MethodGet, false) {
		return
	}
	if !sse.Supported(response) {
		writeError(response, http.StatusInternalServerError, "stream_unavailable", "Streaming is unavailable.")
		return
	}
	stream, err := handler.projects.Subscribe(request.Context())
	if err != nil {
		writeFailure(response, err)
		return
	}
	_ = sse.Serve(response, request, stream, "")
}

func (handler *Handler) runtime(response http.ResponseWriter, request *http.Request) {
	if !exactRequest(response, request, http.MethodGet, false) {
		return
	}
	if !localweb.OriginAllowed(request, handler.serverURL) {
		writeError(response, http.StatusForbidden, "forbidden_origin", "The request origin is not allowed.")
		return
	}
	connection, err := websocket.Accept(response, request, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	defer connection.CloseNow()
	connection.SetReadLimit(maximumJSONBytes)
	handler.serveRuntime(request.Context(), connection)
}

func (handler *Handler) runtimeSource(response http.ResponseWriter, request *http.Request) {
	switch request.Method {
	case http.MethodGet:
		handler.readRuntimeSource(response, request)
	case http.MethodPut:
		handler.applyRuntimeSource(response, request)
	default:
		httpjson.RequireMethod(response, request, http.MethodGet, http.MethodPut)
		writeError(response, http.StatusMethodNotAllowed, "method_not_allowed", "The request method is not allowed.")
	}
}

func (handler *Handler) readRuntimeSource(response http.ResponseWriter, request *http.Request) {
	if !exactRequest(response, request, http.MethodGet, false) {
		return
	}
	if origin := request.Header.Get("Origin"); origin != "" && !localweb.OriginAllowed(request, handler.serverURL) {
		writeError(response, http.StatusForbidden, "forbidden_origin", "The request origin is not allowed.")
		return
	}
	document, err := handler.coordinator.RuntimeSource()
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, document)
}

func (handler *Handler) applyRuntimeSource(response http.ResponseWriter, request *http.Request) {
	if !handler.mutationRequest(response, request, http.MethodPut, true) {
		return
	}
	var command contracts.ApplyRuntimeSourceRequest
	if err := decodeRequest(response, request, &command); err != nil {
		writeFailure(response, err)
		return
	}
	result, err := handler.coordinator.ApplyRuntimeSource(request.Context(), command)
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler *Handler) serveRuntime(parent context.Context, connection *websocket.Conn) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	stream, err := handler.coordinator.Subscribe(ctx)
	if err != nil {
		_ = connection.Close(websocket.StatusInternalError, "runtime unavailable")
		return
	}
	writeErrors := make(chan error, 1)
	var writeMutex sync.Mutex
	go writeRuntimeStream(ctx, connection, &writeMutex, stream, writeErrors)
	handler.readRuntimeStream(ctx, cancel, connection, &writeMutex, writeErrors)
}

func writeRuntimeStream(ctx context.Context, connection *websocket.Conn, mutex *sync.Mutex, stream <-chan contracts.RuntimeEnvelope, result chan<- error) {
	for envelope := range stream {
		writeContext, writeCancel := context.WithTimeout(ctx, 5*time.Second)
		mutex.Lock()
		err := wsjson.Write(writeContext, connection, envelope)
		mutex.Unlock()
		writeCancel()
		if err != nil {
			result <- err
			return
		}
	}
	result <- nil
}

func (handler *Handler) readRuntimeStream(ctx context.Context, cancel context.CancelFunc, connection *websocket.Conn, mutex *sync.Mutex, writeErrors <-chan error) {
	for {
		var raw json.RawMessage
		if err := wsjson.Read(ctx, connection, &raw); err != nil {
			cancel()
			<-writeErrors
			return
		}
		code, commandErr := handler.handleRuntimeCommand(raw)
		if commandErr != nil {
			if code == "" {
				code = runtimeErrorCode(commandErr)
			}
			handler.writeRuntimeError(ctx, connection, mutex, code, commandErr.Error())
		}
		select {
		case <-writeErrors:
			return
		default:
		}
	}
}

func (handler *Handler) handleRuntimeCommand(raw json.RawMessage) (string, error) {
	var discriminator struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &discriminator); err != nil {
		return "invalid_command", err
	}
	switch discriminator.Type {
	case "event":
		var event contracts.RuntimeEvent
		if err := contracts.DecodeStrict(raw, &event); err != nil {
			return "", err
		}
		_, err := handler.coordinator.HandleEvent(event)
		return "", err
	case "cancel":
		var cancellation contracts.RuntimeCancelRequest
		if err := contracts.DecodeStrict(raw, &cancellation); err != nil {
			return "", err
		}
		return "", handler.coordinator.Cancel(cancellation)
	default:
		return "", errors.New("runtime command type is invalid")
	}
}

func (handler *Handler) reload(response http.ResponseWriter, request *http.Request) {
	if !handler.commandRequest(response, request, false) {
		return
	}
	result, err := handler.coordinator.Reload(request.Context())
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler *Handler) runtimeSnapshot(response http.ResponseWriter, request *http.Request) {
	if !exactRequest(response, request, http.MethodGet, false) {
		return
	}
	projectSnapshot, err := handler.coordinator.ProjectSnapshot()
	if err != nil {
		writeFailure(response, err)
		return
	}
	runtimeSnapshot, err := handler.coordinator.Snapshot()
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"project": projectSnapshot, "runtime": runtimeSnapshot})
}

func (handler *Handler) invoke(response http.ResponseWriter, request *http.Request) {
	if !handler.commandRequest(response, request, true) {
		return
	}
	handlerName := strings.TrimPrefix(request.URL.Path, "/api/v1/runtime/invoke/")
	if handlerName == "" || strings.Contains(handlerName, "/") {
		http.NotFound(response, request)
		return
	}
	var command contracts.DirectInvokeRequest
	if err := decodeRequest(response, request, &command); err != nil {
		writeFailure(response, err)
		return
	}
	result, err := handler.coordinator.Invoke(request.Context(), handlerName, command)
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler *Handler) upload(response http.ResponseWriter, request *http.Request) {
	if !handler.commandRequest(response, request, false) {
		return
	}
	mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if err != nil || strings.TrimSpace(mediaType) == "" || mediaType == "application/json" {
		writeError(response, http.StatusUnsupportedMediaType, "invalid_media_type", "A raw binary Content-Type is required.")
		return
	}
	invocationID := request.Header.Get("X-Setta-Invocation-ID")
	reference, err := handler.content.Put(invocationID, mediaType, http.MaxBytesReader(response, request.Body, content.MaximumBytes+1))
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusCreated, reference)
}

func (handler *Handler) download(response http.ResponseWriter, request *http.Request) {
	if !exactRequest(response, request, http.MethodGet, false) {
		return
	}
	id := strings.TrimPrefix(request.URL.Path, "/api/v1/content/")
	if id == "" || strings.Contains(id, "/") {
		http.NotFound(response, request)
		return
	}
	reference, reader, err := handler.content.OpenID(id)
	if err != nil {
		writeFailure(response, err)
		return
	}
	defer reader.Close()
	response.Header().Set("Content-Type", reference.MediaType)
	response.Header().Set("Content-Length", fmt.Sprintf("%d", reference.ByteLength))
	response.WriteHeader(http.StatusOK)
	_, _ = io.Copy(response, reader)
}

func (handler *Handler) identity(response http.ResponseWriter, request *http.Request) {
	if !exactRequest(response, request, http.MethodGet, false) {
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{
		"schemaVersion": "realtime-session/v1",
		"appId":         "realtime",
		"projectPath":   handler.projectRoot,
		"instanceNonce": handler.sessionNonce,
	})
}

func (handler *Handler) commandRequest(response http.ResponseWriter, request *http.Request, jsonBody bool) bool {
	return handler.mutationRequest(response, request, http.MethodPost, jsonBody)
}

func (handler *Handler) mutationRequest(response http.ResponseWriter, request *http.Request, method string, jsonBody bool) bool {
	if !exactRequest(response, request, method, true) {
		return false
	}
	if !localweb.OriginAllowed(request, handler.serverURL) {
		writeError(response, http.StatusForbidden, "forbidden_origin", "The request origin is not allowed.")
		return false
	}
	if jsonBody {
		if !httpjson.HasJSONMediaType(request) {
			writeError(response, http.StatusUnsupportedMediaType, "invalid_media_type", "Content-Type must be application/json.")
			return false
		}
	}
	return true
}

func (handler *Handler) writeRuntimeError(ctx context.Context, connection *websocket.Conn, mutex *sync.Mutex, code string, message string) {
	writeContext, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	mutex.Lock()
	defer mutex.Unlock()
	_ = wsjson.Write(writeContext, connection, contracts.RuntimeEnvelope{Type: "error", Error: &contracts.StructuredError{Code: code, Message: message}})
}

func exactRequest(response http.ResponseWriter, request *http.Request, method string, allowBody bool) bool {
	if !httpjson.RequireMethod(response, request, method) {
		writeError(response, http.StatusMethodNotAllowed, "method_not_allowed", "The request method is not allowed.")
		return false
	}
	if request.URL.RawQuery != "" {
		writeError(response, http.StatusBadRequest, "unexpected_query", "Query parameters are not accepted.")
		return false
	}
	if !allowBody && (request.ContentLength > 0 || request.Body != nil && request.Body != http.NoBody) {
		data, _ := io.ReadAll(io.LimitReader(request.Body, 1))
		if len(data) > 0 {
			writeError(response, http.StatusBadRequest, "unexpected_body", "A request body is not accepted.")
			return false
		}
	}
	return true
}

func decodeRequest(response http.ResponseWriter, request *http.Request, target any) error {
	return httpjson.DecodeRequest(response, request, maximumJSONBytes, target)
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	if err := httpjson.Write(response, status, value); err != nil {
		_ = httpjson.Write(response, http.StatusInternalServerError, contracts.StructuredError{Code: "encoding_failure", Message: "The response could not be encoded."})
	}
}

func writeFailure(response http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	code := "invalid_request"
	switch {
	case errors.Is(err, source.ErrConflict):
		status, code = http.StatusConflict, "source_conflict"
	case errors.Is(err, project.ErrRevisionConflict), errors.Is(err, project.ErrIdentityConflict):
		status, code = http.StatusConflict, "revision_conflict"
	case errors.Is(err, content.ErrNotFound):
		status, code = http.StatusNotFound, "content_not_found"
	case errors.Is(err, content.ErrTooLarge):
		status, code = http.StatusRequestEntityTooLarge, "content_too_large"
	case errors.Is(err, source.ErrTooLarge):
		status, code = http.StatusRequestEntityTooLarge, "source_too_large"
	case errors.Is(err, content.ErrCapacity):
		status, code = http.StatusInsufficientStorage, "content_capacity"
	}
	writeError(response, status, code, err.Error())
}

func writeError(response http.ResponseWriter, status int, code string, message string) {
	writeJSON(response, status, map[string]any{"error": contracts.StructuredError{Code: code, Message: message}})
}

func runtimeErrorCode(err error) string {
	value := strings.ToLower(err.Error())
	switch {
	case strings.Contains(value, "session"):
		return "session_conflict"
	case strings.Contains(value, "binding"):
		return "binding_unavailable"
	case strings.Contains(value, "worker"):
		return "worker_unavailable"
	default:
		return "runtime_error"
	}
}
