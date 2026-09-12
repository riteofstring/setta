package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/setta/bench/backend/internal/contracts"
	"github.com/setta/bench/backend/internal/coordinator"
	"github.com/setta/bench/backend/internal/localweb"
	"github.com/setta/bench/backend/internal/project"
	"github.com/setta/bench/backend/internal/runstore"
)

const maximumJSONBytes = 4 << 20

type Coordinator interface {
	Snapshot() (contracts.ApplicationSnapshotV1, error)
	Project() (contracts.ProjectV1, error)
	ReplaceProject(contracts.ReplaceProjectRequestV1) (contracts.ProjectV1, error)
	ImportCandidate(contracts.ImportCandidateRequestV1) (contracts.ProjectV1, error)
	Launch(contracts.LaunchRequestV1) (contracts.LaunchResponseV1, error)
	Rerun(string) (contracts.LaunchResponseV1, error)
	Cancel(string) (contracts.RunV1, error)
	PutReview(contracts.PutReviewRequestV1) (contracts.ReviewV1, error)
	Subscribe(context.Context) (<-chan contracts.ApplicationSnapshotV1, error)
	OpenArtifact(string) (contracts.ArtifactReferenceV1, io.ReadCloser, error)
}

type Handler struct {
	coordinator  Coordinator
	projectRoot  string
	sessionNonce string
	serverURL    string
}

func New(coordinator Coordinator, projectRoot string, sessionNonce string, serverURL string) (*Handler, error) {
	if coordinator == nil || strings.TrimSpace(projectRoot) == "" || strings.TrimSpace(sessionNonce) == "" || strings.TrimSpace(serverURL) == "" {
		return nil, errors.New("httpapi: coordinator and session identity are required")
	}
	canonical, err := filepath.Abs(projectRoot)
	if err != nil {
		return nil, err
	}
	return &Handler{coordinator: coordinator, projectRoot: canonical, sessionNonce: sessionNonce, serverURL: serverURL}, nil
}

func (handler *Handler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	response.Header().Set("Cache-Control", "no-store")
	response.Header().Set("X-Content-Type-Options", "nosniff")
	switch request.URL.Path {
	case "/api/v1/snapshot":
		handler.snapshot(response, request)
	case "/api/v1/events":
		handler.events(response, request)
	case "/api/v1/project":
		handler.project(response, request)
	case "/api/v1/launches":
		handler.launch(response, request)
	case "/api/v1/reviews":
		handler.review(response, request)
	case "/api/v1/candidates/import":
		handler.importCandidate(response, request)
	case "/api/v1/runtime/session":
		handler.session(response, request)
	default:
		if strings.HasPrefix(request.URL.Path, "/api/v1/runs/") {
			handler.runAction(response, request)
			return
		}
		if strings.HasPrefix(request.URL.Path, "/api/v1/artifacts/") {
			handler.artifact(response, request)
			return
		}
		writeError(response, http.StatusNotFound, "not_found", "Route not found.")
	}
}

func (handler *Handler) snapshot(response http.ResponseWriter, request *http.Request) {
	if !exactRequest(response, request, http.MethodGet, false) {
		return
	}
	snapshot, err := handler.coordinator.Snapshot()
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, snapshot)
}

func (handler *Handler) project(response http.ResponseWriter, request *http.Request) {
	switch request.Method {
	case http.MethodGet:
		if !exactRequest(response, request, http.MethodGet, false) {
			return
		}
		value, err := handler.coordinator.Project()
		if err != nil {
			writeFailure(response, err)
			return
		}
		writeJSON(response, http.StatusOK, value)
	case http.MethodPut:
		if !handler.mutationRequest(response, request, http.MethodPut, true) {
			return
		}
		var command contracts.ReplaceProjectRequestV1
		if err := decodeRequest(request, &command); err != nil {
			writeFailure(response, err)
			return
		}
		value, err := handler.coordinator.ReplaceProject(command)
		if err != nil {
			writeFailure(response, err)
			return
		}
		writeJSON(response, http.StatusOK, value)
	default:
		response.Header().Set("Allow", "GET, PUT")
		writeError(response, http.StatusMethodNotAllowed, "method_not_allowed", "The request method is not allowed.")
	}
}

func (handler *Handler) launch(response http.ResponseWriter, request *http.Request) {
	if !handler.mutationRequest(response, request, http.MethodPost, true) {
		return
	}
	var command contracts.LaunchRequestV1
	if err := decodeRequest(request, &command); err != nil {
		writeFailure(response, err)
		return
	}
	result, err := handler.coordinator.Launch(command)
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusAccepted, result)
}

func (handler *Handler) importCandidate(response http.ResponseWriter, request *http.Request) {
	if !handler.mutationRequest(response, request, http.MethodPost, true) {
		return
	}
	var command contracts.ImportCandidateRequestV1
	if err := decodeRequest(request, &command); err != nil {
		writeFailure(response, err)
		return
	}
	result, err := handler.coordinator.ImportCandidate(command)
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler *Handler) runAction(response http.ResponseWriter, request *http.Request) {
	relative := strings.TrimPrefix(request.URL.Path, "/api/v1/runs/")
	parts := strings.Split(relative, "/")
	if len(parts) != 2 || !contracts.ValidID(parts[0]) {
		writeError(response, http.StatusNotFound, "not_found", "Route not found.")
		return
	}
	if !handler.mutationRequest(response, request, http.MethodPost, false) {
		return
	}
	switch parts[1] {
	case "cancel":
		run, err := handler.coordinator.Cancel(parts[0])
		if err != nil {
			writeFailure(response, err)
			return
		}
		writeJSON(response, http.StatusOK, run)
	case "rerun":
		result, err := handler.coordinator.Rerun(parts[0])
		if err != nil {
			writeFailure(response, err)
			return
		}
		writeJSON(response, http.StatusAccepted, result)
	default:
		writeError(response, http.StatusNotFound, "not_found", "Route not found.")
	}
}

