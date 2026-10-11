package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/riteofstring/setta/apps/review/backend/internal/contracts"
	"github.com/riteofstring/setta/apps/review/backend/internal/coordinator"
	"github.com/riteofstring/setta/packages/local-backend/artifacthttp"
	"github.com/riteofstring/setta/packages/local-backend/httpjson"
	"github.com/riteofstring/setta/packages/local-backend/localweb"
	"github.com/riteofstring/setta/packages/local-backend/sse"
)

const maximumJSONBytes = 4 << 20

type Service interface {
	Snapshot() (contracts.ReviewSnapshot, error)
	Apply(contracts.ReviewMutation) (contracts.MutationResult, error)
	Export(bool) (contracts.ExportResult, error)
	Subscribe(context.Context) (<-chan contracts.ReviewSnapshot, error)
	OpenArtifact(string, string) (*os.File, contracts.ArtifactEvidenceReference, error)
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
	handler.mux.HandleFunc("/api/v1/review", handler.review)
	handler.mux.HandleFunc("/api/v1/review/apply", handler.apply)
	handler.mux.HandleFunc("/api/v1/review/events", handler.events)
	handler.mux.HandleFunc("/api/v1/review/export", handler.export)
	handler.mux.HandleFunc("/api/v1/evidence/", handler.artifact)
	handler.mux.HandleFunc("/api/v2/runtime/session", handler.identity)
	return handler, nil
}

func (handler *Handler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	response.Header().Set("Cache-Control", "no-store")
	response.Header().Set("X-Content-Type-Options", "nosniff")
	handler.mux.ServeHTTP(response, request)
}

func (handler *Handler) review(response http.ResponseWriter, request *http.Request) {
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
	var mutation contracts.ReviewMutation
	if err := decodeJSON(response, request, &mutation); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_request", err.Error(), nil, nil)
		return
	}
	if err := mutation.Validate(); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_request", err.Error(), nil, nil)
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
		writeError(response, http.StatusInternalServerError, "stream_unavailable", "Streaming is unavailable.", nil, nil)
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
	if !handler.mutationRequest(response, request) {
		return
	}
	includeContinuations := false
	if raw := request.URL.Query().Get("continuations"); raw != "" {
		parsed, err := strconv.ParseBool(raw)
		if err != nil || len(request.URL.Query()) != 1 {
			writeError(response, http.StatusBadRequest, "invalid_request", "The continuations query value is invalid.", nil, nil)
			return
		}
		includeContinuations = parsed
	} else if len(request.URL.Query()) != 0 {
		writeError(response, http.StatusBadRequest, "invalid_request", "The export query is invalid.", nil, nil)
		return
	}
	result, err := handler.service.Export(includeContinuations)
	if err != nil {
		writeFailure(response, err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler *Handler) artifact(response http.ResponseWriter, request *http.Request) {
	if !httpjson.RequireMethod(response, request, http.MethodGet, http.MethodHead) {
		writeError(response, http.StatusMethodNotAllowed, "method_not_allowed", "The request method is not allowed.", nil, nil)
		return
	}
	download, validQuery := artifacthttp.DownloadRequested(request.URL.RawQuery)
	if !validQuery {
		writeError(response, http.StatusBadRequest, "invalid_request", "The artifact query is invalid.", nil, nil)
		return
	}
	requestID, evidenceID, ok := artifactIdentity(request.URL.Path)
	if !ok {
		http.NotFound(response, request)
		return
	}
	file, metadata, err := handler.service.OpenArtifact(requestID, evidenceID)
	if err != nil {
		writeFailure(response, err)
		return
	}
	defer file.Close()
	if !download && !artifacthttp.InlineMediaType(metadata.MediaType) {
		writeError(response, http.StatusUnsupportedMediaType, "unsupported_media_type", "The artifact media type is not available for inline preview.", nil, nil)
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
		"schemaVersion": "review-session/v1",
		"appId":         "review",
		"projectPath":   handler.projectRoot,
		"instanceNonce": handler.sessionNonce,
	})
}

func (handler *Handler) mutationRequest(response http.ResponseWriter, request *http.Request) bool {
	if !exactMethod(response, request, http.MethodPost) {
		return false
	}
	if !localweb.OriginAllowed(request, handler.serverURL) {
		writeError(response, http.StatusForbidden, "forbidden_origin", "The request origin is not allowed.", nil, nil)
		return false
	}
	if request.URL.Path == "/api/v1/review/apply" {
		if !httpjson.HasJSONMediaType(request) {
			writeError(response, http.StatusUnsupportedMediaType, "unsupported_media_type", "The request must contain application/json.", nil, nil)
			return false
		}
	}
	return true
}

func exactMethod(response http.ResponseWriter, request *http.Request, method string) bool {
	if httpjson.RequireMethod(response, request, method) {
		return true
	}
	writeError(response, http.StatusMethodNotAllowed, "method_not_allowed", "The request method is not allowed.", nil, nil)
	return false
}

func decodeJSON(response http.ResponseWriter, request *http.Request, target any) error {
	return httpjson.DecodeRequest(response, request, maximumJSONBytes, target)
}

func artifactIdentity(path string) (string, string, bool) {
	relative := strings.TrimPrefix(path, "/api/v1/evidence/")
	parts := strings.Split(relative, "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func writeFailure(response http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, coordinator.ErrRevisionConflict):
		writeError(response, http.StatusConflict, "revision_conflict", "The review changed; reload before applying this decision.", nil, nil)
	case errors.Is(err, coordinator.ErrProjectIdentity):
		writeError(response, http.StatusConflict, "identity_conflict", "The mutation targets another review project.", nil, nil)
	case errors.Is(err, coordinator.ErrRequestMissing):
		writeError(response, http.StatusNotFound, "request_missing", "The review request does not exist.", nil, nil)
	case errors.Is(err, coordinator.ErrEvidenceMissing):
		writeError(response, http.StatusNotFound, "evidence_missing", "The requested evidence does not exist.", nil, nil)
	default:
		writeError(response, http.StatusInternalServerError, "internal_error", "Review could not complete the request.", nil, nil)
	}
}

func writeError(response http.ResponseWriter, status int, code string, message string, requestID *string, evidenceID *string) {
	writeJSON(response, status, contracts.StructuredError{Code: code, Message: message, RequestID: requestID, EvidenceID: evidenceID})
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	_ = httpjson.Write(response, status, value)
}
