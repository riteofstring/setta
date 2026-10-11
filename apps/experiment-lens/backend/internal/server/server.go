package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/riteofstring/setta/apps/experiment-lens/backend/internal/artifact"
	"github.com/riteofstring/setta/apps/experiment-lens/backend/internal/contracts"
	"github.com/riteofstring/setta/apps/experiment-lens/backend/internal/coordinator"
	"github.com/riteofstring/setta/packages/local-backend/artifacthttp"
	"github.com/riteofstring/setta/packages/local-backend/httpjson"
	"github.com/riteofstring/setta/packages/local-backend/localweb"
	"github.com/riteofstring/setta/packages/local-backend/sse"
)

const maximumJSONBytes = 4 << 20

type Service interface {
	Snapshot() (contracts.LensSnapshot, error)
	Apply(contracts.LensMutation) (contracts.MutationResult, error)
	Export() (contracts.ExportResult, error)
	Subscribe(context.Context) (<-chan contracts.LensSnapshot, error)
	OpenArtifact(string) (*os.File, contracts.ArtifactReference, error)
}

type Handler struct {
	service      Service
	projectRoot  string
	sessionNonce string
	serverURL    string
	mux          *http.ServeMux
}

func New(service Service, projectRoot string, sessionNonce string, serverURL string) (*Handler, error) {
	if service == nil || strings.TrimSpace(projectRoot) == "" || strings.TrimSpace(sessionNonce) == "" || strings.TrimSpace(serverURL) == "" {
		return nil, errors.New("server: service and identity configuration are required")
	}
	canonical, err := filepath.Abs(projectRoot)
	if err != nil {
		return nil, fmt.Errorf("server: resolve project root: %w", err)
	}
	handler := &Handler{service: service, projectRoot: canonical, sessionNonce: sessionNonce, serverURL: serverURL, mux: http.NewServeMux()}
	handler.mux.HandleFunc("/api/v1/experiment-lens", handler.snapshot)
	handler.mux.HandleFunc("/api/v1/experiment-lens/apply", handler.apply)
	handler.mux.HandleFunc("/api/v1/experiment-lens/events", handler.events)
	handler.mux.HandleFunc("/api/v1/experiment-lens/export", handler.export)
	handler.mux.HandleFunc("/api/v1/artifacts/", handler.artifact)
	handler.mux.HandleFunc("/api/v2/runtime/session", handler.identity)
	return handler, nil
}

func (handler *Handler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	response.Header().Set("Cache-Control", "no-store")
	response.Header().Set("X-Content-Type-Options", "nosniff")
	handler.mux.ServeHTTP(response, request)
}

func (handler *Handler) snapshot(response http.ResponseWriter, request *http.Request) {
	if !exactMethod(response, request, http.MethodGet) {
		return
	}
	snapshot, err := handler.service.Snapshot()
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, snapshot)
}

func (handler *Handler) apply(response http.ResponseWriter, request *http.Request) {
	if !handler.mutationRequest(response, request) {
		return
	}
	var mutation contracts.LensMutation
	if err := decodeJSON(response, request, &mutation); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_request", err.Error(), nil)
		return
	}
	if err := mutation.Validate(); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_request", err.Error(), nil)
		return
	}
	result, err := handler.service.Apply(mutation)
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler *Handler) events(response http.ResponseWriter, request *http.Request) {
	if !exactMethod(response, request, http.MethodGet) {
		return
	}
	if !sse.Supported(response) {
		writeError(response, http.StatusInternalServerError, "stream_unavailable", "Streaming is unavailable.", nil)
		return
	}
	stream, err := handler.service.Subscribe(request.Context())
	if err != nil {
		writeFailure(response, err)
		return
	}
	_ = sse.Serve(response, request, stream, "snapshot")
}

