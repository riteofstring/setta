package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/artifacts"
	"setta/internal/modes"
)

const (
	RouteImportFilesToArtifacts               = "/importFilesToArtifacts"
	RouteLoadCachedImageArtifacts             = "/loadCachedImageArtifacts"
	RouteLoadCachedChartData                  = "/loadCachedChartData"
	RouteLoadCachedBrushStrokes               = "/loadCachedBrushStrokes"
	RouteLoadCachedDrawAreaLayerItemTransform = "/loadDrawAreaLayerItemTransform"
	RouteUpdateArtifacts                      = "/updateArtifacts"
	RouteDeleteArtifacts                      = "/deleteArtifacts"
)

type ArtifactRouteDependencies struct {
	ModePolicy     modes.Policy
	ShareSessions  modes.ShareSessionStore
	Artifacts      ArtifactService
	ShareArtifacts ShareArtifactService
}

type ArtifactService interface {
	ImportFiles(ctx context.Context, request artifacts.ImportFilesRequest) ([]artifacts.ImportFilesResponseItem, error)
	LoadCachedImages(ctx context.Context, request artifacts.LoadCachedPathsRequest) ([]*artifacts.ImageArtifact, error)
	LoadCachedChartData(ctx context.Context, request artifacts.LoadCachedPathsRequest) ([]*artifacts.ChartDataArtifact, error)
	LoadCachedBrushStrokes(ctx context.Context, request artifacts.LoadCachedPathsRequest) ([]*artifacts.JSONArtifact, error)
	LoadCachedDrawAreaLayerItemTransforms(ctx context.Context, request artifacts.LoadCachedPathsRequest) ([]*artifacts.JSONArtifact, error)
	Update(ctx context.Context, request artifacts.UpdateRequest) ([]artifacts.ArtifactSaveResult, error)
	Delete(ctx context.Context, request artifacts.DeleteRequest) ([]string, error)
}

type ShareArtifactService interface {
	LoadCachedImages(ctx context.Context, sessionID string, request artifacts.LoadCachedPathsRequest) ([]*artifacts.ImageArtifact, error)
	LoadCachedChartData(ctx context.Context, sessionID string, request artifacts.LoadCachedPathsRequest) ([]*artifacts.ChartDataArtifact, error)
	LoadCachedBrushStrokes(ctx context.Context, sessionID string, request artifacts.LoadCachedPathsRequest) ([]*artifacts.JSONArtifact, error)
	LoadCachedDrawAreaLayerItemTransforms(ctx context.Context, sessionID string, request artifacts.LoadCachedPathsRequest) ([]*artifacts.JSONArtifact, error)
	Update(ctx context.Context, sessionID string, request artifacts.UpdateRequest) ([]artifacts.ArtifactSaveResult, error)
	Delete(ctx context.Context, sessionID string, request artifacts.DeleteRequest) ([]string, error)
}

type UpdateArtifactsRequest struct {
	Artifacts        []artifacts.RawArtifact         `json:"artifacts"`
	ConflictStrategy *artifacts.SaveConflictStrategy `json:"conflictStrategy,omitempty"`
	UploadScope      artifacts.UploadScope           `json:"uploadScope"`
}

func RegisterArtifactRoutes(router chi.Router, deps ArtifactRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Artifacts == nil {
		return fmt.Errorf("artifact service is required in ide mode")
	}
	ideGuard := RequireFullIDERuntime(deps.ModePolicy)
	router.With(ideGuard).Post(RouteImportFilesToArtifacts, importFilesToArtifactsHandler(deps))

	if deps.ModePolicy.IsDeployment() {
		if deps.ShareSessions == nil {
			return fmt.Errorf("share session store is required in deployment mode")
		}
		if deps.ShareArtifacts == nil {
			return fmt.Errorf("share artifact service is required in deployment mode")
		}
		shareGuard := RequireShareSession(modes.Resolver{
			Policy: deps.ModePolicy,
			Store:  deps.ShareSessions,
		})
		router.With(shareGuard).Post(RouteLoadCachedImageArtifacts, loadCachedImageArtifactsShareHandler(deps))
		router.With(shareGuard).Post(RouteLoadCachedChartData, loadCachedChartDataShareHandler(deps))
		router.With(shareGuard).Post(RouteLoadCachedBrushStrokes, loadCachedBrushStrokesShareHandler(deps))
		router.With(shareGuard).Post(RouteLoadCachedDrawAreaLayerItemTransform, loadCachedDrawAreaLayerItemTransformShareHandler(deps))
		router.With(shareGuard).Post(RouteUpdateArtifacts, updateArtifactsShareHandler(deps))
		router.With(shareGuard).Post(RouteDeleteArtifacts, deleteArtifactsShareHandler(deps))
		return nil
	}

	router.With(ideGuard).Post(RouteLoadCachedImageArtifacts, loadCachedImageArtifactsHandler(deps))
	router.With(ideGuard).Post(RouteLoadCachedChartData, loadCachedChartDataHandler(deps))
	router.With(ideGuard).Post(RouteLoadCachedBrushStrokes, loadCachedBrushStrokesHandler(deps))
	router.With(ideGuard).Post(RouteLoadCachedDrawAreaLayerItemTransform, loadCachedDrawAreaLayerItemTransformHandler(deps))
	router.With(ideGuard).Post(RouteUpdateArtifacts, updateArtifactsHandler(deps))
	router.With(ideGuard).Post(RouteDeleteArtifacts, deleteArtifactsHandler(deps))
	return nil
}

func importFilesToArtifactsHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Artifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.ImportFilesRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.Artifacts.ImportFiles(r.Context(), payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func loadCachedImageArtifactsHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Artifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.LoadCachedPathsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.Artifacts.LoadCachedImages(r.Context(), payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func loadCachedImageArtifactsShareHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ShareArtifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		sessionID, ok := artifactShareSessionID(r)
		if !ok {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.LoadCachedPathsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.ShareArtifacts.LoadCachedImages(r.Context(), sessionID, payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func loadCachedChartDataHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Artifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.LoadCachedPathsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.Artifacts.LoadCachedChartData(r.Context(), payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func loadCachedChartDataShareHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ShareArtifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		sessionID, ok := artifactShareSessionID(r)
		if !ok {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.LoadCachedPathsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.ShareArtifacts.LoadCachedChartData(r.Context(), sessionID, payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func loadCachedBrushStrokesHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Artifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.LoadCachedPathsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.Artifacts.LoadCachedBrushStrokes(r.Context(), payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func loadCachedBrushStrokesShareHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ShareArtifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		sessionID, ok := artifactShareSessionID(r)
		if !ok {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.LoadCachedPathsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.ShareArtifacts.LoadCachedBrushStrokes(r.Context(), sessionID, payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func loadCachedDrawAreaLayerItemTransformHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Artifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.LoadCachedPathsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.Artifacts.LoadCachedDrawAreaLayerItemTransforms(r.Context(), payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func loadCachedDrawAreaLayerItemTransformShareHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ShareArtifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		sessionID, ok := artifactShareSessionID(r)
		if !ok {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.LoadCachedPathsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.ShareArtifacts.LoadCachedDrawAreaLayerItemTransforms(r.Context(), sessionID, payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func updateArtifactsHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Artifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[UpdateArtifactsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.Artifacts.Update(r.Context(), artifacts.UpdateRequest{
			Artifacts:        payload.Artifacts,
			ConflictStrategy: payload.ConflictStrategy,
			UploadScope:      payload.UploadScope,
		})
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func updateArtifactsShareHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ShareArtifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		sessionID, ok := artifactShareSessionID(r)
		if !ok {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[UpdateArtifactsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.ShareArtifacts.Update(r.Context(), sessionID, artifacts.UpdateRequest{
			Artifacts:        payload.Artifacts,
			ConflictStrategy: payload.ConflictStrategy,
			UploadScope:      payload.UploadScope,
		})
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func deleteArtifactsHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Artifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.DeleteRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.Artifacts.Delete(r.Context(), payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func deleteArtifactsShareHandler(deps ArtifactRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ShareArtifacts == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		sessionID, ok := artifactShareSessionID(r)
		if !ok {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeJSONBody[artifacts.DeleteRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		results, err := deps.ShareArtifacts.Delete(r.Context(), sessionID, payload)
		if err != nil {
			writeArtifactRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, results)
	}
}

func artifactShareSessionID(r *http.Request) (string, bool) {
	requestInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		return "", false
	}
	return requestInfo.ShareSessionID, true
}

func writeArtifactRouteError(w http.ResponseWriter, r *http.Request, err error) {
	var artifactErr *artifacts.Error
	if errors.As(err, &artifactErr) {
		switch artifactErr.Kind {
		case artifacts.ErrorInvalidRequest:
			writeError(w, r, http.StatusBadRequest, "invalid_request", artifactErr.Message)
		case artifacts.ErrorPolicyDenied:
			writeError(w, r, http.StatusForbidden, "artifact_policy_denied", artifactErr.Message)
		case artifacts.ErrorPathForbidden:
			writeError(w, r, http.StatusForbidden, "artifact_path_forbidden", artifactErr.Message)
		case artifacts.ErrorPathNotFound:
			writeError(w, r, http.StatusNotFound, "artifact_path_not_found", artifactErr.Message)
		case artifacts.ErrorPathNotFile:
			writeError(w, r, http.StatusBadRequest, "artifact_path_not_file", artifactErr.Message)
		case artifacts.ErrorBinaryPayloadInvalid:
			writeError(w, r, http.StatusBadRequest, "invalid_binary_content_id", artifactErr.Message)
		case artifacts.ErrorBinaryPayloadNotFound:
			writeError(w, r, http.StatusNotFound, "binary_payload_not_found", artifactErr.Message)
		case artifacts.ErrorArtifactTypeUnsupported:
			writeError(w, r, http.StatusBadRequest, "unsupported_artifact_type", artifactErr.Message)
		case artifacts.ErrorTooLarge:
			writeError(w, r, http.StatusRequestEntityTooLarge, "artifact_payload_too_large", artifactErr.Message)
		case artifacts.ErrorMimeNotAllowed:
			writeError(w, r, http.StatusUnsupportedMediaType, "artifact_mime_not_allowed", artifactErr.Message)
		default:
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		}
		return
	}
	writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
}