func (handler *Handler) review(response http.ResponseWriter, request *http.Request) {
	if !handler.mutationRequest(response, request, http.MethodPut, true) {
		return
	}
	var command contracts.PutReviewRequestV1
	if err := decodeRequest(request, &command); err != nil {
		writeFailure(response, err)
		return
	}
	review, err := handler.coordinator.PutReview(command)
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, review)
}

func (handler *Handler) events(response http.ResponseWriter, request *http.Request) {
	if !exactRequest(response, request, http.MethodGet, false) {
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeError(response, http.StatusInternalServerError, "stream_unavailable", "Event streaming is unavailable.")
		return
	}
	stream, err := handler.coordinator.Subscribe(request.Context())
	if err != nil {
		writeFailure(response, err)
		return
	}
	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("Cache-Control", "no-cache, no-transform")
	response.Header().Set("X-Accel-Buffering", "no")
	response.WriteHeader(http.StatusOK)
	for {
		select {
		case <-request.Context().Done():
			return
		case snapshot, open := <-stream:
			if !open {
				return
			}
			encoded, err := json.Marshal(snapshot)
			if err != nil {
				return
			}
			if _, err := fmt.Fprintf(response, "data: %s\n\n", encoded); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func (handler *Handler) artifact(response http.ResponseWriter, request *http.Request) {
	if !exactRequest(response, request, http.MethodGet, false) {
		return
	}
	id := strings.TrimPrefix(request.URL.Path, "/api/v1/artifacts/")
	if !contracts.ValidID(id) || strings.Contains(id, "/") {
		writeError(response, http.StatusNotFound, "artifact_not_found", "Artifact not found.")
		return
	}
	reference, reader, err := handler.coordinator.OpenArtifact(id)
	if err != nil {
		writeFailure(response, err)
		return
	}
	defer reader.Close()
	response.Header().Set("Content-Type", reference.MediaType)
	response.Header().Set("Content-Length", strconv.FormatInt(reference.ByteLength, 10))
	response.Header().Set("ETag", `"sha256:`+reference.SHA256+`"`)
	response.Header().Set("Content-Security-Policy", "sandbox; default-src 'none'")
	response.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
	response.WriteHeader(http.StatusOK)
	_, _ = io.Copy(response, reader)
}

func (handler *Handler) session(response http.ResponseWriter, request *http.Request) {
	if !exactRequest(response, request, http.MethodGet, false) {
		return
	}
	writeJSON(response, http.StatusOK, contracts.RuntimeSessionV1{
		SchemaVersion: "bench-session/v1", AppID: "bench", ProjectPath: handler.projectRoot, InstanceNonce: handler.sessionNonce,
	})
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
		mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
		if err != nil || mediaType != "application/json" {
			writeError(response, http.StatusUnsupportedMediaType, "invalid_media_type", "Content-Type must be application/json.")
			return false
		}
	} else if !rejectBody(response, request) {
		return false
	}
	return true
}

func exactRequest(response http.ResponseWriter, request *http.Request, method string, allowBody bool) bool {
	if request.Method != method {
		response.Header().Set("Allow", method)
		writeError(response, http.StatusMethodNotAllowed, "method_not_allowed", "The request method is not allowed.")
		return false
	}
	if request.URL.RawQuery != "" {
		writeError(response, http.StatusBadRequest, "unexpected_query", "Query parameters are not accepted.")
		return false
	}
	return allowBody || rejectBody(response, request)
}

func rejectBody(response http.ResponseWriter, request *http.Request) bool {
	if request.ContentLength == 0 || request.Body == nil || request.Body == http.NoBody {
		return true
	}
	data, _ := io.ReadAll(io.LimitReader(request.Body, 1))
	if len(data) == 0 {
		return true
	}
	writeError(response, http.StatusBadRequest, "unexpected_body", "A request body is not accepted.")
	return false
}

func decodeRequest(request *http.Request, target any) error {
	data, err := io.ReadAll(http.MaxBytesReader(nil, request.Body, maximumJSONBytes))
	if err != nil {
		return err
	}
	if len(bytes.TrimSpace(data)) == 0 {
		return errors.New("request body is empty")
	}
	return contracts.DecodeStrict(data, target)
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	encoded, err := json.Marshal(value)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "encoding_failed", "The response could not be encoded.")
		return
	}
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_, _ = response.Write(append(encoded, '\n'))
}

func writeFailure(response http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	code := "invalid_request"
	switch {
	case errors.Is(err, project.ErrRevisionConflict), errors.Is(err, project.ErrIdentityConflict):
		status, code = http.StatusConflict, "revision_conflict"
	case errors.Is(err, runstore.ErrRunNotFound), errors.Is(err, runstore.ErrArtifactNotFound):
		status, code = http.StatusNotFound, "not_found"
	case errors.Is(err, runstore.ErrRunTerminal):
		status, code = http.StatusConflict, "run_terminal"
	case errors.Is(err, coordinator.ErrClosed):
		status, code = http.StatusServiceUnavailable, "unavailable"
	}
	writeError(response, status, code, boundedError(err.Error()))
}

func writeError(response http.ResponseWriter, status int, code string, message string) {
	encoded, _ := json.Marshal(map[string]any{"error": contracts.StructuredErrorV1{Code: code, Message: message}})
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_, _ = response.Write(append(encoded, '\n'))
}

func boundedError(value string) string {
	if len(value) > 4096 {
		return value[:4096]
	}
	return value
}