func (handler *Handler) export(response http.ResponseWriter, request *http.Request) {
	if !exactMethod(response, request, http.MethodGet) {
		return
	}
	if request.URL.RawQuery != "" {
		writeError(response, http.StatusBadRequest, "invalid_request", "The export query is invalid.", nil)
		return
	}
	result, err := handler.service.Export()
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler *Handler) artifact(response http.ResponseWriter, request *http.Request) {
	if !httpjson.RequireMethod(response, request, http.MethodGet, http.MethodHead) {
		writeError(response, http.StatusMethodNotAllowed, "method_not_allowed", "The request method is not allowed.", nil)
		return
	}
	download, validQuery := artifacthttp.DownloadRequested(request.URL.RawQuery)
	if !validQuery {
		writeError(response, http.StatusBadRequest, "invalid_request", "The artifact query is invalid.", nil)
		return
	}
	id, ok := artifactIdentity(request.URL.Path)
	if !ok {
		http.NotFound(response, request)
		return
	}
	file, metadata, err := handler.service.OpenArtifact(id)
	if err != nil {
		writeFailure(response, err)
		return
	}
	defer file.Close()
	if !download && !artifacthttp.InlineMediaType(metadata.MediaType) {
		writeError(response, http.StatusUnsupportedMediaType, "unsupported_media_type", "The artifact media type is not available for inline preview.", &id)
		return
	}
	if err := artifacthttp.Serve(response, request, file, artifacthttp.Metadata{
		Path: metadata.Path, MediaType: metadata.MediaType, ByteLength: metadata.ByteLength,
	}, download); err != nil {
		writeFailure(response, err)
	}
}

func (handler *Handler) identity(response http.ResponseWriter, request *http.Request) {
	if !exactMethod(response, request, http.MethodGet) {
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{
		"schemaVersion": "experiment-lens-session/v1", "appId": "experiment-lens",
		"projectPath": handler.projectRoot, "instanceNonce": handler.sessionNonce,
	})
}

func (handler *Handler) mutationRequest(response http.ResponseWriter, request *http.Request) bool {
	if !exactMethod(response, request, http.MethodPost) {
		return false
	}
	if !localweb.OriginAllowed(request, handler.serverURL) {
		writeError(response, http.StatusForbidden, "forbidden_origin", "The request origin is not allowed.", nil)
		return false
	}
	if !httpjson.HasJSONMediaType(request) {
		writeError(response, http.StatusUnsupportedMediaType, "unsupported_media_type", "Content-Type must be application/json.", nil)
		return false
	}
	return true
}

func exactMethod(response http.ResponseWriter, request *http.Request, method string) bool {
	if httpjson.RequireMethod(response, request, method) {
		return true
	}
	writeError(response, http.StatusMethodNotAllowed, "method_not_allowed", "The request method is not allowed.", nil)
	return false
}

func decodeJSON(response http.ResponseWriter, request *http.Request, target any) error {
	return httpjson.DecodeRequest(response, request, maximumJSONBytes, target)
}

func artifactIdentity(requestPath string) (string, bool) {
	relative := strings.TrimPrefix(requestPath, "/api/v1/artifacts/")
	if relative == "" || strings.Contains(relative, "/") {
		return "", false
	}
	return relative, true
}

func writeFailure(response http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, coordinator.ErrRevisionConflict):
		writeError(response, http.StatusConflict, "revision_conflict", "The selection changed; reload before applying this update.", nil)
	case errors.Is(err, coordinator.ErrExperimentIdentity):
		writeError(response, http.StatusConflict, "identity_conflict", "The mutation targets another experiment revision.", nil)
	case errors.Is(err, coordinator.ErrInvalidSelection):
		writeError(response, http.StatusBadRequest, "invalid_request", "The submitted selection is invalid for this experiment.", nil)
	case errors.Is(err, coordinator.ErrArtifactMissing):
		writeError(response, http.StatusNotFound, "artifact_missing", "The requested artifact does not exist.", nil)
	case errors.Is(err, coordinator.ErrArtifactChanged), errors.Is(err, artifact.ErrArtifactChanged):
		writeError(response, http.StatusConflict, "artifact_changed", "A selected artifact changed after admission.", nil)
	default:
		writeError(response, http.StatusInternalServerError, "internal_error", "Experiment Lens could not complete the request.", nil)
	}
}

func writeError(response http.ResponseWriter, status int, code string, message string, artifactID *string) {
	writeJSON(response, status, contracts.StructuredError{Code: code, Message: message, ArtifactID: artifactID})
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	_ = httpjson.Write(response, status, value)
}
